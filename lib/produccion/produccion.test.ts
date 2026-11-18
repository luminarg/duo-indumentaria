import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { assemblyTransforms, DEFAULT_ASSEMBLY, shoulderTip, sizeScale } from "./assembly";
import { approxMeasurer, buildPrintPieces } from "./build";
import { defaultDesignConfig } from "./defaults";
import { exportRollPdf, splitSegments } from "./exportPdf";
import { apply, area, bbox, compose, minDistance, offset } from "./geometry";
import { DEFAULT_SETTINGS, nest } from "./nesting";
import { gridUnit, placeElement, sizeGroupOf } from "./rules";
import { sampleMolds } from "./sampleMolds";
import type { GarmentRequest, PatternPiece } from "./types";

const molds = sampleMolds();
const piece = (size: string, kind: PatternPiece["kind"]) => molds.find((p) => p.sizeLabel === size && p.kind === kind)!;
const design = defaultDesignConfig();

describe("talles", () => {
  it("distingue niño de adulto", () => {
    expect(sizeGroupOf("10")).toBe("nino");
    expect(sizeGroupOf("16")).toBe("nino");
    expect(sizeGroupOf("10 años")).toBe("nino");
    expect(sizeGroupOf("L")).toBe("adulto");
    expect(sizeGroupOf("4XL")).toBe("adulto");
  });
});

describe("escudo con la grilla de 10 unidades", () => {
  const escudo = design.elements[0];

  it("en el frente va a la izquierda de quien usa = derecha del dibujo", () => {
    const p = piece("L", "frente");
    const b = bbox(p.outline);
    const u = gridUnit(p);
    const { center } = placeElement(p, escudo);
    expect(center.x).toBeCloseTo(b.maxX - 2.5 * u, 6);
    expect(center.y).toBeCloseTo(b.minY + 3.5 * u, 6);
    expect(center.x).toBeGreaterThan((b.minX + b.maxX) / 2);
  });

  it("en la espalda, la izquierda de quien usa queda a la izquierda del dibujo", () => {
    const p = piece("L", "espalda");
    const b = bbox(p.outline);
    const { center } = placeElement(p, { ...escudo, pieceKind: "espalda" });
    expect(center.x).toBeLessThan((b.minX + b.maxX) / 2);
  });

  it("cae en el mismo punto relativo en todos los talles", () => {
    for (const size of ["6", "10", "M", "L", "4XL"]) {
      const p = piece(size, "frente");
      const b = bbox(p.outline);
      const u = gridUnit(p);
      const { center } = placeElement(p, escudo);
      expect((b.maxX - center.x) / u).toBeCloseTo(2.5, 6);
      expect((center.y - b.minY) / u).toBeCloseTo(3.5, 6);
    }
  });

  it("usa el tamaño de niño en talles de niño", () => {
    expect(placeElement(piece("10", "frente"), escudo).widthMm).toBe(70);
    expect(placeElement(piece("L", "frente"), escudo).widthMm).toBe(90);
  });
});

