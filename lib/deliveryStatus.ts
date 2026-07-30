// Calcula si un pedido está demorado, en tiempo, o entregado, comparando la
// fecha aproximada de entrega contra hoy. Se usa en el listado de pedidos,
// en el detalle, y en las métricas del dashboard.

export type DeliveryState = "demorado" | "en_tiempo" | "sin_fecha" | "entregado";

export function getDeliveryState(status: string, estimatedDeliveryDate: string | null): DeliveryState {
  if (status === "entregado") return "entregado";
  if (!estimatedDeliveryDate) return "sin_fecha";

  const today = new Date(new Date().toDateString());
  const due = new Date(`${estimatedDeliveryDate}T00:00:00`);
  return due < today ? "demorado" : "en_tiempo";
}

export const DELIVERY_STATE_LABELS: Record<DeliveryState, string> = {
  demorado: "Demorado",
  en_tiempo: "En tiempo",
  sin_fecha: "Sin fecha",
  entregado: "Entregado",
};
