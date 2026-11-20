"use client";

import { useState, useTransition } from "react";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Input, Select } from "../../../components/ui/Input";
import { freePiecePrints, readFreeFile, type FreeFile, type FreeFit, type FreePiece } from "@/lib/produccion/freePieces";
import { nest, DEFAULT_SETTINGS } from "@/lib/produccion/nesting";
import { exportRollPdf } from "@/lib/produccion/exportPdf";
import { defaultDesignConfig } from "@/lib/produccion/defaults";
import { validateLayout } from "@/lib/produccion/rollEdit";
import { pdfToPngBlob } from "@/lib/produccion/pdfRaster";
import type { RollLayout } from "@/lib/produccion/types";
import { RollEditor } from "../RollEditor";
import { FabricWidthInput } from "../FabricWidthInput";
import { useFabricWidth } from "../useFabricWidth";

type Flag = { id: string; name: string; fileKey: string; widthCm: number; heightCm: number; qty: number; fit: FreeFit; hemCm: number; bgColor: string };

const SIZES: { label: string; w: number; h: number }[] = [
  { label: "150 × 90", w: 150, h: 90 },
  { label: "140 × 100", w: 140, h: 100 },
  { label: "200 × 100", w: 200, h: 100 },
  { label: "100 × 70", w: 100, h: 70 },
  { label: "90 × 60", w: 90, h: 60 },
  { label: "300 × 150", w: 300, h: 150 },
];

const FIT_LABEL: Record<FreeFit, string> = {
  cubrir: "Llenar (recorta lo que sobra)",
  entero: "Entero (sobra color de fondo)",
  estirar: "Estirar a la medida",
};

