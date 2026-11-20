import Link from "next/link";
import { PageHeader } from "../../../components/ui/PageHeader";
import { Flags } from "./Flags";

export default function BanderasPage() {
  return (
    <div>
      <PageHeader
        title="Banderas"
        description="Elegí la medida, subí el diseño y la cantidad: la app arma el rollo para sublimar, con dobladillo si hace falta. Las banderas más anchas que la tela se giran solas."
        action={
          <Link href="/panel/produccion" className="text-sm text-zinc-500 hover:underline">
            Volver a Producción
          </Link>
        }
      />
      <Flags />
    </div>
  );
}
