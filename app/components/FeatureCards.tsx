import { getFeatureIcon } from "@/lib/featureIcons";

type Feature = { id: string; icon: string; title: string; description: string };

// Nota sobre contraste: el texto de descripción usa `text-muted` (zinc-400,
// #a1a1aa) en vez de un gris oscuro — sobre fondo negro da ~7:1 de contraste,
// bien por encima del mínimo WCAG AA (4.5:1) para texto de este tamaño.
export function FeatureCards({ features }: { features: Feature[] }) {
  if (features.length === 0) return null;

  return (
    <section className="bg-background px-6 py-20 sm:px-10">
      <div className="mx-auto grid max-w-6xl gap-10 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((feature) => {
          const Icon = getFeatureIcon(feature.icon);
          return (
            <div key={feature.id} className="flex flex-col items-start gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent">
                <Icon className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-foreground">{feature.title}</h3>
              <p className="text-sm leading-relaxed text-muted">{feature.description}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
