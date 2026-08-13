"use client";

import { useState, useTransition } from "react";
import { updateBusinessSettings } from "./actions";
import { Card } from "../../components/ui/Card";
import { Input, Textarea } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { SlidersManager } from "./SlidersManager";
import { FeatureCardsManager } from "./FeatureCardsManager";
import { SeoGuide } from "./SeoGuide";
import { cn } from "@/lib/cn";

type Settings = {
  business_name: string;
  logo_url: string | null;
  favicon_url: string | null;
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
  seo_title?: string | null;
  seo_description?: string | null;
  seo_keywords?: string | null;
  seo_og_image_url?: string | null;
};

type Slider = {
  id: string;
  image_url: string;
  title: string | null;
  subtitle: string | null;
  active: boolean;
  sort_order: number;
};

type Feature = {
  id: string;
  icon: string;
  title: string;
  description: string;
  sort_order: number;
  active: boolean;
};

const TABS = [
  { key: "negocio", label: "Negocio" },
  { key: "home", label: "Home" },
  { key: "contacto", label: "Contacto" },
  { key: "presupuestos", label: "Presupuestos" },
  { key: "seo", label: "SEO" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function ConfigForm({
  settings,
  sliders,
  features,
}: {
  settings: Settings;
  sliders: Slider[];
  features: Feature[];
}) {
  const [tab, setTab] = useState<TabKey>("negocio");
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(settings.logo_url);
  const [faviconPreview, setFaviconPreview] = useState<string | null>(settings.favicon_url);
  const [ogPreview, setOgPreview] = useState<string | null>(settings.seo_og_image_url ?? null);
  const [seoTitle, setSeoTitle] = useState(settings.seo_title ?? "");
  const [seoDescription, setSeoDescription] = useState(settings.seo_description ?? "");

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
    <div className="flex max-w-2xl flex-col gap-6">
      {message && (
        <div className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-800">{message}</div>
      )}
      {error && <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

      <div className="flex gap-1 border-b border-zinc-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              tab === t.key
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:text-zinc-700"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Un solo <form>: las pestañas solo esconden secciones con CSS (no
          las desmontan), así "Guardar cambios" siempre manda todos los
          campos juntos sin importar en qué pestaña estás parado. */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div className={cn("flex flex-col gap-6", tab !== "negocio" && "hidden")}>
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

            <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
              Favicon (ícono de la pestaña del navegador)
              <input
                type="file"
                name="favicon"
                accept="image/png,image/x-icon,image/svg+xml,image/jpeg"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setFaviconPreview(URL.createObjectURL(file));
                }}
                className="mt-1 block w-full text-sm text-zinc-600"
              />
            </label>
            {faviconPreview && (
              <div className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={faviconPreview}
                  alt="Favicon"
                  className="h-8 w-8 rounded bg-zinc-900 object-contain p-1"
                />
                <span className="text-xs text-zinc-400">Recomendado: imagen cuadrada (ej. 512×512px)</span>
              </div>
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

          <Card>
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input type="checkbox" name="show_prices" defaultChecked={settings.show_prices} />
              Mostrar precios en el catálogo público
            </label>
          </Card>
        </div>

        <div className={cn("flex flex-col gap-6", tab !== "home" && "hidden")}>
          <Card className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-zinc-900">Textos del hero (home)</h2>
            <Input label="Título" name="hero_title" defaultValue={settings.hero_title ?? "Vive tu Juego."} />
            <Textarea label="Subtítulo" name="hero_subtitle" defaultValue={settings.hero_subtitle ?? ""} />
          </Card>
        </div>

        <div className={cn("flex flex-col gap-6", tab !== "contacto" && "hidden")}>
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
        </div>

        <div className={cn("flex flex-col gap-6", tab !== "presupuestos" && "hidden")}>
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
        </div>

        <div className={cn("flex flex-col gap-6", tab !== "seo" && "hidden")}>
          <Card className="flex flex-col gap-4">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">Posicionamiento en buscadores (SEO)</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Esto es lo que Google y las redes sociales muestran cuando alguien busca o comparte tu sitio. No
                hace falta tocar código: se guarda igual que el resto de esta pantalla.
              </p>
            </div>

            <div>
              <Input
                label="Título para buscadores"
                name="seo_title"
                value={seoTitle}
                onChange={(e) => setSeoTitle(e.target.value)}
                placeholder={settings.business_name}
                hint="Ej: 'Duo Indumentaria — Indumentaria deportiva a medida'. Ideal hasta 60 caracteres."
              />
              <p className={cn("mt-1 text-[11px]", seoTitle.length > 60 ? "text-amber-600" : "text-zinc-400")}>
                {seoTitle.length}/60
              </p>
            </div>

            <div>
              <Textarea
                label="Descripción para buscadores"
                name="seo_description"
                value={seoDescription}
                onChange={(e) => setSeoDescription(e.target.value)}
                placeholder="Indumentaria deportiva personalizada — pedidos, presupuestos y producción."
                hint="Lo que aparece debajo del título en los resultados de Google. Ideal hasta 155 caracteres."
              />
              <p
                className={cn("mt-1 text-[11px]", seoDescription.length > 155 ? "text-amber-600" : "text-zinc-400")}
              >
                {seoDescription.length}/155
              </p>
            </div>

            <Input
              label="Palabras clave (opcional)"
              name="seo_keywords"
              defaultValue={settings.seo_keywords ?? ""}
              placeholder="indumentaria deportiva, camisetas personalizadas, equipos"
              hint="Separadas por coma. Hoy pesan poco en el ranking de Google, pero no está de más."
            />

            <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
              Imagen para compartir en redes (WhatsApp, Facebook, Instagram)
              <input
                type="file"
                name="seo_og_image"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setOgPreview(URL.createObjectURL(file));
                }}
                className="mt-1 block w-full text-sm text-zinc-600"
              />
            </label>
            {ogPreview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={ogPreview} alt="Imagen para redes" className="max-h-40 w-auto rounded border border-zinc-200 object-contain" />
            )}
            <p className="text-[11px] text-zinc-400">
              Recomendado: 1200×630px. Es la imagen que se ve cuando alguien pega el link de tu sitio en WhatsApp o
              redes sociales.
            </p>
          </Card>

          <SeoGuide />
        </div>

        <Button type="submit" disabled={isPending} className="self-start">
          {isPending ? "Guardando..." : "Guardar cambios"}
        </Button>
      </form>

      {/* Fuera del <form> de arriba a propósito (site_features y
          site_sliders tienen su propio CRUD con sus propios forms — no
          pueden ir anidados dentro de otro <form>). Solo se muestran en
          la pestaña Home. */}
      <div className={cn("flex flex-col gap-8", tab !== "home" && "hidden")}>
        <FeatureCardsManager features={features} />
        <SlidersManager sliders={sliders} />
      </div>
    </div>
  );
}