describe("armado para que las rayas coincidan", () => {
  for (const size of ["L", "10", "4XL"]) {
    it(`frente y espalda comparten línea de base y el fondo es continuo (talle ${size})`, () => {
      const ofSize = molds.filter((p) => p.sizeLabel === size);
      const base = molds.filter((p) => p.sizeLabel === "L");
      const s = sizeScale(ofSize, base);
      const t = assemblyTransforms(ofSize, DEFAULT_ASSEMBLY, s);
      const front = piece(size, "frente");
      const back = piece(size, "espalda");
      const tf = t.get(front.id)!;
      const tb = t.get(back.id)!;
      expect(apply(tf, { x: 0, y: bbox(front.outline).maxY }).y).toBeCloseTo(0, 6);
      expect(apply(tb, { x: 0, y: bbox(back.outline).maxY }).y).toBeCloseTo(0, 6);

      // Un mismo punto del lienzo del fondo tiene que caer en el mismo lugar
      // del espacio armado, venga de la pieza que venga.
      const { prints } = buildPrintPieces({
        pieces: molds,
        assembly: DEFAULT_ASSEMBLY,
        design,
        garments: [{ orderItemId: "x", sizeLabel: size, variant: "jugador" }],
        measure: approxMeasurer,
      });
      const pf = prints.find((p) => p.piece.kind === "frente")!;
      const pb = prints.find((p) => p.piece.kind === "espalda")!;
      const pm = prints.find((p) => p.piece.kind === "manga_izq")!;
      const tm = t.get(pm.piece.id)!;
      const canvasPt = { x: 700, y: 400 };
      const viaFront = apply(compose(pf.backgroundTransform, tf), canvasPt);
      const viaBack = apply(compose(pb.backgroundTransform, tb), canvasPt);
      const viaSleeve = apply(compose(pm.backgroundTransform, tm), canvasPt);
      expect(viaBack.x).toBeCloseTo(viaFront.x, 6);
      expect(viaBack.y).toBeCloseTo(viaFront.y, 6);
      expect(viaSleeve.x).toBeCloseTo(viaFront.x, 6);
      expect(viaSleeve.y).toBeCloseTo(viaFront.y, 6);
    });
  }

  it("la manga se alinea por el punto del hombro", () => {
    const ofSize = molds.filter((p) => p.sizeLabel === "L");
    const t = assemblyTransforms(ofSize, DEFAULT_ASSEMBLY, 1);
    const front = piece("L", "frente");
    const sleeve = piece("L", "manga_izq");
    const tip = apply(t.get(front.id)!, shoulderTip(front, "max"));
    const top = apply(t.get(sleeve.id)!, { x: bbox(sleeve.outline).minX + (bbox(sleeve.outline).maxX - bbox(sleeve.outline).minX) / 2, y: bbox(sleeve.outline).minY });
    expect(top.x).toBeCloseTo(tip.x, 0);
    expect(top.y).toBeCloseTo(tip.y, 6);
  });
});

describe("nombre, número y etiqueta", () => {
  const garments: GarmentRequest[] = [
    { orderItemId: "a", sizeLabel: "L", name: "Pérez", number: "10", variant: "jugador" },
    { orderItemId: "b", sizeLabel: "10", name: "Fernández Sosa de la Torre", number: "7", variant: "jugador" },
  ];
  const { prints } = buildPrintPieces({ pieces: molds, assembly: DEFAULT_ASSEMBLY, design, garments, measure: approxMeasurer });

  it("número de 200 mm en adulto y 170 mm en niño, en la espalda", () => {
    const nL = prints.find((p) => p.garment.orderItemId === "a" && p.piece.kind === "espalda")!.texts.find((t) => t.kind === "numero")!;
    const n10 = prints.find((p) => p.garment.orderItemId === "b" && p.piece.kind === "espalda")!.texts.find((t) => t.kind === "numero")!;
    expect(nL.heightMm).toBe(200);
    expect(n10.heightMm).toBe(170);
    expect(prints.find((p) => p.garment.orderItemId === "a" && p.piece.kind === "frente")!.texts.some((t) => t.kind === "numero")).toBe(false);
  });

  it("el nombre largo se achica en proporción para entrar", () => {
    const back = prints.find((p) => p.garment.orderItemId === "b" && p.piece.kind === "espalda")!;
    const name = back.texts.find((t) => t.kind === "nombre")!;
    expect(name.heightMm).toBeLessThan(40);
    const short = prints.find((p) => p.garment.orderItemId === "a" && p.piece.kind === "espalda")!.texts.find((t) => t.kind === "nombre")!;
    expect(short.heightMm).toBe(40);
    expect(short.text).toBe("PÉREZ");
  });

  it("etiqueta de talle a 3 cm del costado derecho y 7 cm de la base, medida al borde", () => {
    const front = prints.find((p) => p.garment.orderItemId === "a" && p.piece.kind === "frente")!;
    const tag = front.texts.find((t) => t.kind === "talle")!;
    const b = bbox(front.piece.outline);
    expect(tag.center.x + tag.widthMm / 2).toBeCloseTo(b.maxX - 30, 6);
    expect(tag.center.y + tag.heightMm / 2).toBeCloseTo(b.maxY - 70, 6);
    expect(tag.text).toBe("L");
  });
});

