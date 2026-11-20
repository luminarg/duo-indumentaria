// DTF → PNG en el navegador: fondo transparente, RGB, a 300 dpi.
import { pngWithDpi, type DtfFile, type DtfLayout } from "./dtf";

type Drawable = CanvasImageSource & { width: number; height: number };

/** El diseño como imagen de `wPx` × `hPx` (PDF con pdf.js, sin fondo; imágenes tal cual). */
async function rasterize(f: DtfFile, wPx: number, hPx: number): Promise<Drawable> {
  if (f.kind !== "pdf") {
    return await createImageBitmap(new Blob([f.bytes as BlobPart], { type: f.kind === "png" ? "image/png" : "image/jpeg" }));
  }
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const doc = await pdfjs.getDocument({ data: f.bytes.slice() }).promise;
  try {
    const page = await doc.getPage(1);
    const vp1 = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.max(wPx / vp1.width, hPx / vp1.height) });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("El navegador no permite dibujar la imagen");
    await page.render({ canvas, canvasContext: ctx, viewport, background: "rgba(0,0,0,0)" }).promise;
    return canvas;
  } finally {
    await doc.destroy();
  }
}

/**
 * Una hoja o tramo del DTF como PNG transparente. `dpi` 300 para imprimir;
 * más bajo para la vista previa.
 */
export async function renderDtfSheet(layout: DtfLayout, files: DtfFile[], sheet: number, dpi = 300): Promise<HTMLCanvasElement> {
  const pxPerMm = dpi / 25.4;
  const sh = layout.sheets[sheet];
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sh.widthMm * pxPerMm);
  canvas.height = Math.round(sh.heightMm * pxPerMm);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(`El navegador no puede armar una imagen de ${canvas.width} × ${canvas.height} px: bajá el largo del tramo.`);
  ctx.imageSmoothingQuality = "high";
  const cache = new Map<string, Drawable>();
  for (const p of layout.placed.filter((x) => x.sheet === sheet)) {
    const f = files.find((x) => x.id === p.itemId);
    if (!f) continue;
    // Medida del diseño "derecho" (sin girar), en píxeles.
    const wPx = Math.round((p.rotated ? p.h : p.w) * pxPerMm);
    const hPx = Math.round((p.rotated ? p.w : p.h) * pxPerMm);
    const k = `${f.id}|${wPx}|${hPx}`;
    let img = cache.get(k);
    if (!img) {
      img = await rasterize(f, wPx, hPx);
      cache.set(k, img);
    }
    const bx = p.x * pxPerMm, by = p.y * pxPerMm, bh = p.h * pxPerMm;
    ctx.save();
    if (p.rotated) {
      // Girado 90° a la izquierda: igual que en el PDF.
      ctx.translate(bx, by + bh);
      ctx.rotate(-Math.PI / 2);
    } else ctx.translate(bx, by);
    ctx.drawImage(img, 0, 0, wPx, hPx);
    ctx.restore();
  }
  return canvas;
}

export async function canvasToPng300(canvas: HTMLCanvasElement, dpi = 300): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("No se pudo generar el PNG (imagen muy grande)"))), "image/png"));
  return pngWithDpi(new Uint8Array(await blob.arrayBuffer()), dpi);
}
