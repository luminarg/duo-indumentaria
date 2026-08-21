import Link from "next/link";
import { Check } from "lucide-react";

function formatMoney(value: number) {
  return `$${value.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`;
}

const STATUS_MESSAGE: Record<string, string> = {
  aprobado: "¡Este presupuesto ya fue aprobado y estamos preparando tu pedido!",
  vencido: "Este presupuesto venció. Escribinos si querés que te pasemos uno nuevo.",
  rechazado: "Este presupuesto fue cancelado.",
};

// Vista de solo lectura para cuando el admin ya avanzó el estado del
// presupuesto (aprobado / vencido / rechazado) — el cliente ya no puede
// tocar cantidades, solo ver el resumen final.
export function QuoteClosedView({
  quoteNumber,
  status,
  total,
  depositAmount,
  depositPercent,
  businessName,
  logoUrl,
  orderToken,
}: {
  quoteNumber: string;
  status: string;
  total: number;
  depositAmount: number;
  depositPercent: number;
  businessName: string;
  logoUrl: string | null;
  orderToken: string | null;
}) {
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
          <h1 className="text-2xl font-semibold text-white">Presupuesto {quoteNumber}</h1>
          <p className="mt-2 text-sm text-zinc-400">
            {STATUS_MESSAGE[status] ?? "Este presupuesto ya no admite cambios."}
          </p>
        </div>

        {status === "aprobado" && (
          <div className="rounded-xl bg-white/5 p-5">
            <div className="flex items-center gap-2 text-green-400">
              <Check className="h-5 w-5" />
              <span className="text-sm font-medium">Confirmado</span>
            </div>
            <div className="mt-4 flex items-center justify-between text-zinc-300">
              <span className="text-sm">Total</span>
              <span className="text-lg font-semibold text-white">{formatMoney(total)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-zinc-300">
              <span className="text-sm">Seña ({depositPercent}%)</span>
              <span className="text-lg font-semibold text-white">{formatMoney(depositAmount)}</span>
            </div>

            {orderToken && (
              <Link
                href={`/pedido/${orderToken}`}
                className="mt-5 block rounded-md bg-white px-4 py-2.5 text-center text-sm font-medium text-black"
              >
                Ir a cargar los datos de tu pedido
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
