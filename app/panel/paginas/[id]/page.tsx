import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "../../../components/ui/PageHeader";
import { PageEditor } from "./PageEditor";

export default async function EditarPaginaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: page } = await supabase.from("site_pages").select("*").eq("id", id).single();
  if (!page) notFound();

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  return (
    <div>
      <PageHeader
        title={page.title}
        description="Editá el contenido y tocá Guardar. Mientras esté en borrador, solo la ves vos."
        action={
          <Link href="/panel/paginas" className="text-sm font-medium text-zinc-600 hover:text-zinc-900">
            ← Volver a Páginas
          </Link>
        }
      />
      <PageEditor page={page} siteUrl={siteUrl} />
    </div>
  );
}
