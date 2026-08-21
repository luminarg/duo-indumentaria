"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { recalcQuoteTotals } from "@/app/panel/presupuestos/actions";

const quantitySchema = z.object({
  itemId: z.string().min(1),
  quantity: z.coerce.number().int().min(0),
});

const submitSchema = z.object({
  token: z.string().min(1),
  quantities: z.array(quantitySchema).min(1),
});

export type SubmitQuoteQuantitiesInput = z.infer<typeof submitSchema>;

// El cliente ajusta cuántas unidades quiere de cada artículo del
// presupuesto (o las carga por primera vez, si el admin mandó un
// "presupuesto abierto" con cantidad 0) y confirma. Guardamos SOLO las
// cantidades — descripción y precio los define el negocio, no el cliente.
export async function submitQuoteQuantities(input: SubmitQuoteQuantitiesInput) {
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  const data = parsed.data;

  if (!data.quantities.some((q) => q.quantity > 0)) {
    return { ok: false as const, error: "Cargá al menos una cantidad mayor a cero" };
  }

  const supabase = createAdminClient();

  const { data: quote, error: findError } = await supabase
    .from("quotes")
    .select("id, status")
    .eq("public_token", data.token)
    .single();

  if (findError || !quote) {
    return { ok: false as const, error: "No se encontró el presupuesto para este link" };
  }

  // Una vez que vos (admin) avanzaste el estado — aprobado, vencido o
  // rechazado — el cliente ya no puede seguir tocando cantidades.
  if (quote.status !== "borrador" && quote.status !== "enviado") {
    return { ok: false as const, error: "Este presupuesto ya no admite cambios" };
  }

  // Trae los ítems reales del presupuesto para validar que cada itemId
  // enviado le pertenece a ESTE presupuesto (nunca confiar en ids sueltos
  // que llegan desde un formulario público).
  const { data: existingItems } = await supabase.from("quote_items").select("id").eq("quote_id", quote.id);
  const validIds = new Set((existingItems ?? []).map((i) => i.id));

  const updates = data.quantities.filter((q) => validIds.has(q.itemId));
  if (updates.length === 0) {
    return { ok: false as const, error: "No se pudo identificar los artículos del presupuesto" };
  }

  const results = await Promise.all(
    updates.map((u) => supabase.from("quote_items").update({ quantity: u.quantity }).eq("id", u.itemId))
  );
  const updateError = results.find((r) => r.error)?.error;
  if (updateError) {
    return { ok: false as const, error: "No se pudieron guardar las cantidades: " + updateError.message };
  }

  await recalcQuoteTotals(quote.id, supabase);

  await supabase.from("quotes").update({ client_confirmed_at: new Date().toISOString() }).eq("id", quote.id);

  revalidatePath(`/presupuesto/${data.token}`);
  revalidatePath(`/panel/presupuestos/${quote.id}`);

  const { data: updatedQuote } = await supabase
    .from("quotes")
    .select("total, deposit_amount, deposit_percent")
    .eq("id", quote.id)
    .single();

  return {
    ok: true as const,
    total: Number(updatedQuote?.total ?? 0),
    depositAmount: Number(updatedQuote?.deposit_amount ?? 0),
    depositPercent: Number(updatedQuote?.deposit_percent ?? 50),
  };
}
