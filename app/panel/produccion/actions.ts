"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DesignConfig, PieceKind } from "@/lib/produccion/types";
import { FONT_FOLDER, fontNameFromPath, fontSlug, type FontEntry } from "@/lib/produccion/fonts";

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
  return (data ?? [])
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
  const { data: last } = await q;
  const version = (last?.[0]?.version ?? 0) + 1;
  const { error } = await supabase.from("order_designs").insert({
    order_id: input.orderId,
    requirement_id: input.requirementId,
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
  const baseSize = String(formData.get("base_size_label") || "L").trim() || "L";
  if (!name) throw new Error("Falta el nombre del modelo");
  const { data, error } = await supabase
    .from("pattern_models")
    .insert({ name, article_type_id: articleTypeId, neck, base_size_label: baseSize })
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
