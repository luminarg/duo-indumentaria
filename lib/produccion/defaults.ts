import type { DesignConfig } from "./types";

// Valores por defecto de un diseño nuevo, tomados del relevamiento.
// Los marcados con "SUPUESTO" no salieron del cuestionario: hay que
// confirmarlos con el taller (se editan por diseño en el panel).

export type GarmentKind = "remera" | "short";

/**
 * Elemento nuevo según su etiqueta (definido por el taller):
 *  - "escudo"/"marca": remera → frente, a la izquierda de quien usa, 3 del
 *    costado y 4,2 del hombro; short → pierna derecha, al costado derecho del
 *    dibujo (zona del frente), 3,5 del costado y 2,5 de la base.
 *  - "duo" (o el segundo elemento): remera → derecha de quien usa, 2,1 del
 *    costado y 1,8 del hombro; short → igual que el escudo pero en la otra
 *    pierna (izquierda, su zona del frente es el borde izquierdo).
 */
export function elementDefaults(label: string, kind: GarmentKind, index = 0) {
  const l = label.trim().toLowerCase();
  const isDuo = l.includes("duo") || (!/escudo|marca/.test(l) && index > 0);
  if (kind === "short")
    return isDuo
      ? { pieceKind: "pierna_izq" as const, side: "izquierda" as const, fromSideUnits: 3.5, fromBaseUnits: 2.5, fromShoulderTopUnits: 7.5 }
      : { pieceKind: "pierna_der" as const, side: "derecha" as const, fromSideUnits: 3.5, fromBaseUnits: 2.5, fromShoulderTopUnits: 7.5 };
  return isDuo
    ? { pieceKind: "frente" as const, side: "derecha" as const, fromSideUnits: 2.1, fromShoulderTopUnits: 1.8, fromBaseUnits: undefined }
    : { pieceKind: "frente" as const, side: "izquierda" as const, fromSideUnits: 3, fromShoulderTopUnits: 4.2, fromBaseUnits: undefined };
}

export function defaultDesignConfig(kind: GarmentKind = "remera"): DesignConfig {
  const c = baseConfig();
  if (kind === "short") {
    c.elements = [{ ...c.elements[0], ...elementDefaults("Escudo", "short") }];
    c.collars = { ...c.collars, enabled: false }; // el short no lleva cuello
    // Número del short: en la pierna izquierda, en el mismo lugar que el
    // escudo (que va en la derecha) pero del otro lado, arriba de la marca.
    c.number = { ...c.number, pieceKinds: ["pierna_izq"], shortSide: "delantero", shortFromSideUnits: 3.5, shortFromBaseUnits: 4.6 };
    // Indicador de talle del short: pierna izquierda, esquina alta de la cintura.
    c.sizeIndicator = {
      ...c.sizeIndicator,
      shortKind: "pierna_izq",
      shortAlongWaistUnits: 1,
      shortBelowWaistUnits: 0.4,
      widthMm: 76,
      textX: 0.3,
      textY: 0.74,
      textRotation: 180, // dada vuelta
      textAlign: "centro",
      textHeightMm: 6,
    };
  }
  return c;
}

function baseConfig(): DesignConfig {
  return {
    baseSizeLabel: "L",
    background: {
      mode: "piezas", // como se trabaja hoy: el diseño se hace sobre las piezas de un talle
      filePath: null,
      widthMm: 2000, // SUPUESTO: lienzo amplio que cubre la prenda armada
      heightMm: 1100,
      scaling: "proporcional", // relevamiento: la trama se agranda en proporción
      color: "#FFFFFF",
    },
    elements: [
      {
        id: "escudo",
        label: "Escudo",
        pieceKind: "frente",
        side: "izquierda", // izquierda de quien usa la remera
        fromSideUnits: 3, // taller (nov 2026)
        fromShoulderTopUnits: 4.2, // taller (nov 2026)
        widthMm: { adulto: 90, nino: 70 }, // SUPUESTO: adulto y niño difieren
        aspect: 1,
        filePath: null,
      },
    ],
    number: {
      enabled: true,
      pieceKinds: ["espalda"],
      heightMm: { adulto: 200, nino: 170 }, // relevamiento
      frontHeightMm: { adulto: 80, nino: 70 }, // SUPUESTO
      fromShoulderTopUnits: 6.2, // SUPUESTO
      frontFromShoulderTopUnits: 3.5,
      frontSide: "derecha",
      frontFromSideUnits: 2.5,
      shortHeightMm: { adulto: 100, nino: 80 }, // SUPUESTO
      shortSide: "delantero", // SUPUESTO
      shortFromSideUnits: 2.5, // décimos del ancho desde el borde del delantero
      shortFromBaseUnits: 2.5, // décimos del alto desde el ruedo
      style: { font: "Helvetica-Bold", fill: "#141414" },
    },
    name: {
      enabled: true,
      heightMm: 40, // relevamiento: 40 mm, se achica en proporción si no entra
      fromShoulderTopUnits: 2.4, // SUPUESTO: arriba en la espalda
      maxWidthFraction: 0.85, // SUPUESTO
      style: { font: "Helvetica-Bold", fill: "#141414" },
    },
    sizeTag: {
      enabled: true,
      pieceKinds: ["frente", "espalda", "manga_izq", "manga_der", "pierna_izq", "pierna_der"],
      corner: "derecha", // esquina de la base, contra el borde, dentro del ruedo
      marginMm: 1, // adentro de la línea: no pisa el contorno negro
      heightMm: 5, // como en el diseño de Talleres
      color: "auto",
    },
    sizeIndicator: {
      enabled: false, // opcional: en algunas prendas va y en otras no
      pieceKind: "frente", // solo en el frente
      side: "izquierda", // izquierda de quien usa (taller, nov 2026)
      fromSideUnits: 0.8,
      fromBaseUnits: 2.2,
      widthMm: 22,
      artPath: null, // el arte se sube como el escudo, sin la letra
      artAspect: 3.7,
      textX: 0.7,
      textY: 0.2,
      textRotation: 90, // vertical, se lee de arriba abajo
      textAlign: "centro",
      textHeightMm: 6,
      textColor: "#FFFFFF",
    },
    collars: {
      enabled: true, // el taller: siempre van las tiras al final (se apaga si el cuello es tela de color)
      stripHeightMm: 40,
      necksPerStrip: 3, // 30 remeras → 10 tiras
      extraStrips: 0,
      color: null, // = color de fondo del diseño
      artPath: null,
      artAspect: 1,
      separatorMm: 0.5,
      separatorColor: "auto",
    },
    safeMarginMm: 10, // relevamiento
  };
}
