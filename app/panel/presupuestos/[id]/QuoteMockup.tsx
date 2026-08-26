"use client";

import { useRef, useState, useTransition } from "react";
import { ImageUp } from "lucide-react";
import { uploadQuoteMockup, removeQuoteMockup } from "../actions";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";

export function QuoteMockup({ quoteId, mockupUrl }: { quoteId: string; mockupUrl: string | null }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await uploadQuoteMockup(quoteId, formData);
        formRef.current?.reset();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al subir la imagen");
      }
    });
  }

  function handleRemove() {
    startTransition(async () => {
      try {
        await removeQuoteMockup(quoteId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al quitar la imagen");
      }
    });
  }

  return (
    <Card>
      <div className="mb-2 flex items-center gap-2">
        <ImageUp className="h-4 w-4 text-zinc-500" />
        <h2 className="text-sm font-semibold text-zinc-900">Mockup del diseño (opcional)</h2>
      </div>
      <p className="mb-3 text-xs text-zinc-500">
        Subí una imagen PNG y se va a incrustar dentro del PDF del presupuesto, junto a los artículos.
      </p>

      {error && <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>}

      {mockupUrl && (
        <div className="mb-3 flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mockupUrl} alt="Mockup del presupuesto" className="h-28 w-28 rounded-md border border-zinc-200 object-contain" />
          <Button type="button" variant="secondary" size="sm" onClick={handleRemove} disabled={isPending}>
            Quitar
          </Button>
        </div>
      )}

      <form ref={formRef} onSubmit={handleUpload} className="flex items-end gap-2">
        <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-zinc-500">
          {mockupUrl ? "Reemplazar imagen" : "Imagen (PNG)"}
          <input type="file" name="mockup" accept="image/png" required className="mt-1 block w-full text-sm" />
        </label>
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Subiendo..." : "Subir"}
        </Button>
      </form>
    </Card>
  );
}
