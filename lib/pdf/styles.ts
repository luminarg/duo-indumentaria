import { StyleSheet } from "@react-pdf/renderer";

// Estilos compartidos entre los PDFs (presupuesto e informe de pedido) para
// que ambos documentos se vean consistentes con la identidad del negocio.
export const pdfStyles = StyleSheet.create({
  page: {
    padding: 36,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#18181b",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: "#18181b",
  },
  // Variante oscura del header, para la ficha técnica del pedido — el logo
  // del negocio es blanco, así que necesita un fondo negro para verse.
  headerDark: {
    backgroundColor: "#000000",
    borderBottomWidth: 0,
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 20,
  },
  logo: {
    width: 90,
    maxHeight: 50,
    objectFit: "contain",
  },
  clubLogo: {
    width: 60,
    maxHeight: 46,
    objectFit: "contain",
  },
  businessName: {
    fontSize: 16,
    fontWeight: 700,
  },
  businessNameDark: {
    color: "#ffffff",
  },
  businessMeta: {
    fontSize: 8,
    color: "#71717a",
    marginTop: 2,
  },
  businessMetaDark: {
    color: "#a1a1aa",
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 9,
    color: "#71717a",
    marginBottom: 16,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 6,
    textTransform: "uppercase",
    color: "#3f3f46",
  },
  row: {
    flexDirection: "row",
    marginBottom: 3,
  },
  label: {
    width: 110,
    color: "#71717a",
  },
  value: {
    flex: 1,
  },
  table: {
    marginTop: 6,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e4e4e7",
    paddingVertical: 4,
  },
  tableHeaderRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#18181b",
    paddingVertical: 4,
    fontWeight: 700,
  },
  tableCell: {
    flex: 1,
  },
  // --- Ficha técnica: cover page con identidad de marca ---
  statsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 18,
  },
  statBadge: {
    flex: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  statLabel: {
    fontSize: 6.5,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  statValue: {
    fontSize: 12,
    fontWeight: 700,
  },
  coverGrid: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 4,
  },
  coverCol: {
    flex: 1,
  },
  mockupBox: {
    width: "100%",
    height: 168,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e4e4e7",
    marginBottom: 6,
  },
  mockupImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    borderRadius: 8,
  },
  mockupCaption: {
    fontSize: 7,
    color: "#71717a",
    textAlign: "center",
    marginBottom: 12,
  },
  mockupPlaceholder: {
    width: "100%",
    height: 168,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#d4d4d8",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  mockupPlaceholderText: {
    fontSize: 8,
    color: "#a1a1aa",
  },
  imageGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
  },
  imageBox: {
    width: 110,
  },
  image: {
    width: 110,
    height: 110,
    objectFit: "cover",
    borderRadius: 4,
  },
  imageCaption: {
    fontSize: 7,
    color: "#71717a",
    marginTop: 2,
    textAlign: "center",
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 36,
    right: 36,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#e4e4e7",
    fontSize: 8,
    color: "#71717a",
  },
});
