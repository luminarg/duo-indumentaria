"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Input, Select } from "../../../components/ui/Input";
import { EmptyState } from "../../../components/ui/EmptyState";
import { parseSvgPieces, type ImportedPiece } from "@/lib/produccion/svgImport";
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

function ModelDetail({ model, sizes }: { model: Model; sizes: Record<string, string[]> }) {
  const router = useRouter();
  const [sizeLabel, setSizeLabel] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pieces, setPieces] = useState<(ImportedPiece & { kind: PieceKind })[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onFile = async (f: File) => {
    setError(null);
    setStatus(null);
    setFile(f);
    try {
      const { pieces: found, notes } = parseSvgPieces(await f.text());
      setPieces(found.map((p) => ({ ...p, kind: p.guessedKind })));
      setNotes(notes);
      if (!found.length) setError("No se encontraron piezas cerradas en el archivo.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onSave = () =>
    startTransition(async () => {
      setError(null);
      try {
        if (!sizeLabel.trim()) throw new Error("Indicá el talle de este archivo");
        const use = pieces.filter((p) => p.kind !== "otra");
        const kinds = use.map((p) => p.kind);
        if (new Set(kinds).size !== kinds.length) throw new Error("Hay dos piezas con el mismo tipo");
        const sourcePath = file ? await uploadToProduction(`moldes/${model.id}`, file, "svg") : null;
        await savePatternPieces(
          model.id,
          use.map((p) => ({
            sizeLabel: sizeLabel.trim(),
            kind: p.kind,
            outline: p.outline.map((q) => [Math.round(q.x * 100) / 100, Math.round(q.y * 100) / 100] as [number, number]),
            widthMm: p.widthMm,
            heightMm: p.heightMm,
            sourceFilePath: sourcePath,
          }))
        );
        setStatus(`Talle ${sizeLabel} guardado con ${use.length} piezas.`);
        setPieces([]);
        setFile(null);
        setSizeLabel("");
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
        <h2 className="text-sm font-medium text-zinc-900">Importar un talle</h2>
        <p className="text-xs text-zinc-500">
          En Corel: seleccioná las piezas del talle y exportá como SVG, a escala real (1:1). Las piezas se detectan solas; revisá que cada una tenga el tipo correcto.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Talle" value={sizeLabel} onChange={(e) => setSizeLabel(e.target.value)} placeholder="L, 10, 4XL…" />
          <label className="text-xs font-medium text-zinc-500">
            Archivo SVG
            <input type="file" accept=".svg,image/svg+xml" className="mt-2 block w-full text-sm" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
        </div>
        {notes.map((n) => (
          <p key={n} className="text-xs text-amber-700">{n}</p>
        ))}
        {pieces.length > 0 && (
          <div className="flex flex-wrap gap-4">
            {pieces.map((p, i) => (
              <div key={i} className="flex flex-col items-center gap-2 rounded-md border border-zinc-200 p-2">
                <svg viewBox={`-10 -10 ${p.widthMm + 20} ${p.heightMm + 20}`} height={160}>
                  <path d={pathD(p.outline)} fill="#f4f4f5" stroke="#111" strokeWidth={2} />
                </svg>
                <span className="text-xs text-zinc-500">
                  {p.widthMm.toFixed(0)} × {p.heightMm.toFixed(0)} mm
                </span>
                <select
                  className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
                  value={p.kind}
                  onChange={(e) => setPieces((ps) => ps.map((q, j) => (j === i ? { ...q, kind: e.target.value as PieceKind } : q)))}
                >
                  {KINDS.map((k) => (
                    <option key={k.value} value={k.value}>{k.label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}
        {status && <p className="text-sm text-green-700">{status}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button onClick={onSave} disabled={isPending || !pieces.length} className="self-start">
          Guardar talle
        </Button>
      </Card>
    </div>
  );
}
