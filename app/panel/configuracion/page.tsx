import { createClient } from "@/lib/supabase/server";
import { ConfigForm } from "./ConfigForm";
import { PageHeader } from "../../components/ui/PageHeader";

export default async function ConfiguracionPage() {
  const supabase = await createClient();

  const [{ data: settings }, { data: sliders }, { data: features }, { data: articleTypesRaw }, { data: articleSizesRaw }] =
    await Promise.all([
      supabase.from("business_settings").select("*").eq("id", 1).single(),
      supabase.from("site_sliders").select("*").order("sort_order", { ascending: true }),
      supabase.from("site_features").select("*").order("sort_order", { ascending: true }),
      supabase.from("article_types").select("*").order("sort_order", { ascending: true }),
      supabase.from("article_type_sizes").select("*").order("sort_order", { ascending: true }),
    ]);

  const articleTypes = (articleTypesRaw ?? []).map((at) => ({
    id: at.id,
    name: at.name,
    requires_number: at.requires_number,
    requires_name: at.requires_name,
    sizes: (articleSizesRaw ?? [])
      .filter((s) => s.article_type_id === at.id)
      .map((s) => ({ id: s.id, label: s.label, measurements: s.measurements })),
  }));

  return (
    <div>
      <PageHeader
        title="Configuración"
        description="Todo lo que ves acá se refleja directo en la web pública."
      />
      {settings && (
        <ConfigForm settings={settings} sliders={sliders ?? []} features={features ?? []} articleTypes={articleTypes} />
      )}
    </div>
  );
}
