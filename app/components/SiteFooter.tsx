import Link from "next/link";

export function SiteFooter({
  businessName,
  menuPages = [],
}: {
  businessName: string;
  menuPages?: { title: string; slug: string }[];
}) {
  return (
    <footer className="border-t border-foreground/10 bg-background px-6 py-6 text-center sm:px-10">
      {/* Links a las páginas del menú — también acá abajo porque en celular
          el menú de arriba no se muestra. */}
      {menuPages.length > 0 && (
        <nav className="mb-3 flex flex-wrap justify-center gap-x-5 gap-y-1 text-sm text-muted">
          {menuPages.map((p) => (
            <Link key={p.slug} href={`/${p.slug}`} className="transition-colors hover:text-foreground">
              {p.title}
            </Link>
          ))}
        </nav>
      )}
      <p className="text-xs text-muted">
        Copyright © {new Date().getFullYear()} {businessName} — Todos los derechos reservados.
      </p>
    </footer>
  );
}
