// PDF → imagen en el navegador (pdf.js). Se usa para el mockup: el PDF es
// vectorial y fiel al rollo; la imagen es para mandar por WhatsApp o mail.
// El worker se sirve desde /public (misma versión que el paquete).

export async function pdfToPngBlob(bytes: Uint8Array, maxPx = 2400): Promise<Blob> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  try {
    const page = await doc.getPage(1);
    const vp1 = page.getViewport({ scale: 1 });
    const scale = maxPx / Math.max(vp1.width, vp1.height);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("El navegador no permite dibujar la imagen");
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    return await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("No se pudo generar la imagen"))), "image/png"));
  } finally {
    await doc.destroy();
  }
}

/** Todas las páginas de un PDF como canvas, a `pxPerPt` píxeles por punto. */
export async function pdfPagesToCanvases(bytes: Uint8Array, pxPerPt: number): Promise<HTMLCanvasElement[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  try {
    const out: HTMLCanvasElement[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: pxPerPt });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("El navegador no permite dibujar la imagen");
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      out.push(canvas);
    }
    return out;
  } finally {
    await doc.destroy();
  }
}

/**
 * Color que predomina en el fondo del diseño: se dibuja la página y se cuenta
 * qué color ocupa más superficie dentro de las piezas encontradas (así sirve
 * aunque el fondo sea una imagen, un degradé o tenga transparencias). Se
 * ignoran el negro del contorno y lo transparente. Devuelve "#RRGGBB".
 */
export async function dominantColorInPieces(bytes: Uint8Array, outlinesMm: { x: number; y: number }[][]): Promise<string | null> {
  if (!outlinesMm.length) return null;
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2, 1200 / Math.max(base.width, base.height));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const pxPerMm = (72 / 25.4) * scale;
    // Máscara de las piezas (se rellenan los contornos y se lee esa máscara).
    const mask = document.createElement("canvas");
    mask.width = canvas.width;
    mask.height = canvas.height;
    const mctx = mask.getContext("2d", { willReadFrequently: true })!;
    mctx.fillStyle = "#000";
    for (const o of outlinesMm) {
      mctx.beginPath();
      o.forEach((p, i) => (i ? mctx.lineTo(p.x * pxPerMm, p.y * pxPerMm) : mctx.moveTo(p.x * pxPerMm, p.y * pxPerMm)));
      mctx.closePath();
      mctx.fill();
    }
    const m = mctx.getImageData(0, 0, mask.width, mask.height).data;
    const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
    for (let i = 0; i < data.length; i += 4 * 2) {
      if (m[i + 3] < 200 || data[i + 3] < 200) continue;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (0.2126 * r + 0.7152 * g + 0.0722 * b < 25) continue; // contorno negro
      const k = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      const e = buckets.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
      e.n++; e.r += r; e.g += g; e.b += b;
      buckets.set(k, e);
    }
    let best: { n: number; r: number; g: number; b: number } | null = null;
    for (const e of buckets.values()) if (!best || e.n > best.n) best = e;
    if (!best) return null;
    const hex = (v: number) => Math.round(v / best!.n).toString(16).padStart(2, "0");
    return `#${hex(best.r)}${hex(best.g)}${hex(best.b)}`.toUpperCase();
  } finally {
    await doc.destroy();
  }
}
