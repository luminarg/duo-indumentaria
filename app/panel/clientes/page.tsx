import { createClient } from "@/lib/supabase/server";
import { createCustomer } from "./actions";
import { PageHeader } from "../../components/ui/PageHeader";
import { Card } from "../../components/ui/Card";
import { Input, Select } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { ClientesTable } from "./ClientesTable";

const TYPES = [
  { value: "club", label: "Club" },
  { value: "colegio", label: "Colegio" },
  { value: "gimnasio", label: "Gimnasio" },
  { value: "particular", label: "Particular" },
];

export default async function ClientesPage() {
  const supabase = await createClient();
  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, type, contact_name, contact_role, phone")
    .order("name", { ascending: true });

  return (
    <div>
      <PageHeader
        title="Clientes"
        description="Clubes, colegios, gimnasios y particulares — cada presupuesto y pedido se asocia a uno."
      />

      <Card className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Nuevo cliente</h2>
        <form action={createCustomer} className="grid gap-3 sm:grid-cols-2">
          <Input name="name" placeholder="Nombre (ej. Club Ameghino)" required />
          <Select name="type" defaultValue="club">
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
          <Input name="contact_name" placeholder="Persona de contacto" />
          <Input name="contact_role" placeholder="Cargo (ej. Presidente, Coordinador)" />
          <Input name="phone" placeholder="Teléfono" />
          <Input name="email" placeholder="Email" />
          <Input name="origin" placeholder="Origen (opcional)" />
          <Input name="notes" placeholder="Notas (opcional)" />
          <Button type="submit" className="self-start sm:col-span-2">
            Crear cliente
          </Button>
        </form>
      </Card>

      <ClientesTable clients={clients ?? []} />
    </div>
  );
}
