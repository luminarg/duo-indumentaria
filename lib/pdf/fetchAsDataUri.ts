import { createAdminClient } from "@/lib/supabase/admin";

// Descarga un archivo de un bucket PRIVADO de Storage y lo devuelve como
// data URI, para poder incrustarlo directo en el PDF (react-pdf no puede
// usar una URL firmada con expiración corta de forma confiable, así que
// bajamos los bytes nosotros mismos).
export async function fetchPrivateFileAsDataUri(
  bucket: string,
  path: string,
  contentType: string
): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(bucket).download(path);
  if (error || !data) return null;

  const buffer = Buffer.from(await data.arrayBuffer());
  return `data:${contentType};base64,${buffer.toString("base64")}`;
}

export function guessImageMimeType(fileName: string | null): string | null {
  if (!fileName) return null;
  const ext = fileName.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    default:
      return null; // no es imagen (pdf, ai, etc.) — no se puede incrustar
  }
}
