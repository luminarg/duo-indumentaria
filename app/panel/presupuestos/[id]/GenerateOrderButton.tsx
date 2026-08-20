"use client";

import { useState } from "react";
import { generateOrderFromQuote } from "../actions";
import { Modal } from "../../../components/ui/Modal";
import { Button } from "../../../components/ui/Button";

type QuoteItem = {
  id: string;
  description: string;
  quantity: number;
  article_type_id: string | null;
  requires_number: boolean;
  requires_name: boolean;
};

type ArticleType = { id: string; name: string };

type RequirementDraft = {
  itemId: string;
  description: string;
  quantity: number;
  articleTypeId: string | null;
  requiresNumber: boolean;
  requiresName: boolean;
};

export function GenerateOrderButton({ quoteId, items, articleTypes }: { quoteId: string; items: QuoteItem[]; articleTypes: ArticleType[] }) {
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<RequirementDraft[]>(() =>
    items.map((i) => ({
      itemId: i.id,
      description: i.description,
      quantity: i.quantity,
      articleTypeId: i.article_type_id,
      requiresNumber: i.requires_number,
      requiresName: i.requires_name,
    }))
  );

  function update(itemId: string, patch: Partial<RequirementDraft>) {
    setDrafts((prev) => prev.map((d) => (d.itemId === itemId ? { ...d, ...patch } : d)));
  }

  const articleTypeName = (id: string | null) => articleTypes.find((a) => a.id === id)?.name ?? null;

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        Generar pedido
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Confirmar datos del pedido"
        subtitle="Por cada artículo, confirmá si el cliente tiene que completar nombre y número"
        footer={
          <div className="flex items-center justify-between gap-3">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="generate-order-form">
              Confirmar y generar pedido
            </Button>
          </div>
        }
      >
        <form
          id="generate-order-form"
          action={generateOrderFromQuote.bind(
            null,
            drafts.map((d) => ({
              description: d.description,
              articleTypeId: d.articleTypeId,
              requiresNumber: d.requiresNumber,
              requiresName: d.requiresName,
              quantityQuoted: d.quantity,
            })),
            quoteId
          )}
          className="flex flex-col gap-3"
        >
          {drafts.length === 0 && (
            <p className="text-sm text-zinc-400">Este presupuesto no tiene artículos cargados.</p>
          )}
          {drafts.map((d) => (
            <div key={d.itemId} className="rounded-md border border-zinc-200 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-zinc-900">{d.description}</span>
                <span className="text-xs text-zinc-400">Cant. {d.quantity}</span>
              </div>
              {articleTypeName(d.articleTypeId) && (
                <p className="mt-0.5 text-xs text-zinc-400">{articleTypeName(d.articleTypeId)}</p>
              )}
              <div className="mt-2 flex gap-4">
                <label className="flex items-center gap-1.5 text-xs text-zinc-600">
                  <input
                    type="checkbox"
                    checked={d.requiresNumber}
                    onChange={(e) => update(d.itemId, { requiresNumber: e.target.checked })}
                  />
                  Lleva número
                </label>
                <label className="flex items-center gap-1.5 text-xs text-zinc-600">
                  <input
                    type="checkbox"
                    checked={d.requiresName}
                    onChange={(e) => update(d.itemId, { requiresName: e.target.checked })}
                  />
                  Lleva nombre
                </label>
              </div>
              <p className="mt-1.5 text-[11px] text-zinc-400">
                {d.requiresNumber || d.requiresName
                  ? "El cliente va a cargar talle, nombre y número por cada unidad."
                  : "El cliente solo va a indicar la cantidad por talle."}
              </p>
            </div>
          ))}
        </form>
      </Modal>
    </>
  );
}
