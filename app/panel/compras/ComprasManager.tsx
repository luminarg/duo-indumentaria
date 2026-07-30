"use client";

import { useMemo, useState, useTransition } from "react";
import { createSupplier, deleteSupplier, createPurchase, updatePurchaseRealCost, deletePurchase } from "./actions";
import { Card } from "../../components/ui/Card";
import { Input, Select } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { SearchInput } from "../../components/ui/SearchInput";
import { cn } from "@/lib/cn";

type Purchase = {
  id: string;
  description: string;
  category: string | null;
  supplierName: string | null;
  orderNumber: string | null;
  budgeted_cost: number;
  real_cost: number;
  purchase_date: string;
};

type Supplier = {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
};

type OrderOption = { id: string; order_number: string };

const CATEGORIES = [
  { value: "", label: "Sin categoría" },
  { value: "tela_insumos", label: "Tela / insumos" },
  { value: "flete", label: "Flete" },
  { value: "servicios", label: "Servicios" },
  { value: "otro", label: "Otro" },
];

function formatMoney(n: number) {
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function categoryLabel(value: string | null) {
  if (!value) return "—";
  return CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

const TABS = [
  { key: "compras", label: "Compras" },
  { key: "proveedores", label: "Proveedores" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function ComprasManager({
  purchases,
  suppliers,
  orders,
}: {
  purchases: Purchase[];
  suppliers: Supplier[];
  orders: OrderOption[];
}) {
  const [tab, setTab] = useState<TabKey>("compras");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [purchaseQuery, setPurchaseQuery] = useState("");
  const [supplierQuery, setSupplierQuery] = useState("");

  const totalBudgeted = purchases.reduce((sum, p) => sum + p.budgeted_cost, 0);
  const totalReal = purchases.reduce((sum, p) => sum + p.real_cost, 0);

  const filteredPurchases = useMemo(() => {
    const q = purchaseQuery.trim().toLowerCase();
    if (!q) return purchases;
    return purchases.filter((p) =>
      [p.description, categoryLabel(p.category), p.supplierName, p.orderNumber]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(q))
    );
  }, [purchases, purchaseQuery]);

  const filteredSuppliers = useMemo(() => {
    const q = supplierQuery.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter((s) =>
      [s.name, s.contact_name, s.phone].filter(Boolean).some((field) => field!.toLowerCase().includes(q))
    );
  }, [suppliers, supplierQuery]);

  function runAction(action: () => Promise<void>, onSuccess?: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        onSuccess?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ocurrió un error");
      }
    });
  }

  function handleCreateSupplier(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    runAction(() => createSupplier(formData), () => form.reset());
  }

  function handleCreatePurchase(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    runAction(() => createPurchase(formData), () => form.reset());
  }

  function handleUpdateRealCost(purchaseId: string, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    runAction(() => updatePurchaseRealCost(purchaseId, formData));
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <p className="text-xs font-medium text-zinc-500">Presupuestado</p>
          <p className="mt-1 text-xl font-semibold text-zinc-900">{formatMoney(totalBudgeted)}</p>
        </Card>
        <Card>
          <p className="text-xs font-medium text-zinc-500">Real</p>
          <p className="mt-1 text-xl font-semibold text-zinc-900">{formatMoney(totalReal)}</p>
        </Card>
      </div>

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

      {tab === "compras" && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-zinc-900">Nueva compra o gasto</h2>
          <form onSubmit={handleCreatePurchase} className="mb-4 grid gap-3 sm:grid-cols-2">
            <Input name="description" placeholder="Descripción (ej. Tela piel de durazno, flete, etc.)" required className="sm:col-span-2" />
            <Select name="category" defaultValue="">
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
            <Select name="supplier_id" defaultValue="">
              <option value="">Sin proveedor</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <Select name="order_id" defaultValue="">
              <option value="">General (sin pedido)</option>
              {orders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.order_number}
                </option>
              ))}
            </Select>
            <Input type="date" name="purchase_date" defaultValue={new Date().toISOString().slice(0, 10)} />
            <Input type="number" step="0.01" name="budgeted_cost" placeholder="Costo presupuestado" />
            <Input type="number" step="0.01" name="real_cost" placeholder="Costo real (si ya lo sabés)" />
            <Button type="submit" disabled={isPending} size="sm" className="self-start sm:col-span-2">
              Agregar
            </Button>
          </form>

          <SearchInput
            value={purchaseQuery}
            onChange={setPurchaseQuery}
            placeholder="Buscar por descripción, categoría, proveedor o pedido..."
            className="mb-4"
          />

          {filteredPurchases.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-zinc-500">
                    <th className="py-2 pr-3 font-medium">Descripción</th>
                    <th className="py-2 pr-3 font-medium">Categoría</th>
                    <th className="py-2 pr-3 font-medium">Proveedor</th>
                    <th className="py-2 pr-3 font-medium">Pedido</th>
                    <th className="py-2 pr-3 font-medium">Presupuestado</th>
                    <th className="py-2 pr-3 font-medium">Real</th>
                    <th className="py-2 pr-3 font-medium">Fecha</th>
                    <th className="py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPurchases.map((p) => (
                    <tr key={p.id} className="border-b border-zinc-100 last:border-0">
                      <td className="py-2 pr-3 text-zinc-900">{p.description}</td>
                      <td className="py-2 pr-3 text-zinc-600">{categoryLabel(p.category)}</td>
                      <td className="py-2 pr-3 text-zinc-600">{p.supplierName ?? "—"}</td>
                      <td className="py-2 pr-3 text-zinc-600">{p.orderNumber ?? "—"}</td>
                      <td className="py-2 pr-3 text-zinc-600">{formatMoney(p.budgeted_cost)}</td>
                      <td className="py-2 pr-3">
                        <form onSubmit={(e) => handleUpdateRealCost(p.id, e)} className="flex items-center gap-1">
                          <Input type="number" step="0.01" name="real_cost" defaultValue={p.real_cost} className="w-24 px-2 py-1" />
                          <button type="submit" disabled={isPending} className="text-xs text-zinc-500 underline">
                            Guardar
                          </button>
                        </form>
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap text-zinc-600">{formatDate(p.purchase_date)}</td>
                      <td className="py-2">
                        <button
                          onClick={() => {
                            if (confirm("¿Borrar este registro?")) runAction(() => deletePurchase(p.id));
                          }}
                          disabled={isPending}
                          className="text-xs text-red-600"
                        >
                          Borrar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-zinc-400">
              {purchaseQuery ? "No hay resultados para esa búsqueda." : "Todavía no cargaste compras ni gastos."}
            </p>
          )}
        </Card>
      )}

      {tab === "proveedores" && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-zinc-900">Proveedores</h2>
          <form onSubmit={handleCreateSupplier} className="mb-4 grid gap-3 sm:grid-cols-2">
            <Input name="name" placeholder="Nombre del proveedor" required />
            <Input name="contact_name" placeholder="Persona de contacto" />
            <Input name="phone" placeholder="Teléfono" />
            <Input name="email" placeholder="Email" />
            <Button type="submit" disabled={isPending} size="sm" className="self-start sm:col-span-2">
              Agregar proveedor
            </Button>
          </form>

          <SearchInput
            value={supplierQuery}
            onChange={setSupplierQuery}
            placeholder="Buscar por nombre, contacto o teléfono..."
            className="mb-4"
          />

          {filteredSuppliers.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {filteredSuppliers.map((s) => (
                <li key={s.id} className="flex items-center justify-between rounded-md border border-zinc-100 px-3 py-2 text-sm">
                  <div>
                    <span className="font-medium text-zinc-900">{s.name}</span>
                    {s.contact_name && <span className="text-zinc-500"> · {s.contact_name}</span>}
                    {s.phone && <span className="text-zinc-500"> · {s.phone}</span>}
                  </div>
                  <button
                    onClick={() => {
                      if (confirm(`¿Borrar proveedor ${s.name}?`)) runAction(() => deleteSupplier(s.id));
                    }}
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
              {supplierQuery ? "No hay resultados para esa búsqueda." : "Todavía no cargaste proveedores."}
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
