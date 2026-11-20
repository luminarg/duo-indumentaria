import { PDFDocument } from "pdf-lib";
import type { PrintPiece } from "./types";

// Piezas que se suman a mano al rollo, fuera del diseño del pedido:
// - "archivo": un PDF o imagen con su medida (bandera, cuello, parche…).
// - "reposicion": otra copia de una pieza del pedido (una que salió fallada).

export type FreeFile = { key: string; name: string; bytes: Uint8Array; pageWmm: number; pageHmm: number };

export type FreePiece =
  | { id: string; type: "archivo"; fileKey: string; name: string; widthMm: number; heightMm: number; copies: number }
  | { id: string; type: "reposicion"; printKey: string; label: string; copies: number };

const MM = 72 / 25.4;
const PX_PER_MM_300 = 300 / 25.4;

/**
 * Lee un PDF (primera página) o una imagen PNG/JPG y la deja como PDF de una
 * página. Las imágenes se toman a 300 dpi para calcular su medida.
 */
export async function readFreeFile(name: string, data: ArrayBuffer, type: string): Promise<Omit<FreeFile, "key">> {
  const bytes = new Uint8Array(data);
  if (/pdf/i.test(type) || /\.pdf$/i.test(name)) {
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const page = src.getPage(0);
    const { width, height } = page.getSize();
    return { name, bytes, pageWmm: width / MM, pageHmm: height / MM };
  }
  const doc = await PDFDocument.create();
  const img = /png/i.test(type) || /\.png$/i.test(name) ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  const wMm = img.width / PX_PER_MM_300;
  const hMm = img.height / PX_PER_MM_300;
  const page = doc.addPage([wMm * MM, hMm * MM]);
  page.drawImage(img, { x: 0, y: 0, width: wMm * MM, height: hMm * MM });
  return { name, bytes: await doc.save(), pageWmm: wMm, pageHmm: hMm };
}

/** Piezas del rollo para lo agregado a mano. `prints` son las del pedido (para las reposiciones). */
export function freePiecePrints(items: FreePiece[], files: FreeFile[], prints: PrintPiece[]): PrintPiece[] {
  const out: PrintPiece[] = [];
  for (const it of items) {
    const n = Math.max(1, Math.floor(it.copies || 1));
    if (it.type === "reposicion") {
      const src = prints.find((p) => p.key === it.printKey);
      if (!src) continue;
      for (let k = 0; k < n; k++) out.push({ ...src, key: `${src.key}:repo:${it.id}:${k}` });
      continue;
    }
    const f = files.find((x) => x.key === it.fileKey);
    if (!f || !(it.widthMm > 0) || !(it.heightMm > 0)) continue;
    const w = it.widthMm, h = it.heightMm;
    for (let k = 0; k < n; k++) {
      const key = `libre:${it.id}:${k}`;
      out.push({
        key,
        piece: {
          id: `libre-${it.id}`,
          modelId: "libre",
          sizeLabel: it.name,
          kind: "otra",
          name: it.name,
          outline: [
            { x: 0, y: 0 },
            { x: w, y: 0 },
            { x: w, y: h },
            { x: 0, y: h },
          ],
        },
        garment: { orderItemId: key, sizeLabel: it.name, name: null, number: null, variant: "jugador" },
        sizeGroup: "adulto",
        // El archivo entero estirado a la medida pedida.
        backgroundTransform: { a: w / f.pageWmm, b: 0, c: 0, d: h / f.pageHmm, e: 0, f: 0 },
        backgroundClip: null,
        bgFile: f.key,
        bgColor: "#FFFFFF",
        elements: [],
        texts: [],
        boxes: [],
        warnings: [],
      });
    }
  }
  return out;
}
