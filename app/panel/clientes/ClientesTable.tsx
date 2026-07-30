"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "../../components/ui/Card";
import { SearchInput } from "../../components/ui/SearchInput";
import { EmptyState } from "../../components/ui/EmptyState";

type Client = {
  id: string;
  name: string;
  type: string;
  contact_name: string | null;
  contact_role: string | null;
  phone: string | null;
};

export function ClientesTable({ clients }: { clients: Client[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) =>
      [c.name, c.type, c.contact_name, c.contact_role, c.phone]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(q))
    );
  }, [clients, query]);

  return (
    <div className="flex flex-col gap-4">
      <SearchInput value={query} onChange={setQuery} placeholder="Buscar por nombre, tipo o contacto..." />

      {filtered.length > 0 ? (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-zinc-500">
                <th className="px-5 py-3 font-medium">Nombre</th>
                <th className="px-5 py-3 font-medium">Tipo</th>
                <th className="px-5 py-3 font-medium">Contacto</th>
                <th className="px-5 py-3 font-medium">Teléfono</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((client) => (
                <tr key={client.id} className="border-b border-zinc-100 last:border-0 hover:bg-white/40">
                  <td className="px-5 py-3">
                    <Link href={`/panel/clientes/${client.id}`} className="font-medium text-zinc-900 hover:underline">
                      {client.name}
                    </Link>
                  </td>
                  <td className="px-5 py-3 capitalize text-zinc-600">{client.type}</td>
                  <td className="px-5 py-3 text-zinc-600">
                    {client.contact_name
                      ? `${client.contact_name}${client.contact_role ? ` (${client.contact_role})` : ""}`
                      : "—"}
                  </td>
                  <td className="px-5 py-3 text-zinc-600">{client.phone ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <EmptyState
          message={
            query
              ? "No hay clientes que coincidan con la búsqueda."
              : "Todavía no cargaste ningún cliente. Usá el formulario de arriba para crear el primero."
          }
        />
      )}
    </div>
  );
}
