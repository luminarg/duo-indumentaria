import { Image, Text, View } from "@react-pdf/renderer";
import { pdfStyles } from "./styles";
import { getReadableForeground, getMutedForeground } from "../color";

export function BrandHeader({
  businessName,
  logoUrl,
  contactLine,
  dark = false,
  accentColor,
  clubLogoUrl,
}: {
  businessName: string;
  logoUrl: string | null;
  contactLine: string;
  /** El logo del negocio es blanco — en documentos donde así se cargó
   * (por ahora, la ficha técnica del pedido) el header necesita fondo
   * oscuro/de color para que se vea. El presupuesto sigue con el header
   * claro. */
  dark?: boolean;
  /** Si se pasa, el header usa este color (el primario del negocio) en vez
   * del negro fijo — así el documento queda acorde a la identidad elegida
   * desde Configuración. El color de texto se calcula automáticamente
   * para tener buen contraste. */
  accentColor?: string;
  /** Logo del club/empresa cliente (si el pedido tiene uno cargado) — se
   * muestra al lado del logo del negocio para reforzar que es "su"
   * pedido. */
  clubLogoUrl?: string | null;
}) {
  const bg = accentColor || (dark ? "#000000" : null);
  const textColor = bg ? getReadableForeground(bg) : "#18181b";
  const metaColor = bg ? getMutedForeground(bg) : "#71717a";

  return (
    <View style={[pdfStyles.header, bg ? { backgroundColor: bg, borderBottomWidth: 0, borderRadius: 6, paddingHorizontal: 16, paddingVertical: 14 } : {}]}>
      <View>
        <Text style={[pdfStyles.businessName, { color: textColor }]}>{businessName}</Text>
        <Text style={[pdfStyles.businessMeta, { color: metaColor }]}>{contactLine}</Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        {clubLogoUrl && (
          // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image, no es un <img> HTML
          <Image src={clubLogoUrl} style={pdfStyles.clubLogo} />
        )}
        {logoUrl && (
          // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image, no es un <img> HTML
          <Image src={logoUrl} style={pdfStyles.logo} />
        )}
      </View>
    </View>
  );
}
