"use client";

import { useState, useTransition } from "react";
import { updateBusinessSettings } from "./actions";
import { Card } from "../../components/ui/Card";
import { Input, Textarea } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";

type Settings = {
  business_name: string;
  logo_url: string | null;
  whatsapp_number: string | null;
  contact_email: string | null;
  address: string | null;
  social_instagram: string | null;
  social_facebook: string | null;
  primary_color: string;
  secondary_color: string;
  show_prices: boolean;
  hero_title?: string | null;
  hero_subtitle?: string | null;
  quote_header_text?: string | null;
  quote_footer_text?: string | null;
  quote_validity_days?: number;
};

export function ConfigForm({ settings }: { settings: Settings }) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(settings.logo_url);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await updateBusinessSettings(formData);
        setMessage("Guardado.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al guardar");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-2xl flex-col gap-6">
      {message && (
        <div className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-800">{message}</div>
      )}
      {error && <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

      <Card className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-zinc-900">Datos del negocio</h2>
        <Input label="Nombre" name="business_name" defaultValue={settings.business_name} />

        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
          Logo
          <input
            type="file"
            name="logo"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) setLogoPreview(URL.createObjectURL(file));
            }}
            className="mt-1 block w-full text-sm text-zinc-600"
          />
        </label>
        {logoPreview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoPreview} alt="Logo" className="h-16 w-auto rounded bg-zinc-900 p-2" />
        )}
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-zinc-900">Colores del sitio</h2>
        <div className="flex gap-6">
          <label className="text-xs font-medium text-zinc-500">
            Color principal (fondo)
            <input
              type="color"
              name="primary_color"
              defaultValue={settings.primary_color}
              className="mt-1 block h-10 w-16 rounded border border-zinc-300"
            />
          </label>
          <label className="text-xs font-medium text-zinc-500">
            Color de acento (botones)
            <input
              type="color"
              name="secondary_color"
              defaultValue={settings.secondary_color}
              className="mt-1 block h-10 w-16 rounded border border-zinc-300"
            />
          </label>
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-zinc-900">Textos del hero (home)</h2>
        <Input label="Título" name="hero_title" defaultValue={settings.hero_title ?? "Vive tu Juego."} />
        <Textarea label="Subtítulo" name="hero_subtitle" defaultValue={settings.hero_subtitle ?? ""} />
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-zinc-900">Contacto y redes</h2>
        <Input
          label="WhatsApp (solo números, con código de país)"
          name="whatsapp_number"
          defaultValue={settings.whatsapp_number ?? ""}
          placeholder="543534848150"
        />
        <Input label="Email de contacto" name="contact_email" defaultValue={settings.contact_email ?? ""} />
        <Input label="Dirección" name="address" defaultValue={settings.address ?? ""} />
        <Input
          label="Instagram (link completo)"
          name="social_instagram"
          defaultValue={settings.social_instagram ?? ""}
        />
        <Input
          label="Facebook (link completo)"
          name="social_facebook"
          defaultValue={settings.social_facebook ?? ""}
        />
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-zinc-900">Textos del presupuesto (PDF)</h2>
        <Textarea
          label="Encabezado (opcional)"
          name="quote_header_text"
          defaultValue={settings.quote_header_text ?? ""}
        />
        <Textarea
          label="Pie / condiciones"
          name="quote_footer_text"
          defaultValue={
            settings.quote_footer_text ??
            "El presupuesto no incluye IVA. Necesitamos una seña del 50% para confirmar el pedido."
          }
        />
        <Input
          label="Validez por defecto (días)"
          type="number"
          name="quote_validity_days"
          defaultValue={settings.quote_validity_days ?? 7}
          className="w-32"
        />
      </Card>

      <Card>
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input type="checkbox" name="show_prices" defaultChecked={settings.show_prices} />
          Mostrar precios en el catálogo público
        </label>
      </Card>

      <Button type="submit" disabled={isPending} className="self-start">
        {isPending ? "Guardando..." : "Guardar cambios"}
      </Button>
    </form>
  );
}
