import { PDFDocument } from "pdf-lib";
import { compose } from "./geometry";
import type { Affine, PrintPiece } from "./types";

// Piezas que se suman a mano al rollo, fuera del diseño del pedido:
// - "archivo": un PDF o imagen con su medida (bandera, cuello, parche…).
// - "reposicion": otra copia de una pieza del pedido (una que salió fallada).

export type FreeFile = { key: string; name: string; bytes: Uint8Array; pageWmm: number; pageHmm: number };

export type FreePiece =
  | {
      id: string;
      type: "archivo";
      fileKey: string;
      name: string;
      /** Medida terminada (lo que se ve), sin el dobladillo. */
      widthMm: number;
      heightMm: number;
      copies: number;
      /** estirar: ocupa la medida exacta; cubrir: llena y recorta lo que sobra; entero: entra todo y el resto va del color de fondo. */
      fit?: FreeFit;
      /** Dobladillo en cada borde (mm): se agrega afuera de la medida, del color de fondo. */
      hemMm?: number;
      bgColor?: string;
    }
  | { id: string; type: "reposicion"; printKey: string; label: string; copies: number };

export type FreeFit = "estirar" | "cubrir" | "entero";

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

/**
 * Lienzo del archivo → pieza, para una medida terminada `w`×`h` corrida `hem`
 * (el dobladillo) y el modo de ajuste. Devuelve también la zona visible en
 * coordenadas del lienzo (para recortar el arte y que no pise el dobladillo).
 */
export function fitArt(pageW: number, pageH: number, w: number, h: number, hem: number, fit: FreeFit): { t: Affine; clip: { x: number; y: number }[] } {
  let sx: number, sy: number;
  if (fit === "estirar") {
    sx = w / pageW;
    sy = h / pageH;
  } else {
    sx = sy = fit === "cubrir" ? Math.max(w / pageW, h / pageH) : Math.min(w / pageW, h / pageH);
  }
  const e = hem + (w - pageW * sx) / 2;
  const f = hem + (h - pageH * sy) / 2;
  const t: Affine = { a: sx, b: 0, c: 0, d: sy, e, f };
  // Zona terminada (hem..hem+w, hem..hem+h) llevada al lienzo.
  const x0 = (hem - e) / sx, x1 = (hem + w - e) / sx, y0 = (hem - f) / sy, y1 = (hem + h - f) / sy;
  const clip = [
    { x: Math.max(0, x0), y: Math.max(0, y0) },
    { x: Math.min(pageW, x1), y: Math.max(0, y0) },
    { x: Math.min(pageW, x1), y: Math.min(pageH, y1) },
    { x: Math.max(0, x0), y: Math.min(pageH, y1) },
  ];
  return { t, clip };
}

/**
 * Piezas del rollo para lo agregado a mano. `prints` son las del pedido (para
 * las reposiciones). Si una pieza es más ancha que `usableWidthMm` y parada
 * entra, se gira 90° (una bandera de 2 m en tela de 1,55 m).
 */
export function freePiecePrints(items: FreePiece[], files: FreeFile[], prints: PrintPiece[], usableWidthMm = Infinity): PrintPiece[] {
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
    const hem = Math.max(0, it.hemMm ?? 0);
    const W = it.widthMm + 2 * hem, H = it.heightMm + 2 * hem;
    const { t: fitT, clip } = fitArt(f.pageWmm, f.pageHmm, it.widthMm, it.heightMm, hem, it.fit ?? "estirar");
    const rotate = W > usableWidthMm && H <= usableWidthMm;
    // Girada 90°: (x, y) → (H − y, x).
    const t = rotate ? compose(fitT, { a: 0, b: 1, c: -1, d: 0, e: H, f: 0 }) : fitT;
    const w = rotate ? H : W, h = rotate ? W : H;
    const needsClip = hem > 0 || (it.fit ?? "estirar") !== "estirar";
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
        backgroundTransform: t,
        // Recorte a la medida terminada: el dobladillo y lo que sobra van del color de fondo.
        backgroundClip: needsClip ? clip : null,
        noBleed: true,
        bgFile: f.key,
        bgColor: it.bgColor ?? "#FFFFFF",
        elements: [],
        texts: [],
        boxes: [],
        warnings: [],
      });
    }
  }
  return out;
}
