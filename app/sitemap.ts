import type { MetadataRoute } from "next";

// Sitemap generado — hoy el sitio público es de una sola página (home), así
// que alcanza con esta entrada. Cuando se sume el catálogo completo de
// productos, este archivo es el lugar para agregar cada producto.
export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  return [
    {
      url: siteUrl,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
