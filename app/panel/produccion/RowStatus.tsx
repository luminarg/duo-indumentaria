"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { updateOrderStatus } from "../pedidos/actions";
import { deleteJob, setJobStatus } from "./actions";
import { ORDER_STATUSES, orderStatusLabel } from "@/lib/orderStatus";
import { JOB_STATUSES, JOB_STATUS_LABELS } from "@/lib/produccion/jobStatus";

/**
 * Cambiar el estado a mano desde la lista (por si se avanzó por fuera del
 * sistema). Pedidos: los estados del pedido. Trabajos libres: su estado
 * propio ("Automático" = según tenga diseño y rollo) y, además, borrar.
 */
export function RowStatus({ kind, id, value, name }: { kind: "order" | "job"; id: string; value: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const change = (status: string) =>
    start(async () => {
      setError(null);
      try {
        if (kind === "order") await updateOrderStatus(id, status);
        else await setJobStatus(id, status);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });

  const remove = () => {
    if (!confirm(`¿Borrar el trabajo libre "${name}"? Se borran también sus rollos guardados.`)) return;
    start(async () => {
      try {
        await deleteJob(id);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  return (
    <div className="flex items-center gap-1.5">
      <select
        aria-label="Estado"
        value={value}
        disabled={pending}
        onChange={(e) => change(e.target.value)}
        className="h-9 max-w-[170px] rounded-lg border border-zinc-200 bg-white px-2 text-xs font-medium text-zinc-700"
        title={error ?? "Cambiar el estado a mano"}
      >
        {kind === "order"
          ? ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {orderStatusLabel(s)}
              </option>
            ))
          : [
              <option key="" value="">
                Automático
              </option>,
              ...JOB_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {JOB_STATUS_LABELS[s]}
                </option>
              )),
            ]}
      </select>
      {kind === "job" && (
        <button type="button" onClick={remove} disabled={pending} title="Borrar trabajo libre" className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600">
          <Trash2 className="h-4 w-4" />
        </button>
      )}
      {error && <span className="max-w-[160px] text-xs text-red-600">{error}</span>}
    </div>
  );
}
