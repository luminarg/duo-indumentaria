// Agrupa prendas por producto (artículo) y talle, para poder mostrar algo
// como:
//   Musculosa: XS - 2, S - 1 (total 3)
//   Pantalón: L - 1, M - 3 (total 4)
// Se usa tanto en el panel como en el link público del pedido y en el
// informe en PDF, así el conteo es siempre el mismo en todos lados.

const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];

export type SizeCount = { size: string; quantity: number };
export type ProductSummary = { product: string; sizes: SizeCount[]; total: number };

export function summarizeBySizeAndProduct(
  rows: { product: string | null | undefined; size: string | null | undefined; quantity: number }[]
): ProductSummary[] {
  const byProduct = new Map<string, Map<string, number>>();

  for (const row of rows) {
    const product = (row.product ?? "").trim() || "Sin artículo";
    const size = (row.size ?? "").trim() || "Sin talle";
    if (!row.quantity) continue;
    if (!byProduct.has(product)) byProduct.set(product, new Map());
    const sizeMap = byProduct.get(product)!;
    sizeMap.set(size, (sizeMap.get(size) ?? 0) + row.quantity);
  }

  return Array.from(byProduct.entries()).map(([product, sizeMap]) => {
    const sizes = Array.from(sizeMap.entries())
      .map(([size, quantity]) => ({ size, quantity }))
      .sort((a, b) => {
        const ai = SIZE_ORDER.indexOf(a.size.toUpperCase());
        const bi = SIZE_ORDER.indexOf(b.size.toUpperCase());
        if (ai === -1 && bi === -1) return a.size.localeCompare(b.size);
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });
    const total = sizes.reduce((sum, s) => sum + s.quantity, 0);
    return { product, sizes, total };
  });
}
