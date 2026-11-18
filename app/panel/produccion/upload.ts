"use client";

import { createClient } from "@/lib/supabase/client";
import { createFontUpload, createProductionUpload, signedProductionUrls } from "./actions";

/** Sube un archivo directo del navegador al bucket privado y devuelve su ruta. */
export async function uploadToProduction(folder: string, file: Blob, ext: string): Promise<string> {
  const { path, token } = await createProductionUpload(folder, ext);
  const supabase = createClient();
  const { error } = await supabase.storage.from("production-files").uploadToSignedUrl(path, token, file, {
    contentType: file.type || "application/octet-stream",
  });
  if (error) throw new Error("No se pudo subir el archivo: " + error.message);
  return path;
}

/** Descarga archivos del bucket privado como bytes (para armar el PDF en el navegador). */
export async function downloadProductionFiles(paths: string[]): Promise<Record<string, Uint8Array>> {
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length) return {};
  const urls = await signedProductionUrls(unique);
  const out: Record<string, Uint8Array> = {};
  await Promise.all(
    unique.map(async (p) => {
      const url = urls[p];
      if (!url) return;
      const res = await fetch(url);
      if (res.ok) out[p] = new Uint8Array(await res.arrayBuffer());
    })
  );
  return out;
}

/** Sube una fuente (.ttf/.otf) a la biblioteca y devuelve su ruta. */
export async function uploadFont(file: File): Promise<string> {
  const { path, token } = await createFontUpload(file.name);
  const supabase = createClient();
  const { error } = await supabase.storage.from("production-files").uploadToSignedUrl(path, token, file, {
    contentType: /\.otf$/i.test(file.name) ? "font/otf" : "font/ttf",
  });
  if (error) throw new Error("No se pudo subir la fuente: " + error.message);
  return path;
}
