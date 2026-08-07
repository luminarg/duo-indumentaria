"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { NewQuoteModal } from "./NewQuoteModal";

type Client = { id: string; name: string };

export function NewQuoteButton({ clients }: { clients: Client[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Nuevo presupuesto
      </Button>
      <NewQuoteModal clients={clients} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
