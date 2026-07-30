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
      className={`glass-badge inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${STATE_CLASSES[state]}`}
    >
      {DELIVERY_STATE_LABELS[state]}
    </span>
  );
}
