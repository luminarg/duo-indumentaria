"use client";

import { useState } from "react";
import { ChevronDown, GraduationCap } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { cn } from "@/lib/cn";

type Section = {
  key: string;
  title: string;
  content: React.ReactNode;
};

const ul = "flex list-disc flex-col gap-1.5 pl-5 text-sm text-zinc-600";
const ol = "flex list-decimal flex-col gap-1.5 pl-5 text-sm text-zinc-600";
const p = "text-sm leading-relaxed text-zinc-600";

const SECTIONS: Section[] = [
  {
    key: "que-es",
    title: "¿Qué es el SEO y por qué te conviene?",
    content: (
      <div className="flex flex-col gap-2">
        <p className={p}>
          SEO significa &ldquo;Search Engine Optimization&rdquo; — optimización para buscadores. En criollo: es
          todo lo que hacés para que, cuando alguien busque en Google algo como &ldquo;camisetas de fútbol
          personalizadas&rdquo; o &ldquo;indumentaria deportiva para equipos&rdquo;, tu sitio aparezca entre los
          primeros resultados, en vez de perderse en la página 5 (que nadie mira).
        </p>
        <p className={p}>
          No es magia ni es pago — es distinto de la publicidad (Google Ads). El SEO es posicionamiento
          orgánico: no pagás por cada clic, pero lleva tiempo y trabajo constante construirlo.
        </p>
        <ul className={ul}>
          <li>Reduce tu dependencia de la publicidad paga.</li>
          <li>Capta gente que ya está buscando lo que vendés.</li>
          <li>Es acumulativo: lo que armás hoy te sigue trayendo clientes dentro de un año.</li>
          <li>Te ayuda en lo local — que aparezcas cuando alguien de tu zona busque un proveedor.</li>
        </ul>
      </div>
    ),
  },
  {
    key: "como-decide-google",
    title: "¿Cómo decide Google qué mostrar primero?",
    content: (
      <div className="flex flex-col gap-2">
        <p className={p}>Simplificando bastante, Google hace tres cosas:</p>
        <ol className={ol}>
          <li>
            <strong className="text-zinc-800">Rastrea:</strong> recorre internet con robots que van de link en
            link, encontrando páginas nuevas.
          </li>
          <li>
            <strong className="text-zinc-800">Indexa:</strong> guarda una copia de cada página, entendiendo de
            qué trata.
          </li>
          <li>
            <strong className="text-zinc-800">Posiciona:</strong> cuando alguien busca algo, elige qué mostrar
            primero según qué tan relevante, confiable y rápida sea cada página.
          </li>
        </ol>
        <div className="mt-1 rounded-md bg-zinc-50 px-3 py-2.5 text-xs text-zinc-500">
          <strong className="text-zinc-700">Novedad 2026 — los &ldquo;resúmenes con IA&rdquo; de Google:</strong>{" "}
          Google ahora muestra respuestas generadas por IA arriba de los resultados tradicionales. Por eso
          conviene que tu contenido sea claro y directo, para que la IA también te pueda citar como fuente. Los
          fundamentos de siempre (buen título, buena descripción, contenido real) siguen siendo la base de las
          dos cosas.
        </div>
      </div>
    ),
  },
  {
    key: "como-completar",
    title: "Cómo completar cada campo de acá arriba",
    content: (
      <div className="flex flex-col gap-3">
        <div>
          <p className="text-xs font-semibold text-zinc-700">Título para buscadores</p>
          <p className={p}>
            Es el texto azul y grande del resultado en Google. Meté tu palabra clave principal y el nombre de
            tu marca. Ej: &ldquo;Duo Indumentaria — Ropa deportiva personalizada para equipos&rdquo;, en vez de
            solo &ldquo;Duo&rdquo;.
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold text-zinc-700">Descripción para buscadores</p>
          <p className={p}>
            Es lo que convence a alguien de hacer clic. Contá qué te diferencia (a medida, para equipos/clubes,
            seguimiento del pedido), en tono natural. Ej: &ldquo;Camisetas, buzos y shorts a medida para
            equipos, colegios y clubes. Pedís tu presupuesto y seguís tu pedido paso a paso.&rdquo;
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold text-zinc-700">Palabras clave</p>
          <p className={p}>
            Pensá como piensa tu cliente, no como pensás vos del negocio: &ldquo;indumentaria deportiva
            personalizada&rdquo;, &ldquo;camisetas de equipo a medida&rdquo;, &ldquo;uniformes deportivos [tu
            zona]&rdquo;. Hoy Google le da poco peso a este campo, pero ayuda a que tengas claridad de foco.
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold text-zinc-700">Imagen para redes</p>
          <p className={p}>
            Es lo que se ve cuando alguien comparte tu link en WhatsApp o Instagram. Usá una foto real de
            producto o un mockup con tu logo — no una captura de pantalla.
          </p>
        </div>
      </div>
    ),
  },
  {
    key: "local",
    title: "SEO local: la parte que más rápido te puede traer clientes",
    content: (
      <div className="flex flex-col gap-2">
        <p className={p}>
          Si la mayoría de tus clientes son de tu ciudad o región, esto suele dar resultados más rápido que
          competir por palabras genéricas a nivel país.
        </p>
        <p className="text-xs font-semibold text-zinc-700">
          Perfil de Negocio de Google (antes &ldquo;Google My Business&rdquo;) — gratis
        </p>
        <ol className={ol}>
          <li>
            Entrá a <strong className="text-zinc-800">google.com/business</strong> y creá o reclamá tu ficha.
          </li>
          <li>Completá todo: dirección, teléfono, horarios, categoría y una descripción corta.</li>
          <li>Subí fotos reales del taller y de productos terminados — actualizalas cada tanto.</li>
          <li>Pedile reseñas a clientes conformes después de cada entrega (apuntá a 4,5 estrellas o más).</li>
          <li>Respondé todas las reseñas, buenas y malas.</li>
        </ol>
        <p className={p}>
          Importante: el nombre, dirección y teléfono tienen que decir exactamente lo mismo en tu sitio
          (Configuración → Contacto), en Google Business y en tus redes sociales.
        </p>
      </div>
    ),
  },
  {
    key: "contenido",
    title: "Contenido: dale a Google motivos para encontrarte",
    content: (
      <ul className={ul}>
        <li>
          Mantené la galería de diseños (Configuración → Home) actualizada con trabajos reales — cada imagen
          con un título descriptivo suma contexto.
        </li>
        <li>
          Si en algún momento sumás un blog o &ldquo;casos&rdquo; (ej. &ldquo;Cómo hicimos los uniformes del
          Club X&rdquo;), cada nota es una puerta de entrada nueva desde Google.
        </li>
        <li>Usá el lenguaje que tus clientes realmente usarían al buscar, no jerga interna.</li>
      </ul>
    ),
  },
  {
    key: "tecnico",
    title: "La parte técnica (ya resuelta, no requiere que hagas nada)",
    content: (
      <ul className={ul}>
        <li>Velocidad y mobile-friendly: tu sitio corre sobre Vercel/Next.js, ya optimizado para esto.</li>
        <li>HTTPS (candadito de seguridad): tu dominio ya lo tiene activado.</li>
        <li>
          robots.txt y sitemap.xml: le dicen a Google qué mirar (la home) y qué ignorar (el panel, los links de
          pedidos) — se generan solos.
        </li>
        <li>
          Datos estructurados: confirman que sos un negocio real, con nombre, logo y contacto — salen de lo que
          cargás en Configuración → Contacto.
        </li>
      </ul>
    ),
  },
  {
    key: "medir",
    title: "Cómo saber si está funcionando",
    content: (
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold text-zinc-700">Google Search Console — gratis</p>
        <p className={p}>Te muestra qué busca la gente para llegar a tu sitio y cuántos clics recibís.</p>
        <ol className={ol}>
          <li>
            Entrá a <strong className="text-zinc-800">search.google.com/search-console</strong> con una cuenta
            de Gmail.
          </li>
          <li>Agregá tu dominio y verificá la propiedad (si no sabés cómo, pedime que te guíe paso a paso).</li>
          <li>
            Cargá tu sitemap: tu dominio + <strong className="text-zinc-800">/sitemap.xml</strong>.
          </li>
          <li>Revisalo cada 2-4 semanas — el SEO se mueve lento, no hace falta mirarlo todos los días.</li>
        </ol>
      </div>
    ),
  },
  {
    key: "checklist",
    title: "Por dónde empezar — checklist priorizado",
    content: (
      <ol className={ol}>
        <li>
          <strong className="text-zinc-800">Esta semana:</strong> completá los 4 campos de acá arriba con los
          ejemplos de esta guía.
        </li>
        <li>
          <strong className="text-zinc-800">Esta semana:</strong> creá o reclamá tu Perfil de Negocio de Google.
        </li>
        <li>
          <strong className="text-zinc-800">Este mes:</strong> empezá a pedir reseñas después de cada entrega.
        </li>
        <li>
          <strong className="text-zinc-800">Este mes:</strong> revisá que nombre, dirección y teléfono digan lo
          mismo en todos lados.
        </li>
        <li>
          <strong className="text-zinc-800">Cuando puedas:</strong> dado de alta en Google Search Console.
        </li>
        <li>
          <strong className="text-zinc-800">A mediano plazo:</strong> sumá contenido nuevo de a poco.
        </li>
      </ol>
    ),
  },
];

export function SeoGuide() {
  const [openKeys, setOpenKeys] = useState<string[]>(["que-es"]);

  function toggle(key: string) {
    setOpenKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-white">
          <GraduationCap className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">Guía: qué es el SEO y cómo usarlo</h2>
          <p className="text-xs text-zinc-500">Explicado sin vueltas, con ejemplos para Duo Indumentaria.</p>
        </div>
      </div>

      <div className="flex flex-col divide-y divide-zinc-100 rounded-md border border-zinc-100">
        {SECTIONS.map((section) => {
          const open = openKeys.includes(section.key);
          return (
            <div key={section.key}>
              <button
                type="button"
                onClick={() => toggle(section.key)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm font-medium text-zinc-800 hover:bg-zinc-50"
              >
                {section.title}
                <ChevronDown
                  className={cn("h-4 w-4 shrink-0 text-zinc-400 transition-transform", open && "rotate-180")}
                />
              </button>
              {open && <div className="px-3 pb-3.5 pt-0.5">{section.content}</div>}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
