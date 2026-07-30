"use client";

import { useMemo, useState, useTransition } from "react";
import { createEvent, deleteEvent } from "./actions";
import { Card } from "../../components/ui/Card";
import { Input, Select, Textarea } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { SearchInput } from "../../components/ui/SearchInput";

type EventItem = {
  id: string;
  title: string;
  event_type: string;
  event_at: string;
  notes: string | null;
  clientName: string | null;
};

const EVENT_TYPES = [
  { value: "llamada", label: "Llamada" },
  { value: "reunion", label: "Reunión" },
  { value: "entrega", label: "Entrega" },
  { value: "otro", label: "Otro" },
];

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("es-AR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AgendaManager({
  upcoming,
  past,
  clients,
}: {
  upcoming: EventItem[];
  past: EventItem[];
  clients: { id: string; name: string }[];
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();

  const filteredUpcoming = useMemo(
    () =>
      upcoming.filter(
        (e) =>
          !q ||
          [e.title, e.clientName, e.event_type, e.notes].filter(Boolean).some((field) => field!.toLowerCase().includes(q))
      ),
    [upcoming, q]
  );
  const filteredPast = useMemo(
    () =>
      past.filter(
        (e) =>
          !q ||
          [e.title, e.clientName, e.event_type, e.notes].filter(Boolean).some((field) => field!.toLowerCase().includes(q))
      ),
    [past, q]
  );

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      try {
        await createEvent(formData);
        form.reset();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al crear el evento");
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      try {
        await deleteEvent(id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al borrar");
      }
    });
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      {error && <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Nuevo evento</h2>
        <form onSubmit={handleCreate} className="grid gap-3 sm:grid-cols-2">
          <Input name="title" placeholder="Título" required className="sm:col-span-2" />
          <Select name="event_type" defaultValue="llamada">
            {EVENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
          {clients.length > 0 && (
            <Select name="client_id" defaultValue="">
              <option value="">Sin cliente vinculado</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
          <Input type="date" name="event_date" required />
          <Input type="time" name="event_time" defaultValue="09:00" />
          <Textarea name="notes" placeholder="Notas (opcional)" className="sm:col-span-2" />
          <Button type="submit" disabled={isPending} className="self-start sm:col-span-2">
            {isPending ? "Guardando..." : "Agregar evento"}
          </Button>
        </form>
      </Card>

      <SearchInput value={query} onChange={setQuery} placeholder="Buscar por título, cliente o tipo..." />

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Próximos</h2>
        {filteredUpcoming.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {filteredUpcoming.map((event) => (
              <li
                key={event.id}
                className="flex items-center justify-between rounded-md border border-zinc-100 px-3 py-2 text-sm"
              >
                <div>
                  <div className="font-medium text-zinc-900">{event.title}</div>
                  <div className="text-xs text-zinc-500">
                    {formatDateTime(event.event_at)}
                    {event.clientName ? ` · ${event.clientName}` : ""}
                    {" · "}
                    <span className="capitalize">{event.event_type}</span>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(event.id)}
                  disabled={isPending}
                  className="text-xs text-red-600"
                >
                  Borrar
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-400">
            {query ? "No hay eventos próximos que coincidan con la búsqueda." : "No hay eventos próximos."}
          </p>
        )}
      </Card>

      {filteredPast.length > 0 && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-zinc-900">Pasados</h2>
          <ul className="flex flex-col gap-2">
            {filteredPast.map((event) => (
              <li
                key={event.id}
                className="flex items-center justify-between rounded-md border border-zinc-100 px-3 py-2 text-sm opacity-60"
              >
                <div>
                  <div className="font-medium text-zinc-900">{event.title}</div>
                  <div className="text-xs text-zinc-500">{formatDateTime(event.event_at)}</div>
                </div>
                <button
                  onClick={() => handleDelete(event.id)}
                  disabled={isPending}
                  className="text-xs text-red-600"
                >
                  Borrar
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
