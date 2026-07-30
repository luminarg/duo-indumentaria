import { Shirt, Lightbulb, Trophy } from "lucide-react";

// El ícono de cada tarjeta queda fijo (no es configurable); el título y la
// descripción sí se pueden editar desde Configuración — se pasan por props
// con estos mismos valores como default si todavía no se cargó nada.
const ICONS = [Shirt, Lightbulb, Trophy];

export const FEATURE_DEFAULTS = [
  {
    title: "Personalizá tu equipo",
    description: "Materializá tu identidad por completo: camiseta, short y medias con tu diseño.",
  },
  {
    title: "Te asesoramos",
    description: "Te proponemos ideas, creamos el logo de tu equipo y la línea de diseño.",
  },
  {
    title: "Todas las disciplinas",
    description: "Fabricamos indumentaria para todos los deportes.",
  },
];

type Feature = { title: string; description: string };

// Nota sobre contraste: el texto de descripción usa `text-muted` (zinc-400,
// #a1a1aa) en vez de un gris oscuro — sobre fondo negro da ~7:1 de contraste,
// bien por encima del mínimo WCAG AA (4.5:1) para texto de este tamaño.
export function FeatureCards({ features }: { features?: Feature[] }) {
  const items = ICONS.map((icon, i) => ({
    icon,
    title: features?.[i]?.title || FEATURE_DEFAULTS[i].title,
    description: features?.[i]?.description || FEATURE_DEFAULTS[i].description,
  }));

  return (
    <section className="bg-background px-6 py-20 sm:px-10">
      <div className="mx-auto grid max-w-6xl gap-10 sm:grid-cols-3">
        {items.map(({ icon: Icon, title, description }) => (
          <div key={title} className="flex flex-col items-start gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent">
              <Icon className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-bold text-foreground">{title}</h3>
            <p className="text-sm leading-relaxed text-muted">{description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
