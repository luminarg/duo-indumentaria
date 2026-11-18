"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import { PDFDocument, StandardFonts, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Input, Select } from "../../../components/ui/Input";
import { approxMeasurer, buildPrintPieces, type TextMeasurer } from "@/lib/produccion/build";
import { assemblyFromRows, garmentsFromItems, normalizeConfig, pieceFromRow, type AssemblyRow, type OrderItemRow, type PatternPieceRow } from "@/lib/produccion/db";
import { capHeightRatio, exportRollPdf, pdfMeasurer } from "@/lib/produccion/exportPdf";
import { cssFamilyFor, usedFonts, type FontEntry } from "@/lib/produccion/fonts";
import { addCollarPanel, collarStripCount } from "@/lib/produccion/collars";
import { groupIntoRolls } from "@/lib/produccion/rolls";
import { sizeSheets } from "@/lib/produccion/sizeSheets";
import { pdfPrimitives } from "@/lib/produccion/pdfImport";
import { detectDesignPieces } from "@/lib/produccion/designDetect";
import { DEFAULT_SETTINGS, nest } from "@/lib/produccion/nesting";
import { sampleMolds } from "@/lib/produccion/sampleMolds";
import { DEFAULT_ASSEMBLY } from "@/lib/produccion/assembly";
import type { AnchoredElement, DesignConfig, PieceKind, RollLayout, WearerSide } from "@/lib/produccion/types";
import { listProductionFonts, saveDesign, saveJob, saveJobLayout, saveLayout, signedProductionUrls } from "../actions";
import { downloadProductionFiles, uploadFont, uploadToProduction } from "../upload";
import { PiecePreview, RollPreview, type FontInfo } from "../Previews";

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
type DesignRow = { id: string; requirement_id: string | null; component_id?: string | null; model_id: string | null; variant: string; version: number; config: unknown; created_at: string };
type ComponentRow = { id: string; article_type_id: string; name: string; model_id: string | null; copy_number: boolean; copy_name: boolean; sort_order: number };
type LayoutRow = { id: string; linear_meters: number; piece_count: number; pdf_path: string | null; created_at: string; requirement_id?: string | null; component_id?: string | null; variant?: string | null };

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
  components?: ComponentRow[];
  /** Trabajo libre (escalado para un tercero): sin pedido, sin artículos ni estados. */
  job?: { id: string; onModelChange?: (modelId: string) => void };
}) {
  const job = props.job;
  const { orderId, items, sizeLabels, requirements, models, designs, layouts } = props;
  // Prendas del artículo (combo). Sin prendas cargadas = una sola prenda ("").
  const componentsFor = (reqId: string): ComponentRow[] => {
    const req = requirements.find((r) => r.id === reqId);
    return (props.components ?? []).filter((c) => req?.article_type_id && c.article_type_id === req.article_type_id).sort((a, b) => a.sort_order - b.sort_order);
  };
  // Diseño guardado y molde sugerido para un artículo + prenda + variante.
  const contextFor = (reqId: string, compId: string, v: "jugador" | "arquero") => {
    const saved = designs.find((d) => (d.requirement_id ?? "") === reqId && (d.component_id ?? "") === compId && d.variant === v);
    const req = requirements.find((r) => r.id === reqId);
    const comp = componentsFor(reqId).find((c) => c.id === compId);
    const match = models.find((m) => req?.article_type_id && m.article_type_id === req.article_type_id);
    const modelId = saved?.model_id ?? comp?.model_id ?? match?.id ?? models[0]?.id ?? SAMPLE;
    const base = models.find((m) => m.id === modelId)?.base_size_label;
    return { modelId, config: normalizeConfig(saved?.config, base) };
  };

  const firstReq = requirements[0]?.id ?? "";
  const firstComp = componentsFor(firstReq)[0]?.id ?? "";
  const [requirementId, setRequirementId] = useState<string>(firstReq);
  const [componentId, setComponentId] = useState<string>(firstComp);
  const [variant, setVariant] = useState<"jugador" | "arquero">("jugador");
  const [modelId, setModelId] = useState<string>(() => contextFor(firstReq, firstComp, "jugador").modelId);
  const [config, setConfig] = useState<DesignConfig>(() => contextFor(firstReq, firstComp, "jugador").config);
  const [layout, setLayout] = useState<RollLayout | null>(null);
  // Largo de cada paño (página del PDF) y del rollo de tela/papel, en metros.
  const [panoM, setPanoM] = useState(5);
  const [rolloM, setRolloM] = useState(0);

  const selectContext = (reqId: string, compId: string, v: "jugador" | "arquero") => {
    const comps = componentsFor(reqId);
    const cid = comps.some((c) => c.id === compId) ? compId : (comps[0]?.id ?? "");
    const c = contextFor(reqId, cid, v);
    setRequirementId(reqId);
    setComponentId(cid);
    setVariant(v);
    setModelId(c.modelId);
    setConfig(c.config);
    setLayout(null);
  };

  // Fuentes: la biblioteca (lista) y los bytes de las que usa el diseño.
  const [fontList, setFontList] = useState<FontEntry[]>([]);
  const [fontBytes, setFontBytes] = useState<Record<string, Uint8Array>>({});
  const [fontInfo, setFontInfo] = useState<FontInfo>({});
  useEffect(() => {
    listProductionFonts().then(setFontList).catch(() => setFontList([]));
  }, []);
  const neededFonts = usedFonts(config).join("|");
  useEffect(() => {
    const missing = neededFonts.split("|").filter((f) => f && !fontBytes[f]);
    if (!missing.length) return;
    let alive = true;
    downloadProductionFiles(missing).then((got) => {
      if (alive && Object.keys(got).length) setFontBytes((b) => ({ ...b, ...got }));
    });
    return () => {
      alive = false;
    };
  }, [neededFonts, fontBytes]);

  // Medidor con las métricas reales de cada fuente (mismo cálculo que el PDF)
  // y registro de las fuentes en el navegador para la vista previa.
  const [measure, setMeasure] = useState<TextMeasurer>(() => approxMeasurer);
  useEffect(() => {
    let alive = true;
    (async () => {
      const doc = await PDFDocument.create();
      doc.registerFontkit(fontkit);
      const helvetica = await doc.embedFont(StandardFonts.HelveticaBold);
      const embedded: Record<string, PDFFont> = { "Helvetica-Bold": helvetica };
      const info: FontInfo = {};
      for (const [path, bytes] of Object.entries(fontBytes)) {
        try {
          embedded[path] = await doc.embedFont(bytes);
          const family = cssFamilyFor(path);
          if (typeof FontFace !== "undefined") {
            const face = new FontFace(family, bytes.slice().buffer);
            await face.load();
            document.fonts.add(face);
          }
          info[path] = { family, capRatio: capHeightRatio(embedded[path]) };
        } catch {
          // Fuente dañada o no soportada: se mide y dibuja con Helvetica.
        }
      }
      if (!alive) return;
      setMeasure(() => pdfMeasurer(embedded, helvetica));
      setFontInfo(info);
    })();
    return () => {
      alive = false;
    };
  }, [fontBytes]);

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

  const component = componentsFor(requirementId).find((c) => c.id === componentId) ?? null;
  const garments = useMemo(() => {
    const filtered = requirementId ? items.filter((i) => i.requirement_id === requirementId) : items;
    return garmentsFromItems(filtered, sizeLabels)
      .filter((g) => g.variant === variant)
      // En un combo, cada prenda lleva solo los datos que corresponden (el short: número, sin nombre).
      .map((g) => (component ? { ...g, name: component.copy_name ? g.name : null, number: component.copy_number ? g.number : null } : g));
  }, [items, requirementId, sizeLabels, variant, component]);

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

  const onCollarFile = (file: File) =>
    run("Subiendo arte del cuello…", async () => {
      const pdf = await readPdf(file);
      const path = await uploadToProduction(`disenos/${orderId}`, file, "pdf");
      setAssets((a) => ({ ...a, [path]: pdf.bytes }));
      update((c) => ({ ...c, collars: { ...c.collars, artPath: path, artAspect: pdf.heightMm / pdf.widthMm } }));
      setMessage("Arte del cuello cargado: se repite a lo largo de cada tira, al alto de la tira.");
    });

  const onFontFile = async (file: File): Promise<string | null> => {
    let path: string | null = null;
    await run("Subiendo fuente…", async () => {
      if (!/\.(ttf|otf)$/i.test(file.name)) throw new Error("La fuente tiene que ser .ttf u .otf");
      const bytes = new Uint8Array(await file.arrayBuffer());
      // Se valida antes de subir: si pdf-lib no la puede embeber, no sirve para el rollo.
      const test = await PDFDocument.create();
      test.registerFontkit(fontkit);
      await test.embedFont(bytes).catch(() => {
        throw new Error("No se pudo leer la fuente. Probá con otro archivo .ttf u .otf.");
      });
      path = await uploadFont(file);
      const p = path;
      setFontBytes((b) => ({ ...b, [p]: bytes }));
      setFontList(await listProductionFonts());
      setMessage(`Fuente cargada: ${file.name}`);
    });
    return path;
  };

  const onSaveDesign = () =>
    startTransition(async () => {
      setError(null);
      try {
        if (job) {
          await saveJob({ id: job.id, modelId: modelId === SAMPLE ? null : modelId, design: { variant, config } });
          setMessage("Diseño del trabajo guardado.");
          return;
        }
        const { version } = await saveDesign({
          orderId,
          requirementId: requirementId || null,
          componentId: componentId || null,
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
      if (!(panoM >= 1)) throw new Error("El largo del paño tiene que ser de al menos 1 m.");
      const roll = nest(build.prints, { ...DEFAULT_SETTINGS, maxSegmentLengthMm: panoM * 1000 });
      setLayout(addCollarPanel(roll, config.collars, garments.length, config.background.color));
    });

  async function makePdfBytes(l: RollLayout) {
    const paths = [config.background.filePath, config.sizeIndicator.artPath, config.collars.artPath, ...config.elements.map((e) => e.filePath)].filter(Boolean) as string[];
    const missing = paths.filter((p) => !assets[p]);
    const downloaded = missing.length ? await downloadProductionFiles(missing) : {};
    const all = { ...assets, ...downloaded };
    if (missing.length) setAssets(all);
    const elements: Record<string, Uint8Array> = {};
    for (const e of config.elements) if (e.filePath && all[e.filePath]) elements[e.filePath] = all[e.filePath];
    for (const p of [config.sizeIndicator.artPath, config.collars.artPath]) if (p && all[p]) elements[p] = all[p];
    const bg = config.background.filePath ? all[config.background.filePath] : null;
    const fonts: Record<string, Uint8Array> = {};
    const wanted = usedFonts(config);
    const missingFonts = wanted.filter((f) => !fontBytes[f]);
    const gotFonts = missingFonts.length ? await downloadProductionFiles(missingFonts) : {};
    for (const f of wanted) {
      const b = fontBytes[f] ?? gotFonts[f];
      if (!b) throw new Error("No se encontró una fuente del diseño. Elegila de nuevo o subila otra vez.");
      fonts[f] = b;
    }
    const { bytes } = await exportRollPdf(l, config.background, { background: bg, elements, fonts });
    return bytes;
  }
  async function makePdf(l: RollLayout) {
    return new Blob([(await makePdfBytes(l)) as BlobPart], { type: "application/pdf" });
  }

  const saveBlob = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  // Diseño escalado sin acomodar en rollo: una página por talle con su juego de piezas.
  const onDownloadBySize = () =>
    run("Generando PDF por talle…", async () => {
      if (!build.prints.length) throw new Error("No hay piezas: revisá talles y moldes.");
      const sheets = sizeSheets(build.prints, DEFAULT_SETTINGS);
      const out = await PDFDocument.create();
      out.setTitle("Diseño escalado por talle");
      for (const sh of sheets) {
        const src = await PDFDocument.load(await makePdfBytes(sh.layout));
        const pages = await out.copyPages(src, src.getPageIndices());
        pages.forEach((pg) => out.addPage(pg));
      }
      saveBlob(new Blob([(await out.save()) as BlobPart], { type: "application/pdf" }), `talles-${orderId.slice(0, 8)}.pdf`);
      setMessage(`PDF por talle: ${sheets.map((x) => x.size).join(", ")} (una página por talle, sin nombres ni números).`);
    });

  const onDownload = () =>
    run("Generando PDF…", async () => {
      if (!layout) return;
      saveBlob(await makePdf(layout), `rollo-${orderId.slice(0, 8)}.pdf`);
    });

  // Todas las prendas del pedido (artículo × prenda × variante) que llevan rollo.
  const ctxKey = (req: string, comp: string, v: string) => `${req}|${comp}|${v}`;
  const allContexts = useMemo(() => {
    const out: { key: string; label: string }[] = [];
    const reqIds = requirements.length ? requirements.map((r) => r.id) : [""];
    for (const req of reqIds) {
      const its = req ? items.filter((i) => i.requirement_id === req) : items;
      const variants = [...new Set(its.map((i) => (i.variant === "arquero" ? "arquero" : "jugador")))];
      const comps = componentsFor(req);
      const reqName = requirements.find((r) => r.id === req)?.description ?? "Prendas";
      for (const v of variants)
        for (const c of comps.length ? comps : [null])
          out.push({ key: ctxKey(req, c?.id ?? "", v), label: [reqName, c?.name, v === "arquero" ? "arquero" : null].filter(Boolean).join(" · ") });
    }
    return out;
    // componentsFor depende solo de props
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requirements, items, props.components]);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(
    () => new Set(layouts.filter((l) => l.variant).map((l) => ctxKey(l.requirement_id ?? "", l.component_id ?? "", l.variant!)))
  );
  const pendingRolls = allContexts.filter((c) => !savedKeys.has(c.key));

  const onSaveRoll = () =>
    run("Guardando rollo…", async () => {
      if (!layout) return;
      const blob = await makePdf(layout);
      const path = await uploadToProduction(`rollos/${orderId}`, blob, "pdf");
      if (job) {
        await saveJobLayout({ jobId: job.id, pdfPath: path, lengthMm: layout.lengthMm, pieceCount: layout.placed.length });
        setMessage(`Rollo guardado: ${(layout.lengthMm / 1000).toFixed(2)} m lineales.`);
        return;
      }
      const key = ctxKey(requirementId, componentId, variant);
      const missing = pendingRolls.filter((c) => c.key !== key);
      await saveLayout({
        orderId,
        pdfPath: path,
        lengthMm: layout.lengthMm,
        pieceCount: layout.placed.length,
        advanceStatus: missing.length === 0,
        requirementId: requirementId || null,
        componentId: componentId || null,
        variant,
      });
      setSavedKeys((s) => new Set([...s, key]));
      setMessage(
        `Rollo guardado: ${(layout.lengthMm / 1000).toFixed(2)} m lineales. ` +
          (missing.length ? `Faltan rollos de: ${missing.map((m) => m.label).join(", ")}.` : "Están todas las prendas: el pedido pasó a Sublimación / estampado.")
      );
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

      <Card className="grid gap-4 md:grid-cols-5">
        {!job && (
        <Select label="Artículo del pedido" value={requirementId} onChange={(e) => selectContext(e.target.value, componentId, variant)}>
          {requirements.map((r) => (
            <option key={r.id} value={r.id}>
              {r.description}
            </option>
          ))}
          <option value="">Todas las prendas</option>
        </Select>
        )}
        {!job && componentsFor(requirementId).length > 0 && (
          <Select label="Prenda" value={componentId} onChange={(e) => selectContext(requirementId, e.target.value, variant)}>
            {componentsFor(requirementId).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        )}
        <Select label="Variante" value={variant} onChange={(e) => selectContext(requirementId, componentId, e.target.value as "jugador" | "arquero")}>
          <option value="jugador">Jugadores</option>
          <option value="arquero">Arquero</option>
        </Select>
        <Select label="Molde" value={modelId} onChange={(e) => { setModelId(e.target.value); setLayout(null); job?.onModelChange?.(e.target.value); }}>
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
        <DesignForm config={config} update={update} onBackground={onBackground} onElementFile={onElementFile} onIndicatorFile={onIndicatorFile} fonts={fontList} onFontFile={onFontFile} onCollarFile={onCollarFile} garmentCount={garments.length} />

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
                      <PiecePreview key={p.key} print={p} fontInfo={fontInfo} safeMarginMm={config.safeMarginMm} contourMm={DEFAULT_SETTINGS.contourMm} bgColor={config.background.color} height={170} />
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
              <div className="w-28">
                <Num label="Paños de (m)" step={0.5} value={panoM} onChange={(n) => { setPanoM(n); setLayout(null); }} />
              </div>
              <div className="w-32">
                <Num label="Rollo de (m)" step={1} value={rolloM} onChange={(n) => { setRolloM(n); }} hint="0 = sin límite" />
              </div>
              <Button variant="secondary" onClick={onSaveDesign} disabled={isPending}>Guardar diseño</Button>
              <Button variant="secondary" onClick={onNest} disabled={!!busy || !build.prints.length}>Armar rollo</Button>
              <Button variant="secondary" onClick={onDownload} disabled={!!busy || !layout}>Descargar rollo</Button>
              <Button variant="secondary" onClick={onDownloadBySize} disabled={!!busy || !build.prints.length}>PDF por talle</Button>
              <Button onClick={onSaveRoll} disabled={!!busy || !layout || modelId === SAMPLE}>Guardar rollo</Button>
            </div>
            {!job && allContexts.length > 1 && (
              <p className="text-xs text-zinc-500">
                {pendingRolls.length
                  ? `Rollos pendientes: ${pendingRolls.map((c) => c.label).join(" · ")}. El pedido pasa a sublimación cuando estén todos.`
                  : "Todas las prendas tienen su rollo guardado."}
              </p>
            )}
            {layout && (
              <div className="mt-3 flex flex-col gap-3">
                <p className="text-sm text-zinc-700">
                  <b>{(layout.lengthMm / 1000).toFixed(2)} m lineales</b> en {DEFAULT_SETTINGS.rollWidthMm} mm · {layout.placed.length} piezas ·{" "}
                  {layout.segments.length} {layout.segments.length === 1 ? "paño" : "paños"} de hasta {panoM} m (una página del PDF por paño; ninguna pieza queda partida)
                </p>
                <ul className="text-xs text-zinc-600">
                  {layout.segments.map((sg, i) => (
                    <li key={i}>
                      Paño {i + 1}: {((sg.endMm - sg.startMm) / 1000).toFixed(2)} m{sg.collars ? " (cuellos)" : ""}
                    </li>
                  ))}
                </ul>
                {rolloM > 0 &&
                  (() => {
                    const g = groupIntoRolls(layout, rolloM * 1000);
                    return (
                      <div className="text-sm text-zinc-700">
                        {g.rolls.length === 1 ? (
                          <p>Entra en un rollo de {rolloM} m (sobran {(rolloM - g.rolls[0].lengthMm / 1000).toFixed(2)} m).</p>
                        ) : (
                          <p className="text-amber-700">
                            No entra en un rollo de {rolloM} m: hacen falta {g.rolls.length} rollos.
                          </p>
                        )}
                        {g.rolls.length > 1 && (
                          <ul className="text-xs">
                            {g.rolls.map((rl) => (
                              <li key={rl.index}>
                                Rollo {rl.index}: paños {rl.firstPano}–{rl.lastPano} · {(rl.lengthMm / 1000).toFixed(2)} m
                              </li>
                            ))}
                          </ul>
                        )}
                        {g.tooLong.length > 0 && <p className="text-red-600">Los paños {g.tooLong.join(", ")} son más largos que el rollo: bajá el largo del paño.</p>}
                      </div>
                    );
                  })()}
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
  fonts,
  onFontFile,
  onCollarFile,
  garmentCount,
}: {
  config: DesignConfig;
  update: (fn: (c: DesignConfig) => DesignConfig) => void;
  onBackground: (f: File) => void;
  onElementFile: (idx: number, f: File) => void;
  onIndicatorFile: (f: File) => void;
  fonts: FontEntry[];
  onFontFile: (f: File) => Promise<string | null>;
  onCollarFile: (f: File) => void;
  garmentCount: number;
}) {
  const fontSelect = (label: string, value: string | undefined, set: (font: string) => void) => (
    <FontSelect label={label} value={value} fonts={fonts} onChange={set} onUpload={async (f) => { const p = await onFontFile(f); if (p) set(p); }} />
  );
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
            {fontSelect("Fuente del número", config.number.style.font, (font) => update((c) => ({ ...c, number: { ...c.number, style: { ...c.number.style, font } } })))}
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
            {fontSelect("Fuente del nombre", config.name.style.font, (font) => update((c) => ({ ...c, name: { ...c.name, style: { ...c.name.style, font } } })))}
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
            {fontSelect("Fuente", config.sizeTag.font, (font) => update((c) => ({ ...c, sizeTag: { ...c.sizeTag, font } })))}
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
              <Num label="Alto de la letra (mm)" value={config.sizeIndicator.textHeightMm} onChange={(n) => update((c) => ({ ...c, sizeIndicator: { ...c.sizeIndicator, textHeightMm: n } }))} />
              {fontSelect("Fuente de la letra", config.sizeIndicator.font, (font) => update((c) => ({ ...c, sizeIndicator: { ...c.sizeIndicator, font } })))}
            </div>
          </div>
        )}
      </Card>
      <Card className="flex flex-col gap-3">
        <label className="flex items-center gap-2 text-sm font-medium text-zinc-900">
          <input type="checkbox" checked={config.collars.enabled} onChange={(e) => update((c) => ({ ...c, collars: { ...c.collars, enabled: e.target.checked } }))} />
          Cuellos sublimados (tiras al final del rollo)
        </label>
        {config.collars.enabled && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-zinc-500">
              {collarStripCount(garmentCount, config.collars)} tiras de {config.collars.stripHeightMm} mm a lo ancho del rollo
              ({(((collarStripCount(garmentCount, config.collars) * config.collars.stripHeightMm) / 1000)).toFixed(2)} m), sin marcas: la costurera corta a demanda.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Num label="Alto de la tira (mm)" value={config.collars.stripHeightMm} onChange={(n) => update((c) => ({ ...c, collars: { ...c.collars, stripHeightMm: n } }))} />
              <Num label="Cuellos por tira" value={config.collars.necksPerStrip} onChange={(n) => update((c) => ({ ...c, collars: { ...c.collars, necksPerStrip: n } }))} />
              <Num label="Tiras de más" value={config.collars.extraStrips} onChange={(n) => update((c) => ({ ...c, collars: { ...c.collars, extraStrips: n } }))} hint="Por si hay que rehacer" />
              <Input label="Color (vacío = fondo)" value={config.collars.color ?? ""} placeholder={config.background.color ?? "#FFFFFF"} onChange={(e) => update((c) => ({ ...c, collars: { ...c.collars, color: e.target.value || null } }))} />
              <Num label="Línea divisoria (mm)" step={0.1} value={config.collars.separatorMm} onChange={(n) => update((c) => ({ ...c, collars: { ...c.collars, separatorMm: n } }))} />
              <Input label="Color de la línea" value={config.collars.separatorColor} onChange={(e) => update((c) => ({ ...c, collars: { ...c.collars, separatorColor: e.target.value || "auto" } }))} hint="auto = contrasta" />
            </div>
            <label className="text-xs font-medium text-zinc-500">
              Arte de la tira (opcional, PDF que se repite: rayas, textura) {config.collars.artPath ? "(cargado)" : ""}
              <input type="file" accept="application/pdf" className="mt-1 block w-full text-sm" onChange={(e) => e.target.files?.[0] && onCollarFile(e.target.files[0])} />
            </label>
            {config.collars.artPath && (
              <button type="button" className="self-start text-xs text-red-600 hover:underline" onClick={() => update((c) => ({ ...c, collars: { ...c.collars, artPath: null } }))}>
                Quitar arte (queda el color liso)
              </button>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

const UPLOAD = "__subir__";

/** Selector de fuente: Helvetica Bold, las fuentes subidas, o subir una nueva. */
function FontSelect({
  label,
  value,
  fonts,
  onChange,
  onUpload,
}: {
  label: string;
  value: string | undefined;
  fonts: FontEntry[];
  onChange: (font: string) => void;
  onUpload: (f: File) => void;
}) {
  const inputId = "font-" + useId().replace(/:/g, "");
  const current = value || "Helvetica-Bold";
  const known = current === "Helvetica-Bold" || fonts.some((f) => f.path === current);
  return (
    <div className="flex flex-col">
      <Select
        label={label}
        value={current}
        onChange={(e) => {
          if (e.target.value === UPLOAD) document.getElementById(inputId)?.click();
          else onChange(e.target.value);
        }}
      >
        <option value="Helvetica-Bold">Helvetica Bold</option>
        {fonts.map((f) => (
          <option key={f.path} value={f.path}>
            {f.name}
          </option>
        ))}
        {!known && <option value={current}>(fuente no encontrada)</option>}
        <option value={UPLOAD}>Subir fuente .ttf / .otf…</option>
      </Select>
      <input
        id={inputId}
        type="file"
        accept=".ttf,.otf,font/ttf,font/otf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUpload(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
