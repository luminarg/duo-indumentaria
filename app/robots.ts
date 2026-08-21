import type { MetadataRoute } from "next";

// robots.txt generado — le dice a los buscadores que indexen el sitio
// público pero no el panel interno ni los links privados de pedidos.
export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/panel", "/pedido", "/presupuesto", "/api"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
