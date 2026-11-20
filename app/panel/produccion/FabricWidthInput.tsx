"use client";

import { useState } from "react";
import { Input } from "../../components/ui/Input";

/** Ancho de tela en cm: se puede escribir tranquilo y se aplica al salir del campo o con Enter. */
export function FabricWidthInput({ mm, onChange }: { mm: number; onChange: (mm: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const cm = Number(draft.replace(",", "."));
    if (cm >= 30 && cm <= 500) onChange(Math.round(cm * 10));
    setDraft(null);
  };
  return (
    <Input
      label="Ancho de tela (cm)"
      hint="Ancho útil para acomodar"
      type="text"
      inputMode="decimal"
      value={draft ?? String(mm / 10)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
      }}
    />
  );
}
