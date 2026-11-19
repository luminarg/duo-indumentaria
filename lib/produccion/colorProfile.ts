import { PDFDocument, PDFName, PDFPage, PDFRawStream, PDFStream, PDFString } from "pdf-lib";
import { SRGB_ICC_BASE64 } from "./srgbIcc";

function base64ToBytes(b64: string) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Incorpora el perfil sRGB IEC61966-2.1 como "output intent" del PDF (lo mismo
 * que "Incorporar perfil de color" de Corel): los colores RGB del archivo se
 * leen como sRGB en Corel, Illustrator y el RIP, y no según la configuración
 * de color de cada programa.
 */
export function embedSrgbProfile(doc: PDFDocument) {
  const ctx = doc.context;
  const icc = ctx.flateStream(base64ToBytes(SRGB_ICC_BASE64), { N: 3 });
  const iccRef = ctx.register(icc);
  const intent = ctx.obj({
    Type: "OutputIntent",
    S: "GTS_PDFA1",
    OutputConditionIdentifier: PDFString.of("sRGB IEC61966-2.1"),
    Info: PDFString.of("sRGB IEC61966-2.1"),
    RegistryName: PDFString.of("http://www.color.org"),
    DestOutputProfile: iccRef,
  });
  doc.catalog.set(PDFName.of("OutputIntents"), ctx.obj([intent]));
}

const groupDict = (doc: PDFDocument) => doc.context.obj({ Type: "Group", S: "Transparency", CS: "DeviceRGB" });

/**
 * Marca la página como grupo de transparencia (como hace Corel al exportar).
 * Sin esto, Corel importa las transparencias (máscaras de degradé) como si
 * fueran sólidas.
 */
export function markTransparencyGroup(page: PDFPage) {
  page.node.set(PDFName.of("Group"), groupDict(page.doc));
}

/**
 * Inserta la primera página de un PDF como objeto reutilizable y le copia el
 * grupo de transparencia de la página original (pdf-lib no lo copia).
 */
export async function embedAsGroup(doc: PDFDocument, bytes: Uint8Array) {
  const [emb] = await doc.embedPdf(bytes, [0]);
  await emb.embed();
  const xobj = doc.context.lookup(emb.ref);
  if (xobj instanceof PDFStream || xobj instanceof PDFRawStream) xobj.dict.set(PDFName.of("Group"), groupDict(doc));
  return emb;
}
