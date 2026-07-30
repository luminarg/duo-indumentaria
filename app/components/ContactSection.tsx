import { MessageCircle, Instagram, Facebook, MapPin } from "lucide-react";

export function ContactSection({
  whatsappNumber,
  address,
  instagram,
  facebook,
}: {
  whatsappNumber: string | null;
  address: string | null;
  instagram: string | null;
  facebook: string | null;
}) {
  return (
    <section id="contacto" className="bg-background px-6 py-20 sm:px-10">
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 border-t border-foreground/10 pt-14">
        <h2 className="text-2xl font-black uppercase tracking-tight text-foreground sm:text-3xl">
          Estamos a tu disposición
        </h2>

        {whatsappNumber && (
          <a
            href={`https://wa.me/${whatsappNumber}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
          >
            <MessageCircle className="h-4 w-4" />
            Envíanos un WhatsApp
          </a>
        )}

        <div className="flex flex-col gap-2 text-sm text-muted">
          {address && (
            <span className="inline-flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              {address}
            </span>
          )}
        </div>

        <div className="flex items-center gap-4 text-muted">
          {instagram && (
            <a href={instagram} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-foreground">
              <Instagram className="h-5 w-5" />
            </a>
          )}
          {facebook && (
            <a href={facebook} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-foreground">
              <Facebook className="h-5 w-5" />
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
