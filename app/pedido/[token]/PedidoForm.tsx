"use client";

import { useState, useTransition } from "react";
import { ImageUp } from "lucide-react";
import { submitPedido, uploadPedidoResource, deletePedidoResource, type SubmitPedidoInput } from "./actions";

type Row = { size: string; individualName: string; individualNumber: string; quantity: number };

type SizeGuideEntry = { label: string; measurements: string | null };

type Requirement = {
  id: string;
  description: string;
  requiresNumber: boolean;
  requiresName: boolean;
  quantityQuoted: number | null;
  sizes: SizeGuideEntry[];
  existingItems: Row[];
};

type Resource = {
  id: string;
  resource_type: string;
  file_name: string | null;
  file_url: string;
  signedUrl: string | null;
};

const emptyRow: Row = { size: "", individualName: "", individualNumber: "", quantity: 1 };

const RESOURCE_TYPES = [
  { value: "logo", label: "Logo a estampar" },
  { value: "mockup", label: "Mockup / diseño de referencia" },
  { value: "paleta", label: "Paleta de colores" },
  { value: "otro", label: "Otro" },
];

function isImage(name: string | null) {
  return !!name && /\.(png|jpe?g|webp|gif|svg)$/i.test(name);
}

// true = el cliente carga una fila por persona (talle + nombre/número).
// false = el cliente solo indica cantidad por talle.
function isIndividualMode(req: Requirement) {
  return req.requiresNumber || req.requiresName;
}

function initRowsFor(req: Requirement): Row[] {
  if (isIndividualMode(req)) {
    return req.existingItems.length > 0 ? req.existingItems : [{ ...emptyRow }];
  }
  if (req.sizes.length > 0) {
    return req.sizes.map((s) => {
      const existing = req.existingItems.find((it) => it.size === s.label);
      return { size: s.label, individualName: "", individualNumber: "", quantity: existing?.quantity ?? 0 };
    });
  }
  return req.existingItems.length > 0 ? req.existingItems : [{ ...emptyRow }];
}

