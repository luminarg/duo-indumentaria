"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Input, Select } from "../../../components/ui/Input";
import { approxMeasurer, buildPrintPieces, type TextMeasurer } from "@/lib/produccion/build";
import { assemblyFromRows, garmentsFromItems, normalizeConfig, pieceFromRow, type AssemblyRow, type OrderItemRow, type PatternPieceRow } from "@/lib/produccion/db";
import { exportRollPdf, pdfMeasurer } from "@/lib/produccion/exportPdf";
import { pdfPrimitives } from "@/lib/produccion/pdfImport";
import { detectDesignPieces } from "@/lib/produccion/designDetect";
import { DEFAULT_SETTINGS, nest } from "@/lib/produccion/nesting";
import { sampleMolds } from "@/lib/produccion/sampleMolds";
import { DEFAULT_ASSEMBLY } from "@/lib/produccion/assembly";
import type { AnchoredElement, DesignConfig, PieceKind, RollLayout, WearerSide } from "@/lib/produccion/types";
import { saveDesign, saveLayout, signedProductionUrls } from "../actions";
import { downloadProductionFiles, uploadToProduction } from "../upload";
import { PiecePreview, RollPreview } from "../Previews";

const SAMPLE = "prueba";
const ADULT_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "2XL", "XXL", "3XL", "XXXL", "4XL", "5XL"];
const MM_PER_PT = 25.4 / 72;

function sizeSortKey(label: string): number {
  const n = Number(label);
  if (Number.isFinite(n)) return n;
  const i = ADULT_ORDER.indexOf(label.toUpperCase());
  return i >= 0 ? 100 + i : 200;
}

type Requirement = { id: string; description: string; article_type_id: string | null };
type Model = { id: string; name: string; neck: string | null; base_size_label: string; article_type_id: string | null };
type DesignRow = { id: string; requirement_id: string | null; model_id: string | null; variant: string; version: number; config: unknown; created_at: string };
type LayoutRow = { id: string; linear_meters: number; piece_count: number; pdf_path: string | null; created_at: string };

