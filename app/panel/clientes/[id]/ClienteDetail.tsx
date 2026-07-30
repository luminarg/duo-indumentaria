"use client";

import { useState, useTransition } from "react";
import { updateCustomer, deleteCustomer } from "../actions";
import { Card } from "../../../components/ui/Card";
import { Input, Select } from "../../../components/ui/Input";
import { Button } from "../../../components/ui/Button";

type Client = {
  id: string;
  name: string;
  type: string;
  contact_name: string | null;
  contact_role: string | null;
  phone: string | null;
  email: string | null;
  origin: string | null;
  notes: string | null;
};

const TYPES = [
  { value: "club", label: "Club" },
  { value: "colegio", label: "Colegio" },
  { value: "gimnasio", label: "Gimnasio" },
  { value: "particular", label: "Particular" },
];

export function ClienteDetail({ client }: { client: Client }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await updateCustomer(client.id, formData);
        setMessage("Guardado.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al guardar");
      }
    });
  }

  function handleDelete() {
    if (!confirm(`¿Borrar a ${client.name}? Esta acción no se puede deshacer.`)) return;
    startTransition(async () => {
      try {
        await deleteCustomer(client.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al borrar");
      }
    });
  }

  return (
    <Card>
      {error && <div className="mb-3 rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
      {message && <div className="mb-3 rounded-md bg-green-50 px-4 py-3 text-sm text-green-800">{message}</div>}

      <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
        <Input label="Nombre" name="name" defaultValue={client.name} required />
        <Select label="Tipo" name="type" defaultValue={client.type}>
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
        <Input label="Persona de contacto" name="contact_name" defaultValue={client.contact_name ?? ""} />
        <Input label="Cargo" name="contact_role" defaultValue={client.contact_role ?? ""} />
        <Input label="Teléfono" name="phone" defaultValue={client.phone ?? ""} />
        <Input label="Email" name="email" defaultValue={client.email ?? ""} />
        <Input label="Origen" name="origin" defaultValue={client.origin ?? ""} />
        <Input label="Notas" name="notes" defaultValue={client.notes ?? ""} />

        <div className="flex gap-3 sm:col-span-2">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Guardando..." : "Guardar"}
          </Button>
          <Button type="button" variant="danger" onClick={handleDelete} disabled={isPending}>
            Borrar cliente
          </Button>
        </div>
      </form>
    </Card>
  );
}
