export function SiteFooter({ businessName }: { businessName: string }) {
  return (
    <footer className="border-t border-foreground/10 bg-background px-6 py-6 text-center sm:px-10">
      <p className="text-xs text-muted">
        Copyright © {new Date().getFullYear()} {businessName} — Todos los derechos reservados.
      </p>
    </footer>
  );
}
