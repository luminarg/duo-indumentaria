"use client";

import { useEffect, useState } from "react";

export function Hero({
  images,
  title,
  subtitle,
}: {
  images: string[];
  title: string;
  subtitle: string;
}) {
  const hasImages = images.length > 0;
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (images.length < 2) return;
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % images.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [images.length]);

  return (
    <section className="relative flex h-[85vh] min-h-[520px] items-end overflow-hidden bg-background">
      {hasImages ? (
        images.map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={src + i}
            src={src}
            alt=""
            className="absolute inset-0 h-full w-full object-cover transition-opacity duration-1000"
            style={{ opacity: i === index ? 1 : 0 }}
          />
        ))
      ) : (
        <>
          {/* Fondo plano con el color principal elegido en el panel + un
              resplandor sutil del color de acento, sin depender de
              gradientes con CSS vars (mejor soporte de navegadores). */}
          <div className="absolute inset-0 bg-background" />
          <div
            className="absolute -top-24 left-1/4 h-[28rem] w-[28rem] rounded-full bg-accent opacity-20 blur-3xl"
            aria-hidden
          />
        </>
      )}

      {/* Degradé oscuro para legibilidad cuando hay foto de fondo (las fotos
          varían mucho de tono, así que siempre usamos texto blanco ahí). */}
      {hasImages && (
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/10" />
      )}

      <div className="relative z-10 w-full px-6 pb-16 sm:px-10 sm:pb-20">
        <h1
          className={`max-w-2xl text-5xl font-black leading-[0.95] tracking-tight sm:text-7xl ${
            hasImages ? "text-white" : "text-foreground"
          }`}
        >
          {title}
        </h1>
        <p className={`mt-4 max-w-md text-lg ${hasImages ? "text-zinc-200" : "text-muted"}`}>
          {subtitle}
        </p>

        {images.length > 1 && (
          <div className="mt-8 flex gap-2">
            {images.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Ir a la imagen ${i + 1}`}
                onClick={() => setIndex(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? "w-8 bg-white" : "w-4 bg-white/40 hover:bg-white/60"
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
