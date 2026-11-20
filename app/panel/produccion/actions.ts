"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DesignConfig, PieceKind } from "@/lib/produccion/types";
import { FONT_FOLDER, fontNameFromPath, fontSlug, type FontEntry } from "@/lib/produccion/fonts";
import type { CustomTemplate } from "@/lib/produccion/templates";

// Archivos del módulo (moldes, fondos, escudos, PDFs de rollo) en el bucket
// privado "production-files": se suben con el cliente admin y se leen con
// URLs firmadas, igual que los recursos de pedidos.
const BUCKET = "production-files";

async function requireTeamMember() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");
  return user;
}

/**
 * Pide una URL firmada para subir un archivo DIRECTO desde el navegador a
 * Storage. Los PDFs de rollo pueden pesar decenas de MB: pasarlos por una
 * Server Action choca con el límite de body (10 MB acá, 4,5 MB en Vercel).
 */
export async function createProductionUpload(folder: string, ext: string): Promise<{ path: string; token: string }> {
  await requireTeamMember();
  const safeFolder = folder.replace(/[^a-zA-Z0-9_/-]/g, "").replace(/\.\./g, "") || "varios";
  const safeExt = ext.replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
  const path = `${safeFolder}/${crypto.randomUUID()}.${safeExt}`;
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error("No se pudo preparar la subida: " + (error?.message ?? ""));
  return { path, token: data.token };
}

