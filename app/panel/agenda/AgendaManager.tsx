"use client";

import { useMemo, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { createEvent, deleteEvent, createFrequentContact, deleteFrequentContact } from "./actions";
import { Card } from "../../components/ui/Card";
import { Input, Select, Textarea } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { SearchInput } from "../../components/ui/SearchInput";
import { Modal } from "../../components/ui/Modal";
import { cn } from "@/lib/cn";

type EventItem = {
  id: string;
  title: string;
  event_type: string;
  event_at: string;
  notes: string | null;
  clientName: string | null;
};

type ContactItem = {
  id: string;
  name: string;
  category: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
};

const EVENT_TYPES = [
  { value: "llamada", label: "Llamada" },
  { value: "reunion", label: "Reunión" },
  { value: "entrega", label: "Entrega" },
  { value: "otro", label: "Otro" },
];

const CONTACT_CATEGORIES = [
  { value: "comisionista", label: "Comisionista" },
  { value: "proveedor_tela", label: "Proveedor de tela" },
  { value: "proveedor_insumos", label: "Proveedor de insumos" },
  { value: "otro", label: "Otro" },
];

function contactCategoryLabel(value: string) {
  return CONTACT_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("es-AR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const TABS = [
  { key: "eventos", label: "Eventos" },
  { key: "contactos", label: "Contactos frecuentes" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function AgendaManager({
  upcoming,
  past,
  clients,
  contacts,
}: {
  upcoming: EventItem[];
  past: EventItem[];
  clients: { id: string; name: string }[];
  contacts: ContactItem[];
}) {
  const [tab, setTab] = useState<TabKey>("eventos");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [contactQuery, setContactQuery] = useState("");
  const [newContactOpen, setNewContactOpen] = useState(false);

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

  const cq = contactQuery.trim().toLowerCase();
  const filteredContacts = useMemo(
    () =>
      contacts.filter(
        (c) =>
          !cq ||
          [c.name, contactCategoryLabel(c.category), c.phone, c.email, c.notes]
            .filter(Boolean)
            .some((field) => field!.toLowerCase().includes(cq))
      ),
    [contacts, cq]
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

  function handleCreateContact(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      try {
        await createFrequentContact(formData);
        form.reset();
        setNewContactOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al guardar el contacto");
      }
    });
  }

  function handleDeleteContact(id: string) {
    startTransition(async () => {
      try {
        await deleteFrequentContact(id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al borrar");
      }
    });
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      {error && <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

      <div className="flex gap-1 border-b border-zinc-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors",
              tab === t.key
                ? "border-b-2 border-zinc-900 text-zinc-900"
                : "text-zinc-500 hover:text-zinc-800"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "eventos" && (
        <>
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
        </>
      )}

      {tab === "contactos" && (
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-900">Contactos frecuentes</h2>
            <Button type="button" size="sm" onClick={() => setNewContactOpen(true)}>
              <Plus className="h-4 w-4" />
              Nuevo contacto
            </Button>
          </div>
          <p className="mb-4 text-xs text-zinc-400">
            Comisionistas, vendedores de tela o insumos, y cualquier otro contacto con el que hables seguido pero
            que no sea ni cliente ni proveedor formal.
          </p>

          <SearchInput
            value={contactQuery}
            onChange={setContactQuery}
            placeholder="Buscar por nombre, categoría, teléfono..."
            className="mb-4"
          />

          {filteredContacts.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {filteredContacts.map((c) => (
                <li key={c.id} className="flex items-center justify-between rounded-md border border-zinc-100 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-zinc-900">{c.name}</span>
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-500">
                        {contactCategoryLabel(c.category)}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-zinc-500">
                      {[c.phone, c.email].filter(Boolean).join(" · ") || "Sin datos de contacto"}
                    </div>
                    {c.notes && <div className="mt-0.5 text-xs text-zinc-400">{c.notes}</div>}
                  </div>
                  <button
                    onClick={() => {
                      if (confirm(`¿Borrar el contacto ${c.name}?`)) handleDeleteContact(c.id);
                    }}
                    disabled={isPending}
                    className="shrink-0 text-xs text-red-600"
                  >
                    Borrar
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-zinc-400">
              {contactQuery ? "No hay resultados para esa búsqueda." : "Todavía no cargaste contactos frecuentes."}
            </p>
          )}
        </Card>
      )}

      <Modal
        open={newContactOpen}
        onClose={() => setNewContactOpen(false)}
        title="Nuevo contacto frecuente"
        subtitle="Comisionistas, proveedores de tela/insumos u otros"
        footer={
          <div className="flex items-center justify-between gap-3">
            <Button type="button" variant="secondary" onClick={() => setNewContactOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="new-contact-form" disabled={isPending}>
              {isPending ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        }
      >
        <form id="new-contact-form" onSubmit={handleCreateContact} className="grid gap-3">
          <Input name="name" placeholder="Nombre" required />
          <Select name="category" defaultValue="comisionista">
            {CONTACT_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <Input name="phone" placeholder="Teléfono (opcional)" />
            <Input name="email" placeholder="Email (opcional)" />
          </div>
          <Textarea name="notes" placeholder="Notas (opcional)" />
        </form>
      </Modal>
    </div>
  );
}
