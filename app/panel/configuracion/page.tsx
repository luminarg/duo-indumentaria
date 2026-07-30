import { createClient } from "@/lib/supabase/server";
import { ConfigForm } from "./ConfigForm";
import { SlidersManager } from "./SlidersManager";
import { PageHeader } from "../../components/ui/PageHeader";

export default async function ConfiguracionPage() {
  const supabase = await createClient();

  const [{ data: settings }, { data: sliders }] = await Promise.all([
    supabase.from("business_settings").select("*").eq("id", 1).single(),
    supabase.from("site_sliders").select("*").order("sort_order", { ascending: true }),
  ]);

  return (
    <div>
      <PageHeader
        title="Configuración"
        description="Todo lo que ves acá se refleja directo en la web pública."
      />
      {settings && <ConfigForm settings={settings} />}
      <SlidersManager sliders={sliders ?? []} />
    </div>
  );
}