describe("contorno láser y tizada", () => {
  const garments: GarmentRequest[] = Array.from({ length: 30 }, (_, i) => ({
    orderItemId: `j${i}`,
    sizeLabel: ["10", "12", "S", "M", "L", "XL", "2XL"][i % 7],
    name: `Jugador ${i}`,
    number: String(i + 1),
    variant: "jugador" as const,
  }));
  const { prints } = buildPrintPieces({ pieces: molds, assembly: DEFAULT_ASSEMBLY, design, garments, measure: approxMeasurer });
  const layout = nest(prints, DEFAULT_SETTINGS);

  it("el contorno de 3 mm queda por fuera de la línea", () => {
    const p = piece("L", "frente");
    const outer = offset(p.outline, 3)!;
    const b0 = bbox(p.outline);
    const b1 = bbox(outer);
    expect(b0.minX - b1.minX).toBeCloseTo(3, 1);
    expect(b1.maxY - b0.maxY).toBeCloseTo(3, 1);
    expect(area(outer)).toBeGreaterThan(area(p.outline));
  });

  it("ubica todas las piezas, dentro del ancho del rollo, solo a 0° o 180°", () => {
    expect(layout.placed.length).toBe(30 * 4);
    for (const p of layout.placed) {
      const b = bbox(p.outer);
      expect(b.minX).toBeGreaterThanOrEqual(DEFAULT_SETTINGS.edgeMarginMm - 0.01);
      expect(b.maxX).toBeLessThanOrEqual(DEFAULT_SETTINGS.rollWidthMm - DEFAULT_SETTINGS.edgeMarginMm + 0.01);
      expect([0, 180]).toContain(p.rotation);
    }
  });

  it("deja al menos 6 mm entre contornos (12 mm entre líneas de vector)", () => {
    let min = Infinity;
    for (let i = 0; i < layout.placed.length; i++) {
      for (let j = i + 1; j < layout.placed.length; j++) {
        const a = bbox(layout.placed[i].outer);
        const b = bbox(layout.placed[j].outer);
        if (a.maxX + 10 < b.minX || b.maxX + 10 < a.minX || a.maxY + 10 < b.minY || b.maxY + 10 < a.minY) continue;
        min = Math.min(min, minDistance(layout.placed[i].outer, layout.placed[j].outer));
      }
    }
    expect(min).toBeGreaterThanOrEqual(6);
  });

  it("calcula un largo razonable (aprovechamiento > 50 %)", () => {
    const used = layout.placed.reduce((s, p) => s + area(p.outer), 0);
    const total = layout.lengthMm * DEFAULT_SETTINGS.rollWidthMm;
    expect(used / total).toBeGreaterThan(0.5);
  });

  it("parte el rollo en tramos de hasta 5 m sin cortar piezas", () => {
    const segs = splitSegments(layout);
    for (const s of segs) {
      expect(s.endMm - s.startMm).toBeLessThanOrEqual(DEFAULT_SETTINGS.maxSegmentLengthMm + 1);
      for (const i of s.pieceIndexes) {
        const ys = layout.placed[i].outer.map((q) => q.y);
        expect(Math.min(...ys)).toBeGreaterThanOrEqual(s.startMm);
        expect(Math.max(...ys)).toBeLessThanOrEqual(s.endMm);
      }
    }
    expect(segs.flatMap((s) => s.pieceIndexes).length).toBe(layout.placed.length);
  });

  it("exporta un PDF a tamaño real: 1550 mm de ancho", async () => {
    const { bytes, segments } = await exportRollPdf(layout, design.background);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(segments.length);
    const { width } = doc.getPage(0).getSize();
    expect((width / 72) * 25.4).toBeCloseTo(1550, 3);
  });
});
