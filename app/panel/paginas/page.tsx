import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "../../components/ui/PageHeader";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { createPage } from "./actions";

export default async function PaginasPage() {
  const supabase = await createClient();
  const { data: pages } = await supabase
    .from("site_pages")
    .select("id, title, slug, published, show_in_menu, updated_at")
    .order("sort_order", { ascending: true });

  return (
    <div>
      <PageHeader
        title="Páginas del sitio"
        description="Creá páginas como Nosotros, Preguntas frecuentes o Cómo hacer tu pedido, sin tocar código."
        action={
          <form action={createPage}>
            <Button type="submit">+ Nueva página</Button>
          </form>
        }
      />

      <div className="flex max-w-3xl flex-col gap-3">
        {(pages ?? []).length === 0 && (
          <Card>
            <p className="text-sm text-zinc-500">
              Todavía no creaste ninguna página. Tocá &quot;+ Nueva página&quot; para empezar.
            </p>
          </Card>
        )}
        {(pages ?? []).map((p) => (
          <Card key={p.id} className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold text-zinc-900">{p.title}</span>
                <span
                  className={
                    "rounded-full px-2 py-0.5 text-[11px] font-medium " +
                    (p.published ? "bg-green-100 text-green-800" : "bg-zinc-100 text-zinc-500")
                  }
                >
                  {p.published ? "Publicada" : "Borrador"}
                </span>
                {p.published && p.show_in_menu && (
                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                    En el menú
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-zinc-400">/{p.slug}</p>
            </div>
            <div className="flex items-center gap-2">
              {p.published && (
                <a href={`/${p.slug}`} target="_blank" rel="noopener noreferrer">
                  <Button type="button" variant="secondary" size="sm">
                    Ver
                  </Button>
                </a>
              )}
              <Link href={`/panel/paginas/${p.id}`}>
                <Button type="button" size="sm">
                  Editar
                </Button>
              </Link>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