/** Igual que createProductionUpload, pero para una fuente: el nombre queda en la ruta. */
export async function createFontUpload(fileName: string): Promise<{ path: string; token: string }> {
  await requireTeamMember();
  const ext = (fileName.match(/\.(ttf|otf)$/i)?.[1] ?? "").toLowerCase();
  if (!ext) throw new Error("La fuente tiene que ser .ttf u .otf");
  const path = `${FONT_FOLDER}/${fontSlug(fileName)}--${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error("No se pudo preparar la subida: " + (error?.message ?? ""));
  return { path, token: data.token };
}

/** Fuentes subidas (biblioteca común a todos los pedidos). */
export async function listProductionFonts(): Promise<FontEntry[]> {
  await requireTeamMember();
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).list(FONT_FOLDER, { limit: 500, sortBy: { column: "name", order: "asc" } });
  if (error) throw new Error("No se pudieron leer las fuentes: " + error.message);
  return (Array.isArray(data) ? data : [])
    .filter((f) => /\.(ttf|otf)$/i.test(f.name))
    .map((f) => {
      const path = `${FONT_FOLDER}/${f.name}`;
      return { path, name: fontNameFromPath(path) };
    });
}

export async function deleteProductionFont(path: string) {
  await requireTeamMember();
  if (!path.startsWith(`${FONT_FOLDER}/`) || path.includes("..")) throw new Error("Ruta inválida");
  const admin = createAdminClient();
  const { error } = await admin.storage.from(BUCKET).remove([path]);
  if (error) throw new Error("No se pudo borrar la fuente: " + error.message);
}

export async function signedProductionUrls(paths: string[]): Promise<Record<string, string>> {
  await requireTeamMember();
  const admin = createAdminClient();
  const out: Record<string, string> = {};
  for (const p of paths) {
    const { data } = await admin.storage.from(BUCKET).createSignedUrl(p, 60 * 60);
    if (data?.signedUrl) out[p] = data.signedUrl;
  }
  return out;
}

export async function saveDesign(input: {
  orderId: string;
  requirementId: string | null;
  componentId?: string | null;
  modelId: string | null;
  variant: "jugador" | "arquero";
  config: DesignConfig;
}) {
  const user = await requireTeamMember();
  const supabase = await createClient();
  let q = supabase
    .from("order_designs")
    .select("version")
    .eq("order_id", input.orderId)
    .eq("variant", input.variant)
    .order("version", { ascending: false })
    .limit(1);
  q = input.requirementId ? q.eq("requirement_id", input.requirementId) : q.is("requirement_id", null);
  q = input.componentId ? q.eq("component_id", input.componentId) : q.is("component_id", null);
  const { data: last } = await q;
  const version = (last?.[0]?.version ?? 0) + 1;
  const { error } = await supabase.from("order_designs").insert({
    order_id: input.orderId,
    requirement_id: input.requirementId,
    component_id: input.componentId ?? null,
    model_id: input.modelId,
    variant: input.variant,
    version,
    config: input.config,
    created_by: user.id,
  });
  if (error) throw new Error("No se pudo guardar el diseño: " + error.message);
  revalidatePath(`/panel/produccion/${input.orderId}`);
  return { version };
}

/** Registra la tizada (el PDF ya se subió a Storage) y, si se pide, pasa el pedido a sublimación. */
export async function saveLayout(input: {
  orderId: string;
  pdfPath: string;
  lengthMm: number;
  pieceCount: number;
  advanceStatus: boolean;
  requirementId?: string | null;
  componentId?: string | null;
  variant?: string | null;
}) {
  const user = await requireTeamMember();
  if (!input.orderId || !input.pdfPath || !Number.isFinite(input.lengthMm)) throw new Error("Faltan datos de la tizada");
  const supabase = await createClient();
  const { error } = await supabase.from("production_layouts").insert({
    order_id: input.orderId,
    order_ids: [input.orderId],
    length_mm: input.lengthMm,
    piece_count: input.pieceCount,
    pdf_path: input.pdfPath,
    requirement_id: input.requirementId ?? null,
    component_id: input.componentId ?? null,
    variant: input.variant ?? null,
    created_by: user.id,
  });
  if (error) throw new Error("No se pudo registrar la tizada: " + error.message);

  if (input.advanceStatus) {
    const { error: stErr } = await supabase
      .from("orders")
      .update({ status: "sublimacion_estampado", updated_at: new Date().toISOString() })
      .eq("id", input.orderId);
    if (stErr) throw new Error("Se guardó el rollo pero no se pudo cambiar el estado: " + stErr.message);
  }
  revalidatePath(`/panel/produccion/${input.orderId}`);
  revalidatePath("/panel/produccion");
  revalidatePath(`/panel/pedidos/${input.orderId}`);
  revalidatePath("/panel/pedidos");
}

// ---------- Moldería ----------

export async function createPatternModel(formData: FormData) {
  await requireTeamMember();
  const supabase = await createClient();
  const name = String(formData.get("name") || "").trim();
  const articleTypeId = String(formData.get("article_type_id") || "") || null;
  const neck = String(formData.get("neck") || "").trim() || null;
  const ownerName = String(formData.get("owner_name") || "").trim() || null;
  const baseSize = String(formData.get("base_size_label") || "L").trim() || "L";
  if (!name) throw new Error("Falta el nombre del modelo");
  const { data, error } = await supabase
    .from("pattern_models")
    .insert({ name, article_type_id: articleTypeId, neck, base_size_label: baseSize, owner_name: ownerName })
    .select("id")
    .single();
  if (error) throw new Error("No se pudo crear el modelo: " + error.message);

  // Armado por defecto: frente centrado, espalda al lado, mangas por el hombro.
  await supabase.from("model_assembly").insert([
    { model_id: data.id, kind: "frente", align_mode: "baseline" },
    { model_id: data.id, kind: "espalda", align_mode: "beside", align_to_kind: "frente" },
    { model_id: data.id, kind: "manga_izq", align_mode: "shoulder", align_to_kind: "frente" },
    { model_id: data.id, kind: "manga_der", align_mode: "shoulder", align_to_kind: "frente" },
  ]);
  revalidatePath("/panel/produccion/moldes");
  return { id: data.id as string };
}

export type PieceInput = {
  sizeLabel: string;
  kind: PieceKind;
  name?: string | null;
  outline: [number, number][];
  widthMm: number;
  heightMm: number;
  sourceFilePath?: string | null;
};

/** Reemplaza las piezas de los talles recibidos (las de otros talles quedan). */
export async function savePatternPieces(modelId: string, pieces: PieceInput[]) {
  await requireTeamMember();
  const supabase = await createClient();
  const sizes = [...new Set(pieces.map((p) => p.sizeLabel))];
  const { error: delErr } = await supabase.from("pattern_pieces").delete().eq("model_id", modelId).in("size_label", sizes);
  if (delErr) throw new Error("No se pudieron reemplazar las piezas: " + delErr.message);
  const { error } = await supabase.from("pattern_pieces").insert(
    pieces.map((p) => ({
      model_id: modelId,
      size_label: p.sizeLabel,
      kind: p.kind,
      name: p.name ?? null,
      outline: p.outline,
      width_mm: p.widthMm,
      height_mm: p.heightMm,
      source_file_path: p.sourceFilePath ?? null,
    }))
  );
  if (error) throw new Error("No se pudieron guardar las piezas: " + error.message);
  revalidatePath("/panel/produccion/moldes");
}

export async function deletePatternModel(modelId: string) {
  await requireTeamMember();
  const supabase = await createClient();
  const { error } = await supabase.from("pattern_models").delete().eq("id", modelId);
  if (error) throw new Error("No se pudo borrar el modelo: " + error.message);
  revalidatePath("/panel/produccion/moldes");
}

export type ArticleComponentInput = { name: string; model_id: string | null; copy_number: boolean; copy_name: boolean };

/**
 * Prendas que componen un artículo (combo). Reemplaza la lista entera; las
 * prendas que siguen se actualizan (así no se pierden los diseños ya hechos).
 */
export async function saveArticleComponents(articleTypeId: string, list: (ArticleComponentInput & { id?: string })[]) {
  await requireTeamMember();
  if (!articleTypeId) throw new Error("Falta el artículo");
  const clean = list.map((c, i) => ({ ...c, name: c.name.trim(), sort_order: i })).filter((c) => c.name);
  const supabase = await createClient();
  const { data: current, error: e1 } = await supabase.from("article_type_components").select("id").eq("article_type_id", articleTypeId);
  if (e1) throw new Error("No se pudieron leer las prendas: " + e1.message);
  const keep = new Set(clean.map((c) => c.id).filter(Boolean));
  const remove = (current ?? []).map((c) => c.id).filter((id) => !keep.has(id));
  if (remove.length) {
    const { error } = await supabase.from("article_type_components").delete().in("id", remove);
    if (error) throw new Error("No se pudieron quitar prendas: " + error.message);
  }
  for (const c of clean) {
    const row = { article_type_id: articleTypeId, name: c.name, model_id: c.model_id || null, copy_number: c.copy_number, copy_name: c.copy_name, sort_order: c.sort_order };
    const { error } = c.id
      ? await supabase.from("article_type_components").update(row).eq("id", c.id)
      : await supabase.from("article_type_components").insert(row);
    if (error) throw new Error("No se pudo guardar la prenda " + c.name + ": " + error.message);
  }
  revalidatePath("/panel/produccion/moldes");
}

// ── Trabajos libres (escalado para terceros) ───────────────────────────────

export type JobItem = { size: string; qty: number; name?: string | null; number?: string | null; variant?: "jugador" | "arquero" };

export async function createJob(formData: FormData) {
  const user = await requireTeamMember();
  const clientName = String(formData.get("client_name") || "").trim();
  if (!clientName) throw new Error("Falta el nombre del cliente");
  const notes = String(formData.get("notes") || "").trim() || null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("production_jobs")
    .insert({ client_name: clientName, notes, created_by: user.id })
    .select("id")
    .single();
  if (error) throw new Error("No se pudo crear el trabajo: " + error.message);
  revalidatePath("/panel/produccion/trabajos");
  return { id: data.id as string };
}

export async function saveJob(input: {
  id: string;
  clientName?: string;
  notes?: string | null;
  modelId?: string | null;
  items?: JobItem[];
  /** Diseño de una variante: se guarda junto a los de las otras variantes. */
  design?: { variant: "jugador" | "arquero"; config: DesignConfig };
}) {
  await requireTeamMember();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.clientName !== undefined) {
    if (!input.clientName.trim()) throw new Error("Falta el nombre del cliente");
    patch.client_name = input.clientName.trim();
  }
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.modelId !== undefined) patch.model_id = input.modelId;
  if (input.items !== undefined) {
    patch.items = input.items
      .map((i) => ({
        size: String(i.size ?? "").trim(),
        qty: Math.max(1, Math.floor(Number(i.qty) || 1)),
        name: i.name?.trim() || null,
        number: i.number?.toString().trim() || null,
        variant: i.variant === "arquero" ? "arquero" : "jugador",
      }))
      .filter((i) => i.size);
  }
  const supabase = await createClient();
  if (input.design !== undefined) {
    const { data: cur } = await supabase.from("production_jobs").select("design").eq("id", input.id).single();
    const prev = cur?.design && typeof cur.design === "object" ? (cur.design as Record<string, unknown>) : {};
    patch.design = { ...prev, [input.design.variant]: input.design.config };
  }
  const { error } = await supabase.from("production_jobs").update(patch).eq("id", input.id);
  if (error) throw new Error("No se pudo guardar el trabajo: " + error.message);
  revalidatePath(`/panel/produccion/trabajos/${input.id}`);
}

export async function deleteJob(id: string) {
  await requireTeamMember();
  const supabase = await createClient();
  const { error } = await supabase.from("production_jobs").delete().eq("id", id);
  if (error) throw new Error("No se pudo borrar el trabajo: " + error.message);
  revalidatePath("/panel/produccion/trabajos");
}

export async function saveJobLayout(input: { jobId: string; pdfPath: string; lengthMm: number; pieceCount: number }) {
  const user = await requireTeamMember();
  if (!input.jobId || !input.pdfPath || !Number.isFinite(input.lengthMm)) throw new Error("Faltan datos del rollo");
  const supabase = await createClient();
  const { error } = await supabase.from("production_layouts").insert({
    job_id: input.jobId,
    order_id: null,
    order_ids: [],
    length_mm: input.lengthMm,
    piece_count: input.pieceCount,
    pdf_path: input.pdfPath,
    created_by: user.id,
  });
  if (error) throw new Error("No se pudo registrar el rollo: " + error.message);
  revalidatePath(`/panel/produccion/trabajos/${input.jobId}`);
}

// ── Plantillas de diseño subidas ───────────────────────────────────────────

export async function listDesignTemplates(): Promise<CustomTemplate[]> {
  await requireTeamMember();
  const supabase = await createClient();
  const { data, error } = await supabase.from("design_templates").select("id, name, category, aspect, slots, shapes").order("created_at", { ascending: true });
  if (error) throw new Error("No se pudieron leer las plantillas: " + error.message);
  return (data ?? []).map((t) => ({ ...t, aspect: Number(t.aspect) })) as CustomTemplate[];
}

export async function saveDesignTemplate(t: Omit<CustomTemplate, "id">): Promise<{ id: string }> {
  const user = await requireTeamMember();
  if (!t.name?.trim()) throw new Error("Falta el nombre de la plantilla");
  if (!Array.isArray(t.shapes) || !t.shapes.length) throw new Error("La plantilla no tiene formas");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("design_templates")
    .insert({ name: t.name.trim(), category: t.category || "Mis plantillas", aspect: t.aspect, slots: t.slots, shapes: t.shapes, created_by: user.id })
    .select("id")
    .single();
  if (error) throw new Error("No se pudo guardar la plantilla: " + error.message);
  return { id: data.id as string };
}

export async function deleteDesignTemplate(id: string) {
  await requireTeamMember();
  const supabase = await createClient();
  const { error } = await supabase.from("design_templates").delete().eq("id", id);
  if (error) throw new Error("No se pudo borrar la plantilla: " + error.message);
}

// ── Rollo con varios pedidos ───────────────────────────────────────────────

export async function saveCombinedLayout(input: {
  pdfPath: string;
  lengthMm: number;
  pieceCount: number;
  /** Cada prenda del rollo: de un pedido (orderId) o de un trabajo libre (jobId). */
  contexts: { orderId: string | null; jobId?: string | null; requirementId: string | null; componentId: string | null; variant: "jugador" | "arquero" }[];
  /** Pedidos que con este rollo quedan con todas sus prendas: pasan a sublimación. */
  advanceOrderIds: string[];
}) {
  const user = await requireTeamMember();
  if (!input.pdfPath || !Number.isFinite(input.lengthMm) || !input.contexts.length) throw new Error("Faltan datos del rollo");
  const orderIds = [...new Set(input.contexts.map((c) => c.orderId).filter((x): x is string => !!x))];
  const jobIds = [...new Set(input.contexts.map((c) => c.jobId).filter((x): x is string => !!x))];
  const supabase = await createClient();
  const { data: layout, error } = await supabase
    .from("production_layouts")
    .insert({
      order_id: null,
      order_ids: orderIds,
      // Un trabajo solo: queda también en su página.
      job_id: !orderIds.length && jobIds.length === 1 ? jobIds[0] : null,
      job_ids: jobIds,
      length_mm: input.lengthMm,
      piece_count: input.pieceCount,
      pdf_path: input.pdfPath,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) throw new Error("No se pudo registrar el rollo: " + error.message);
  const { error: e2 } = await supabase.from("production_layout_items").insert(
    input.contexts.map((c) => ({
      layout_id: layout.id,
      order_id: c.orderId || null,
      job_id: c.jobId || null,
      requirement_id: c.requirementId || null,
      component_id: c.componentId || null,
      variant: c.variant,
    }))
  );
  if (e2) throw new Error("Se guardó el rollo pero no qué prendas lleva: " + e2.message);
  const advance = input.advanceOrderIds.filter((id) => orderIds.includes(id));
  if (advance.length) {
    const { error: e3 } = await supabase.from("orders").update({ status: "sublimacion_estampado", updated_at: new Date().toISOString() }).in("id", advance);
    if (e3) throw new Error("Se guardó el rollo pero no se pudo cambiar el estado: " + e3.message);
  }
  for (const id of orderIds) {
    revalidatePath(`/panel/produccion/${id}`);
    revalidatePath(`/panel/pedidos/${id}`);
  }
  for (const id of jobIds) revalidatePath(`/panel/produccion/trabajos/${id}`);
  revalidatePath("/panel/produccion");
  revalidatePath("/panel/pedidos");
  return { id: layout.id as string };
}
