"use client";

import { useState, useTransition } from "react";
import { Check, Plus, Trash2, UserPlus, Users } from "lucide-react";
import { createQuoteWithItems, createClientInline } from "./actions";
import { Modal } from "../../components/ui/Modal";
import { Input, Textarea, Select } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";

type Client = { id: string; name: string };
type ArticleType = { id: string; name: string; requires_number: boolean; requires_name: boolean };

type CartItem = {
  tempId: string;
  description: string;
  unitPrice: number;
  quantity: number;
  articleTypeId: string | null;
  requiresNumber: boolean;
  requiresName: boolean;
};

function formatMoney(value: number) {
  return `$${value.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`;
}

const cellInputClass =
  "w-full rounded border border-transparent bg-transparent px-1 py-0.5 focus:border-zinc-300 focus:bg-white focus:outline-none";

function ItemsCart({
  items,
  onChange,
  articleTypes,
}: {
  items: CartItem[];
  onChange: (items: CartItem[]) => void;
  articleTypes: ArticleType[];
}) {
  const [description, setDescription] = useState("");
  const [unitPrice, setUnitPrice] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [articleTypeId, setArticleTypeId] = useState("");
  const [requiresNumber, setRequiresNumber] = useState(false);
  const [requiresName, setRequiresName] = useState(false);

  function handleArticleTypeChange(id: string) {
    setArticleTypeId(id);
    const at = articleTypes.find((a) => a.id === id);
    setRequiresNumber(at?.requires_number ?? false);
    setRequiresName(at?.requires_name ?? false);
  }

  function addItem() {
    if (!description.trim()) return;
    onChange([
      ...items,
      {
        tempId: crypto.randomUUID(),
        description: description.trim(),
        unitPrice,
        quantity,
        articleTypeId: articleTypeId || null,
        requiresNumber,
        requiresName,
      },
    ]);
    setDescription("");
    setUnitPrice(0);
    setQuantity(1);
    setArticleTypeId("");
    setRequiresNumber(false);
    setRequiresName(false);
  }

  function updateItem(tempId: string, patch: Partial<CartItem>) {
    onChange(items.map((i) => (i.tempId === tempId ? { ...i, ...patch } : i)));
  }

  const total = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  const articleTypeName = (id: string | null) => articleTypes.find((a) => a.id === id)?.name ?? null;

  return (
    <div className="flex flex-col gap-2">
      <div>
        <span className="text-xs font-medium text-zinc-500">Artículos</span>
        <p className="text-[11px] text-zinc-400">
          Cada artículo con su precio unitario y cantidad — el total del presupuesto sale de la suma de
          todos. Podés corregir cantidad o precio tocando el valor en la tabla. Tip: dejá cantidad en 0
          para mandar un "presupuesto abierto" — el cliente va a poder cargar la cantidad que necesita
          desde su link.
        </p>
      </div>

      {items.length > 0 && (
        <div className="overflow-hidden rounded-md border border-zinc-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
                <th className="px-2.5 py-2 text-left font-medium">Descripción</th>
                <th className="w-14 px-1 py-2 text-right font-medium">Cant.</th>
                <th className="w-20 px-1 py-2 text-right font-medium">Precio unit.</th>
                <th className="w-20 px-2 py-2 text-right font-medium">Subtotal</th>
                <th className="w-7" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.tempId} className="border-b border-zinc-100 last:border-0">
                  <td className="px-1.5 py-1">
                    <input
                      value={item.description}
                      onChange={(e) => updateItem(item.tempId, { description: e.target.value })}
                      className={cellInputClass + " text-zinc-800"}
                    />
                    {(articleTypeName(item.articleTypeId) || item.requiresNumber || item.requiresName) && (
                      <p className="px-1 text-[10px] text-zinc-400">
                        {articleTypeName(item.articleTypeId) ?? "Sin tipo"}
                        {item.requiresNumber ? " · con número" : ""}
                        {item.requiresName ? " · con nombre" : ""}
                      </p>
                    )}
                  </td>
                  <td className="px-1 py-1">
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => updateItem(item.tempId, { quantity: Number(e.target.value) || 0 })}
                      className={cellInputClass + " text-right text-zinc-600"}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      type="number"
                      step="0.01"
                      value={item.unitPrice}
                      onChange={(e) => updateItem(item.tempId, { unitPrice: Number(e.target.value) || 0 })}
                      className={cellInputClass + " text-right text-zinc-600"}
                    />
                  </td>
                  <td className="px-2 py-1 text-right font-medium text-zinc-800">
                    {formatMoney(item.unitPrice * item.quantity)}
                  </td>
                  <td className="px-1 text-center">
                    <button
                      type="button"
                      onClick={() => onChange(items.filter((i) => i.tempId !== item.tempId))}
                      className="text-zinc-400 hover:text-red-600"
                      aria-label="Quitar artículo"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-col gap-1.5 rounded-md border border-dashed border-zinc-300 p-2">
        {articleTypes.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={articleTypeId}
              onChange={(e) => handleArticleTypeChange(e.target.value)}
              className="rounded-md border border-zinc-300 px-2 py-1 text-xs focus:border-zinc-500 focus:outline-none"
            >
              <option value="">Sin tipo de artículo</option>
              {articleTypes.map((at) => (
                <option key={at.id} value={at.id}>
                  {at.name}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1 text-xs text-zinc-600">
              <input
                type="checkbox"
                checked={requiresNumber}
                onChange={(e) => setRequiresNumber(e.target.checked)}
              />
              Lleva número
            </label>
            <label className="flex items-center gap-1 text-xs text-zinc-600">
              <input type="checkbox" checked={requiresName} onChange={(e) => setRequiresName(e.target.checked)} />
              Lleva nombre
            </label>
          </div>
        )}
        <div className="grid grid-cols-[1fr_5.5rem_4rem_auto] items-center gap-1.5">
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ej: Camiseta manga corta"
            className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm focus:border-zinc-500 focus:outline-none"
          />
          <input
            type="number"
            step="0.01"
            value={unitPrice || ""}
            onChange={(e) => setUnitPrice(Number(e.target.value) || 0)}
            placeholder="Precio"
            className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm focus:border-zinc-500 focus:outline-none"
          />
          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value) || 0)}
            placeholder="Cant."
            className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm focus:border-zinc-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={addItem}
            className="flex items-center justify-center rounded-md bg-zinc-900 p-1.5 text-white hover:bg-zinc-800"
            aria-label="Agregar artículo"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="rounded-md bg-zinc-50 px-3 py-2.5 text-sm">
        <div className="flex items-center justify-between text-zinc-500">
          <span>Artículos ({items.length})</span>
          <span>{formatMoney(total)}</span>
        </div>
        <div className="mt-1.5 flex items-center justify-between border-t border-zinc-200 pt-1.5 font-semibold text-zinc-900">
          <span>Total</span>
          <span>{formatMoney(total)}</span>
        </div>
      </div>
    </div>
  );
}

