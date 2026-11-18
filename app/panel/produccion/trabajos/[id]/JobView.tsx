"use client";

import { useMemo, useState, useTransition } from "react";
import { Card } from "../../../../components/ui/Card";
import { Button } from "../../../../components/ui/Button";
import { Input, Select } from "../../../../components/ui/Input";
import type { AssemblyRow, OrderItemRow, PatternPieceRow } from "@/lib/produccion/db";
import { ProductionWorkbench } from "../../[id]/ProductionWorkbench";
import { saveJob, type JobItem } from "../../actions";

type Model = { id: string; name: string; neck: string | null; base_size_label: string; article_type_id: string | null };
type LayoutRow = { id: string; linear_meters: number; piece_count: number; pdf_path: string | null; created_at: string };

/** Pegado desde Excel/planilla: talle, cantidad, nombre, número (tab, ; o ,). */
export function parsePastedItems(text: string): JobItem[] {
  const out: JobItem[] = [];
  for (const line of text.split(/\r?\n/)) {
    const cells = line.split(/\t|;|,/).map((c) => c.trim());
    if (!cells[0]) continue;
    const qty = Number(cells[1]);
    if (/^talle$/i.test(cells[0])) continue; // encabezado
    out.push({ size: cells[0], qty: Number.isFinite(qty) && qty > 0 ? Math.floor(qty) : 1, name: cells[2] || null, number: cells[3] || null, variant: /arq/i.test(cells[4] ?? "") ? "arquero" : "jugador" });
  }
  return out;
}

export function JobView({
  job,
  models,
  pieces,
  assembly,
  layouts,
}: {
  job: { id: string; clientName: string; notes: string | null; modelId: string | null; items: JobItem[]; design: Record<string, unknown> };
  models: Model[];
  pieces: PatternPieceRow[];
  assembly: (AssemblyRow & { model_id: string })[];
  layouts: LayoutRow[];
}) {
  const [items, setItems] = useState<JobItem[]>(job.items.length ? job.items : [{ size: "M", qty: 1, variant: "jugador" }]);
  const [dirty, setDirty] = useState(false);
  const [paste, setPaste] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const set = (next: JobItem[]) => {
    setItems(next);
    setDirty(true);
    setMsg(null);
  };
  const patch = (i: number, p: Partial<JobItem>) => set(items.map((it, j) => (j === i ? { ...it, ...p } : it)));

  // El banco de trabajo espera filas de pedido: se arman a partir de la tabla.
  const rows: OrderItemRow[] = useMemo(
    () =>
      items
        .filter((i) => i.size.trim())
        .map((i, k) => ({
          id: `t${k}`,
          size_id: null,
          size_label: i.size.trim(),
          individual_name: i.name || null,
          individual_number: i.number || null,
          quantity: Math.max(1, Math.floor(Number(i.qty) || 1)),
          variant: i.variant ?? "jugador",
          requirement_id: null,
        })),
    [items]
  );
  const designs = useMemo(
    () =>
      (["jugador", "arquero"] as const)
        .filter((v) => job.design[v])
        .map((v) => ({ id: v, requirement_id: null, component_id: null, model_id: job.modelId, variant: v, version: 1, config: job.design[v], created_at: "" })),
    [job]
  );

  const onSaveItems = () =>
    startTransition(async () => {
      setError(null);
      try {
        await saveJob({ id: job.id, items });
        setDirty(false);
        setMsg("Talles guardados.");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });

  const total = items.reduce((s, i) => s + (Number(i.qty) || 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="mr-auto text-sm font-medium text-zinc-900">Talles y cantidades · {total} prendas</h2>
          <Button variant="secondary" type="button" onClick={() => set([...items, { size: "", qty: 1, variant: "jugador" }])}>
            + Fila
          </Button>
          <Button type="button" onClick={onSaveItems} disabled={isPending || !dirty}>
            Guardar talles
          </Button>
        </div>
        <p className="text-xs text-zinc-500">Nombre y número son opcionales: si es solo escalado, dejalos vacíos.</p>
        <div className="flex flex-col gap-2">
          {items.map((it, i) => (
            <div key={i} className="grid grid-cols-[80px_70px_1fr_80px_120px_auto] items-end gap-2">
              <Input label={i === 0 ? "Talle" : undefined} value={it.size} onChange={(e) => patch(i, { size: e.target.value })} />
              <Input label={i === 0 ? "Cant." : undefined} type="number" min={1} value={it.qty} onChange={(e) => patch(i, { qty: Number(e.target.value) })} />
              <Input label={i === 0 ? "Nombre" : undefined} value={it.name ?? ""} onChange={(e) => patch(i, { name: e.target.value })} />
              <Input label={i === 0 ? "Número" : undefined} value={it.number ?? ""} onChange={(e) => patch(i, { number: e.target.value })} />
              <Select label={i === 0 ? "Variante" : undefined} value={it.variant ?? "jugador"} onChange={(e) => patch(i, { variant: e.target.value as "jugador" | "arquero" })}>
                <option value="jugador">Jugador</option>
                <option value="arquero">Arquero</option>
              </Select>
              <button type="button" className="pb-2 text-sm text-red-600 hover:underline" onClick={() => set(items.filter((_, j) => j !== i))}>
                Quitar
              </button>
            </div>
          ))}
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer text-zinc-600">Pegar desde Excel</summary>
          <div className="mt-2 flex flex-col gap-2">
            <p className="text-xs text-zinc-500">Una fila por línea: talle, cantidad, nombre, número (copiá las columnas de la planilla y pegalas acá).</p>
            <textarea
              className="min-h-28 w-full rounded-md border border-zinc-300 p-2 font-mono text-xs"
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder={"M\t10\nL\t8\nXL\t4"}
            />
            <div className="flex gap-2">
              <Button
                variant="secondary"
                type="button"
                disabled={!paste.trim()}
                onClick={() => {
                  const parsed = parsePastedItems(paste);
                  if (parsed.length) set(parsed);
                  setPaste("");
                }}
              >
                Reemplazar tabla
              </Button>
              <Button
                variant="secondary"
                type="button"
                disabled={!paste.trim()}
                onClick={() => {
                  set([...items.filter((i) => i.size.trim()), ...parsePastedItems(paste)]);
                  setPaste("");
                }}
              >
                Agregar al final
              </Button>
            </div>
          </div>
        </details>
        {msg && <p className="text-sm text-green-700">{msg}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </Card>

      <ProductionWorkbench
        orderId={job.id}
        orderStatus=""
        items={rows}
        sizeLabels={{}}
        requirements={[]}
        models={models}
        pieces={pieces}
        assembly={assembly}
        designs={designs}
        layouts={layouts}
        job={{ id: job.id }}
      />
    </div>
  );
}
