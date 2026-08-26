import { Document, Page, Text, View, Image } from "@react-pdf/renderer";
import { pdfStyles } from "./styles";
import { BrandHeader } from "./BrandHeader";
import { getReadableForeground } from "../color";

type QuotePdfProps = {
  business: {
    name: string;
    logoUrl: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    headerText: string | null;
    footerText: string | null;
    primaryColor: string;
    secondaryColor: string;
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
  items: { description: string; unitPrice: number; quantity: number }[];
  sizeGuides?: { name: string; sizes: { label: string; measurements: string | null }[] }[];
  mockupUrl?: string | null;
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

export function QuotePdfDocument({ business, quote, items, sizeGuides = [], mockupUrl, client }: QuotePdfProps) {
  const contactLine = [business.address, business.phone, business.email].filter(Boolean).join(" · ");
  const accent = business.secondaryColor || "#18181b";
  const accentText = getReadableForeground(accent);

  return (
    <Document title={`Presupuesto ${quote.quoteNumber}`}>
      <Page size="A4" style={pdfStyles.page}>
        <BrandHeader
          businessName={business.name}
          logoUrl={business.logoUrl}
          contactLine={contactLine}
          accentColor={business.primaryColor}
        />

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

        {mockupUrl && (
          <View style={pdfStyles.section}>
            <Text style={pdfStyles.sectionTitle}>Mockup del diseño</Text>
            <Image src={mockupUrl} style={{ maxWidth: 220, maxHeight: 220, objectFit: "contain" }} />
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

        {(quote.itemsDescription || quote.fabric || quote.colorScheme || quote.patternNotes) && (
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
        )}

        {items.length > 0 && (
          <View style={pdfStyles.section}>
            <Text style={pdfStyles.sectionTitle}>Artículos</Text>
            <View style={pdfStyles.table}>
              <View style={[pdfStyles.tableHeaderRow, { backgroundColor: accent, borderBottomWidth: 0, borderRadius: 4 }]}>
                <Text style={[pdfStyles.tableCell, { color: accentText, flex: 3 }]}>Descripción</Text>
                <Text style={[pdfStyles.tableCell, { color: accentText }]}>Precio unit.</Text>
                <Text style={[pdfStyles.tableCell, { color: accentText }]}>Cant.</Text>
                <Text style={[pdfStyles.tableCell, { color: accentText }]}>Subtotal</Text>
              </View>
              {items.map((item, i) => (
                <View key={i} style={pdfStyles.tableRow}>
                  <Text style={[pdfStyles.tableCell, { flex: 3 }]}>{item.description}</Text>
                  <Text style={pdfStyles.tableCell}>{formatMoney(item.unitPrice)}</Text>
                  <Text style={pdfStyles.tableCell}>{item.quantity}</Text>
                  <Text style={pdfStyles.tableCell}>{formatMoney(item.unitPrice * item.quantity)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {sizeGuides.length > 0 && (
          <View style={pdfStyles.section}>
            <Text style={pdfStyles.sectionTitle}>Guía de talles</Text>
            {sizeGuides.map((guide) => (
              <View key={guide.name} style={{ marginBottom: 6 }}>
                <Text style={[pdfStyles.label, { marginBottom: 2 }]}>{guide.name}</Text>
                <View style={pdfStyles.table}>
                  <View style={[pdfStyles.tableHeaderRow, { backgroundColor: accent, borderBottomWidth: 0, borderRadius: 4 }]}>
                    <Text style={[pdfStyles.tableCell, { color: accentText }]}>Talle</Text>
                    <Text style={[pdfStyles.tableCell, { color: accentText, flex: 3 }]}>Medidas</Text>
                  </View>
                  {guide.sizes.map((s) => (
                    <View key={s.label} style={pdfStyles.tableRow}>
                      <Text style={pdfStyles.tableCell}>{s.label}</Text>
                      <Text style={[pdfStyles.tableCell, { flex: 3 }]}>{s.measurements}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={pdfStyles.section}>
          <View style={pdfStyles.row}>
            <Text style={pdfStyles.label}>Total</Text>
            <Text style={[pdfStyles.value, { fontWeight: 700 }]}>{formatMoney(quote.total)}</Text>
          </View>
          <View style={pdfStyles.row}>
            <Text style={pdfStyles.label}>Seña ({quote.depositPercent}%)</Text>
            <Text style={[pdfStyles.value, { fontWeight: 700 }]}>{formatMoney(quote.depositAmount)}</Text>
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
