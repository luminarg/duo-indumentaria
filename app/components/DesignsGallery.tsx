type GalleryImage = { id: string; url: string; alt: string };

export function DesignsGallery({ images }: { images: GalleryImage[] }) {
  return (
    <section className="bg-background px-6 py-16 sm:px-10">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-2xl font-black uppercase tracking-tight text-foreground sm:text-3xl">
          Algunos de nuestros diseños
        </h2>
        <div className="mt-4 h-px w-full bg-foreground/10" />

        {images.length > 0 ? (
          <div className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {images.map((image) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={image.id}
                src={image.url}
                alt={image.alt}
                className="aspect-square w-full object-cover"
              />
            ))}
          </div>
        ) : (
          <div className="mt-8 rounded-lg border border-dashed border-foreground/20 px-6 py-12 text-center">
            <p className="text-sm text-muted">
              Todavía no cargaste diseños. Se van a mostrar acá apenas subas
              fotos de productos desde el panel.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
