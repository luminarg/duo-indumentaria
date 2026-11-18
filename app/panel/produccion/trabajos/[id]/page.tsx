import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "../../../../components/ui/PageHeader";
import type { AssemblyRow, PatternPieceRow } from "@/lib/produccion/db";
import type { JobItem } from "../../actions";
import { JobView } from "./JobView";

export default async function TrabajoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: job }, { data: models }, { data: layouts }] = await Promise.all([
    supabase.from("production_jobs").select("id, client_name, notes, model_id, items, design").eq("id", id).single(),
    supabase.from("pattern_models").select("id, name, neck, base_size_label, article_type_id, owner_name").eq("active", true).order("name"),
    supabase
      .from("production_layouts")
      .select("id, linear_meters, piece_count, pdf_path, created_at")
      .eq("job_id", id)
      .order("created_at", { ascending: false }),
  ]);
  if (!job) notFound();

  const modelIds = (models ?? []).map((m) => m.id);
  const [{ data: pieces }, { data: assembly }] = modelIds.length
    ? await Promise.all([
        supabase.from("pattern_pieces").select("id, model_id, size_label, kind, name, outline, shoulder_point, baseline_y").in("model_id", modelIds),
        supabase.from("model_assembly").select("model_id, kind, align_mode, align_to_kind, offset_x, offset_y").in("model_id", modelIds),
      ])
    : [{ data: [] }, { data: [] }];

  // Los modelos de cliente se muestran con el nombre del dueño.
  const labeled = (models ?? []).map((m) => ({ ...m, name: m.owner_name ? `${m.name} (de ${m.owner_name})` : m.name }));

  return (
    <div>
      <PageHeader
        title={`Trabajo libre · ${job.client_name}`}
        description={job.notes || "Escalado para un tercero"}
        action={
          <Link href="/panel/produccion/trabajos" className="text-sm text-zinc-500 hover:underline">
            Todos los trabajos
          </Link>
        }
      />
      <JobView
        job={{
          id: job.id,
          clientName: job.client_name,
          notes: job.notes,
          modelId: job.model_id,
          items: (Array.isArray(job.items) ? job.items : []) as JobItem[],
          design: (job.design && typeof job.design === "object" ? job.design : {}) as Record<string, unknown>,
        }}
        models={labeled}
        pieces={(pieces ?? []) as PatternPieceRow[]}
        assembly={(assembly ?? []) as (AssemblyRow & { model_id: string })[]}
        layouts={layouts ?? []}
      />
    </div>
  );
}
