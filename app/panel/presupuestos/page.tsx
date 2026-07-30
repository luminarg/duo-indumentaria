import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createQuote } from "./actions";
import { PageHeader } from "../../components/ui/PageHeader";
import { Card } from "../../components/ui/Card";
import { Input, Textarea, Select } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { PresupuestosTable } from "./PresupuestosTable";

export default async function PresupuestosPage() {
  const supabase = await createClient();

  const [{ data: clients }, { data: quotes }] = await Promise.all([
    supabase.from("clients").select("id, name").order("name", { ascending: true }),
    supabase
      .from("quotes")
      .select("id, quote_number, status, total, order_id, clients(name)")
      .order("created_at", { ascending: false }),
  ]);

  return (
    <div>
      <PageHeader
        title="Presupuestos"
        description="Cargá acá lo que pidió el cliente. Cuando lo acuerden, generás el pedido desde el presupuesto."
      />

      <Card className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Nuevo presupuesto</h2>
        {clients && clients.length > 0 ? (
          <form action={createQuote} className="grid gap-3 sm:grid-cols-2">
            <Select name="client_id" required className="sm:col-span-2">
              <option value="">Elegí un cliente...</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Textarea
              name="items_description"
              placeholder="Qué pidió (ej: 20 camisetas y 20 shorts, talles S a XL)"
              className="sm:col-span-2"
            />
            <Input name="fabric" placeholder="Tela" />
            <Input name="color_scheme" placeholder="Color / diseño" />
            <Input type="number" name="total" placeholder="Monto total estimado" step="0.01" />
            <Input type="number" name="deposit_percent" placeholder="% de seña" defaultValue={50} />
            <Input type="date" name="valid_until" />
            <Input name="notes" placeholder="Notas (opcional)" />
            <Button type="submit" className="self-start sm:col-span-2">
              Crear presupuesto
            </Button>
          </form>
        ) : (
          <p className="text-sm text-zinc-500">
            Primero necesitás cargar un{" "}
            <Link href="/panel/clientes" className="underline">
              cliente
            </Link>
            .
          </p>
        )}
      </Card>

      <PresupuestosTable
        quotes={(quotes ?? []).map((q) => ({
          id: q.id,
          quote_number: q.quote_number,
          status: q.status,
          total: q.total,
          order_id: q.order_id,
          clientName: (q.clients as unknown as { name: string } | null)?.name ?? null,
        }))}
      />
    </div>
  );
}
