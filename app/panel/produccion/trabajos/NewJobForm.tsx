"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { createJob } from "../actions";

export function NewJobForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <Card>
      <form
        action={(fd) =>
          startTransition(async () => {
            setError(null);
            try {
              const { id } = await createJob(fd);
              router.push(`/panel/produccion/trabajos/${id}`);
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            }
          })
        }
        className="flex flex-col gap-3"
      >
        <h2 className="text-sm font-medium text-zinc-900">Nuevo trabajo</h2>
        <Input name="client_name" label="Cliente" placeholder="Taller Pérez" required />
        <Input name="notes" label="Notas (opcional)" placeholder="Camisetas club X, 2 talles de niño" />
        <Button type="submit" disabled={isPending}>
          Crear trabajo
        </Button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </Card>
  );
}
