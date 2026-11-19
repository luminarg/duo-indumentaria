import { PDFDocument, PDFName, PDFString } from "pdf-lib";
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
