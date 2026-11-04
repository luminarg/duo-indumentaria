import { cn } from "@/lib/cn";
import { orderStatusLabel } from "@/lib/orderStatus";

const STATUS_STYLES: Record<string, string> = {
  borrador: "glass-badge-gray",
  cargado_por_cliente: "glass-badge-blue",
  cerrado: "glass-badge-purple",
  cortando: "glass-badge-orange",
  diseno_molderia: "glass-badge-orange",
  sublimacion_estampado: "glass-badge-orange",
  costura_terminaciones: "glass-badge-amber",
  entregado: "glass-badge-green",
};

export function Badge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "glass-badge inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
        STATUS_STYLES[status] ?? "glass-badge-gray"
      )}
    >
      {orderStatusLabel(status)}
    </span>
  );
}
