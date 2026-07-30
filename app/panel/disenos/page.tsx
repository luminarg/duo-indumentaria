import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "../../components/ui/PageHeader";
import { DesignsManager } from "./DesignsManager";

export default async function DisenosPage() {
  const supabase = await createClient();
  const { data: designs } = await supabase
    .from("designs")
    .select("*")
    .order("sort_order", { ascending: true });

  return (
    <div>
      <PageHeader
        title="Diseños"
        description='Fotos de trabajos realizados para el carrusel "Algunos de nuestros diseños" de la home.'
      />
      <DesignsManager designs={designs ?? []} />
    </div>
  );
}
