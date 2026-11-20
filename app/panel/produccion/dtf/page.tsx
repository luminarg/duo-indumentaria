import Link from "next/link";
import { PageHeader } from "../../../components/ui/PageHeader";
import { DtfSheet } from "./DtfSheet";

export default function DtfPage() {
  return (
    <div>
      <PageHeader
        title="DTF en papel"
        description="Subí los diseños (escudos, logos, números), poné la medida y la cantidad: se acomodan en el papel con la distancia mínima. Sale en PDF y en PNG transparente a 300 dpi."
        action={
          <Link href="/panel/produccion" className="text-sm text-zinc-500 hover:underline">
            Volver a Producción
          </Link>
        }
      />
      <DtfSheet />
    </div>
  );
}
