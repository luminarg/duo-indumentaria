import Link from "next/link";
import { MessageCircle } from "lucide-react";

export function SiteHeader({
  businessName,
  logoUrl,
  whatsappNumber,
  hasHeroImage,
}: {
  businessName: string;
  logoUrl: string | null;
  whatsappNumber: string | null;
  hasHeroImage: boolean;
}) {
  // Si el hero tiene una foto de fondo, el header queda casi sin
  // superposición oscura (ver Hero.tsx), así que usamos texto blanco fijo
  // por legibilidad — no podemos calcular contraste contra una foto. Si el
  // hero es un color plano, seguimos el tema dinámico (foreground/muted).
  const textClass = hasHeroImage ? "text-white" : "text-foreground";
  const mutedClass = hasHeroImage ? "text-zinc-200" : "text-muted";
  const hoverClass = hasHeroImage ? "hover:text-white" : "hover:text-foreground";

  return (
    <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-6 py-5 sm:px-10">
      <Link href="/" className="flex items-center">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={businessName} className="h-[52px] w-auto" />
        ) : (
          <span className={`text-2xl font-black uppercase tracking-tight ${textClass}`}>
            {businessName}
          </span>
        )}
      </Link>
      <nav className={`hidden items-center gap-8 text-sm font-medium sm:flex ${mutedClass}`}>
        <Link href="/products" className={`transition-colors ${hoverClass}`}>
          Catálogo
        </Link>
        <Link href="#contacto" className={`transition-colors ${hoverClass}`}>
          Contacto
        </Link>
      </nav>
      {whatsappNumber && (
        <a
          href={`https://wa.me/${whatsappNumber}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
        >
          <MessageCircle className="h-4 w-4" />
          WhatsApp
        </a>
      )}
    </header>
  );
}
