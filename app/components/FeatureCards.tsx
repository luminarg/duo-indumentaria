import { Shirt, Lightbulb, Trophy } from "lucide-react";

const FEATURES = [
  {
    icon: Shirt,
    title: "Personalizá tu equipo",
    description: "Materializá tu identidad por completo: camiseta, short y medias con tu diseño.",
  },
  {
    icon: Lightbulb,
    title: "Te asesoramos",
    description: "Te proponemos ideas, creamos el logo de tu equipo y la línea de diseño.",
  },
  {
    icon: Trophy,
    title: "Todas las disciplinas",
    description: "Fabricamos indumentaria para todos los deportes.",
  },
];

// Nota sobre contraste: el texto de descripción usa `text-muted` (zinc-400,
// #a1a1aa) en vez de un gris oscuro — sobre fondo negro da ~7:1 de contraste,
// bien por encima del mínimo WCAG AA (4.5:1) para texto de este tamaño.
export function FeatureCards() {
  return (
    <section className="bg-background px-6 py-20 sm:px-10">
      <div className="mx-auto grid max-w-6xl gap-10 sm:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, description }) => (
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
