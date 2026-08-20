"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { NewQuoteModal } from "./NewQuoteModal";

type Client = { id: string; name: string };
type ArticleType = { id: string; name: string; requires_number: boolean; requires_name: boolean };

export function NewQuoteButton({ clients, articleTypes }: { clients: Client[]; articleTypes: ArticleType[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Nuevo presupuesto
      </Button>
      <NewQuoteModal clients={clients} articleTypes={articleTypes} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
