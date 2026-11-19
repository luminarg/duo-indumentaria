import type { Shape } from "./templates";

/**
 * Dibuja la plantilla en un canvas del navegador y devuelve una imagen (data
 * URL) para la vista previa. El PDF de impresión sale vectorial aparte.
 */
export function rasterizeTemplate(shapes: Shape[], widthMm: number, heightMm: number, maxPx = 1600): string {
  const scale = Math.min(4, maxPx / Math.max(widthMm, heightMm));
  const cv = document.createElement("canvas");
  cv.width = Math.max(1, Math.round(widthMm * scale));
  cv.height = Math.max(1, Math.round(heightMm * scale));
  const g = cv.getContext("2d");
  if (!g) return "";
  g.scale(scale, scale);
  for (const s of shapes) {
    if (s.pts.length < 3) continue;
    g.beginPath();
    g.moveTo(s.pts[0].x, s.pts[0].y);
    for (const p of s.pts.slice(1)) g.lineTo(p.x, p.y);
    g.closePath();
    if (s.kind === "poly") g.fillStyle = s.color;
    else {
      const lg = g.createLinearGradient(s.from.x, s.from.y, s.to.x, s.to.y);
      for (const st of s.stops) lg.addColorStop(Math.min(1, Math.max(0, st.t)), st.color);
      g.fillStyle = lg;
    }
    g.fill();
  }
  return cv.toDataURL("image/png");
}
