import { Document, Page, Text, View, Image } from "@react-pdf/renderer";
import { pdfStyles } from "./styles";
import { BrandHeader } from "./BrandHeader";

type OrderReportProps = {
  business: {
    name: string;
    logoUrl: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
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
  images: { dataUri: string; caption: string }[];
  nonImageFiles: { fileName: string; caption: string }[];
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-AR");
}

export function OrderReportDocument({
  business,
  order,
  details,
  items,
  images,
  nonImageFiles,
}: OrderReportProps) {
  const contactLine = [business.address, business.phone, business.email].filter(Boolean).join(" · ");

  return (
    <Document title={`Ficha técnica ${order.orderNumber}`}>
      <Page size="A4" style={pdfStyles.page}>
        <BrandHeader businessName={business.name} logoUrl={business.logoUrl} contactLine={contactLine} dark />

        <Text style={pdfStyles.title}>Ficha técnica — Pedido {order.orderNumber}</Text>
        <Text style={pdfStyles.subtitle}>
          Estado: {order.status.replace(/_/g, " ")}  ·  Creado: {formatDate(order.createdAt)}
        </Text>

        <View style={pdfStyles.section}>
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
        </View>

        {details && (
          <View style={pdfStyles.section}>
            <Text style={pdfStyles.sectionTitle}>Especificaciones técnicas</Text>
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
            {details.printNotes && (
              <View style={pdfStyles.row}>
                <Text style={pdfStyles.label}>Estampado</Text>
                <Text style={pdfStyles.value}>{details.printNotes}</Text>
              </View>
            )}
          </View>
        )}

        {items.length > 0 && (
          <View style={pdfStyles.section}>
            <Text style={pdfStyles.sectionTitle}>Prendas ({items.length})</Text>
            <View style={pdfStyles.table}>
              <View style={pdfStyles.tableHeaderRow}>
                <Text style={pdfStyles.tableCell}>Talle</Text>
                <Text style={pdfStyles.tableCell}>Nombre</Text>
                <Text style={pdfStyles.tableCell}>Número</Text>
                <Text style={pdfStyles.tableCell}>Cant.</Text>
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
      </Page>

      {images.length > 0 && (
        <Page size="A4" style={pdfStyles.page}>
          <Text style={pdfStyles.sectionTitle}>Mockups, logos y paleta</Text>
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