export function ProductionWorkbench(props: {
  orderId: string;
  orderStatus: string;
  items: OrderItemRow[];
  sizeLabels: Record<string, string>;
  requirements: Requirement[];
  models: Model[];
  pieces: PatternPieceRow[];
  assembly: (AssemblyRow & { model_id: string })[];
  designs: DesignRow[];
  layouts: LayoutRow[];
}) {
  const { orderId, items, sizeLabels, requirements, models, designs, layouts } = props;
  // Diseño guardado y molde sugerido para un artículo + variante.
  const contextFor = (reqId: string, v: "jugador" | "arquero") => {
    const saved = designs.find((d) => (d.requirement_id ?? "") === reqId && d.variant === v);
    const req = requirements.find((r) => r.id === reqId);
    const match = models.find((m) => req?.article_type_id && m.article_type_id === req.article_type_id);
    const modelId = saved?.model_id ?? match?.id ?? models[0]?.id ?? SAMPLE;
    const base = models.find((m) => m.id === modelId)?.base_size_label;
    return { modelId, config: normalizeConfig(saved?.config, base) };
  };

  const [requirementId, setRequirementId] = useState<string>(requirements[0]?.id ?? "");
  const [variant, setVariant] = useState<"jugador" | "arquero">("jugador");
  const [modelId, setModelId] = useState<string>(() => contextFor(requirements[0]?.id ?? "", "jugador").modelId);
  const [config, setConfig] = useState<DesignConfig>(() => contextFor(requirements[0]?.id ?? "", "jugador").config);
  const [layout, setLayout] = useState<RollLayout | null>(null);

  const selectContext = (reqId: string, v: "jugador" | "arquero") => {
    const c = contextFor(reqId, v);
    setRequirementId(reqId);
    setVariant(v);
    setModelId(c.modelId);
    setConfig(c.config);
    setLayout(null);
  };

  const [measure, setMeasure] = useState<TextMeasurer>(() => approxMeasurer);
  useEffect(() => {
    let alive = true;
    (async () => {
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.HelveticaBold);
      if (alive) setMeasure(() => pdfMeasurer({ "Helvetica-Bold": font }, font));
    })();
    return () => {
      alive = false;
    };
  }, []);

  const [assets, setAssets] = useState<Record<string, Uint8Array>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const pieces = useMemo(() => {
    if (modelId === SAMPLE) return sampleMolds();
    return props.pieces.filter((p) => p.model_id === modelId).map(pieceFromRow);
  }, [modelId, props.pieces]);
  const assembly = useMemo(
    () => (modelId === SAMPLE ? DEFAULT_ASSEMBLY : assemblyFromRows(props.assembly.filter((a) => a.model_id === modelId))),
    [modelId, props.assembly]
  );

  const garments = useMemo(() => {
    const filtered = requirementId ? items.filter((i) => i.requirement_id === requirementId) : items;
    return garmentsFromItems(filtered, sizeLabels).filter((g) => g.variant === variant);
  }, [items, requirementId, sizeLabels, variant]);

  const build = useMemo(
    () => buildPrintPieces({ pieces, assembly, design: config, garments, measure }),
    [pieces, assembly, config, garments, measure]
  );

  const countBySize = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of garments) m.set(g.sizeLabel, (m.get(g.sizeLabel) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => sizeSortKey(a[0]) - sizeSortKey(b[0]));
  }, [garments]);

  const previewBySize = useMemo(() => {
    const out: { size: string; prints: typeof build.prints }[] = [];
    for (const [size] of countBySize) {
      const g = garments.find((x) => x.sizeLabel === size && (x.name || x.number)) ?? garments.find((x) => x.sizeLabel === size);
      if (!g) continue;
      const prints = build.prints.filter((p) => p.garment.orderItemId === g.orderItemId && (p.piece.kind === "frente" || p.piece.kind === "espalda"));
      if (prints.length) out.push({ size, prints });
    }
    return out;
  }, [countBySize, garments, build]);

  const update = (fn: (c: DesignConfig) => DesignConfig) => {
    setConfig((c) => fn(structuredClone(c)));
    setLayout(null);
  };

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    setMessage(null);
    try {
      await new Promise((r) => setTimeout(r, 20)); // deja que se vea el estado "trabajando"
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  async function readPdf(file: File) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const doc = await PDFDocument.load(bytes);
    const { width, height } = doc.getPage(0).getSize();
    return { bytes, widthMm: width * MM_PER_PT, heightMm: height * MM_PER_PT };
  }

  const onBackground = (file: File) =>
    run("Subiendo diseño…", async () => {
      const pdf = await readPdf(file);
      const path = await uploadToProduction(`disenos/${orderId}`, file, "pdf");
      setAssets((a) => ({ ...a, [path]: pdf.bytes }));
      if (config.background.mode === "piezas") {
        // Buscar las piezas dibujadas y sobre qué talle está hecho el diseño.
        const { prim } = await pdfPrimitives(pdf.bytes);
        const det = detectDesignPieces(prim, pieces);
        update((c) => ({
          ...c,
          baseSizeLabel: det.baseSizeLabel ?? c.baseSizeLabel,
          // El escudo y los logos ya vienen en el diseño: quedan solo los elementos con archivo propio.
          elements: det.baseSizeLabel ? c.elements.filter((e) => e.filePath) : c.elements,
          background: {
            ...c.background,
            filePath: path,
            widthMm: pdf.widthMm,
            heightMm: pdf.heightMm,
            pieces: det.pieces,
            color: det.dominantColor ?? c.background.color,
          },
        }));
        const found = Object.keys(det.pieces).length;
        if (det.baseSizeLabel) {
          setMessage(
            `Diseño hecho sobre el talle ${det.baseSizeLabel}: se reconocieron ${found} piezas.` +
              (det.dominantColor ? ` Color de fondo: ${det.dominantColor}.` : "") +
              (det.notes.length ? ` ${det.notes.join(" ")}` : "")
          );
        } else {
          setError(det.notes.join(" "));
        }
        return;
      }
      update((c) => ({ ...c, background: { ...c.background, filePath: path, widthMm: pdf.widthMm, heightMm: pdf.heightMm } }));
      setMessage(`Fondo cargado: ${pdf.widthMm.toFixed(0)} × ${pdf.heightMm.toFixed(0)} mm`);
    });

  const onElementFile = (idx: number, file: File) =>
    run("Subiendo arte…", async () => {
      const pdf = await readPdf(file);
      const path = await uploadToProduction(`disenos/${orderId}`, file, "pdf");
      setAssets((a) => ({ ...a, [path]: pdf.bytes }));
      update((c) => {
        c.elements[idx] = { ...c.elements[idx], filePath: path, aspect: pdf.heightMm / pdf.widthMm };
        return c;
      });
    });

  const onIndicatorFile = (file: File) =>
    run("Subiendo indicador…", async () => {
      const pdf = await readPdf(file);
      const path = await uploadToProduction(`disenos/${orderId}`, file, "pdf");
      setAssets((a) => ({ ...a, [path]: pdf.bytes }));
      update((c) => ({ ...c, sizeIndicator: { ...c.sizeIndicator, artPath: path, artAspect: pdf.heightMm / pdf.widthMm, widthMm: Math.round(pdf.widthMm) } }));
      setMessage(`Indicador cargado: ${pdf.widthMm.toFixed(0)} × ${pdf.heightMm.toFixed(0)} mm. La letra del talle se agrega sola.`);
    });

  const onSaveDesign = () =>
    startTransition(async () => {
      setError(null);
      try {
        const { version } = await saveDesign({
          orderId,
          requirementId: requirementId || null,
          modelId: modelId === SAMPLE ? null : modelId,
          variant,
          config,
        });
        setMessage(`Diseño guardado (versión ${version}).`);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });

  const onNest = () =>
    run("Armando el rollo…", async () => {
      if (!build.prints.length) throw new Error("No hay piezas para armar: revisá talles y moldes.");
      setLayout(nest(build.prints, DEFAULT_SETTINGS));
    });

  async function makePdf(l: RollLayout) {
    const paths = [config.background.filePath, config.sizeIndicator.artPath, ...config.elements.map((e) => e.filePath)].filter(Boolean) as string[];
    const missing = paths.filter((p) => !assets[p]);
    const downloaded = missing.length ? await downloadProductionFiles(missing) : {};
    const all = { ...assets, ...downloaded };
    if (missing.length) setAssets(all);
    const elements: Record<string, Uint8Array> = {};
    for (const e of config.elements) if (e.filePath && all[e.filePath]) elements[e.filePath] = all[e.filePath];
    const ia = config.sizeIndicator.artPath;
    if (ia && all[ia]) elements[ia] = all[ia];
    const bg = config.background.filePath ? all[config.background.filePath] : null;
    const { bytes } = await exportRollPdf(l, config.background, { background: bg, elements });
    return new Blob([bytes as BlobPart], { type: "application/pdf" });
  }

  const onDownload = () =>
    run("Generando PDF…", async () => {
      if (!layout) return;
      const blob = await makePdf(layout);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rollo-${orderId.slice(0, 8)}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    });

  const onSaveRoll = () =>
    run("Guardando rollo…", async () => {
      if (!layout) return;
      const blob = await makePdf(layout);
      const path = await uploadToProduction(`rollos/${orderId}`, blob, "pdf");
      await saveLayout({ orderId, pdfPath: path, lengthMm: layout.lengthMm, pieceCount: layout.placed.length, advanceStatus: true });
      setMessage(`Rollo guardado: ${(layout.lengthMm / 1000).toFixed(2)} m lineales. El pedido pasó a Sublimación / estampado.`);
    });

  const openLayout = async (path: string) => {
    const urls = await signedProductionUrls([path]);
    if (urls[path]) window.open(urls[path], "_blank");
  };

  const missingPieces = modelId !== SAMPLE && pieces.length === 0;

  return (
    <div className="flex flex-col gap-6">
      {modelId === SAMPLE && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Usando <b>moldes de prueba</b>: sirven para revisar reglas y armado, no para imprimir. Cargá la moldería real en Producción → Moldería.
        </p>
      )}

      <Card className="grid gap-4 md:grid-cols-4">
        <Select label="Artículo del pedido" value={requirementId} onChange={(e) => selectContext(e.target.value, variant)}>
          {requirements.map((r) => (
            <option key={r.id} value={r.id}>
              {r.description}
            </option>
          ))}
          <option value="">Todas las prendas</option>
        </Select>
        <Select label="Variante" value={variant} onChange={(e) => selectContext(requirementId, e.target.value as "jugador" | "arquero")}>
          <option value="jugador">Jugadores</option>
          <option value="arquero">Arquero</option>
        </Select>
        <Select label="Molde" value={modelId} onChange={(e) => { setModelId(e.target.value); setLayout(null); }}>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
          <option value={SAMPLE}>Moldes de prueba</option>
        </Select>
        <div className="flex flex-col gap-1 text-xs text-zinc-500">
          <span className="font-medium">Prendas</span>
          <span className="text-sm text-zinc-900">
            {garments.length} · {countBySize.map(([s, n]) => `${s}×${n}`).join("  ") || "—"}
          </span>
        </div>
      </Card>

      {(busy || message || error) && (
        <div className="flex flex-col gap-1" aria-live="polite">
          {busy && <p className="rounded-md bg-zinc-100 px-4 py-3 text-sm text-zinc-700">{busy}</p>}
          {message && <p className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-800">{message}</p>}
          {error && <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        </div>
      )}

      {missingPieces && <p className="text-sm text-red-600">Este molde todavía no tiene piezas cargadas.</p>}
      {build.missingSizes.length > 0 && (
        <p className="text-sm text-red-600">Faltan piezas del molde para los talles: {build.missingSizes.join(", ")}.</p>
      )}

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <DesignForm config={config} update={update} onBackground={onBackground} onElementFile={onElementFile} onIndicatorFile={onIndicatorFile} />

        <div className="flex flex-col gap-4">
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium text-zinc-900">Vista previa por talle</h2>
              <span className="text-xs text-zinc-500">Grilla de 10 unidades · celeste = zona segura de {config.safeMarginMm} mm</span>
            </div>
            {previewBySize.length ? (
              <div className="flex flex-wrap gap-6">
                {previewBySize.map(({ size, prints }) => (
                  <div key={size} className="flex gap-2 rounded-md border border-zinc-200 p-2">
                    {prints.map((p) => (
                      <PiecePreview key={p.key} print={p} safeMarginMm={config.safeMarginMm} contourMm={DEFAULT_SETTINGS.contourMm} bgColor={config.background.color} height={170} />
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-500">No hay prendas de esta variante en el pedido.</p>
            )}
            {build.warnings.length > 0 && (
              <ul className="mt-4 list-disc pl-5 text-sm text-amber-700">
                {[...new Set(build.warnings.map((w) => w.message))].map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <h2 className="mr-auto text-sm font-medium text-zinc-900">Rollo</h2>
              <Button variant="secondary" onClick={onSaveDesign} disabled={isPending}>Guardar diseño</Button>
              <Button variant="secondary" onClick={onNest} disabled={!!busy || !build.prints.length}>Armar rollo</Button>
              <Button variant="secondary" onClick={onDownload} disabled={!!busy || !layout}>Descargar PDF</Button>
              <Button onClick={onSaveRoll} disabled={!!busy || !layout || modelId === SAMPLE}>Guardar y pasar a sublimación</Button>
            </div>
            {layout && (
              <div className="mt-3 flex flex-col gap-3">
                <p className="text-sm text-zinc-700">
                  <b>{(layout.lengthMm / 1000).toFixed(2)} m lineales</b> en {DEFAULT_SETTINGS.rollWidthMm} mm · {layout.placed.length} piezas ·{" "}
                  {layout.segments.length} {layout.segments.length === 1 ? "tramo" : "tramos"} (una página del PDF por tramo)
                </p>
                <div className="max-h-[600px] overflow-y-auto">
                  <RollPreview layout={layout} />
                </div>
              </div>
            )}
          </Card>

          {layouts.length > 0 && (
            <Card>
              <h2 className="mb-2 text-sm font-medium text-zinc-900">Rollos guardados</h2>
              <ul className="flex flex-col gap-1 text-sm">
                {layouts.map((l) => (
                  <li key={l.id} className="flex items-center gap-3">
                    <span className="text-zinc-500">{new Date(l.created_at).toLocaleString("es-AR")}</span>
                    <span>{Number(l.linear_meters).toFixed(2)} m · {l.piece_count} piezas</span>
                    {l.pdf_path && (
                      <button className="text-zinc-900 underline" onClick={() => openLayout(l.pdf_path!)}>
                        Abrir PDF
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Num({ label, value, onChange, step = 1, hint }: { label: string; value: number; onChange: (n: number) => void; step?: number; hint?: string }) {
  return (
    <Input
      label={label}
      hint={hint}
      type="number"
      step={step}
      value={Number.isFinite(value) ? value : ""}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}

const PIECE_OPTIONS: { value: PieceKind; label: string }[] = [
  { value: "frente", label: "Frente" },
  { value: "espalda", label: "Espalda" },
  { value: "manga_izq", label: "Manga izquierda" },
  { value: "manga_der", label: "Manga derecha" },
];

const SIDE_OPTIONS: { value: WearerSide; label: string }[] = [
  { value: "izquierda", label: "Izquierda de quien la usa" },
  { value: "derecha", label: "Derecha de quien la usa" },
  { value: "centro", label: "Centrado" },
];

function DesignForm({
  config,
  update,
  onBackground,
  onElementFile,
  onIndicatorFile,
}: {
  config: DesignConfig;
  update: (fn: (c: DesignConfig) => DesignConfig) => void;
  onBackground: (f: File) => void;
  onElementFile: (idx: number, f: File) => void;
  onIndicatorFile: (f: File) => void;
}) {
  const setEl = (i: number, patch: Partial<AnchoredElement>) =>
    update((c) => {
      c.elements[i] = { ...c.elements[i], ...patch };
      return c;
    });

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-zinc-900">Diseño</h2>
        <Select
          label="Tipo de archivo"
          value={config.background.mode}
          onChange={(e) => update((c) => ({ ...c, background: { ...c.background, mode: e.target.value as "piezas" | "lienzo", pieces: undefined, filePath: null } }))}
        >
          <option value="piezas">Diseño sobre las piezas de un talle</option>
          <option value="lienzo">Fondo continuo (rayas, trama) para recortar</option>
        </Select>
        <label className="text-xs font-medium text-zinc-500">
          {config.background.mode === "piezas"
            ? "PDF de Corel con las piezas ya diseñadas, a escala real"
            : `PDF del fondo, dibujado sobre el talle ${config.baseSizeLabel}`}
          <input type="file" accept="application/pdf" className="mt-1 block w-full text-sm" onChange={(e) => e.target.files?.[0] && onBackground(e.target.files[0])} />
        </label>
        {config.background.filePath && config.background.mode === "piezas" && (
          <p className="text-xs text-zinc-500">
            Hecho sobre el talle {config.baseSizeLabel}. Piezas reconocidas: {Object.keys(config.background.pieces ?? {}).map((k) => PIECE_OPTIONS.find((o) => o.value === k)?.label.toLowerCase() ?? k).join(", ") || "ninguna"}. Cada talle toma el arte de su pieza, escalado en proporción.
          </p>
        )}
        {config.background.filePath && config.background.mode === "lienzo" && (
          <p className="text-xs text-zinc-500">
            Lienzo de {config.background.widthMm.toFixed(0)} × {config.background.heightMm.toFixed(0)} mm. Su borde inferior, al centro, va en la línea de base del frente.
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Al cambiar de talle"
            value={config.background.scaling}
            onChange={(e) => update((c) => ({ ...c, background: { ...c.background, scaling: e.target.value as "proporcional" | "fijo" } }))}
          >
            <option value="proporcional">Se agranda en proporción</option>
            <option value="fijo">Mantiene el tamaño</option>
          </Select>
          <Input
            label="Color de fondo"
            type="color"
            value={config.background.color || "#ffffff"}
            onChange={(e) => update((c) => ({ ...c, background: { ...c.background, color: e.target.value } }))}
          />
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-zinc-900">Escudo y elementos</h2>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              update((c) => ({
                ...c,
                elements: [
                  ...c.elements,
                  { id: crypto.randomUUID(), label: "Sponsor", pieceKind: "frente", side: "centro", fromSideUnits: 5, fromShoulderTopUnits: 6, widthMm: { adulto: 200, nino: 150 }, aspect: 0.3, filePath: null },
                ],
              }))
            }
          >
            + Agregar
          </Button>
        </div>
        {config.elements.map((el, i) => (
          <div key={el.id} className="flex flex-col gap-2 rounded-md border border-zinc-200 p-3">
            <div className="grid grid-cols-2 gap-2">
              <Input label="Nombre" value={el.label} onChange={(e) => setEl(i, { label: e.target.value })} />
              <Select label="Pieza" value={el.pieceKind} onChange={(e) => setEl(i, { pieceKind: e.target.value as PieceKind })}>
                {PIECE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </div>
            <Select label="Lado" value={el.side} onChange={(e) => setEl(i, { side: e.target.value as WearerSide })}>
              {SIDE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
            <div className="grid grid-cols-2 gap-2">
              {el.side !== "centro" && (
                <Num label="Unidades desde el costado" step={0.1} value={el.fromSideUnits} onChange={(n) => setEl(i, { fromSideUnits: n })} />
              )}
              <Num label="Unidades desde el hombro" step={0.1} value={el.fromShoulderTopUnits} onChange={(n) => setEl(i, { fromShoulderTopUnits: n })} />
              <Num label="Ancho adulto (mm)" value={el.widthMm.adulto} onChange={(n) => setEl(i, { widthMm: { ...el.widthMm, adulto: n } })} />
              <Num label="Ancho niño (mm)" value={el.widthMm.nino} onChange={(n) => setEl(i, { widthMm: { ...el.widthMm, nino: n } })} />
            </div>
            <label className="text-xs font-medium text-zinc-500">
              PDF del arte {el.filePath ? "(cargado)" : ""}
              <input type="file" accept="application/pdf" className="mt-1 block w-full text-sm" onChange={(e) => e.target.files?.[0] && onElementFile(i, e.target.files[0])} />
            </label>
            <button className="self-start text-xs text-red-600 hover:underline" onClick={() => update((c) => ({ ...c, elements: c.elements.filter((_, j) => j !== i) }))}>
              Quitar
            </button>
          </div>
        ))}
      </Card>

      <Card className="flex flex-col gap-3">
        <label className="flex items-center gap-2 text-sm font-medium text-zinc-900">
          <input type="checkbox" checked={config.number.enabled} onChange={(e) => update((c) => ({ ...c, number: { ...c.number, enabled: e.target.checked } }))} />
          Número
        </label>
        {config.number.enabled && (
          <div className="grid grid-cols-2 gap-2">
            <Num label="Alto adulto (mm)" value={config.number.heightMm.adulto} onChange={(n) => update((c) => ({ ...c, number: { ...c.number, heightMm: { ...c.number.heightMm, adulto: n } } }))} />
            <Num label="Alto niño (mm)" value={config.number.heightMm.nino} onChange={(n) => update((c) => ({ ...c, number: { ...c.number, heightMm: { ...c.number.heightMm, nino: n } } }))} />
            <Num label="Centro, unidades desde el hombro" step={0.1} value={config.number.fromShoulderTopUnits} onChange={(n) => update((c) => ({ ...c, number: { ...c.number, fromShoulderTopUnits: n } }))} />
            <label className="flex items-end gap-2 pb-2 text-xs text-zinc-600">
              <input
                type="checkbox"
                checked={config.number.pieceKinds.includes("frente")}
                onChange={(e) =>
                  update((c) => ({
                    ...c,
                    number: { ...c.number, pieceKinds: e.target.checked ? ["espalda", "frente"] : ["espalda"] },
                  }))
                }
              />
              También en el frente
            </label>
          </div>
        )}
        <label className="flex items-center gap-2 text-sm font-medium text-zinc-900">
          <input type="checkbox" checked={config.name.enabled} onChange={(e) => update((c) => ({ ...c, name: { ...c.name, enabled: e.target.checked } }))} />
          Nombre (arriba en la espalda)
        </label>
        {config.name.enabled && (
          <div className="grid grid-cols-2 gap-2">
            <Num label="Alto (mm)" value={config.name.heightMm} onChange={(n) => update((c) => ({ ...c, name: { ...c.name, heightMm: n } }))} hint="Si no entra, se achica en proporción" />
            <Num label="Centro, unidades desde el hombro" step={0.1} value={config.name.fromShoulderTopUnits} onChange={(n) => update((c) => ({ ...c, name: { ...c.name, fromShoulderTopUnits: n } }))} />
          </div>
        )}
        <label className="flex items-center gap-2 text-sm font-medium text-zinc-900">
          <input type="checkbox" checked={config.sizeTag.enabled} onChange={(e) => update((c) => ({ ...c, sizeTag: { ...c.sizeTag, enabled: e.target.checked } }))} />
          Talle en la esquina de cada pieza
        </label>
        {config.sizeTag.enabled && (
          <div className="grid grid-cols-2 gap-2 pl-6">
            <Select label="Esquina de la base" value={config.sizeTag.corner} onChange={(e) => update((c) => ({ ...c, sizeTag: { ...c.sizeTag, corner: e.target.value as "derecha" | "izquierda" } }))}>
              <option value="derecha">Derecha</option>
              <option value="izquierda">Izquierda</option>
            </Select>
            <Num label="Alto (mm)" value={config.sizeTag.heightMm} onChange={(n) => update((c) => ({ ...c, sizeTag: { ...c.sizeTag, heightMm: n } }))} hint="Contra el borde, dentro del ruedo" />
          </div>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <label className="flex items-center gap-2 text-sm font-medium text-zinc-900">
          <input type="checkbox" checked={config.sizeIndicator.enabled} onChange={(e) => update((c) => ({ ...c, sizeIndicator: { ...c.sizeIndicator, enabled: e.target.checked } }))} />
          Indicador de talle en el frente (opcional)
        </label>
        {config.sizeIndicator.enabled && (
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-zinc-500">
              PDF del indicador, sin la letra del talle {config.sizeIndicator.artPath ? "(cargado)" : ""}
              <input type="file" accept="application/pdf" className="mt-1 block w-full text-sm" onChange={(e) => e.target.files?.[0] && onIndicatorFile(e.target.files[0])} />
            </label>
            <Select label="Lado" value={config.sizeIndicator.side} onChange={(e) => update((c) => ({ ...c, sizeIndicator: { ...c.sizeIndicator, side: e.target.value as WearerSide } }))}>
              {SIDE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
            <div className="grid grid-cols-2 gap-2">
              <Num label="Unidades desde el costado" step={0.1} value={config.sizeIndicator.fromSideUnits} onChange={(n) => update((c) => ({ ...c, sizeIndicator: { ...c.sizeIndicator, fromSideUnits: n } }))} />
              <Num label="Unidades desde la base" step={0.1} value={config.sizeIndicator.fromBaseUnits} onChange={(n) => update((c) => ({ ...c, sizeIndicator: { ...c.sizeIndicator, fromBaseUnits: n } }))} />
              <Num label="Ancho (mm)" value={config.sizeIndicator.widthMm} onChange={(n) => update((c) => ({ ...c, sizeIndicator: { ...c.sizeIndicator, widthMm: n } }))} />
              <Select
                label="Letra del talle"
                value={String(config.sizeIndicator.textY)}
                onChange={(e) => update((c) => ({ ...c, sizeIndicator: { ...c.sizeIndicator, textY: Number(e.target.value) } }))}
              >
                <option value="0.15">Arriba</option>
                <option value="0.5">Al centro</option>
                <option value="0.85">Abajo</option>
              </Select>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
