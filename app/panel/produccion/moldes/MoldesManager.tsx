"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Input, Select } from "../../../components/ui/Input";
import { EmptyState } from "../../../components/ui/EmptyState";
import { importSvg, type ImportedPiece } from "@/lib/produccion/vectorImport";
import { importPdf } from "@/lib/produccion/pdfImport";
import { normalizeSize } from "@/lib/produccion/rules";
import type { PieceKind, Poly } from "@/lib/produccion/types";
import { createPatternModel, deletePatternModel, savePatternPieces } from "../actions";
import { uploadToProduction } from "../upload";

type Model = { id: string; name: string; neck: string | null; base_size_label: string; article_type_id: string | null; active: boolean };

const KINDS: { value: PieceKind; label: string }[] = [
  { value: "frente", label: "Frente" },
  { value: "espalda", label: "Espalda" },
  { value: "manga_izq", label: "Manga izquierda" },
  { value: "manga_der", label: "Manga derecha" },
  { value: "otra", label: "Otra / no usar" },
];

const pathD = (poly: Poly) => `M${poly.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L")} Z`;

export function MoldesManager({
  models,
  summary,
  articleTypes,
}: {
  models: Model[];
  summary: Record<string, Record<string, string[]>>;
  articleTypes: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>(models[0]?.id ?? "");

  const onCreate = (fd: FormData) =>
    startTransition(async () => {
      setError(null);
      try {
        const { id } = await createPatternModel(fd);
        setSelected(id);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });

  return (
    <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
      <div className="flex flex-col gap-4">
        <Card>
          <form action={onCreate} className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-zinc-900">Nuevo modelo</h2>
            <Input name="name" label="Nombre" placeholder="Remera cuello redondo" required />
            <Select name="article_type_id" label="Tipo de artículo" defaultValue="">
              <option value="">—</option>
              {articleTypes.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
            <div className="grid grid-cols-2 gap-2">
              <Select name="neck" label="Cuello" defaultValue="redondo">
                <option value="redondo">Redondo</option>
                <option value="v">V</option>
                <option value="raglan">Raglan</option>
              </Select>
              <Input name="base_size_label" label="Talle base" defaultValue="L" />
            </div>
            <Button type="submit" disabled={isPending}>Crear modelo</Button>
          </form>
        </Card>

        {models.length ? (
          <Card className="flex flex-col gap-1 p-2">
            {models.map((m) => {
              const sizes = Object.keys(summary[m.id] ?? {});
              return (
                <button
                  key={m.id}
                  onClick={() => setSelected(m.id)}
                  className={`rounded-md px-3 py-2 text-left text-sm ${selected === m.id ? "bg-zinc-900 text-white" : "hover:bg-zinc-100"}`}
                >
                  <div className="font-medium">{m.name}</div>
                  <div className={`text-xs ${selected === m.id ? "text-zinc-300" : "text-zinc-500"}`}>
                    {sizes.length ? `${sizes.length} talles` : "Sin piezas"} · base {m.base_size_label}
                  </div>
                </button>
              );
            })}
          </Card>
        ) : (
          <EmptyState message="Todavía no hay modelos de molde." />
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      {selected && models.find((m) => m.id === selected) && (
        <ModelDetail key={selected} model={models.find((m) => m.id === selected)!} sizes={summary[selected] ?? {}} />
      )}
    </div>
  );
}

type Row = ImportedPiece & { key: number };

function ModelDetail({ model, sizes }: { model: Model; sizes: Record<string, string[]> }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [fallbackSize, setFallbackSize] = useState("");
  const [notes, setNotes] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onFile = async (f: File) => {
    setError(null);
    setStatus(null);
    setFile(f);
    try {
      const isPdf = f.name.toLowerCase().endsWith(".pdf") || f.type === "application/pdf";
      const res = isPdf ? await importPdf(new Uint8Array(await f.arrayBuffer())) : importSvg(await f.text());
      setRows(res.pieces.map((p, i) => ({ ...p, key: i })));
      setNotes(res.notes);
      if (!res.pieces.length) setError("No se encontraron piezas cerradas en el archivo.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  // Grupos por talle (las piezas sin talle van juntas y usan el talle que se escriba).
  const groups = (() => {
    const m = new Map<string, Row[]>();
    for (const r of rows) {
      const k = r.sizeLabel ?? "";
      (m.get(k) ?? m.set(k, []).get(k)!).push(r);
    }
    const order = (k: string) => {
      if (!k) return 1000;
      const n = Number(k);
      if (Number.isFinite(n)) return n;
      const i = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "XXXXL"].indexOf(normalizeSize(k));
      return i >= 0 ? 100 + i : 500;
    };
    return [...m.entries()].sort((a, b) => order(a[0]) - order(b[0]));
  })();

  const setRow = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const renameGroup = (from: string, to: string) =>
    setRows((rs) => rs.map((r) => ((r.sizeLabel ?? "") === from ? { ...r, sizeLabel: to.trim().toUpperCase() || null } : r)));

  const onSave = () =>
    startTransition(async () => {
      setError(null);
      try {
        const use = rows
          .filter((r) => r.kind !== "otra")
          .map((r) => ({ ...r, sizeLabel: r.sizeLabel ?? (fallbackSize.trim().toUpperCase() || null) }));
        if (use.some((r) => !r.sizeLabel)) throw new Error("Hay piezas sin talle: escribilo en su grupo.");
        const bySize = new Map<string, Row[]>();
        for (const r of use) (bySize.get(r.sizeLabel!) ?? bySize.set(r.sizeLabel!, []).get(r.sizeLabel!)!).push(r);
        for (const [size, list] of bySize) {
          const kinds = list.map((p) => p.kind);
          if (new Set(kinds).size !== kinds.length) throw new Error(`En el talle ${size} hay dos piezas con el mismo tipo.`);
        }
        const ext = file?.name.toLowerCase().endsWith(".pdf") ? "pdf" : "svg";
        const sourcePath = file ? await uploadToProduction(`moldes/${model.id}`, file, ext) : null;
        await savePatternPieces(
          model.id,
          use.map((p) => ({
            sizeLabel: p.sizeLabel!,
            kind: p.kind,
            outline: p.outline.map((q) => [Math.round(q.x * 100) / 100, Math.round(q.y * 100) / 100] as [number, number]),
            widthMm: p.widthMm,
            heightMm: p.heightMm,
            sourceFilePath: sourcePath,
          }))
        );
        setStatus(`Guardados ${bySize.size} talles (${use.length} piezas).`);
        setRows([]);
        setFile(null);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });

  const sortedSizes = Object.entries(sizes);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-zinc-900">{model.name}</h2>
          <button
            className="text-xs text-red-600 hover:underline"
            onClick={() =>
              confirm("¿Borrar el modelo y todas sus piezas?") &&
              startTransition(async () => {
                await deletePatternModel(model.id);
                router.refresh();
              })
            }
          >
            Borrar modelo
          </button>
        </div>
        {sortedSizes.length ? (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-zinc-500">
                <th className="py-2 font-medium">Talle</th>
                <th className="py-2 font-medium">Piezas</th>
              </tr>
            </thead>
            <tbody>
              {sortedSizes.map(([s, kinds]) => (
                <tr key={s} className="border-b border-zinc-100 last:border-0">
                  <td className="py-2 font-medium">{s}</td>
                  <td className="py-2 text-zinc-600">{kinds.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-zinc-500">Todavía no hay talles cargados.</p>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-zinc-900">Importar moldería</h2>
        <p className="text-xs text-zinc-500">
          Exportá desde Corel a PDF o SVG, a escala real (1:1). Puede ser un archivo con un talle o con todos: si debajo de cada grupo de piezas está escrito el talle, se asignan solos. Revisá talles y tipos antes de guardar.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-medium text-zinc-500">
            Archivo PDF o SVG
            <input type="file" accept=".pdf,.svg,application/pdf,image/svg+xml" className="mt-2 block w-full text-sm" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
          {groups.some(([k]) => !k) && (
            <Input label="Talle de las piezas sin talle" value={fallbackSize} onChange={(e) => setFallbackSize(e.target.value)} placeholder="L, 10, XXL…" />
          )}
        </div>
        {notes.map((n) => (
          <p key={n} className="text-xs text-amber-700">{n}</p>
        ))}
        {groups.map(([size, list]) => (
          <div key={size || "sin-talle"} className="flex flex-col gap-2 rounded-md border border-zinc-200 p-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500">Talle</span>
              <input
                className="w-24 rounded-md border border-zinc-300 px-2 py-1 text-sm font-medium"
                defaultValue={size}
                placeholder={fallbackSize || "?"}
                onBlur={(e) => e.target.value.trim().toUpperCase() !== size && renameGroup(size, e.target.value)}
              />
              <span className="text-xs text-zinc-500">{list.length} piezas</span>
            </div>
            <div className="flex flex-wrap gap-3">
              {list.map((p) => (
                <div key={p.key} className="flex flex-col items-center gap-1">
                  <svg viewBox={`-10 -10 ${p.widthMm + 20} ${p.heightMm + 20}`} height={90}>
                    <path d={pathD(p.outline)} fill="#f4f4f5" stroke="#111" strokeWidth={3} />
                  </svg>
                  <span className="text-[11px] text-zinc-500">
                    {p.widthMm.toFixed(1)} × {p.heightMm.toFixed(1)} mm
                  </span>
                  <select
                    className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
                    value={p.kind}
                    onChange={(e) => setRow(p.key, { kind: e.target.value as PieceKind })}
                  >
                    {KINDS.map((k) => (
                      <option key={k.value} value={k.value}>{k.label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        ))}
        {status && <p className="text-sm text-green-700">{status}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button onClick={onSave} disabled={isPending || !rows.length} className="self-start">
          Guardar moldería
        </Button>
      </Card>
    </div>
  );
}
