import { Image, Text, View } from "@react-pdf/renderer";
import { pdfStyles } from "./styles";

export function BrandHeader({
  businessName,
  logoUrl,
  contactLine,
  dark = false,
}: {
  businessName: string;
  logoUrl: string | null;
  contactLine: string;
  /** El logo del negocio es blanco — en documentos donde así se cargó
   * (por ahora, la ficha técnica del pedido) el header necesita fondo
   * negro para que se vea. El presupuesto sigue con el header claro. */
  dark?: boolean;
}) {
  return (
    <View style={dark ? [pdfStyles.header, pdfStyles.headerDark] : pdfStyles.header}>
      <View>
        <Text style={dark ? [pdfStyles.businessName, pdfStyles.businessNameDark] : pdfStyles.businessName}>
          {businessName}
        </Text>
        <Text style={dark ? [pdfStyles.businessMeta, pdfStyles.businessMetaDark] : pdfStyles.businessMeta}>
          {contactLine}
        </Text>
      </View>
      {logoUrl && (
        // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image, no es un <img> HTML
        <Image src={logoUrl} style={pdfStyles.logo} />
      )}
    </View>
  );
}
