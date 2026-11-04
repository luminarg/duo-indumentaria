// Estados de un pedido, en orden. "borrador" y "cargado_por_cliente" son las
// etapas en las que el cliente todavía puede editar su link; a partir de
// "cerrado" (lo hace el equipo con el botón "Cerrar pedido") el link queda
// en solo lectura y se ve el seguimiento de producción.
export const ORDER_STATUSES = [
  "borrador",
  "cargado_por_cliente",
  "cerrado",
  "cortando",
  "diseno_molderia",
  "sublimacion_estampado",
  "costura_terminaciones",
  "entregado",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<string, string> = {
  borrador: "Borrador",
  cargado_por_cliente: "Cargado por el cliente",
  cerrado: "Cerrado",
  cortando: "Cortando",
  diseno_molderia: "Diseño en moldería",
  sublimacion_estampado: "Sublimación / estampado",
  costura_terminaciones: "Costura y terminaciones",
  entregado: "Entregado",
};

// Estados en los que el cliente todavía puede modificar su pedido.
export const CLIENT_EDITABLE_STATUSES: readonly string[] = ["borrador", "cargado_por_cliente"];

export function orderStatusLabel(status: string) {
  return ORDER_STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}
