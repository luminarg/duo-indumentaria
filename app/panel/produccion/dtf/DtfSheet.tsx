"use client";

import { useState, useTransition } from "react";
import { PDFDocument } from "pdf-lib";
import { zipSync } from "fflate";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Input, Select } from "../../../components/ui/Input";
import { exportDtfPdf, packDtf, type DtfFile, type DtfLayout, type DtfSettings } from "@/lib/produccion/dtf";
import { canvasToPng300, renderDtfSheet } from "@/lib/produccion/dtfRaster";

type Row = { id: string; name: string; file: DtfFile; aspect: number; widthCm: number; qty: number };

const PAPERS: { id: string; label: string; w: number; h: number; roll: boolean }[] = [
  { id: "r58", label: "Rollo 58 cm", w: 580, h: 1000, roll: true },
  { id: "r60", label: "Rollo 60 cm", w: 600, h: 1000, roll: true },
  { id: "r30", label: "Rollo 30 cm", w: 300, h: 1000, roll: true },
  { id: "a3", label: "Hoja A3 (29,7 × 42 cm)", w: 297, h: 420, roll: false },
  { id: "a4", label: "Hoja A4 (21 × 29,7 cm)", w: 210, h: 297, roll: false },
  { id: "custom", label: "Otra medida", w: 580, h: 1000, roll: true },
];

const MM = 72 / 25.4;
const PX_MM_300 = 300 / 25.4;

async function readDesign(f: File): Promise<{ file: DtfFile; aspect: number; widthMm: number }> {
  const bytes = new Uint8Array(await f.arrayBuffer());
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  if (/pdf$/i.test(f.type) || /\.pdf$/i.test(f.name)) {
    const p = (await PDFDocument.load(bytes, { ignoreEncryption: true })).getPage(0).getSize();
    return { file: { id, kind: "pdf", bytes }, aspect: p.height / p.width, widthMm: p.width / MM };
  }
  const kind = /png$/i.test(f.type) || /\.png$/i.test(f.name) ? "png" : "jpg";
  const bmp = await createImageBitmap(new Blob([bytes as BlobPart], { type: f.type || `image/${kind}` }));
  // Medida a 300 dpi (la de la imagen tal como está).
  return { file: { id, kind, bytes }, aspect: bmp.height / bmp.width, widthMm: bmp.width / PX_MM_300 };
}

