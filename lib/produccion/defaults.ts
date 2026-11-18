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
      pieceKinds: ["frente", "espalda", "manga_izq", "manga_der"],
      fromRightMm: 30, // relevamiento: 3 cm del costado
      fromBaseMm: 70, // relevamiento: 7 cm de la base
      heightMm: 10, // SUPUESTO
    },
    safeMarginMm: 10, // relevamiento
  };
}
