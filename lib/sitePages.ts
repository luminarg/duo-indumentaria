// Utilidades para las páginas de contenido del sitio (site_pages).

// Direcciones que ya usa el sistema — una página nueva no puede llamarse
// así porque quedaría tapada (o taparía) una parte del sitio.
export const RESERVED_SLUGS = [
  "panel",
  "pedido",
  "presupuesto",
  "api",
  "products",
  "robots.txt",
  "sitemap.xml",
  "favicon.ico",
  "_next",
];

// "¿Cómo hacer tu pedido?" → "como-hacer-tu-pedido"
export function slugify(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function isReservedSlug(slug: string) {
  return RESERVED_SLUGS.includes(slug);
}
