import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "../../../components/ui/PageHeader";
import { Card } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { NewJobForm } from "./NewJobForm";

// Trabajos libres: escalado de diseños para terceros, sin pedido.
export default async function TrabajosPage() {
  const supabase = await createClient();
  const { data: jobs } = await supabase
    .from("production_jobs")
    .select("id, client_name, notes, items, created_at, updated_at, pattern_models(name)")
    .order("updated_at", { ascending: false })
    .limit(200);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Trabajos libres"
        description="Escalado de diseños para terceros, sin un pedido detrás: moldería propia o del cliente, rollo listo para imprimir o PDF por talle."
        action={
          <Link href="/panel/produccion" className="text-sm text-zinc-500 hover:underline">
            Volver a Producción
          </Link>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <NewJobForm />
        {jobs?.length ? (
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-zinc-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Cliente</th>
                  <th className="px-5 py-3 font-medium">Moldería</th>
                  <th className="px-5 py-3 font-medium">Prendas</th>
                  <th className="px-5 py-3 font-medium">Actualizado</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => {
                  const items = (Array.isArray(j.items) ? j.items : []) as { qty?: number }[];
                  const model = (j.pattern_models as unknown as { name: string } | null)?.name;
                  return (
                    <tr key={j.id} className="border-t border-zinc-100">
                      <td className="px-5 py-3">
                        <Link href={`/panel/produccion/trabajos/${j.id}`} className="font-medium text-zinc-900 hover:underline">
                          {j.client_name}
                        </Link>
                        {j.notes && <div className="text-xs text-zinc-500">{j.notes}</div>}
                      </td>
                      <td className="px-5 py-3 text-zinc-600">{model ?? "—"}</td>
                      <td className="px-5 py-3 text-zinc-600">{items.reduce((s, i) => s + (i.qty ?? 1), 0)}</td>
                      <td className="px-5 py-3 text-zinc-500">{new Date(j.updated_at).toLocaleDateString("es-AR")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        ) : (
          <EmptyState message="Todavía no hay trabajos libres." />
        )}
      </div>
    </div>
  );
}
