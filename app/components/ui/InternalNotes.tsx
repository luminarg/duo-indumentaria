"use client";

import { useState, useTransition } from "react";
import { Lock } from "lucide-react";
import { Card } from "./Card";
import { Button } from "./Button";

export type InternalNote = {
  id: string;
  body: string;
  author_name: string;
  created_at: string;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Historial de notas internas — solo el equipo las ve (nunca aparecen en el
// PDF ni en ningún link público del cliente). Es de solo alta: no se editan
// ni se borran, para que quede la trazabilidad completa.
export function InternalNotes({
  notes,
  onAdd,
}: {
  notes: InternalNote[];
  onAdd: (body: string) => Promise<void>;
}) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!body.trim()) {
      setError("Escribí algo antes de guardar");
      return;
    }
    startTransition(async () => {
      try {
        await onAdd(body.trim());
        setBody("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al guardar la nota");
      }
    });
  }

  return (
    <Card>
      <div className="mb-1 flex items-center gap-2">
        <Lock className="h-4 w-4 text-zinc-500" />
        <h2 className="text-sm font-semibold text-zinc-900">Notas internas</h2>
      </div>
      <p className="mb-3 text-xs text-zinc-500">
        Solo las ve el equipo — nunca se muestran al cliente. Quedan fijas como historial, no se pueden editar ni borrar.
      </p>

      {error && <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>}

      {notes.length > 0 ? (
        <ul className="mb-4 flex flex-col gap-3">
          {notes.map((note) => (
            <li key={note.id} className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
              <p className="whitespace-pre-wrap text-sm text-zinc-800">{note.body}</p>
              <p className="mt-1 text-[11px] text-zinc-400">
                {note.author_name} · {formatDate(note.created_at)}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-4 text-sm text-zinc-400">Todavía no hay notas internas.</p>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Ej: cliente pidió adelantar la entrega, avisó por WhatsApp el 20/8"
          className="min-h-20 rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
        <Button type="submit" size="sm" disabled={isPending} className="self-start">
          {isPending ? "Guardando..." : "Agregar nota"}
        </Button>
      </form>
    </Card>
  );
}
