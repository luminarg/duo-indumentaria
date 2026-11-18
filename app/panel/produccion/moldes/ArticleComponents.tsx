"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Input, Select } from "../../../components/ui/Input";
import { saveArticleComponents } from "../actions";

type Component = { id?: string; article_type_id: string; name: string; model_id: string | null; copy_number: boolean; copy_name: boolean; sort_order: number };

/**
 * Prendas de cada artículo. Un artículo sin prendas es una sola prenda (la de
 * siempre). Un combo ("Camiseta + short") lista cada prenda con su moldería y
 * qué datos del jugador lleva.
 */
export function ArticleComponents({
  articleTypes,
  models,
  components,
}: {
  articleTypes: { id: string; name: string }[];
  models: { id: string; name: string }[];
  components: Component[];
}) {
  const [typeId, setTypeId] = useState(articleTypes[0]?.id ?? "");
  const [drafts, setDrafts] = useState<Record<string, Component[]>>({});
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  if (!articleTypes.length) return null;
  const list = drafts[typeId] ?? components.filter((c) => c.article_type_id === typeId);
  const set = (next: Component[]) => {
    setDrafts((d) => ({ ...d, [typeId]: next }));
    setMsg(null);
  };
  const patch = (i: number, p: Partial<Component>) => set(list.map((c, j) => (j === i ? { ...c, ...p } : c)));

  const onSave = () =>
    startTransition(async () => {
      setError(null);
      try {
        await saveArticleComponents(
          typeId,
          list.map((c) => ({ id: c.id, name: c.name, model_id: c.model_id, copy_number: c.copy_number, copy_name: c.copy_name }))
        );
        setDrafts((d) => {
          const n = { ...d };
          delete n[typeId];
          return n;
        });
        setMsg("Prendas guardadas.");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-medium text-zinc-900">Prendas de cada artículo (combos)</h2>
        <p className="text-xs text-zinc-500">
          Si un artículo es un combo (ej. camiseta + short, buzo + pantalón), cargá acá cada prenda con su moldería. Cada jugador del pedido genera una prenda de cada una, con su mismo talle. Un artículo sin prendas cargadas es una sola prenda.
        </p>
      </div>
      <div className="max-w-sm">
        <Select label="Artículo" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
          {articleTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      </div>
      {list.length === 0 && <p className="text-sm text-zinc-500">Este artículo es una sola prenda.</p>}
      {list.map((c, i) => (
        <div key={c.id ?? `n${i}`} className="grid items-end gap-3 rounded-md border border-zinc-200 p-3 md:grid-cols-[1fr_1fr_auto_auto_auto]">
          <Input label="Prenda" value={c.name} placeholder="Short" onChange={(e) => patch(i, { name: e.target.value })} />
          <Select label="Moldería" value={c.model_id ?? ""} onChange={(e) => patch(i, { model_id: e.target.value || null })}>
            <option value="">Elegir en cada pedido</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
          <label className="flex items-center gap-2 pb-2 text-sm text-zinc-700">
            <input type="checkbox" checked={c.copy_number} onChange={(e) => patch(i, { copy_number: e.target.checked })} />
            Número
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm text-zinc-700">
            <input type="checkbox" checked={c.copy_name} onChange={(e) => patch(i, { copy_name: e.target.checked })} />
            Nombre
          </label>
          <button type="button" className="pb-2 text-sm text-red-600 hover:underline" onClick={() => set(list.filter((_, j) => j !== i))}>
            Quitar
          </button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          type="button"
          onClick={() =>
            set([
              ...list,
              {
                article_type_id: typeId,
                name: list.length === 0 ? "Camiseta" : "",
                model_id: null,
                copy_number: true,
                copy_name: list.length === 0,
                sort_order: list.length,
              },
            ])
          }
        >
          + Agregar prenda
        </Button>
        <Button type="button" onClick={onSave} disabled={isPending || !drafts[typeId]}>
          Guardar prendas
        </Button>
        {msg && <span className="text-sm text-green-700">{msg}</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </Card>
  );
}
