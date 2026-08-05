import { Document, Page, Text, View, Image } from "@react-pdf/renderer";
import { pdfStyles } from "./styles";
import { BrandHeader } from "./BrandHeader";
import { getReadableForeground, getMutedForeground } from "../color";

type OrderReportProps = {
  business: {
    name: string;
    logoUrl: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    primaryColor: string;
    secondaryColor: string;
  };
  order: {
    orderNumber: string;
    status: string;
    createdAt: string;
    teamOrGroupName: string | null;
    contactName: string | null;
    contactPhone: string | null;
    contactEmail: string | null;
    generalNotes: string | null;
    estimatedDeliveryDate: string | null;
  };
  details: {
    fabric: string | null;
    colorScheme: string | null;
    patternNotes: string | null;
    printNotes: string | null;
  } | null;
  items: {
    sizeLabel: string | null;
    color: string | null;
    individualName: string | null;
    individualNumber: string | null;
    quantity: number;
  }[];
  // Logo del club/empresa cliente y mockup principal — se destacan en la
  // portada en vez de quedar perdidos en la grilla genérica de archivos.
  clientLogoDataUri: string | null;
  featuredMockupDataUri: string | null;
  images: { dataUri: string; caption: string }[];
  nonImageFiles: { fileName: string; caption: string }[];
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-AR");
}

const STATUS_LABELS: Record<string, string> = {
  borrador: "Borrador",
  cargado_por_cliente: "Cargado por el cliente",
  senado: "Seña confirmada",
  cortando: "Cortando",
  estampando: "Estampando",
  armando: "Armando",
  embalando: "Embalando",
  entregado: "Entregado",
};

