// Helpers para elegir automáticamente un color de texto legible sobre
// cualquier color de fondo que el dueño elija desde el panel — evita que
// alguien elija, por ejemplo, un fondo claro y el texto siga siendo blanco
// (el mismo problema de contraste que motivó el rediseño de la home).

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const num = parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function relativeLuminance([r, g, b]: [number, number, number]) {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const channel = c / 255;
    return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(l1: number, l2: number) {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Devuelve blanco o un gris muy oscuro, el que tenga mejor contraste sobre `bgHex`. */
export function getReadableForeground(bgHex: string): string {
  try {
    const bgLuminance = relativeLuminance(hexToRgb(bgHex));
    const contrastWithWhite = contrastRatio(bgLuminance, 1);
    const contrastWithDark = contrastRatio(bgLuminance, relativeLuminance(hexToRgb("#18181b")));
    return contrastWithWhite >= contrastWithDark ? "#ffffff" : "#18181b";
  } catch {
    return "#ffffff";
  }
}

/** Gris intermedio para texto secundario, ajustado según si el fondo es claro u oscuro. */
export function getMutedForeground(bgHex: string): string {
  const foreground = getReadableForeground(bgHex);
  return foreground === "#ffffff" ? "#a1a1aa" : "#52525b";
}
