import { UploadCloud, HandCoins, Scissors, Stamp, Shirt, Package, Truck, Check } from "lucide-react";
import { getReadableForeground } from "@/lib/color";

const STEPS = [
  { key: "cargado_por_cliente", label: "Pedido cargado", icon: UploadCloud },
  { key: "senado", label: "Seña confirmada", icon: HandCoins },
  { key: "cortando", label: "Cortando", icon: Scissors },
  { key: "estampando", label: "Estampando", icon: Stamp },
  { key: "armando", label: "Armando", icon: Shirt },
  { key: "embalando", label: "Embalando", icon: Package },
  { key: "entregado", label: "Entregado", icon: Truck },
] as const;

function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Date(`${iso}T00:00:00`).toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" });
}

export function OrderTrackingView({
  orderNumber,
  status,
  estimatedDeliveryDate,
  businessName,
  logoUrl,
  primaryColor,
}: {
  orderNumber: string;
  status: string;
  estimatedDeliveryDate: string | null;
  businessName: string;
  logoUrl: string | null;
  primaryColor: string;
}) {
  const currentIndex = STEPS.findIndex((s) => s.key === status);
  const accentForeground = getReadableForeground(primaryColor);
  const deliveryDateLabel = formatDate(estimatedDeliveryDate);

  return (
    <div className="min-h-screen bg-black">
      <div className="mx-auto max-w-xl px-6 py-16">
        <div className="mb-8 flex flex-col items-center text-center">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={businessName} className="mb-4 h-12 w-auto object-contain" />
          ) : (
            <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">{businessName}</p>
          )}
          <h1 className="text-2xl font-semibold text-white">Pedido {orderNumber}</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Ya no se puede modificar — cualquier consulta, escribinos directamente.
          </p>
          {deliveryDateLabel && (
            <p className="mt-3 rounded-full bg-white/10 px-4 py-1.5 text-xs font-medium text-zinc-300">
              Entrega aproximada: {deliveryDateLabel}
            </p>
          )}
        </div>

        <ol className="flex flex-col gap-0">
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            const isDone = index < currentIndex;
            const isCurrent = index === currentIndex;
            const isLast = index === STEPS.length - 1;

            return (
              <li key={step.key} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 transition-colors"
                    style={
                      isDone || isCurrent
                        ? { backgroundColor: primaryColor, borderColor: primaryColor, color: accentForeground }
                        : { backgroundColor: "#18181b", borderColor: "#3f3f46", color: "#71717a" }
                    }
                  >
                    {isDone ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                  </div>
                  {!isLast && (
                    <div
                      className="w-0.5 flex-1"
                      style={{ backgroundColor: isDone ? primaryColor : "#3f3f46", minHeight: "2rem" }}
                    />
                  )}
                </div>
                <div className={isCurrent ? "pb-8" : "pb-8 opacity-60"}>
                  <p className={isCurrent ? "pt-2 text-sm font-semibold text-white" : "pt-2 text-sm font-medium text-zinc-400"}>
                    {step.label}
                  </p>
                  {isCurrent && <p className="text-xs text-zinc-400">Estamos acá ahora mismo.</p>}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
