import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { assemblyTransforms, DEFAULT_ASSEMBLY, shoulderTip, sizeScale } from "./assembly";
import { approxMeasurer, buildPrintPieces, contrastOn } from "./build";
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

  it("etiqueta de talle en un cuadrado, a 3 cm del costado derecho y 7 cm de la base, medida al borde", () => {
    const front = prints.find((p) => p.garment.orderItemId === "a" && p.piece.kind === "frente")!;
    const box = front.boxes[0];
    const tag = front.texts.find((t) => t.kind === "talle")!;
    const b = bbox(front.piece.outline);
    expect(box.center.x + box.sizeMm / 2).toBeCloseTo(b.maxX - 30, 6);
    expect(box.center.y + box.sizeMm / 2).toBeCloseTo(b.maxY - 70, 6);
    expect(tag.center).toEqual(box.center);
    expect(tag.text).toBe("L");
  });

  it("el color de la etiqueta contrasta con el fondo", () => {
    expect(contrastOn("#003c67")).toBe("#FFFFFF");
    expect(contrastOn("#FFFFFF")).toBe("#141414");
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

// ---------------------------------------------------------------- importación y diseño

import { importSvg } from "./vectorImport";
import { importPdf } from "./pdfImport";
import { designToPiece } from "./build";
import { rgb } from "pdf-lib";

function pathOf(poly: { x: number; y: number }[], dx: number, dy: number) {
  return "M" + poly.map((p) => `${(p.x + dx).toFixed(2)},${(p.y + dy).toFixed(2)}`).join(" L") + " Z";
}

describe("importación de moldería", () => {
  it("lee un SVG con varios talles y asigna el talle por el texto de abajo", () => {
    // Dos talles uno al lado del otro: mangas, espalda, frente; rótulo debajo.
    let x = 0;
    const parts: string[] = [];
    for (const size of ["10", "L"]) {
      const ps = molds.filter((p) => p.sizeLabel === size);
      const f = ps.find((p) => p.kind === "frente")!, b = ps.find((p) => p.kind === "espalda")!, s = ps.find((p) => p.kind === "manga_izq")!;
      const sb = bbox(s.outline), bb = bbox(b.outline);
      parts.push(`<path d="${pathOf(s.outline, x, 0)}"/>`, `<path d="${pathOf(s.outline, x, sb.maxY + 20)}"/>`);
      x += sb.maxX + 20;
      parts.push(`<path d="${pathOf(b.outline, x, 0)}"/>`);
      x += bb.maxX;
      parts.push(`<path d="${pathOf(f.outline, x, 0)}"/>`);
      parts.push(`<text x="${x - 60}" y="${bb.maxY + 250}" font-size="150">${size}</text>`);
      x += bbox(f.outline).maxX + 300;
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${x}mm" height="1200mm" viewBox="0 0 ${x} 1200">${parts.join("")}</svg>`;
    const r = importSvg(svg);
    expect(r.sizes).toEqual(["10", "L"]);
    const L = r.pieces.filter((p) => p.sizeLabel === "L");
    expect(L.map((p) => p.kind).sort()).toEqual(["espalda", "frente", "manga_der", "manga_izq"]);
    const front = L.find((p) => p.kind === "frente")!;
    expect(front.widthMm).toBeCloseTo(560, 1);
  });

  it("en un PDF de Corel toma el borde interior de la línea de 3 mm", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([800 * MMPT, 900 * MMPT]);
    const p = piece("L", "frente");
    const outer = offset(p.outline, 3)!;
    // Anillo: exterior + interior en un mismo relleno (así exporta Corel).
    const d = (poly: { x: number; y: number }[]) => "M" + poly.map((q) => `${((q.x + 50) * MMPT).toFixed(2)},${((q.y + 50) * MMPT).toFixed(2)}`).join(" L") + " Z";
    page.drawSvgPath(d(outer) + " " + d([...p.outline].reverse()), { x: 0, y: page.getHeight(), color: rgb(0, 0, 0) });
    const r = await importPdf(new Uint8Array(await doc.save()));
    expect(r.pieces).toHaveLength(1);
    expect(r.pieces[0].widthMm).toBeCloseTo(560, 0);
    expect(r.notes.join(" ")).toMatch(/3\.0 mm/);
  });
});

const MMPT = 72 / 25.4;

describe("diseño hecho sobre un talle", () => {
  it("lo que está en el arte cae en las mismas unidades de la grilla en otro talle", () => {
    const base = piece("M", "frente");
    const target = piece("XL", "frente");
    const bb = bbox(base.outline);
    // La pieza M está en el archivo de diseño en (1000, 80), sin girar.
    const ref = { outline: base.outline.map((q) => ({ x: q.x + 1000, y: q.y + 80 })), box: { minX: bb.minX + 1000, minY: bb.minY + 80, maxX: bb.maxX + 1000, maxY: bb.maxY + 80 }, rotation: 0 as const, match: 1 };
    const m = designToPiece(ref, base, target);
    const uB = gridUnit(base), uT = gridUnit(target);
    // Escudo en el diseño: 2,5 u desde el costado derecho del dibujo y 3,5 u desde el hombro.
    const crestCanvas = { x: bb.maxX - 2.5 * uB + 1000, y: bb.minY + 3.5 * uB + 80 };
    const c = apply(m, crestCanvas);
    const tb = bbox(target.outline);
    expect((tb.maxX - c.x) / uT).toBeCloseTo(2.5, 6);
    expect((c.y - tb.minY) / uT).toBeCloseTo(3.5, 6);
  });

  it("deshace el giro de 180° de una pieza en el archivo", () => {
    const base = piece("M", "manga_izq");
    const bb = bbox(base.outline);
    const W = bb.maxX - bb.minX, H = bb.maxY - bb.minY;
    const rotated = base.outline.map((q) => ({ x: W - q.x + 10, y: H - q.y + 20 }));
    const ref = { outline: rotated, box: { minX: 10, minY: 20, maxX: 10 + W, maxY: 20 + H }, rotation: 180 as const, match: 1 };
    const m = designToPiece(ref, base, base);
    const p0 = base.outline[3];
    const back = apply(m, { x: W - p0.x + 10, y: H - p0.y + 20 });
    expect(back.x).toBeCloseTo(p0.x, 6);
    expect(back.y).toBeCloseTo(p0.y, 6);
  });
});

describe("giro de 180° en la tizada", () => {
  it("encastra un par de mangas girando una, respetando los 6 mm", () => {
    // Manga simplificada: angosta arriba (copa), ancha abajo.
    const manga = [
      { x: 150, y: 0 }, { x: 350, y: 0 }, { x: 500, y: 250 }, { x: 0, y: 250 },
    ];
    const pieces: PatternPiece[] = ["manga_izq", "manga_der"].map((kind, i) => ({
      id: `t${i}`, modelId: "t", sizeLabel: "L", kind: kind as PatternPiece["kind"], outline: manga,
    }));
    const design0 = { ...defaultDesignConfig(), elements: [], sizeTag: { ...defaultDesignConfig().sizeTag, enabled: false } };
    const { prints } = buildPrintPieces({ pieces, assembly: DEFAULT_ASSEMBLY, design: design0, garments: [{ orderItemId: "a", sizeLabel: "L", variant: "jugador" }], measure: approxMeasurer });
    // En 1000 mm no entran dos mangas derechas una al lado de la otra (2 × 512).
    const layout = nest(prints, { ...DEFAULT_SETTINGS, rollWidthMm: 1000 });
    expect(layout.placed.map((p) => p.rotation).sort()).toEqual([0, 180]);
    expect(layout.lengthMm).toBeLessThan(300); // una sola fila, no dos
    expect(minDistance(layout.placed[0].outer, layout.placed[1].outer)).toBeGreaterThanOrEqual(6);
  });
});
