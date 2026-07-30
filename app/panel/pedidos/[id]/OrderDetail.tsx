"use client";

import { useState, useTransition } from "react";
import {
  updateOrderDetails,
  updateOrderStatus,
  updateEstimatedDeliveryDate,
  uploadOrderResource,
  deleteOrderResource,
} from "../actions";
import { Card } from "../../../components/ui/Card";
import { Input, Textarea, Select } from "../../../components/ui/Input";
import { Button } from "../../../components/ui/Button";
import { Badge } from "../../../components/ui/Badge";
import { DeliveryBadge } from "../../../components/ui/DeliveryBadge";

type Order = {
  id: string;
  order_number: string;
  status: string;
  team_or_group_name: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  general_notes: string | null;
  estimated_delivery_date: string | null;
};

type Details = {
  fabric: string | null;
  color_scheme: string | null;
  pattern_notes: string | null;
  print_notes: string | null;
} | null;

type Item = {
  id: string;
  size_label: string | null;
  color: string | null;
  individual_name: string | null;
  individual_number: string | null;
  quantity: number;
};

type Resource = {
  id: string;
  resource_type: string;
  file_name: string | null;
  file_url: string;
  signedUrl: string | null;
};

const STATUSES = [
  "borrador",
  "cargado_por_cliente",
  "senado",
  "cortando",
  "estampando",
  "armando",
  "embalando",
  "entregado",
];

const RESOURCE_TYPES = [
  { value: "mockup", label: "Mockup" },
  { value: "logo", label: "Logo" },
  { value: "paleta", label: "Paleta de colores" },
  { value: "otro", label: "Otro" },
];

function isImage(name: string | null) {
  return !!name && /\.(png|jpe?g|webp|gif|svg)$/i.test(name);
}

export function OrderDetail({
  order,
  details,
  items,
  resources,
}: {
  order: Order;
  details: Details;
  items: Item[];
  resources: Resource[];
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function handleStatusChange(status: string) {
    setError(null);
    startTransition(async () => {
      try {
        await updateOrderStatus(order.id, status);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al cambiar el estado");
      }
    });
  }

  function handleDetailsSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await updateOrderDetails(order.id, formData);
        setMessage("Guardado.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al guardar");
      }
    });
  }

  function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      try {
        await uploadOrderResource(order.id, formData);
        form.reset();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al subir el archivo");
      }
    });
  }

  function handleDeleteResource(resource: Resource) {
    startTransition(async () => {
      try {
        await deleteOrderResource(resource.id, order.id, resource.file_url);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al borrar");
      }
    });
  }

  function handleDeliveryDateSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await updateEstimatedDeliveryDate(order.id, formData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al guardar la fecha");
      }
    });
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      {error && <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
      {message && <div className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-800">{message}</div>}

      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs text-zinc-500">Estado actual</div>
          <div className="mt-1 flex items-center gap-2">
            <Badge status={order.status} />
            <DeliveryBadge status={order.status} estimatedDeliveryDate={order.estimated_delivery_date} />
          </div>
        </div>
        <select
          defaultValue={order.status}
          disabled={isPending}
          onChange={(e) => handleStatusChange(e.target.value)}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <form onSubmit={handleDeliveryDateSubmit} className="flex items-end gap-2">
          <Input
            label="Fecha de entrega aproximada"
            type="date"
            name="estimated_delivery_date"
            defaultValue={order.estimated_delivery_date ?? ""}
          />
          <Button type="submit" size="sm" variant="secondary" disabled={isPending}>
            Guardar
          </Button>
        </form>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Datos del cliente</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-zinc-500">Contacto</dt>
            <dd className="text-zinc-900">{order.contact_name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Teléfono</dt>
            <dd className="text-zinc-900">{order.contact_phone ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Email</dt>
            <dd className="text-zinc-900">{order.contact_email ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Notas del cliente</dt>
            <dd className="text-zinc-900">{order.general_notes ?? "—"}</dd>
          </div>
        </dl>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">
          Diseño y especificaciones técnicas
        </h2>
        <p className="mb-3 text-xs text-zinc-500">
          Esto lo definís vos con el cliente antes de mandar el link — no lo carga él.
        </p>
        <form onSubmit={handleDetailsSubmit} className="flex flex-col gap-3">
          <Input
            label="Nombre del equipo / club / colegio"
            name="team_or_group_name"
            defaultValue={order.team_or_group_name ?? ""}
          />
          <Input label="Tela" name="fabric" defaultValue={details?.fabric ?? ""} />
          <Input
            label="Color / esquema de diseño"
            name="color_scheme"
            defaultValue={details?.color_scheme ?? ""}
            placeholder="Ej: blanco y rojo, mangas negras"
          />
          <Textarea label="Moldería" name="pattern_notes" defaultValue={details?.pattern_notes ?? ""} />
          <Textarea
            label="Notas de estampado"
            name="print_notes"
            defaultValue={details?.print_notes ?? ""}
          />
          <Button type="submit" disabled={isPending} className="self-start">
            {isPending ? "Guardando..." : "Guardar"}
          </Button>
        </form>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Prendas cargadas por el cliente</h2>
        {items.length > 0 ? (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-zinc-500">
                <th className="py-2 pr-4">Talle</th>
                <th className="py-2 pr-4">Nombre</th>
                <th className="py-2 pr-4">Número</th>
                <th className="py-2 pr-4">Cant.</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-zinc-100 last:border-0">
                  <td className="py-2 pr-4">{item.size_label ?? "—"}</td>
                  <td className="py-2 pr-4">{item.individual_name ?? "—"}</td>
                  <td className="py-2 pr-4">{item.individual_number ?? "—"}</td>
                  <td className="py-2 pr-4">{item.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-zinc-400">
            El cliente todavía no cargó las prendas de su pedido.
          </p>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Mockups, logos y paleta</h2>

        {resources.length > 0 && (
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {resources.map((resource) => (
              <div key={resource.id} className="flex flex-col gap-1">
                {resource.signedUrl && isImage(resource.file_name) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={resource.signedUrl}
                    alt={resource.file_name ?? ""}
                    className="aspect-square w-full rounded object-cover"
                  />
                ) : (
                  <a
                    href={resource.signedUrl ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex aspect-square w-full items-center justify-center rounded border border-zinc-200 text-xs text-zinc-500"
                  >
                    {resource.file_name}
                  </a>
                )}
                <span className="text-xs capitalize text-zinc-500">{resource.resource_type}</span>
                <button
                  onClick={() => handleDeleteResource(resource)}
                  disabled={isPending}
                  className="text-left text-xs text-red-600"
                >
                  Borrar
                </button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleUpload} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-zinc-500">
            Archivo
            <input type="file" name="file" required className="mt-1 block w-full text-sm" />
          </label>
          <Select name="resource_type" defaultValue="mockup" className="sm:w-40">
            {RESOURCE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Subiendo..." : "Subir"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
