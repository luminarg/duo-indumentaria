import { Document, Page, Text, View } from "@react-pdf/renderer";
import { pdfStyles } from "./styles";
import { BrandHeader } from "./BrandHeader";

type QuotePdfProps = {
  business: {
    name: string;
    logoUrl: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    headerText: string | null;
    footerText: string | null;
  };
  quote: {
    quoteNumber: string;
    createdAt: string;
    validUntil: string | null;
    itemsDescription: string | null;
    fabric: string | null;
    colorScheme: string | null;
    patternNotes: string | null;
    total: number;
    depositPercent: number;
    depositAmount: number;
    notes: string | null;
  };
  client: {
    name: string;
    contactName: string | null;
    contactRole: string | null;
    phone: string | null;
    email: string | null;
  };
};

function formatMoney(value: number) {
  return `$${value.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-AR");
}

export function QuotePdfDocument({ business, quote, client }: QuotePdfProps) {
  const contactLine = [business.address, business.phone, business.email].filter(Boolean).join(" · ");

  return (
    <Document title={`Presupuesto ${quote.quoteNumber}`}>
      <Page size="A4" style={pdfStyles.page}>
        <BrandHeader businessName={business.name} logoUrl={business.logoUrl} contactLine={contactLine} />

        <Text style={pdfStyles.title}>Presupuesto {quote.quoteNumber}</Text>
        <Text style={pdfStyles.subtitle}>
          Fecha: {formatDate(quote.createdAt)}
          {quote.validUntil ? `  ·  Válido hasta: ${formatDate(quote.validUntil)}` : ""}
        </Text>

        {business.headerText && (
          <View style={pdfStyles.section}>
            <Text>{business.headerText}</Text>
          </View>
        )}

        <View style={pdfStyles.section}>
          <Text style={pdfStyles.sectionTitle}>Cliente</Text>
          <View style={pdfStyles.row}>
            <Text style={pdfStyles.label}>Nombre</Text>
            <Text style={pdfStyles.value}>{client.name}</Text>
          </View>
          {client.contactName && (
            <View style={pdfStyles.row}>
              <Text style={pdfStyles.label}>Contacto</Text>
              <Text style={pdfStyles.value}>
                {client.contactName}
                {client.contactRole ? ` (${client.contactRole})` : ""}
              </Text>
            </View>
          )}
          {(client.phone || client.email) && (
            <View style={pdfStyles.row}>
              <Text style={pdfStyles.label}>Contacto</Text>
              <Text style={pdfStyles.value}>{[client.phone, client.email].filter(Boolean).join(" · ")}</Text>
            </View>
          )}
        </View>

        <View style={pdfStyles.section}>
          <Text style={pdfStyles.sectionTitle}>Detalle</Text>
          {quote.itemsDescription && (
            <View style={pdfStyles.row}>
              <Text style={pdfStyles.label}>Solicitado</Text>
              <Text style={pdfStyles.value}>{quote.itemsDescription}</Text>
            </View>
          )}
          {quote.fabric && (
            <View style={pdfStyles.row}>
              <Text style={pdfStyles.label}>Tela</Text>
              <Text style={pdfStyles.value}>{quote.fabric}</Text>
            </View>
          )}
          {quote.colorScheme && (
            <View style={pdfStyles.row}>
              <Text style={pdfStyles.label}>Color / diseño</Text>
              <Text style={pdfStyles.value}>{quote.colorScheme}</Text>
            </View>
          )}
          {quote.patternNotes && (
            <View style={pdfStyles.row}>
              <Text style={pdfStyles.label}>Moldería</Text>
              <Text style={pdfStyles.value}>{quote.patternNotes}</Text>
            </View>
          )}
        </View>

        <View style={pdfStyles.section}>
          <Text style={pdfStyles.sectionTitle}>Monto</Text>
          <View style={pdfStyles.row}>
            <Text style={pdfStyles.label}>Total</Text>
            <Text style={pdfStyles.value}>{formatMoney(quote.total)}</Text>
          </View>
          <View style={pdfStyles.row}>
            <Text style={pdfStyles.label}>Seña ({quote.depositPercent}%)</Text>
            <Text style={pdfStyles.value}>{formatMoney(quote.depositAmount)}</Text>
          </View>
        </View>

        {quote.notes && (
          <View style={pdfStyles.section}>
            <Text style={pdfStyles.sectionTitle}>Notas</Text>
            <Text>{quote.notes}</Text>
          </View>
        )}

        {business.footerText && (
          <View style={pdfStyles.footer} fixed>
            <Text>{business.footerText}</Text>
          </View>
        )}
      </Page>
    </Document>
  );
}