function save(bytes: Uint8Array, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function DtfSheet() {
  const [rows, setRows] = useState<Row[]>([]);
  const [paper, setPaper] = useState("r58");
  const [customW, setCustomW] = useState(58);
  const [customH, setCustomH] = useState(100);
  const [customRoll, setCustomRoll] = useState(true);
  const [tramoCm, setTramoCm] = useState(100);
  const [marginMm, setMarginMm] = useState(5);
  const [gapMm, setGapMm] = useState(5);
  const [rotate, setRotate] = useState(true);
  const [layout, setLayout] = useState<DtfLayout | null>(null);
  const [previews, setPreviews] = useState<string[]>([]);
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

  const settings = (): DtfSettings => {
    const p = PAPERS.find((x) => x.id === paper)!;
    const custom = paper === "custom";
    const roll = custom ? customRoll : p.roll;
    const w = custom ? customW * 10 : p.w;
    const h = roll ? tramoCm * 10 : custom ? customH * 10 : p.h;
    return { paperWidthMm: w, paperHeightMm: h, roll, marginMm, gapMm, allowRotate: rotate };
  };
  const files = () => rows.map((r) => r.file);

  const onFiles = (list: FileList) =>
    run("Leyendo archivos…", async () => {
      const added: Row[] = [];
      for (const f of Array.from(list)) {
        const d = await readDesign(f);
        added.push({ id: d.file.id, name: f.name.replace(/\.[^.]+$/, ""), file: d.file, aspect: d.aspect, widthCm: Math.round(d.widthMm) / 10, qty: 1 });
      }
      setRows((r) => [...r, ...added]);
      setLayout(null);
    });

  const patch = (id: string, p: Partial<Row>) => {
    setRows((r) => r.map((x) => (x.id === id ? { ...x, ...p } : x)));
    setLayout(null);
  };

  const onPack = () =>
    run("Acomodando…", async () => {
      if (!rows.length) throw new Error("Subí al menos un diseño.");
      const s = settings();
      const L = packDtf(
        rows.map((r) => ({ id: r.id, name: r.name, widthMm: r.widthCm * 10, heightMm: r.widthCm * 10 * r.aspect, qty: r.qty })),
        s
      );
      setLayout(L);
      // Vista previa liviana (25 dpi).
      const urls: string[] = [];
      for (let i = 0; i < L.sheets.length; i++) urls.push((await renderDtfSheet(L, files(), i, 25)).toDataURL("image/png"));
      setPreviews(urls);
      const used = L.sheets.reduce((a, sh) => a + sh.heightMm, 0) / 1000;
      setMessage(
        `${L.placed.length} diseños en ${L.sheets.length} ${s.roll ? (L.sheets.length === 1 ? "tramo" : "tramos") : L.sheets.length === 1 ? "hoja" : "hojas"}` +
          (s.roll ? ` · ${used.toFixed(2)} m de papel` : "") +
          (L.tooBig.length ? `. No entran en el papel: ${L.tooBig.join(", ")}.` : ".")
      );
    });

  const onPdf = () =>
    run("Generando PDF…", async () => {
      if (!layout) return;
      save(await exportDtfPdf(layout, files()), `dtf-${new Date().toISOString().slice(0, 10)}.pdf`, "application/pdf");
    });

  const onPng = () =>
    run("Generando PNG a 300 dpi…", async () => {
      if (!layout) return;
      const out: Record<string, Uint8Array> = {};
      for (let i = 0; i < layout.sheets.length; i++) {
        setBusy(`Generando PNG a 300 dpi… (${i + 1} de ${layout.sheets.length})`);
        const canvas = await renderDtfSheet(layout, files(), i, 300);
        out[`dtf-${String(i + 1).padStart(2, "0")}.png`] = await canvasToPng300(canvas, 300);
        canvas.width = canvas.height = 0;
      }
      const day = new Date().toISOString().slice(0, 10);
      const names = Object.keys(out);
      if (names.length === 1) save(out[names[0]], `dtf-${day}.png`, "image/png");
      else save(zipSync(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [v, { level: 0 }]]))), `dtf-${day}.zip`, "application/zip");
    });

  const s = settings();
  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-zinc-900">Papel</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-56">
            <Select label="Papel" value={paper} onChange={(e) => { setPaper(e.target.value); setLayout(null); }}>
              {PAPERS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </Select>
          </div>
          {paper === "custom" && (
            <>
              <div className="w-28">
                <Input label="Ancho (cm)" type="number" value={customW} onChange={(e) => { setCustomW(Number(e.target.value)); setLayout(null); }} />
              </div>
              <label className="flex items-center gap-2 pb-2 text-sm text-zinc-700">
                <input type="checkbox" checked={customRoll} onChange={(e) => { setCustomRoll(e.target.checked); setLayout(null); }} /> Es rollo
              </label>
              {!customRoll && (
                <div className="w-28">
                  <Input label="Alto (cm)" type="number" value={customH} onChange={(e) => { setCustomH(Number(e.target.value)); setLayout(null); }} />
                </div>
              )}
            </>
          )}
          {s.roll && (
            <div className="w-36">
              <Input label="Largo por tramo (cm)" type="number" step={10} value={tramoCm} onChange={(e) => { setTramoCm(Math.max(10, Number(e.target.value))); setLayout(null); }} hint="Cada tramo es un PNG" />
            </div>
          )}
          <div className="w-28">
            <Input label="Margen (mm)" type="number" value={marginMm} onChange={(e) => { setMarginMm(Math.max(0, Number(e.target.value))); setLayout(null); }} />
          </div>
          <div className="w-32">
            <Input label="Distancia mín. (mm)" type="number" value={gapMm} onChange={(e) => { setGapMm(Math.max(0, Number(e.target.value))); setLayout(null); }} />
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm text-zinc-700">
            <input type="checkbox" checked={rotate} onChange={(e) => { setRotate(e.target.checked); setLayout(null); }} /> Permitir girar 90°
          </label>
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="mr-auto text-sm font-medium text-zinc-900">Diseños · {rows.reduce((a, r) => a + r.qty, 0)} copias</h2>
          <label className="cursor-pointer rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50">
            Subir diseños (PDF, PNG, JPG)
            <input type="file" multiple accept="application/pdf,image/png,image/jpeg" className="hidden" onChange={(e) => { if (e.target.files?.length) onFiles(e.target.files); e.target.value = ""; }} />
          </label>
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-zinc-500">Todavía no hay diseños. Los PDF van vectoriales; las imágenes conviene que estén a 300 dpi y con fondo transparente.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-zinc-500">
              <tr>
                <th className="py-1 font-medium">Diseño</th>
                <th className="py-1 font-medium">Ancho (cm)</th>
                <th className="py-1 font-medium">Alto (cm)</th>
                <th className="py-1 font-medium">Cantidad</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-zinc-100">
                  <td className="py-1.5 pr-2">
                    <input className="w-full rounded border border-zinc-200 px-2 py-1" value={r.name} onChange={(e) => patch(r.id, { name: e.target.value })} />
                    <span className="text-xs text-zinc-400">{r.file.kind.toUpperCase()}</span>
                  </td>
                  <td className="py-1.5 pr-2">
                    <input type="number" step={0.5} className="w-20 rounded border border-zinc-300 px-2 py-1" value={r.widthCm} onChange={(e) => patch(r.id, { widthCm: Math.max(0.5, Number(e.target.value)) })} />
                  </td>
                  <td className="py-1.5 pr-2">
                    <input
                      type="number"
                      step={0.5}
                      className="w-20 rounded border border-zinc-300 px-2 py-1"
                      value={Math.round(r.widthCm * r.aspect * 10) / 10}
                      onChange={(e) => patch(r.id, { widthCm: Math.max(0.5, Number(e.target.value) / r.aspect) })}
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <input type="number" min={1} className="w-20 rounded border border-zinc-300 px-2 py-1" value={r.qty} onChange={(e) => patch(r.id, { qty: Math.max(1, Math.floor(Number(e.target.value)) || 1) })} />
                  </td>
                  <td className="py-1.5 text-right">
                    <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => { setRows((x) => x.filter((y) => y.id !== r.id)); setLayout(null); }}>
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={onPack} disabled={!!busy || !rows.length}>Acomodar en el papel</Button>
          <Button variant="secondary" onClick={onPdf} disabled={!!busy || !layout}>Descargar PDF</Button>
          <Button onClick={onPng} disabled={!!busy || !layout}>Descargar PNG 300 dpi</Button>
        </div>
        {busy && <p className="text-sm text-zinc-600">{busy}</p>}
        {message && <p className="text-sm text-green-700">{message}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </Card>

      {layout && previews.length > 0 && (
        <Card className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-zinc-900">Vista previa</h2>
          <div className="flex flex-wrap items-start gap-4">
            {previews.map((src, i) => (
              <figure key={i} className="flex flex-col items-center gap-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={`Papel ${i + 1}`}
                  className="max-h-[520px] border border-zinc-300"
                  style={{ backgroundImage: "repeating-conic-gradient(#e4e4e7 0% 25%, #fff 0% 50%)", backgroundSize: "16px 16px" }}
                />
                <figcaption className="text-xs text-zinc-500">
                  {s.roll ? "Tramo" : "Hoja"} {i + 1} · {(layout.sheets[i].widthMm / 10).toFixed(1)} × {(layout.sheets[i].heightMm / 10).toFixed(1)} cm
                </figcaption>
              </figure>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