function SizeGuide({ sizes }: { sizes: SizeGuideEntry[] }) {
  const withMeasurements = sizes.filter((s) => s.measurements);
  if (withMeasurements.length === 0) return null;
  return (
    <div className="rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
      <p className="mb-1 font-medium text-zinc-700">Guía de talles</p>
      <ul className="flex flex-col gap-0.5">
        {withMeasurements.map((s) => (
          <li key={s.label}>
            <span className="font-medium">{s.label}</span> — {s.measurements}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Sección de un artículo donde el cliente lleva nombre y/o número: una fila
// por persona (talle, nombre si lleva, número si lleva, cantidad).
function IndividualRequirementFields({
  req,
  rows,
  onChange,
}: {
  req: Requirement;
  rows: Row[];
  onChange: (rows: Row[]) => void;
}) {
  function update(index: number, patch: Partial<Row>) {
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }
  function addRow() {
    onChange([...rows, { ...emptyRow }]);
  }
  function removeRow(index: number) {
    onChange(rows.filter((_, i) => i !== index));
  }

  return (
    <fieldset className="flex flex-col gap-3 rounded-md border border-zinc-200 p-3">
      <legend className="px-1 text-sm font-medium text-zinc-900">{req.description}</legend>
      <SizeGuide sizes={req.sizes} />
      {rows.map((row, index) => (
        <div key={index} className="grid grid-cols-2 gap-2 rounded-md border border-zinc-200 p-3 sm:grid-cols-4">
          {req.sizes.length > 0 ? (
            <select
              required
              className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
              value={row.size}
              onChange={(e) => update(index, { size: e.target.value })}
            >
              <option value="">Talle</option>
              {req.sizes.map((s) => (
                <option key={s.label} value={s.label}>
                  {s.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              required
              className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
              placeholder="Talle"
              value={row.size}
              onChange={(e) => update(index, { size: e.target.value })}
            />
          )}
          {req.requiresName ? (
            <input
              className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
              placeholder="Nombre"
              value={row.individualName}
              onChange={(e) => update(index, { individualName: e.target.value })}
            />
          ) : (
            <div />
          )}
          {req.requiresNumber ? (
            <input
              className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
              placeholder="Número"
              value={row.individualNumber}
              onChange={(e) => update(index, { individualNumber: e.target.value })}
            />
          ) : (
            <div />
          )}
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
              placeholder="Cant."
              value={row.quantity}
              onChange={(e) => update(index, { quantity: Number(e.target.value) })}
            />
            {rows.length > 1 && (
              <button type="button" onClick={() => removeRow(index)} className="text-xs text-red-600">
                Quitar
              </button>
            )}
          </div>
        </div>
      ))}
      <button type="button" onClick={addRow} className="self-start text-sm font-medium text-zinc-900 underline">
        + Agregar otra persona
      </button>
    </fieldset>
  );
}

// Sección de un artículo sin nombre/número: cantidad por talle (talles fijos
// definidos en el tipo de artículo) o, si no hay talles configurados, una
// lista libre de talle + cantidad.
function AggregateRequirementFields({
  req,
  rows,
  onChange,
}: {
  req: Requirement;
  rows: Row[];
  onChange: (rows: Row[]) => void;
}) {
  function update(index: number, patch: Partial<Row>) {
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  if (req.sizes.length > 0) {
    return (
      <fieldset className="flex flex-col gap-3 rounded-md border border-zinc-200 p-3">
        <legend className="px-1 text-sm font-medium text-zinc-900">{req.description}</legend>
        <SizeGuide sizes={req.sizes} />
        <p className="text-xs text-zinc-500">Indicá cuántas unidades necesitás de cada talle.</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {rows.map((row, index) => (
            <label key={row.size} className="flex items-center justify-between gap-2 rounded-md border border-zinc-200 px-2 py-1.5 text-sm">
              {row.size}
              <input
                type="number"
                min={0}
                className="w-16 rounded-md border border-zinc-300 px-2 py-1 text-sm"
                value={row.quantity}
                onChange={(e) => update(index, { quantity: Number(e.target.value) })}
              />
            </label>
          ))}
        </div>
      </fieldset>
    );
  }

  function addRow() {
    onChange([...rows, { ...emptyRow, individualName: "", individualNumber: "" }]);
  }
  function removeRow(index: number) {
    onChange(rows.filter((_, i) => i !== index));
  }

  return (
    <fieldset className="flex flex-col gap-3 rounded-md border border-zinc-200 p-3">
      <legend className="px-1 text-sm font-medium text-zinc-900">{req.description}</legend>
      <p className="text-xs text-zinc-500">Indicá talle y cantidad.</p>
      {rows.map((row, index) => (
        <div key={index} className="grid grid-cols-2 gap-2">
          <input
            required
            className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            placeholder="Talle"
            value={row.size}
            onChange={(e) => update(index, { size: e.target.value })}
          />
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
              placeholder="Cant."
              value={row.quantity}
              onChange={(e) => update(index, { quantity: Number(e.target.value) })}
            />
            {rows.length > 1 && (
              <button type="button" onClick={() => removeRow(index)} className="text-xs text-red-600">
                Quitar
              </button>
            )}
          </div>
        </div>
      ))}
      <button type="button" onClick={addRow} className="self-start text-sm font-medium text-zinc-900 underline">
        + Agregar otro talle
      </button>
    </fieldset>
  );
}

export function PedidoForm({
  token,
  defaultValues,
  resources,
  requirements,
  legacyItems,
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
  requirements: Requirement[];
  legacyItems: Row[];
}) {
  const [rowsByRequirement, setRowsByRequirement] = useState<Record<string, Row[]>>(() =>
    Object.fromEntries(requirements.map((r) => [r.id, initRowsFor(r)]))
  );
  const showLegacy = requirements.length === 0 || legacyItems.length > 0;
  const [legacyRows, setLegacyRows] = useState<Row[]>(legacyItems.length > 0 ? legacyItems : [{ ...emptyRow }]);

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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const requirementPayload: SubmitPedidoInput["requirements"] = requirements.map((req) => {
      const rows = rowsByRequirement[req.id] ?? [];
      const filtered = isIndividualMode(req)
        ? rows.filter((r) => r.size.trim() !== "")
        : rows.filter((r) => r.size.trim() !== "" && r.quantity > 0);
      return {
        requirementId: req.id,
        rows: filtered.map((r) => ({
          size: r.size,
          individualName: req.requiresName ? r.individualName : "",
          individualNumber: req.requiresNumber ? r.individualNumber : "",
          quantity: r.quantity,
        })),
      };
    });

    if (showLegacy) {
      requirementPayload.push({
        requirementId: null,
        rows: legacyRows
          .filter((r) => r.size.trim() !== "")
          .map((r) => ({
            size: r.size,
            individualName: r.individualName,
            individualNumber: r.individualNumber,
            quantity: r.quantity,
          })),
      });
    }

    startTransition(async () => {
      const result = await submitPedido({
        token,
        teamOrGroupName: teamName,
        contactName,
        contactPhone,
        contactEmail,
        generalNotes: notes,
        requirements: requirementPayload,
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

        <div className="flex flex-col gap-4">
          <p className="text-sm font-medium text-zinc-900">Prendas</p>
          <p className="-mt-2 text-xs text-zinc-500">
            Completá los datos de cada artículo. El diseño y los colores ya quedaron acordados con nosotros.
          </p>
          {requirements.map((req) =>
            isIndividualMode(req) ? (
              <IndividualRequirementFields
                key={req.id}
                req={req}
                rows={rowsByRequirement[req.id] ?? []}
                onChange={(rows) => setRowsByRequirement((prev) => ({ ...prev, [req.id]: rows }))}
              />
            ) : (
              <AggregateRequirementFields
                key={req.id}
                req={req}
                rows={rowsByRequirement[req.id] ?? []}
                onChange={(rows) => setRowsByRequirement((prev) => ({ ...prev, [req.id]: rows }))}
              />
            )
          )}
          {showLegacy && (
            <fieldset className="flex flex-col gap-3 rounded-md border border-zinc-200 p-3">
              {requirements.length > 0 && (
                <legend className="px-1 text-sm font-medium text-zinc-900">Otras prendas</legend>
              )}
              {legacyRows.map((row, index) => (
                <div key={index} className="grid grid-cols-2 gap-2 rounded-md border border-zinc-200 p-3 sm:grid-cols-4">
                  <input
                    required
                    className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                    placeholder="Talle"
                    value={row.size}
                    onChange={(e) =>
                      setLegacyRows((prev) => prev.map((r, i) => (i === index ? { ...r, size: e.target.value } : r)))
                    }
                  />
                  <input
                    className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                    placeholder="Nombre (si lleva)"
                    value={row.individualName}
                    onChange={(e) =>
                      setLegacyRows((prev) =>
                        prev.map((r, i) => (i === index ? { ...r, individualName: e.target.value } : r))
                      )
                    }
                  />
                  <input
                    className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                    placeholder="Número"
                    value={row.individualNumber}
                    onChange={(e) =>
                      setLegacyRows((prev) =>
                        prev.map((r, i) => (i === index ? { ...r, individualNumber: e.target.value } : r))
                      )
                    }
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                      placeholder="Cant."
                      value={row.quantity}
                      onChange={(e) =>
                        setLegacyRows((prev) =>
                          prev.map((r, i) => (i === index ? { ...r, quantity: Number(e.target.value) } : r))
                        )
                      }
                    />
                    {legacyRows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setLegacyRows((prev) => prev.filter((_, i) => i !== index))}
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
                onClick={() => setLegacyRows((prev) => [...prev, { ...emptyRow }])}
                className="self-start text-sm font-medium text-zinc-900 underline"
              >
                + Agregar otra prenda
              </button>
            </fieldset>
          )}
        </div>

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
