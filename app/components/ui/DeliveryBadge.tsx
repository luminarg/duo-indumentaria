import { getDeliveryState, DELIVERY_STATE_LABELS } from "@/lib/deliveryStatus";

const STATE_CLASSES: Record<string, string> = {
  demorado: "glass-badge-red",
  en_tiempo: "glass-badge-green",
  sin_fecha: "glass-badge-gray",
  entregado: "glass-badge-gray",
};

export function DeliveryBadge({
  status,
  estimatedDeliveryDate,
}: {
  status: string;
  estimatedDeliveryDate: string | null;
}) {
  // Entregado y sin fecha no aportan información accionable — no mostramos
  // badge para no ensuciar la grilla.
  const state = getDeliveryState(status, estimatedDeliveryDate);
  if (state === "entregado" || state === "sin_fecha") return null;

  return (
    <span
      className={`glass-badge inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${STATE_CLASSES[state]}`}
    >
      {DELIVERY_STATE_LABELS[state]}
    </span>
  );
}
