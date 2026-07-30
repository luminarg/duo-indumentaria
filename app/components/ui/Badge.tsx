import { cn } from "@/lib/cn";

const STATUS_STYLES: Record<string, string> = {
  borrador: "glass-badge-gray",
  cargado_por_cliente: "glass-badge-blue",
  senado: "glass-badge-purple",
  cortando: "glass-badge-orange",
  estampando: "glass-badge-orange",
  armando: "glass-badge-orange",
  embalando: "glass-badge-amber",
  entregado: "glass-badge-green",
};

export function Badge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "glass-badge inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium capitalize",
        STATUS_STYLES[status] ?? "glass-badge-gray"
      )}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}
