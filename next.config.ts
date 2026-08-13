import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // El default de Next.js es 1MB para el body de una Server Action —
      // como subimos imágenes (logo, favicon, sliders, diseños, mockups)
      // directo por Server Actions con FormData, cualquier foto de más de
      // 1MB (muy común, sobre todo desde el celular) fallaba con un error
      // genérico. Lo subimos a 10MB para cubrir fotos normales.
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
