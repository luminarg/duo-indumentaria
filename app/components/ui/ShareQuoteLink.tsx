"use client";

import { useState } from "react";
import { Share2, Check, MessageCircle } from "lucide-react";
import { Button } from "./Button";

// Botón para compartir el link público de un presupuesto — mismo patrón que
// ShareOrderLink. En mobile usa la Web Share API nativa; si no está
// disponible (desktop), copia el link. Si tenemos el teléfono del cliente,
// sumamos un atajo directo a WhatsApp.
export function ShareQuoteLink({
  link,
  quoteNumber,
  contactPhone,
}: {
  link: string;
  quoteNumber: string;
  contactPhone?: string | null;
}) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const shareData = {
      title: `Presupuesto ${quoteNumber}`,
      text: `Te paso el link de tu presupuesto ${quoteNumber}:`,
      url: link,
    };
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        // El usuario canceló el selector nativo o falló — probamos copiar.
      }
    }
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sin acceso al portapapeles — no hacemos nada más.
    }
  }

  const whatsappHref = contactPhone
    ? `https://wa.me/${contactPhone.replace(/\D/g, "")}?text=${encodeURIComponent(
        `Hola! Te paso el link de tu presupuesto ${quoteNumber}: ${link}`
      )}`
    : null;

  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="secondary" onClick={handleShare}>
        {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
        {copied ? "Link copiado" : "Compartir link"}
      </Button>
      {whatsappHref && (
        <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
          <Button type="button" variant="secondary">
            <MessageCircle className="h-4 w-4" />
            WhatsApp
          </Button>
        </a>
      )}
    </div>
  );
}
