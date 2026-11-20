"use client";

import { useMemo, useState, useTransition } from "react";
import { PDFDocument, StandardFonts, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Input, Select } from "../../../components/ui/Input";
import { assemblyFromRows, normalizeConfig, pieceFromRow, type AssemblyRow, type OrderItemRow, type PatternPieceRow } from "@/lib/produccion/db";
import { buildContext, contextGarments, designFiles, type ContextBuild } from "@/lib/produccion/contextBuild";
import { ctxKey, orderContexts } from "@/lib/produccion/contexts";
import { addCollarPanel } from "@/lib/produccion/collars";
import { exportRollPdf, pdfMeasurer } from "@/lib/produccion/exportPdf";
import { nest, DEFAULT_SETTINGS } from "@/lib/produccion/nesting";
import { useFabricWidth } from "../useFabricWidth";
import { FreePieces } from "../FreePieces";
import { FabricWidthInput } from "../FabricWidthInput";
import { validateLayout } from "@/lib/produccion/rollEdit";
import { approxMeasurer, type TextMeasurer } from "@/lib/produccion/build";
import type { CustomTemplate } from "@/lib/produccion/templates";
import type { PrintPiece, RollLayout } from "@/lib/produccion/types";
import { RollEditor } from "../RollEditor";
import { listDesignTemplates, saveCombinedLayout } from "../actions";
import { downloadProductionFiles, uploadToProduction } from "../upload";

type DesignRow = { id: string; order_id: string; requirement_id: string | null; component_id: string | null; model_id: string | null; variant: string; version: number; config: unknown };
type Covered = { order_id: string | null; requirement_id: string | null; component_id: string | null; variant: string | null };
export type CombinedOrder = {
  id: string;
  /** Trabajo libre (escalado para un tercero), no un pedido. */
  isJob?: boolean;
  number: string;
  status: string;
  name: string;
  items: OrderItemRow[];
  requirements: { id: string; description: string | null; article_type_id: string | null }[];
  designs: DesignRow[];
  covered: Covered[];
};
type Comp = { id: string; article_type_id: string; name: string; model_id: string | null; copy_number: boolean; copy_name: boolean; sort_order: number };
type Model = { id: string; name: string; base_size_label: string | null; article_type_id: string | null };

type Row = {
  id: string; // orderId|ctxKey
  order: CombinedOrder;
  key: string;
  label: string;
  requirementId: string;
  componentId: string;
  variant: "jugador" | "arquero";
  design: DesignRow | null;
  garments: number;
  done: boolean;
};

