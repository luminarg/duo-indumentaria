import type { DesignConfig } from "./types";

// Valores por defecto de un diseño nuevo, tomados del relevamiento.
// Los marcados con "SUPUESTO" no salieron del cuestionario: hay que
// confirmarlos con el taller (se editan por diseño en el panel).

export function defaultDesignConfig(): DesignConfig {
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
        fromSideUnits: 2.5, // relevamiento
        fromShoulderTopUnits: 3.5, // relevamiento
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
      side: "izquierda",
      fromSideUnits: 0.8, // tomado del diseño de Talleres (talle M)
      fromBaseUnits: 2.4,
      widthMm: 20,
      artPath: null, // el arte se sube como el escudo, sin la letra
      artAspect: 3.7,
      textX: 0.5,
      textY: 0.15,
      textHeightMm: 6,
      textColor: "#FFFFFF",
    },
    collars: {
      enabled: false, // a veces el cuello es tela de color y no se imprime
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