export function NewQuoteModal({
  clients,
  articleTypes,
  open,
  onClose,
}: {
  clients: Client[];
  articleTypes: ArticleType[];
  open: boolean;
  onClose: () => void;
}) {
  const [availableClients, setAvailableClients] = useState(clients);
  const [isNewClient, setIsNewClient] = useState(clients.length === 0);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [newClientName, setNewClientName] = useState("");
  const [newClientContact, setNewClientContact] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");
  const [savedClientId, setSavedClientId] = useState<string | null>(null);
  const [items, setItems] = useState<CartItem[]>([]);
  const [accentColor, setAccentColor] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSavingClient, startSavingClient] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    setError(null);
    const hasClient = isNewClient ? newClientName.trim().length > 0 : selectedClientId.length > 0;
    if (!hasClient) {
      e.preventDefault();
      setError(isNewClient ? "Ingresá el nombre del cliente nuevo" : "Elegí un cliente");
      return;
    }
    // No hacemos preventDefault: dejamos que el form action nativo se
    // dispare (así el redirect del server action funciona bien).
  }

  function handleSaveClient() {
    setError(null);
    if (!newClientName.trim()) {
      setError("Ingresá el nombre del cliente para guardarlo");
      return;
    }
    startSavingClient(async () => {
      try {
        const created = await createClientInline({
          name: newClientName,
          contactName: newClientContact || null,
          phone: newClientPhone || null,
          email: newClientEmail || null,
        });
        setAvailableClients((prev) => [...prev, created]);
        setSavedClientId(created.id);
        setSelectedClientId(created.id);
        setIsNewClient(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al guardar el cliente");
      }
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nuevo presupuesto"
      subtitle="Elegí el cliente y cargá los artículos"
      footer={
        <div className="flex items-center justify-between gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="new-quote-form">
            Crear presupuesto
          </Button>
        </div>
      }
    >
      <form
        id="new-quote-form"
        action={createQuoteWithItems.bind(
          null,
          items.map(({ description, unitPrice, quantity, articleTypeId, requiresNumber, requiresName }) => ({
            description,
            unitPrice,
            quantity,
            articleTypeId,
            requiresNumber,
            requiresName,
          }))
        )}
        onSubmit={handleSubmit}
        className="flex flex-col gap-4"
      >
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>}

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500">Cliente</span>
            <button
              type="button"
              onClick={() => setIsNewClient(!isNewClient)}
              className="flex items-center gap-1 text-xs font-medium text-zinc-600 hover:text-zinc-900"
            >
              {isNewClient ? (
                <>
                  <Users className="h-3.5 w-3.5" /> Elegir uno existente
                </>
              ) : (
                <>
                  <UserPlus className="h-3.5 w-3.5" /> Cargar cliente nuevo
                </>
              )}
            </button>
          </div>
          <span className="text-[11px] text-zinc-400">
            Elegí un cliente ya cargado, o cargá uno nuevo sin salir de acá.
          </span>

          {isNewClient ? (
            <div className="mt-1 flex flex-col gap-2 rounded-md border border-zinc-200 p-3">
              <Input
                name="new_client_name"
                placeholder="Nombre del cliente / equipo *"
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
              />
              <Input
                name="new_client_contact"
                placeholder="Nombre de contacto (opcional)"
                value={newClientContact}
                onChange={(e) => setNewClientContact(e.target.value)}
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  name="new_client_phone"
                  placeholder="Teléfono (opcional)"
                  value={newClientPhone}
                  onChange={(e) => setNewClientPhone(e.target.value)}
                />
                <Input
                  name="new_client_email"
                  placeholder="Email (opcional)"
                  value={newClientEmail}
                  onChange={(e) => setNewClientEmail(e.target.value)}
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={isSavingClient}
                onClick={handleSaveClient}
                className="self-start"
              >
                {isSavingClient ? "Guardando..." : "Guardar cliente"}
              </Button>
              <p className="text-[11px] text-zinc-400">
                Lo guarda en la base ahora mismo, así queda cargado aunque no termines el presupuesto.
              </p>
            </div>
          ) : (
            <>
              {savedClientId === selectedClientId && selectedClientId && (
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-green-700">
                  <Check className="h-3.5 w-3.5" /> Cliente guardado
                </div>
              )}
              <Select
                name="client_id"
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
              >
                <option value="">Elegí un cliente...</option>
                {availableClients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </>
          )}
        </div>

        <Textarea
          label="Qué pidió el cliente"
          name="items_description"
          placeholder="Ej: 20 camisetas y 20 shorts, talles S a XL"
          hint="Resumen libre para tu referencia interna — no se desglosa en el PDF, para eso están los artículos de abajo."
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Tela"
            name="fabric"
            placeholder="Ej: Interlock premium"
            hint="Opcional, se puede completar más adelante."
          />
          <Input
            label="Color / diseño"
            name="color_scheme"
            placeholder="Ej: Blanco y rojo, mangas negras"
            hint="Combinación de colores o esquema acordado."
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-500">Color del presupuesto (opcional)</span>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={accentColor || "#18181b"}
              onChange={(e) => setAccentColor(e.target.value)}
              className="h-9 w-14 cursor-pointer rounded-md border border-zinc-300 bg-white p-1"
            />
            <input type="hidden" name="accent_color" value={accentColor} />
            <span className="text-sm text-zinc-600">
              {accentColor ? accentColor : "Usa el color del negocio por defecto"}
            </span>
            {accentColor && (
              <button
                type="button"
                onClick={() => setAccentColor("")}
                className="text-xs text-zinc-400 underline hover:text-zinc-600"
              >
                Quitar
              </button>
            )}
          </div>
          <span className="text-[11px] text-zinc-400">
            Por ejemplo, para que el PDF salga con los colores del equipo/club del cliente.
          </span>
        </div>

        <ItemsCart items={items} onChange={setItems} articleTypes={articleTypes} />

        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="% de seña"
            type="number"
            name="deposit_percent"
            defaultValue={50}
            hint="Porcentaje que le vas a pedir de seña para confirmar el pedido."
          />
          <Input
            label="Válido hasta"
            type="date"
            name="valid_until"
            hint="Fecha límite de validez del presupuesto (opcional)."
          />
        </div>

        <Textarea
          label="Notas"
          name="notes"
          placeholder="Aclaraciones adicionales (opcional)"
          hint="Para vos o para el cliente — aparece en el PDF si lo completás."
        />
      </form>
    </Modal>
  );
}
