import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "../../../components/ui/PageHeader";
import { MoldesManager } from "./MoldesManager";
import { ArticleComponents } from "./ArticleComponents";

export default async function MoldesPage() {
  const supabase = await createClient();
  const [{ data: models }, { data: pieces }, { data: articleTypes }] = await Promise.all([
    supabase.from("pattern_models").select("id, name, neck, base_size_label, article_type_id, active, owner_name").order("name"),
    supabase.from("pattern_pieces").select("model_id, size_label, kind"),
    supabase.from("article_types").select("id, name").order("sort_order", { ascending: true }),
  ]);
  const { data: components } = await supabase
    .from("article_type_components")
    .select("id, article_type_id, name, model_id, copy_number, copy_name, sort_order")
    .order("sort_order", { ascending: true });

  const summary: Record<string, Record<string, string[]>> = {};
  for (const p of pieces ?? []) {
    summary[p.model_id] ??= {};
    (summary[p.model_id][p.size_label] ??= []).push(p.kind);
  }

  return (
    <div>
      <PageHeader
        title="Moldería"
        description="Modelos de molde por artículo. La moldería se importa desde Corel (PDF o SVG, a escala real), con uno o todos los talles."
      />
      <MoldesManager models={models ?? []} summary={summary} articleTypes={articleTypes ?? []} />
      <div className="mt-6">
        <ArticleComponents articleTypes={articleTypes ?? []} models={(models ?? []).map((m) => ({ id: m.id, name: m.name }))} components={components ?? []} />
      </div>
    </div>
  );
}
