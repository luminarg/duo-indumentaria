"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteQuote } from "../actions";
import { Button } from "../../../components/ui/Button";

export function DeleteQuoteButton({ quoteId, quoteNumber }: { quoteId: string; quoteNumber: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    if (!confirm(`¿Borrar el presupuesto ${quoteNumber}? Esta acción no se puede deshacer.`)) return;
    setError(null);
    startTransition(async () => {
      try {
        await deleteQuote(quoteId);
        router.push("/panel/presupuestos");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al borrar");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="danger" onClick={handleDelete} disabled={isPending}>
        <Trash2 className="h-4 w-4" />
        {isPending ? "Borrando..." : "Borrar presupuesto"}
      </Button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
