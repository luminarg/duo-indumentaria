"use client";

import { useMemo, useState, useTransition } from "react";
import { Plus, TrendingUp, TrendingDown, HandCoins } from "lucide-react";
import { createSupplier, deleteSupplier, createPurchase, updatePurchaseRealCost, deletePurchase } from "./actions";
import { Card } from "../../components/ui/Card";
import { Input, Select } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { SearchInput } from "../../components/ui/SearchInput";
import { Modal } from "../../components/ui/Modal";
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

type IncomeEntry = {
  id: string;
  date: string;
  description: string;
  clientName: string | null;
  amount: number;
};

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
  return new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function categoryLabel(value: string | null) {
  if (!value) return "—";
  return CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

const TABS = [
  { key: "ingresos", label: "Ingresos" },
  { key: "gastos", label: "Gastos" },
  { key: "proveedores", label: "Proveedores" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function ComprasManager({
  purchases,
  suppliers,
  orders,
  income,
}: {
  purchases: Purchase[];
  suppliers: Supplier[];
  orders: OrderOption[];
  income: IncomeEntry[];
}) {
  const [tab, setTab] = useState<TabKey>("ingresos");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [purchaseQuery, setPurchaseQuery] = useState("");
  const [supplierQuery, setSupplierQuery] = useState("");
  const [incomeQuery, setIncomeQuery] = useState("");
  const [newPurchaseOpen, setNewPurchaseOpen] = useState(false);

  const totalBudgeted = purchases.reduce((sum, p) => sum + p.budgeted_cost, 0);
  const totalReal = purchases.reduce((sum, p) => sum + p.real_cost, 0);
  const totalIncome = income.reduce((sum, i) => sum + i.amount, 0);
  const saldo = totalIncome - totalReal;

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

  const filteredIncome = useMemo(() => {
    const q = incomeQuery.trim().toLowerCase();
    if (!q) return income;
    return income.filter((i) =>
      [i.description, i.clientName].filter(Boolean).some((field) => field!.toLowerCase().includes(q))
    );
  }, [income, incomeQuery]);

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
    runAction(() => createPurchase(formData), () => {
      form.reset();
      setNewPurchaseOpen(false);
    });
  }

  function handleUpdateRealCost(purchaseId: string, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    runAction(() => updatePurchaseRealCost(purchaseId, formData));
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-green-100 text-green-700">
            <TrendingUp className="h-4.5 w-4.5" />
          </div>
          <div>
            <p className="text-xs font-medium text-zinc-500">Ingresos (total)</p>
            <p className="mt-0.5 text-xl font-semibold text-zinc-900">{formatMoney(totalIncome)}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-700">
            <TrendingDown className="h-4.5 w-4.5" />
          </div>
          <div>
            <p className="text-xs font-medium text-zinc-500">Gastos (real)</p>
            <p className="mt-0.5 text-xl font-semibold text-zinc-900">{formatMoney(totalReal)}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3">
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
              saldo >= 0 ? "bg-zinc-900 text-white" : "bg-red-100 text-red-700"
            )}
          >
            <HandCoins className="h-4.5 w-4.5" />
          </div>
          <div>
            <p className="text-xs font-medium text-zinc-500">Saldo</p>
            <p className={cn("mt-0.5 text-xl font-semibold", saldo >= 0 ? "text-zinc-900" : "text-red-600")}>
              {formatMoney(saldo)}
            </p>
          </div>
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

      {tab === "ingresos" && (
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-900">Ingresos por pedidos</h2>
            <span className="text-xs text-zinc-400">Se generan solos al cobrar seña o entregar</span>
          </div>

          <SearchInput
            value={incomeQuery}
            onChange={setIncomeQuery}
            placeholder="Buscar por descripción o cliente..."
            className="mb-4"
          />

          {filteredIncome.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-zinc-500">
                    <th className="py-2 pr-3 font-medium">Descripción</th>
                    <th className="py-2 pr-3 font-medium">Cliente</th>
                    <th className="py-2 pr-3 font-medium">Monto</th>
                    <th className="py-2 font-medium">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredIncome.map((i) => (
                    <tr key={i.id} className="border-b border-zinc-100 last:border-0">
                      <td className="py-2 pr-3 text-zinc-900">{i.description}</td>
                      <td className="py-2 pr-3 text-zinc-600">{i.clientName ?? "—"}</td>
                      <td className="py-2 pr-3 font-medium text-green-700">{formatMoney(i.amount)}</td>
                      <td className="py-2 whitespace-nowrap text-zinc-600">{formatDate(i.date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-zinc-400">
              {incomeQuery
                ? "No hay resultados para esa búsqueda."
                : "Todavía no hay ingresos registrados — se cargan solos cuando marcás un pedido como señado o entregado."}
            </p>
          )}
        </Card>
      )}

      {tab === "gastos" && (
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-900">Compras y gastos</h2>
            <Button type="button" size="sm" onClick={() => setNewPurchaseOpen(true)}>
              <Plus className="h-4 w-4" />
              Nueva compra o gasto
            </Button>
          </div>

          <p className="mb-4 text-xs text-zinc-400">Presupuestado (total): {formatMoney(totalBudgeted)}</p>

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

      <Modal
        open={newPurchaseOpen}
        onClose={() => setNewPurchaseOpen(false)}
        title="Nueva compra o gasto"
        subtitle="Costo presupuestado vs. real, con proveedor y pedido opcionales"
        footer={
          <div className="flex items-center justify-between gap-3">
            <Button type="button" variant="secondary" onClick={() => setNewPurchaseOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="new-purchase-form" disabled={isPending}>
              {isPending ? "Guardando..." : "Agregar"}
            </Button>
          </div>
        }
      >
        <form id="new-purchase-form" onSubmit={handleCreatePurchase} className="grid gap-3 sm:grid-cols-2">
          <Input
            name="description"
            placeholder="Descripción (ej. Tela piel de durazno, flete, etc.)"
            required
            className="sm:col-span-2"
          />
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
        </form>
      </Modal>
    </div>
  );
}
