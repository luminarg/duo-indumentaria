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