export function CombinedRoll({
  orders,
  sizeLabels,
  models,
  components,
  pieces,
  assembly,
}: {
  orders: CombinedOrder[];
  sizeLabels: Record<string, string>;
  models: Model[];
  components: Comp[];
  pieces: PatternPieceRow[];
  assembly: (AssemblyRow & { model_id: string })[];
}) {
  // Todas las prendas de cada pedido, con su diseño más nuevo (si tiene).
  const rows: Row[] = useMemo(
    () =>
      orders.flatMap((o) => {
        const covered = new Set(o.covered.map((c) => ctxKey(c.requirement_id, c.component_id, c.variant!)));
        return orderContexts(o.requirements, o.items, components).map((c) => {
          const design = o.designs.find((d) => (d.requirement_id ?? "") === c.requirementId && (d.component_id ?? "") === c.componentId && d.variant === c.variant) ?? null;
          const its = c.requirementId ? o.items.filter((i) => i.requirement_id === c.requirementId) : o.items;
          const garments = its.filter((i) => (i.variant === "arquero" ? "arquero" : "jugador") === c.variant).reduce((s, i) => s + (i.quantity ?? 1), 0);
          return { id: `${o.id}|${c.key}`, order: o, key: c.key, label: c.label, requirementId: c.requirementId, componentId: c.componentId, variant: c.variant, design, garments, done: covered.has(c.key) };
        });
      }),
    [orders, components]
  );

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [panoM, setPanoM] = useState(5);
  const [pdfLayout, setPdfLayout] = useState<"paginas" | "lado">("lado");
  const [gapCm, setGapCm] = useState(50);
  const [fabricMm, setFabricMm] = useFabricWidth();
  const [extra, setExtra] = useState<{ prints: PrintPiece[]; files: Record<string, Uint8Array> }>({ prints: [], files: {} });
  const [lastBuilds, setLastBuilds] = useState<PrintPiece[]>([]);
  const [layout, setLayout] = useState<RollLayout | null>(null);
  const [builds, setBuilds] = useState<{ row: Row; build: ContextBuild }[]>([]);
  const [measureFonts, setMeasureFonts] = useState<Record<string, Uint8Array>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const run = (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(null);
      }
    });
  };

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      setLayout(null);
      return n;
    });

  const chosen = rows.filter((r) => selected.has(r.id) && r.design);

  const onBuild = () =>
    run("Armando el rollo…", async () => {
      if (!chosen.length) throw new Error("Elegí al menos una prenda con diseño guardado.");
      if (!(panoM >= 1)) throw new Error("El largo del paño tiene que ser de al menos 1 m.");
      const configs = chosen.map((r) => {
        const model = models.find((m) => m.id === r.design!.model_id);
        return normalizeConfig(r.design!.config, model?.base_size_label ?? undefined);
      });
      // Fuentes de todos los diseños, para medir nombres igual que en el PDF.
      const fontPaths = [...new Set(configs.flatMap((c) => designFiles(c).fonts))];
      const fontBytes = fontPaths.length ? await downloadProductionFiles(fontPaths) : {};
      const missingFont = fontPaths.find((f) => !fontBytes[f]);
      if (missingFont) throw new Error("Falta una fuente de un diseño. Abrí ese pedido y elegila de nuevo.");
      let measure: TextMeasurer = approxMeasurer;
      {
        const doc = await PDFDocument.create();
        doc.registerFontkit(fontkit);
        const helv = await doc.embedFont(StandardFonts.HelveticaBold);
        const fonts: Record<string, PDFFont> = { "Helvetica-Bold": helv };
        for (const [p, b] of Object.entries(fontBytes)) fonts[p] = await doc.embedFont(b);
        measure = pdfMeasurer(fonts, helv);
      }
      const custom: CustomTemplate[] = configs.some((c) => c.background.template?.id.startsWith("custom:")) ? await listDesignTemplates() : [];

      const out: { row: Row; build: ContextBuild }[] = [];
      const warnings: string[] = [];
      chosen.forEach((r, i) => {
        const modelId = r.design!.model_id;
        const mp = pieces.filter((p) => p.model_id === modelId).map(pieceFromRow);
        if (!mp.length) throw new Error(`${r.order.number} · ${r.label}: el molde del diseño no tiene piezas cargadas.`);
        const asm = assemblyFromRows(assembly.filter((a) => a.model_id === modelId));
        const comp = components.find((c) => c.id === r.componentId) ?? null;
        const its = r.requirementId ? r.order.items.filter((it) => it.requirement_id === r.requirementId) : r.order.items;
        const garments = contextGarments(its, sizeLabels, r.variant, comp, r.id);
        const build = buildContext({
          config: configs[i],
          pieces: mp,
          assembly: asm,
          modelBaseSize: models.find((m) => m.id === modelId)?.base_size_label,
          custom,
          garments,
          measure,
          templateKey: `plantilla:${r.id}`,
        });
        warnings.push(...build.warnings.slice(0, 3).map((w) => `${r.order.number}: ${w}`));
        out.push({ row: r, build });
      });
      let L = nest(
        [...out.flatMap((o) => o.build.prints), ...extra.prints],
        { ...DEFAULT_SETTINGS, rollWidthMm: fabricMm, maxSegmentLengthMm: panoM * 1000 }
      );
      for (const o of out) L = addCollarPanel(L, o.build.design.collars, o.build.garments.length, o.build.design.background.color);
      setBuilds(out);
      setLastBuilds(out.flatMap((o) => o.build.prints));
      setMeasureFonts(fontBytes);
      setLayout(L);
      setMessage(
        `Rollo armado con ${chosen.length} ${chosen.length === 1 ? "prenda" : "prendas"} de ${new Set(chosen.map((c) => c.order.id)).size} pedido(s) o trabajo(s): ${(L.lengthMm / 1000).toFixed(2)} m.` +
          (warnings.length ? ` Avisos: ${warnings.join(" · ")}` : "")
      );
    });

  async function makePdf(l: RollLayout): Promise<Uint8Array> {
    const problems = validateLayout(l);
    if (problems.length) throw new Error(`Hay ${problems.length} pieza(s) en rojo: corregilas antes de exportar.`);
    const paths = new Set<string>();
    for (const { build } of builds) {
      const f = designFiles(build.design);
      if (f.background) paths.add(f.background);
      f.elements.forEach((p) => paths.add(p));
    }
    const files = paths.size ? await downloadProductionFiles([...paths]) : {};
    const backgrounds: Record<string, Uint8Array> = {};
    const elements: Record<string, Uint8Array> = {};
    for (const { build } of builds) {
      const f = designFiles(build.design);
      if (build.templatePdf) backgrounds[build.templateKey] = await build.templatePdf;
      else if (f.background) {
        if (!files[f.background]) throw new Error("No se encontró el archivo de un diseño. Volvé a subirlo en su pedido.");
        backgrounds[f.background] = files[f.background];
      }
      for (const p of f.elements) if (files[p]) elements[p] = files[p];
    }
    const { bytes } = await exportRollPdf(
      l,
      builds[0].build.design.background,
      { backgrounds: { ...backgrounds, ...extra.files }, elements, fonts: measureFonts },
      pdfLayout === "lado" && l.segments.length > 1 ? { sideBySide: { gapMm: gapCm * 10 } } : {}
    );
    return bytes;
  }

  const download = (bytes: Uint8Array, name: string) => {
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  const onDownload = () =>
    run("Generando PDF…", async () => {
      if (!layout) return;
      download(await makePdf(layout), `rollo-combinado-${new Date().toISOString().slice(0, 10)}.pdf`);
    });

  const onSave = () =>
    run("Guardando el rollo…", async () => {
      if (!layout) return;
      const bytes = await makePdf(layout);
      const path = await uploadToProduction("rollos/combinados", new Blob([bytes as BlobPart], { type: "application/pdf" }), "pdf");
      // Pedidos que con este rollo tienen todas sus prendas: pasan a sublimación.
      const used = builds.map((b) => b.row);
      const advance = [...new Set(used.filter((r) => !r.order.isJob).map((r) => r.order.id))].filter((oid) =>
        rows.filter((r) => r.order.id === oid).every((r) => r.done || used.some((u) => u.id === r.id))
      );
      await saveCombinedLayout({
        pdfPath: path,
        lengthMm: layout.lengthMm,
        pieceCount: layout.placed.length,
        contexts: used.map((r) => ({
          orderId: r.order.isJob ? null : r.order.id,
          jobId: r.order.isJob ? r.order.id : null,
          requirementId: r.requirementId || null,
          componentId: r.componentId || null,
          variant: r.variant,
        })),
        advanceOrderIds: advance,
      });
      setMessage(
        `Rollo guardado: ${(layout.lengthMm / 1000).toFixed(2)} m.` +
          (advance.length ? ` Pasaron a sublimación: ${advance.map((id) => orders.find((o) => o.id === id)?.number).join(", ")}.` : " Ningún pedido quedó completo todavía.")
      );
    });

  const orderOf = (idx: number) => {
    if (!layout) return "";
    const p = layout.placed[idx].print;
    const oid = p.garment.orderItemId.split("|")[0];
    const o = orders.find((x) => x.id === oid);
    return `${o?.isJob ? o.name : (o?.number?.replace(/^PED-\d{4}-/, "#") ?? "")} ${p.piece.sizeLabel}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-3 p-0">
        <div className="px-5 pt-4 text-sm font-medium text-zinc-900">Prendas para el rollo</div>
        {rows.length === 0 ? (
          <p className="px-5 pb-4 text-sm text-zinc-500">No hay pedidos en diseño, cerrados o cortando, ni trabajos libres con diseño.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-zinc-500">
              <tr>
                <th className="w-10 px-5 py-2" />
                <th className="px-2 py-2 font-medium">Pedido</th>
                <th className="px-2 py-2 font-medium">Prenda</th>
                <th className="px-2 py-2 font-medium">Cant.</th>
                <th className="px-2 py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={`border-t border-zinc-100 ${!r.design ? "text-zinc-400" : ""}`}>
                  <td className="px-5 py-2">
                    <input type="checkbox" disabled={!r.design} checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Incluir ${r.order.number} ${r.label}`} />
                  </td>
                  <td className="px-2 py-2">
                    <div className="font-medium text-zinc-900">{r.order.number}</div>
                    <div className="text-xs text-zinc-500">{r.order.name}</div>
                  </td>
                  <td className="px-2 py-2">{r.label}</td>
                  <td className="px-2 py-2">{r.garments}</td>
                  <td className="px-2 py-2 text-xs">
                    {!r.design ? "Sin diseño guardado" : r.done ? <span className="text-green-700">Ya tiene rollo</span> : <span className="text-zinc-600">Pendiente</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <FreePieces
        prints={lastBuilds}
        usableWidthMm={fabricMm - 2 * DEFAULT_SETTINGS.edgeMarginMm}
        labelOf={(p) => {
          const o = orders.find((x) => x.id === p.garment.orderItemId.split("|")[0]);
          return [o?.isJob ? o.name : o?.number, p.garment.name, p.garment.number].filter(Boolean).join(" ");
        }}
        onChange={(x) => { setExtra(x); setLayout(null); }}
      />

      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <h2 className="mr-auto text-sm font-medium text-zinc-900">Rollo · {chosen.length} {chosen.length === 1 ? "prenda elegida" : "prendas elegidas"}</h2>
          <div className="w-32">
            <FabricWidthInput mm={fabricMm} onChange={(v) => { setFabricMm(v); setLayout(null); }} />
          </div>
          <div className="w-28">
            <Input label="Paños de (m)" type="number" step={0.5} value={panoM} onChange={(e) => { setPanoM(Number(e.target.value)); setLayout(null); }} />
          </div>
          <div className="w-48">
            <Select label="PDF" value={pdfLayout} onChange={(e) => setPdfLayout(e.target.value as "lado" | "paginas")}>
              <option value="lado">Paños uno al lado del otro</option>
              <option value="paginas">Una página por paño</option>
            </Select>
          </div>
          {pdfLayout === "lado" && (
            <div className="w-28">
              <Input label="Separación (cm)" type="number" step={5} value={gapCm} onChange={(e) => setGapCm(Math.max(0, Number(e.target.value)))} />
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={onBuild} disabled={!!busy || !chosen.length}>
            Armar rollo
          </Button>
          <Button variant="secondary" onClick={onDownload} disabled={!!busy || !layout}>
            Descargar rollo
          </Button>
          <Button onClick={onSave} disabled={!!busy || !layout}>
            Guardar rollo
          </Button>
        </div>
        {busy && <p className="text-sm text-zinc-600">{busy}</p>}
        {message && <p className="text-sm text-green-700">{message}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {layout && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-zinc-700">
              <b>{(layout.lengthMm / 1000).toFixed(2)} m lineales</b> · {layout.placed.length} piezas · {layout.segments.length} paños de hasta {panoM} m
            </p>
            <div className="max-h-[700px] overflow-y-auto">
              <RollEditor layout={layout} onChange={setLayout} labelOf={orderOf} />
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