export function Flags() {
  const [files, setFiles] = useState<FreeFile[]>([]);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [fabricMm, setFabricMm] = useFabricWidth();
  const [panoM, setPanoM] = useState(5);
  const [pdfLayout, setPdfLayout] = useState<"lado" | "paginas">("lado");
  const [gapCm, setGapCm] = useState(50);
  const [layout, setLayout] = useState<RollLayout | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
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

  const reset = () => {
    setLayout(null);
    setPreview(null);
  };
  const patch = (id: string, p: Partial<Flag>) => {
    setFlags((x) => x.map((f) => (f.id === id ? { ...f, ...p } : f)));
    reset();
  };

  const onFiles = (list: FileList) =>
    run("Leyendo diseños…", async () => {
      for (const file of Array.from(list)) {
        const read = await readFreeFile(file.name, await file.arrayBuffer(), file.type);
        const key = `bandera:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`;
        setFiles((x) => [...x, { ...read, key }]);
        // Medida inicial: 150 de ancho con la proporción del diseño (alto redondeado a 5 cm).
        const h = Math.max(20, Math.round(((150 * read.pageHmm) / read.pageWmm) / 5) * 5);
        setFlags((x) => [
          ...x,
          { id: key, name: file.name.replace(/\.[^.]+$/, ""), fileKey: key, widthCm: 150, heightCm: h, qty: 1, fit: "cubrir", hemCm: 2, bgColor: "#FFFFFF" },
        ]);
      }
      reset();
    });

  const usable = fabricMm - 2 * DEFAULT_SETTINGS.edgeMarginMm;
  const items = (): FreePiece[] =>
    flags.map((f) => ({ id: f.id, type: "archivo", fileKey: f.fileKey, name: f.name, widthMm: f.widthCm * 10, heightMm: f.heightCm * 10, copies: f.qty, fit: f.fit, hemMm: f.hemCm * 10, bgColor: f.bgColor }));

  async function pdfOf(l: RollLayout) {
    const problems = validateLayout(l);
    if (problems.length) throw new Error(`Hay ${problems.length} pieza(s) en rojo: corregilas antes de exportar.`);
    const bg = { ...defaultDesignConfig().background, filePath: null, color: "#FFFFFF" };
    const { bytes } = await exportRollPdf(
      l,
      bg,
      { backgrounds: Object.fromEntries(files.map((f) => [f.key, f.bytes])) },
      pdfLayout === "lado" && l.segments.length > 1 ? { sideBySide: { gapMm: gapCm * 10 } } : {}
    );
    return bytes;
  }

  const onBuild = () =>
    run("Armando el rollo…", async () => {
      if (!flags.length) throw new Error("Subí al menos un diseño.");
      const wont = flags.filter((f) => Math.min(f.widthCm, f.heightCm) * 10 + 2 * f.hemCm * 10 > usable);
      if (wont.length) throw new Error(`No entra en la tela de ${fabricMm / 10} cm ni girada: ${wont.map((f) => `${f.name} (${f.widthCm} × ${f.heightCm})`).join(", ")}.`);
      const prints = freePiecePrints(items(), files, [], usable);
      const L = nest(prints, { ...DEFAULT_SETTINGS, rollWidthMm: fabricMm, maxSegmentLengthMm: panoM * 1000 });
      setLayout(L);
      const rotated = flags.filter((f) => (f.widthCm + 2 * f.hemCm) * 10 > usable).map((f) => f.name);
      setMessage(
        `${prints.length} ${prints.length === 1 ? "bandera" : "banderas"}: ${(L.lengthMm / 1000).toFixed(2)} m de tela de ${fabricMm / 10} cm.` +
          (rotated.length ? ` Van giradas por ser más anchas que la tela: ${rotated.join(", ")}.` : "")
      );
      const png = await pdfToPngBlob(await pdfOf(L), 1600);
      setPreview(URL.createObjectURL(png));
    });

  const onDownload = () =>
    run("Generando PDF…", async () => {
      if (!layout) return;
      const bytes = await pdfOf(layout);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `banderas-${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    });

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="mr-auto text-sm font-medium text-zinc-900">Banderas · {flags.reduce((a, f) => a + f.qty, 0)} en total</h2>
          <label className="cursor-pointer rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50">
            Subir diseño (PDF, PNG, JPG)
            <input type="file" multiple accept="application/pdf,image/png,image/jpeg" className="hidden" onChange={(e) => { if (e.target.files?.length) onFiles(e.target.files); e.target.value = ""; }} />
          </label>
        </div>
        {flags.length === 0 ? (
          <p className="text-sm text-zinc-500">Subí el diseño de la bandera. Después elegís la medida (o una de las comunes), cuántas, cómo se ajusta el diseño y el dobladillo.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {flags.map((f) => (
              <div key={f.id} className="grid grid-cols-2 gap-3 rounded-lg border border-zinc-200 p-3 sm:grid-cols-4 lg:grid-cols-8">
                <div className="col-span-2">
                  <Input label="Bandera" value={f.name} onChange={(e) => patch(f.id, { name: e.target.value })} />
                </div>
                <Select
                  label="Medida común (cm)"
                  value={SIZES.find((s) => s.w === f.widthCm && s.h === f.heightCm)?.label ?? ""}
                  onChange={(e) => {
                    const s = SIZES.find((x) => x.label === e.target.value);
                    if (s) patch(f.id, { widthCm: s.w, heightCm: s.h });
                  }}
                >
                  <option value="">A medida</option>
                  {SIZES.map((s) => (
                    <option key={s.label} value={s.label}>{s.label}</option>
                  ))}
                </Select>
                <Input label="Ancho (cm)" type="number" step={1} value={f.widthCm} onChange={(e) => patch(f.id, { widthCm: Math.max(1, Number(e.target.value)) })} />
                <Input label="Alto (cm)" type="number" step={1} value={f.heightCm} onChange={(e) => patch(f.id, { heightCm: Math.max(1, Number(e.target.value)) })} />
                <Input label="Cantidad" type="number" min={1} value={f.qty} onChange={(e) => patch(f.id, { qty: Math.max(1, Math.floor(Number(e.target.value)) || 1) })} />
                <Select label="Diseño" value={f.fit} onChange={(e) => patch(f.id, { fit: e.target.value as FreeFit })}>
                  {(Object.keys(FIT_LABEL) as FreeFit[]).map((k) => (
                    <option key={k} value={k}>{FIT_LABEL[k]}</option>
                  ))}
                </Select>
                <Input label="Dobladillo (cm)" type="number" step={0.5} min={0} value={f.hemCm} onChange={(e) => patch(f.id, { hemCm: Math.max(0, Number(e.target.value)) })} />
                <label className="flex flex-col text-sm text-zinc-700">
                  Color de fondo
                  <input type="color" value={f.bgColor} onChange={(e) => patch(f.id, { bgColor: e.target.value.toUpperCase() })} className="mt-1 h-9 w-full rounded border border-zinc-300" />
                </label>
                <div className="flex items-end">
                  <button type="button" className="pb-2 text-xs text-red-600 hover:underline" onClick={() => { setFlags((x) => x.filter((y) => y.id !== f.id)); reset(); }}>
                    Quitar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <div className="hint-float flex flex-wrap items-end gap-x-3 gap-y-6 pb-4">
          <h2 className="mr-auto self-center text-sm font-medium text-zinc-900">Rollo</h2>
          <div className="w-32">
            <FabricWidthInput mm={fabricMm} onChange={(v) => { setFabricMm(v); reset(); }} />
          </div>
          <div className="w-28">
            <Input label="Paños de (m)" type="number" step={0.5} value={panoM} onChange={(e) => { setPanoM(Math.max(1, Number(e.target.value))); reset(); }} />
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
          <Button variant="secondary" onClick={onBuild} disabled={!!busy || !flags.length}>Armar rollo</Button>
          <Button onClick={onDownload} disabled={!!busy || !layout}>Descargar rollo</Button>
        </div>
        {busy && <p className="text-sm text-zinc-600">{busy}</p>}
        {message && <p className="text-sm text-green-700">{message}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Vista del rollo de banderas" className="max-h-[480px] self-start rounded border border-zinc-200" />
        )}
        {layout && (
          <div className="overflow-auto">
            <RollEditor layout={layout} onChange={(l) => { setLayout(l); setPreview(null); }} labelOf={(i) => layout.placed[i].print.piece.name ?? ""} />
          </div>
        )}
      </Card>
    </div>
  );
}
