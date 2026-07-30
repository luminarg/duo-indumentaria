"use client";

import { useState, useTransition } from "react";
import { ImageUp } from "lucide-react";
import { submitPedido, uploadPedidoResource, deletePedidoResource, type SubmitPedidoInput } from "./actions";

type Item = SubmitPedidoInput["items"][number];

type Resource = {
  id: string;
  resource_type: string;
  file_name: string | null;
  file_url: string;
  signedUrl: string | null;
};

const emptyItem: Item = {
  size: "",
  individualName: "",
  individualNumber: "",
  quantity: 1,
};

const RESOURCE_TYPES = [
  { value: "logo", label: "Logo a estampar" },
  { value: "mockup", label: "Mockup / diseño de referencia" },
  { value: "paleta", label: "Paleta de colores" },
  { value: "otro", label: "Otro" },
];

function isImage(name: string | null) {
  return !!name && /\.(png|jpe?g|webp|gif|svg)$/i.test(name);
}

export function PedidoForm({
  token,
  defaultValues,
  resources,
}: {
  orderId: string;
  token: string;
  defaultValues: {
    team_or_group_name: string | null;
    contact_name: string | null;
    contact_phone: string | null;
    contact_email: string | null;
    general_notes: string | null;
  };
  resources: Resource[];
}) {
  const [items, setItems] = useState<Item[]>([{ ...emptyItem }]);
  const teamName = defaultValues.team_or_group_name ?? "";
  const [contactName, setContactName] = useState(defaultValues.contact_name ?? "");
  const [contactPhone, setContactPhone] = useState(defaultValues.contact_phone ?? "");
  const [contactEmail, setContactEmail] = useState(defaultValues.contact_email ?? "");
  const [notes, setNotes] = useState(defaultValues.general_notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, startUpload] = useTransition();

  function updateItem(index: number, patch: Partial<Item>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function addItem() {
    setItems((prev) => [...prev, { ...emptyItem }]);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await submitPedido({
        token,
        teamOrGroupName: teamName,
        contactName,
        contactPhone,
        contactEmail,
        generalNotes: notes,
        items,
      });
      if (!result.ok) {
        setError(result.error);
      } else {
        setSuccess(true);
      }
    });
  }

  function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setUploadError(null);
    const form = e.currentTarget;
    const formData = new FormData(form);
    startUpload(async () => {
      const result = await uploadPedidoResource(token, formData);
      if (!result.ok) {
        setUploadError(result.error);
      } else {
        form.reset();
      }
    });
  }

  function handleDeleteResource(resource: Resource) {
    startUpload(async () => {
      await deletePedidoResource(token, resource.id, resource.file_url);
    });
  }

  return (
    <div className="mt-8 flex flex-col gap-6">
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {success && (
          <div className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-800">
            ¡Listo! Guardamos tu pedido. Te vamos a contactar con el presupuesto.
          </div>
        )}
        {error && (
          <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        )}

        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-medium text-zinc-900">Datos de contacto</legend>
          {teamName && (
            <p className="text-sm text-zinc-500">
              Pedido para: <span className="font-medium text-zinc-900">{teamName}</span>
            </p>
          )}
          <input
            required
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            placeholder="Tu nombre"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
          />
          <input
            required
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            placeholder="Teléfono / WhatsApp"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
          />
          <input
            type="email"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            placeholder="Email (opcional)"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
          />
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-medium text-zinc-900">Prendas</legend>
          <p className="text-xs text-zinc-500">
            Cargá el talle y, si lleva nombre o número, completalo. El diseño y los
            colores ya quedaron acordados con nosotros.
          </p>
          {items.map((item, index) => (
            <div key={index} className="grid grid-cols-2 gap-2 rounded-md border border-zinc-200 p-3 sm:grid-cols-4">
              <input
                required
                className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                placeholder="Talle"
                value={item.size}
                onChange={(e) => updateItem(index, { size: e.target.value })}
              />
              <input
                className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                placeholder="Nombre (si lleva)"
                value={item.individualName}
                onChange={(e) => updateItem(index, { individualName: e.target.value })}
              />
              <input
                className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                placeholder="Número"
                value={item.individualNumber}
                onChange={(e) => updateItem(index, { individualNumber: e.target.value })}
              />
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                  placeholder="Cant."
                  value={item.quantity}
                  onChange={(e) => updateItem(index, { quantity: Number(e.target.value) })}
                />
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="text-xs text-red-600"
                  >
                    Quitar
                  </button>
                )}
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={addItem}
            className="self-start text-sm font-medium text-zinc-900 underline"
          >
            + Agregar otra prenda
          </button>
        </fieldset>

        <textarea
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
          placeholder="Notas generales del pedido (opcional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {isPending ? "Guardando..." : "Enviar pedido"}
        </button>
      </form>

      <fieldset className="flex flex-col gap-3 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 p-5">
        <div className="flex items-center gap-2">
          <ImageUp className="h-5 w-5 shrink-0 text-amber-600" />
          <legend className="text-sm font-semibold text-zinc-900">
            ¿Tenés un logo o diseño para adjuntar?
          </legend>
        </div>
        <p className="text-xs text-zinc-600">
          Subí acá tu logo para estampar, un diseño de referencia o una paleta de
          colores — no hace falta que envíes el pedido primero.
        </p>

        {uploadError && (
          <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">{uploadError}</div>
        )}

        {resources.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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
                    className="flex aspect-square w-full items-center justify-center rounded border border-zinc-200 px-2 text-center text-xs text-zinc-500"
                  >
                    {resource.file_name}
                  </a>
                )}
                <span className="truncate text-xs capitalize text-zinc-500">{resource.resource_type}</span>
                <button
                  type="button"
                  onClick={() => handleDeleteResource(resource)}
                  disabled={isUploading}
                  className="text-left text-xs text-red-600"
                >
                  Borrar
                </button>
              </div>
            ))}
          </div>
        )}

        <form
          onSubmit={handleUpload}
          className="flex flex-col gap-3 rounded-lg bg-white p-3 sm:flex-row sm:items-end"
        >
          <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-zinc-500">
            Archivo
            <input type="file" name="file" required className="mt-1 block w-full text-sm" />
          </label>
          <select
            name="resource_type"
            defaultValue="logo"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm sm:w-48"
          >
            {RESOURCE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={isUploading}
            className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
          >
            {isUploading ? "Subiendo..." : "Subir archivo"}
          </button>
        </form>
      </fieldset>
    </div>
  );
}