export function OrderReportDocument({
  business,
  order,
  details,
  items,
  clientLogoDataUri,
  featuredMockupDataUri,
  images,
  nonImageFiles,
}: OrderReportProps) {
  const contactLine = [business.address, business.phone, business.email].filter(Boolean).join(" · ");
  const accent = business.secondaryColor || "#18181b";
  const accentText = getReadableForeground(accent);
  const accentMuted = getMutedForeground(accent);
  const totalQuantity = items.reduce((sum, item) => sum + (item.quantity || 0), 0);

  return (
    <Document title={`Ficha técnica ${order.orderNumber}`}>
      <Page size="A4" style={pdfStyles.page}>
        <BrandHeader
          businessName={business.name}
          logoUrl={business.logoUrl}
          contactLine={contactLine}
          accentColor={business.primaryColor}
          clubLogoUrl={clientLogoDataUri}
        />

        <Text style={pdfStyles.title}>Ficha técnica — Pedido {order.orderNumber}</Text>
        <Text style={pdfStyles.subtitle}>
          {order.teamOrGroupName ?? order.contactName ?? "Cliente"} · Creado: {formatDate(order.createdAt)}
        </Text>

        {/* Badges de resumen — lo primero que se ve, con el color de
            acento del negocio para que se note de un vistazo. */}
        <View style={pdfStyles.statsRow}>
          <View style={[pdfStyles.statBadge, { backgroundColor: accent }]}>
            <Text style={[pdfStyles.statLabel, { color: accentMuted }]}>Cantidad de prendas</Text>
            <Text style={[pdfStyles.statValue, { color: accentText }]}>{totalQuantity}</Text>
          </View>
          <View style={[pdfStyles.statBadge, { backgroundColor: accent }]}>
            <Text style={[pdfStyles.statLabel, { color: accentMuted }]}>Estado</Text>
            <Text style={[pdfStyles.statValue, { color: accentText }]}>
              {STATUS_LABELS[order.status] ?? order.status.replace(/_/g, " ")}
            </Text>
          </View>
          <View style={[pdfStyles.statBadge, { backgroundColor: accent }]}>
            <Text style={[pdfStyles.statLabel, { color: accentMuted }]}>Entrega aprox.</Text>
            <Text style={[pdfStyles.statValue, { color: accentText }]}>
              {order.estimatedDeliveryDate ? formatDate(order.estimatedDeliveryDate) : "—"}
            </Text>
          </View>
          <View style={[pdfStyles.statBadge, { backgroundColor: accent }]}>
            <Text style={[pdfStyles.statLabel, { color: accentMuted }]}>Estampado</Text>
            <Text style={[pdfStyles.statValue, { color: accentText, fontSize: 9 }]}>
              {details?.printNotes || "—"}
            </Text>
          </View>
        </View>

        {/* Mockup destacado + datos del cliente lado a lado. */}
        <View style={pdfStyles.coverGrid}>
          <View style={pdfStyles.coverCol}>
            {featuredMockupDataUri ? (
              <View style={pdfStyles.mockupBox}>
                {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
                <Image src={featuredMockupDataUri} style={pdfStyles.mockupImage} />
              </View>
            ) : (
              <View style={pdfStyles.mockupPlaceholder}>
                <Text style={pdfStyles.mockupPlaceholderText}>Sin mockup cargado</Text>
              </View>
            )}
            <Text style={pdfStyles.mockupCaption}>Mockup / diseño de referencia</Text>
          </View>

          <View style={pdfStyles.coverCol}>
            <Text style={pdfStyles.sectionTitle}>Cliente</Text>
            <View style={pdfStyles.row}>
              <Text style={pdfStyles.label}>Equipo / cliente</Text>
              <Text style={pdfStyles.value}>{order.teamOrGroupName ?? "—"}</Text>
            </View>
            <View style={pdfStyles.row}>
              <Text style={pdfStyles.label}>Contacto</Text>
              <Text style={pdfStyles.value}>{order.contactName ?? "—"}</Text>
            </View>
            {(order.contactPhone || order.contactEmail) && (
              <View style={pdfStyles.row}>
                <Text style={pdfStyles.label}>Datos de contacto</Text>
                <Text style={pdfStyles.value}>
                  {[order.contactPhone, order.contactEmail].filter(Boolean).join(" · ")}
                </Text>
              </View>
            )}
            {order.generalNotes && (
              <View style={pdfStyles.row}>
                <Text style={pdfStyles.label}>Notas del cliente</Text>
                <Text style={pdfStyles.value}>{order.generalNotes}</Text>
              </View>
            )}

            {details && (
              <>
                <Text style={[pdfStyles.sectionTitle, { marginTop: 10 }]}>Especificaciones</Text>
                {details.fabric && (
                  <View style={pdfStyles.row}>
                    <Text style={pdfStyles.label}>Tela</Text>
                    <Text style={pdfStyles.value}>{details.fabric}</Text>
                  </View>
                )}
                {details.colorScheme && (
                  <View style={pdfStyles.row}>
                    <Text style={pdfStyles.label}>Color / diseño</Text>
                    <Text style={pdfStyles.value}>{details.colorScheme}</Text>
                  </View>
                )}
                {details.patternNotes && (
                  <View style={pdfStyles.row}>
                    <Text style={pdfStyles.label}>Moldería</Text>
                    <Text style={pdfStyles.value}>{details.patternNotes}</Text>
                  </View>
                )}
              </>
            )}
          </View>
        </View>

        {items.length > 0 && (
          <View style={pdfStyles.section}>
            <Text style={pdfStyles.sectionTitle}>Prendas ({items.length})</Text>
            <View style={pdfStyles.table}>
              <View style={[pdfStyles.tableHeaderRow, { backgroundColor: accent, borderBottomWidth: 0, borderRadius: 4 }]}>
                <Text style={[pdfStyles.tableCell, { color: accentText }]}>Talle</Text>
                <Text style={[pdfStyles.tableCell, { color: accentText }]}>Nombre</Text>
                <Text style={[pdfStyles.tableCell, { color: accentText }]}>Número</Text>
                <Text style={[pdfStyles.tableCell, { color: accentText }]}>Cant.</Text>
              </View>
              {items.map((item, i) => (
                <View key={i} style={pdfStyles.tableRow}>
                  <Text style={pdfStyles.tableCell}>{item.sizeLabel ?? "—"}</Text>
                  <Text style={pdfStyles.tableCell}>{item.individualName ?? "—"}</Text>
                  <Text style={pdfStyles.tableCell}>{item.individualNumber ?? "—"}</Text>
                  <Text style={pdfStyles.tableCell}>{item.quantity}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {nonImageFiles.length > 0 && (
          <View style={pdfStyles.section}>
            <Text style={pdfStyles.sectionTitle}>Otros archivos adjuntos</Text>
            {nonImageFiles.map((f, i) => (
              <Text key={i}>
                • {f.caption}: {f.fileName}
              </Text>
            ))}
          </View>
        )}

        <Text
          style={pdfStyles.footer}
          fixed
          render={({ pageNumber, totalPages }) => `${business.name} · Página ${pageNumber} de ${totalPages}`}
        />
      </Page>

      {images.length > 0 && (
        <Page size="A4" style={pdfStyles.page}>
          <Text style={pdfStyles.sectionTitle}>Más mockups, logos y paleta</Text>
          <View style={pdfStyles.imageGrid}>
            {images.map((img, i) => (
              <View key={i} style={pdfStyles.imageBox}>
                {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image, no es un <img> HTML */}
                <Image src={img.dataUri} style={pdfStyles.image} />
                <Text style={pdfStyles.imageCaption}>{img.caption}</Text>
              </View>
            ))}
          </View>
        </Page>
      )}
    </Document>
  );
}
