import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { assemblyTransforms, DEFAULT_ASSEMBLY, shoulderTip, sizeScale } from "./assembly";
import { approxMeasurer, buildPrintPieces, contrastOn } from "./build";
import { defaultDesignConfig, elementDefaults } from "./defaults";
import { exportRollPdf, splitSegments } from "./exportPdf";
import { apply, area, areaOutside, bbox, compose, minDistance, offset, rectPoly, spanAtY } from "./geometry";
import { DEFAULT_SETTINGS, nest } from "./nesting";
import { gridUnit, placeElement, shoulderTop, sizeGroupOf } from "./rules";
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
    expect(center.x).toBeCloseTo(b.maxX - 3 * u, 6);
    expect(center.y).toBeCloseTo(b.minY + 4.2 * u, 6);
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
      expect((b.maxX - center.x) / u).toBeCloseTo(3, 6);
      expect((center.y - b.minY) / u).toBeCloseTo(4.2, 6);
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

  it("talle en la esquina de la base, contra el borde y adentro de la línea, en todas las piezas", () => {
    for (const kind of ["frente", "espalda", "manga_izq"] as const) {
      const pc = prints.find((p) => p.garment.orderItemId === "a" && p.piece.kind === kind)!;
      const tag = pc.texts.find((t) => t.kind === "talle")!;
      const b = bbox(pc.piece.outline);
      // Pegado a la base y al costado derecho (a pocos mm), sin salirse de la pieza.
      expect(b.maxY - (tag.center.y + tag.heightMm / 2)).toBeLessThan(3);
      // Contra el costado a la altura del talle (en las mangas el costado es inclinado).
      const span = spanAtY(pc.piece.outline, tag.center.y + tag.heightMm / 2)!;
      expect(span[1] - (tag.center.x + tag.widthMm / 2)).toBeLessThan(4);
      expect(areaOutside(rectPoly(tag.center.x, tag.center.y, tag.widthMm, tag.heightMm), pc.piece.outline)).toBeLessThan(0.5);
      expect(tag.text).toBe("L");
    }
  });

  it("el indicador de talle tipo escudo va solo en el frente, con la letra encima", () => {
    const d2 = { ...design, sizeIndicator: { ...design.sizeIndicator, enabled: true, artPath: "ind.pdf", artAspect: 3.7 } };
    const r = buildPrintPieces({ pieces: molds, assembly: DEFAULT_ASSEMBLY, design: d2, garments: [garments[0]], measure: approxMeasurer });
    const front = r.prints.find((p) => p.piece.kind === "frente")!;
    const back = r.prints.find((p) => p.piece.kind === "espalda")!;
    expect(front.elements.some((e) => e.elementId === "indicador-talle")).toBe(true);
    expect(back.elements.some((e) => e.elementId === "indicador-talle")).toBe(false);
    const el = front.elements.find((e) => e.elementId === "indicador-talle")!;
    const b = bbox(front.piece.outline);
    const u = gridUnit(front.piece);
    expect((b.maxX - el.center.x) / u).toBeCloseTo(0.8, 6); // izquierda de quien usa = derecha del dibujo
    expect((b.maxY - el.center.y) / u).toBeCloseTo(2.2, 6);
    expect(front.texts.filter((t) => t.kind === "talle").length).toBe(2); // esquina + indicador
  });

  it("el color de la etiqueta contrasta con el fondo", () => {
    expect(contrastOn("#003c67")).toBe("#FFFFFF");
    expect(contrastOn("#FFFFFF")).toBe("#141414");
  });
});

describe("retoque: el rollo se achica solo", () => {
  it("si sobra lugar al final, el largo baja hasta la última pieza y las tiras suben", () => {
    const design = defaultDesignConfig();
    const garments: GarmentRequest[] = Array.from({ length: 2 }, (_, i) => ({ orderItemId: `c${i}`, sizeLabel: "M", variant: "jugador" }));
    const { prints } = buildPrintPieces({ pieces: sampleMolds(), assembly: DEFAULT_ASSEMBLY, design, garments, measure: approxMeasurer });
    const roll = addCollarPanel(nest(prints, DEFAULT_SETTINGS), design.collars, 6, "#112233");
    // Simula un rollo con 300 mm de más (como si se hubiera subido la última pieza).
    const loose = {
      ...roll,
      segments: roll.segments.map((g) => ({ ...g, endMm: g.endMm + 300, collars: g.collars ? { ...g.collars, startMm: g.collars.startMm + 300, endMm: g.collars.endMm + 300 } : undefined })),
      lengthMm: roll.lengthMm + 300,
    };
    const c = compactLayout(loose);
    const lowest = Math.max(...c.placed.flatMap((p) => p.outer.map((q) => q.y)));
    const panel = c.segments.find((g) => g.collars)!.collars!;
    expect(panel.startMm).toBeCloseTo(lowest + DEFAULT_SETTINGS.gapMm, 6);
    expect(c.lengthMm).toBeLessThan(loose.lengthMm);
    expect(validateLayout(c)).toEqual([]);
  });
});

describe("valores por defecto del taller", () => {
  it("elementos según la etiqueta, en remera y short", () => {
    expect(elementDefaults("Escudo", "remera")).toMatchObject({ pieceKind: "frente", side: "izquierda", fromSideUnits: 3, fromShoulderTopUnits: 4.2 });
    expect(elementDefaults("Marca", "remera")).toMatchObject({ side: "izquierda", fromSideUnits: 3 });
    expect(elementDefaults("duo", "remera")).toMatchObject({ pieceKind: "frente", side: "derecha", fromSideUnits: 2.1, fromShoulderTopUnits: 1.8 });
    expect(elementDefaults("Escudo", "short")).toMatchObject({ pieceKind: "pierna_der", side: "derecha", fromSideUnits: 3.5, fromBaseUnits: 2.5 });
    expect(elementDefaults("Duo", "short")).toMatchObject({ pieceKind: "pierna_izq", side: "izquierda", fromSideUnits: 3.5, fromBaseUnits: 2.5 });
    expect(elementDefaults("Sponsor", "short", 1)).toMatchObject({ pieceKind: "pierna_izq" }); // segundo elemento: la otra pierna
  });

  it("indicador de talle de remera y de short", () => {
    const r = defaultDesignConfig("remera").sizeIndicator;
    expect(r).toMatchObject({ side: "izquierda", fromSideUnits: 0.8, fromBaseUnits: 2.2, widthMm: 22, textX: 0.7, textY: 0.2, textRotation: 90, textAlign: "centro", textHeightMm: 6 });
    const sh = defaultDesignConfig("short").sizeIndicator;
    expect(sh).toMatchObject({ shortKind: "pierna_izq", shortAlongWaistUnits: 1, shortBelowWaistUnits: 0.4, widthMm: 76, textX: 0.3, textY: 0.74, textRotation: 180, textAlign: "centro", textHeightMm: 6 });
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
    const m = designToPiece(ref, base, target, { fit: "ancho" });
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

import { existsSync, readFileSync } from "fs";
import fontkit from "@pdf-lib/fontkit";
import { PDFDict, PDFName } from "pdf-lib";
import { fontNameFromPath, fontSlug, usedFonts } from "./fonts";
import { pdfMeasurer } from "./exportPdf";

describe("fuentes subidas", () => {
  it("nombre legible, nombre de archivo seguro y fuentes usadas", () => {
    expect(fontNameFromPath("fuentes/Bebas-Neue--ab12cd34.ttf")).toBe("Bebas Neue");
    expect(fontNameFromPath("Helvetica-Bold")).toBe("Helvetica Bold");
    expect(fontSlug("Fútbol Pro (v2).OTF")).toBe("Futbol-Pro-v2");
    const d = defaultDesignConfig();
    d.number.style.font = "fuentes/A--1.ttf";
    d.name.style.font = "fuentes/A--1.ttf";
    d.sizeIndicator.font = "fuentes/B--2.otf";
    expect(usedFonts(d).sort()).toEqual(["fuentes/A--1.ttf", "fuentes/B--2.otf"]);
  });

  // Usa fuentes del sistema si están (Linux); en otras máquinas se saltea.
  const TTF = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf";
  const OTF = "/usr/share/fonts/opentype/inter/InterDisplay-MediumItalic.otf";
  it.skipIf(!existsSync(TTF) || !existsSync(OTF))("mide y embebe .ttf y .otf en el rollo", async () => {
    const fonts = { "fuentes/Deja--1.ttf": new Uint8Array(readFileSync(TTF)), "fuentes/Inter--2.otf": new Uint8Array(readFileSync(OTF)) };
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const helv = await doc.embedFont("Helvetica-Bold");
    const measure = pdfMeasurer({ "fuentes/Deja--1.ttf": await doc.embedFont(fonts["fuentes/Deja--1.ttf"]), "fuentes/Inter--2.otf": await doc.embedFont(fonts["fuentes/Inter--2.otf"]) }, helv);
    expect(measure("10", "fuentes/Deja--1.ttf", 200)).not.toBeCloseTo(measure("10", "Helvetica-Bold", 200), 0);

    const design = defaultDesignConfig();
    design.number.style.font = "fuentes/Deja--1.ttf";
    design.name.style.font = "fuentes/Inter--2.otf";
    design.sizeTag.font = "fuentes/Inter--2.otf";
    const garments: GarmentRequest[] = [{ orderItemId: "a", sizeLabel: "M", variant: "jugador", name: "Pérez", number: "10" }];
    const { prints } = buildPrintPieces({ pieces: sampleMolds(), assembly: DEFAULT_ASSEMBLY, design, garments, measure });
    const numero = prints.flatMap((p) => p.texts).find((t) => t.kind === "numero");
    expect(numero?.style.font).toBe("fuentes/Deja--1.ttf");
    const layout = nest(prints, DEFAULT_SETTINGS);
    const { bytes } = await exportRollPdf(layout, design.background, { fonts });
    const out = await PDFDocument.load(bytes);
    expect(out.getPageCount()).toBeGreaterThan(0);
    const names = out.context
      .enumerateIndirectObjects()
      .map(([, o]) => (o instanceof PDFDict ? o.get(PDFName.of("FontName")) : undefined))
      .filter(Boolean)
      .map(String)
      .join(" ");
    expect(names).toMatch(/DejaVuSerif-Bold/);
    expect(names).toMatch(/InterDisplay/);
  });
});

import { addCollarPanel, collarStripCount } from "./collars";

describe("panel de cuellos", () => {
  it("30 remeras a 3 por tira = 10 tiras al final del rollo, sin cortar tiras entre tramos", async () => {
    const design = defaultDesignConfig();
    design.collars = { ...design.collars, enabled: true };
    expect(collarStripCount(30, design.collars)).toBe(10);
    expect(collarStripCount(31, design.collars)).toBe(11);
    expect(collarStripCount(30, { ...design.collars, enabled: false })).toBe(0);

    const garments: GarmentRequest[] = Array.from({ length: 2 }, (_, i) => ({ orderItemId: `g${i}`, sizeLabel: "M", variant: "jugador" }));
    const { prints } = buildPrintPieces({ pieces: sampleMolds(), assembly: DEFAULT_ASSEMBLY, design, garments, measure: approxMeasurer });
    const roll = nest(prints, DEFAULT_SETTINGS);
    const withCollars = addCollarPanel(roll, design.collars, 30, "#112233");
    const panel = withCollars.segments.at(-1)!.collars!;
    expect(panel.strips).toBe(10);
    // A 6 mm del contorno de la última pieza, en el mismo paño.
    const lowest = Math.max(...roll.placed.flatMap((p) => p.outer.map((q) => q.y)));
    expect(panel.startMm).toBeCloseTo(lowest + DEFAULT_SETTINGS.gapMm);
    expect(withCollars.lengthMm).toBeCloseTo(lowest + DEFAULT_SETTINGS.gapMm + 400);
    expect(withCollars.segments.length).toBe(roll.segments.length);
    expect(panel.color).toBe("#112233");
    expect(panel.separatorColor).toBe(contrastOn("#112233"));

    // 200 tiras de 40 mm = 8 m: se reparte en tramos de hasta 5 m, cortando entre tiras.
    // Rollo combinado: el panel del segundo pedido va a continuación del primero.
    const two = addCollarPanel(withCollars, design.collars, 6, "#445566");
    const panels = two.segments.filter((g) => g.collars).map((g) => g.collars!);
    expect(panels.length).toBe(2);
    expect(panels[1].startMm).toBeCloseTo(panels[0].endMm, 6);
    const big = addCollarPanel(roll, { ...design.collars, necksPerStrip: 1 }, 200, "#112233");
    const cs = big.segments.filter((s) => s.collars);
    expect(cs.reduce((a, s) => a + s.collars!.strips, 0)).toBe(200);
    for (const s of cs) expect(s.endMm - s.startMm).toBeLessThanOrEqual(DEFAULT_SETTINGS.maxSegmentLengthMm);

    const { bytes } = await exportRollPdf(withCollars, design.background);
    const out = await PDFDocument.load(bytes);
    const last = out.getPage(out.getPageCount() - 1);
    const seg = withCollars.segments.at(-1)!;
    expect(last.getHeight() / (72 / 25.4)).toBeCloseTo(seg.endMm - seg.startMm, 0);
  });
});

import { groupIntoRolls } from "./rolls";

describe("paños y rollos", () => {
  it("respeta el largo de paño elegido y reparte paños en rollos sin partirlos", () => {
    const garments: GarmentRequest[] = Array.from({ length: 12 }, (_, i) => ({ orderItemId: `g${i}`, sizeLabel: "M", variant: "jugador" }));
    const { prints } = buildPrintPieces({ pieces: sampleMolds(), assembly: DEFAULT_ASSEMBLY, design: defaultDesignConfig(), garments, measure: approxMeasurer });
    const L = nest(prints, { ...DEFAULT_SETTINGS, maxSegmentLengthMm: 2000 });
    expect(L.segments.length).toBeGreaterThan(1);
    for (const s of L.segments) expect(s.endMm - s.startMm).toBeLessThanOrEqual(2000 + 1e-6);
    const g = groupIntoRolls(L, 4000);
    expect(g.rolls.reduce((a, r) => a + r.lastPano - r.firstPano + 1, 0)).toBe(L.segments.length);
    for (const r of g.rolls) expect(r.lengthMm).toBeLessThanOrEqual(4000 + 1e-6);
    expect(groupIntoRolls(L, 0).rolls).toHaveLength(1);
  });
});

import { sizeSheets } from "./sizeSheets";

describe("PDF por talle (trabajos libres)", () => {
  it("una hoja por talle con un juego de piezas, sin nombre ni número", () => {
    const garments: GarmentRequest[] = [
      { orderItemId: "a", sizeLabel: "S", variant: "jugador", name: "Gómez", number: "5" },
      { orderItemId: "b", sizeLabel: "S", variant: "jugador", name: "Ruiz", number: "9" },
      { orderItemId: "c", sizeLabel: "L", variant: "jugador", name: "Paz", number: "10" },
    ];
    const molds = sampleMolds();
    const { prints } = buildPrintPieces({ pieces: molds, assembly: DEFAULT_ASSEMBLY, design: defaultDesignConfig(), garments, measure: approxMeasurer });
    const sheets = sizeSheets(prints);
    expect(sheets.map((s) => s.size).sort()).toEqual(["L", "S"]);
    for (const sh of sheets) {
      const perSize = molds.filter((m) => m.sizeLabel === sh.size).length;
      expect(sh.layout.placed).toHaveLength(perSize);
      expect(sh.layout.segments).toHaveLength(1);
      expect(sh.layout.placed.flatMap((p) => p.print.texts).some((t) => t.kind === "nombre" || t.kind === "numero")).toBe(false);
    }
  });
});

import { BUILTIN_TEMPLATES, canvasForPieces, renderTemplate, templateDefaults, markerSlot } from "./templates";
import { templateToPdf } from "./templatePdf";
import { templateFromFile } from "./templateImport";

describe("plantillas de diseño", () => {
  const molds = sampleMolds();
  const base = molds.filter((m) => m.sizeLabel === "M");
  const cv = canvasForPieces(base, DEFAULT_ASSEMBLY);

  it("el lienzo cubre la prenda armada y ubica frente y espalda", () => {
    expect(cv.widthMm).toBeGreaterThan(0);
    const f = cv.anchors.frente!;
    expect(f.cx).toBeCloseTo(cv.widthMm / 2, 0); // el frente va centrado (así lo espera backgroundTransform)
    expect(f.bottom).toBeCloseTo(cv.heightMm, 0); // la base del frente es el borde inferior
    expect(cv.anchors.espalda!.cx).toBeGreaterThan(f.cx);
  });

  it("todas las plantillas del sistema generan un PDF vectorial válido", async () => {
    for (const t of BUILTIN_TEMPLATES) {
      const shapes = renderTemplate({ id: t.id, params: templateDefaults(t), colors: t.defaultColors }, cv);
      expect(shapes.length, t.id).toBeGreaterThan(0);
      const bytes = await templateToPdf(shapes, cv.widthMm, cv.heightMm);
      const doc = await PDFDocument.load(bytes);
      expect(doc.getPage(0).getWidth() / (72 / 25.4)).toBeCloseTo(cv.widthMm, 0);
    }
  });

  it("la plantilla se recorta de cada pieza y escala con el talle (rayas que coinciden)", async () => {
    const t = BUILTIN_TEMPLATES.find((x) => x.id === "rayas_verticales")!;
    const spec = { id: t.id, params: templateDefaults(t), colors: t.defaultColors };
    const design = defaultDesignConfig();
    design.baseSizeLabel = "M";
    design.background = { ...design.background, mode: "lienzo", filePath: "tpl", widthMm: cv.widthMm, heightMm: cv.heightMm, scaling: "proporcional", color: spec.colors[0], template: spec, sleeveColor: "#FF0000" };
    const garments: GarmentRequest[] = [{ orderItemId: "a", sizeLabel: "S", variant: "jugador" }, { orderItemId: "b", sizeLabel: "L", variant: "jugador" }];
    const { prints } = buildPrintPieces({ pieces: molds, assembly: DEFAULT_ASSEMBLY, design, garments, measure: approxMeasurer });
    const sleeve = prints.find((p) => p.piece.kind === "manga_izq")!;
    expect(sleeve.bgColor).toBe("#FF0000"); // mangas lisas
    expect(sleeve.backgroundClip).toEqual([]);
    const frontS = prints.find((p) => p.piece.kind === "frente" && p.piece.sizeLabel === "S")!;
    const frontL = prints.find((p) => p.piece.kind === "frente" && p.piece.sizeLabel === "L")!;
    // Escala del lienzo = relación de anchos de frente (proporcional).
    expect(frontL.backgroundTransform.a / frontS.backgroundTransform.a).toBeCloseTo(gridUnit(frontL.piece) / gridUnit(frontS.piece), 3);
    const bg = await templateToPdf(renderTemplate(spec, cv), cv.widthMm, cv.heightMm);
    const L = nest(prints, DEFAULT_SETTINGS);
    const { bytes } = await exportRollPdf(L, design.background, { backgrounds: { tpl: bg } });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(0);
  });

  it("plantilla propia desde SVG: colores marcadores → Color 1–4, el resto fijo", async () => {
    expect(markerSlot("#FF0000")).toBe(0);
    expect(markerSlot("#00ff00")).toBe(1);
    expect(markerSlot("#123456")).toBeNull();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200mm" height="100mm" viewBox="0 0 200 100">
      <style>.fil0 {fill:#0000FF} .fil1 {fill:#ABCDEF}</style>
      <rect x="0" y="0" width="200" height="100" fill="#FF0000"/>
      <g fill="#00FF00"><path d="M10 10 L60 10 L60 60 Z"/></g>
      <path class="fil0" d="M100 10 L150 10 L150 60 Z"/>
      <path class="fil1" d="M160 10 L190 10 L190 40 Z"/>
      <path d="M0 0 L10 0" fill="none" stroke="#000"/>
    </svg>`;
    const t = await templateFromFile("Prueba", { svg });
    expect(t.shapes).toHaveLength(4);
    expect(t.slots).toBe(3);
    expect(t.shapes.map((s) => s.slot ?? s.color)).toEqual([0, 1, 2, "#ABCDEF"]);
    expect(t.aspect).toBeCloseTo(0.5, 2);
    const shapes = renderTemplate({ id: "custom:x", params: { ajuste: "estirar", zoom: 100, subir: 0 }, colors: ["#111111", "#222222", "#333333"] }, cv, [{ ...t, id: "x" }]);
    expect(shapes.filter((s) => s.kind === "poly").map((s) => (s as { color: string }).color).slice(1)).toEqual(["#111111", "#222222", "#333333", "#ABCDEF"]);
  });
});

describe("arte llevado a otros talles (ajuste y piezas giradas)", () => {
  const molds = sampleMolds();
  const refOf = (p: PatternPiece) => {
    const b = bbox(p.outline);
    return { outline: p.outline, box: b, rotation: 0 as const, match: 1 };
  };
  it("ajustar: el arte cubre la pieza de punta a punta, a lo ancho y a lo largo", () => {
    const base = molds.find((m) => m.sizeLabel === "M" && m.kind === "frente")!;
    const target = molds.find((m) => m.sizeLabel === "XL" && m.kind === "frente")!;
    const m = designToPiece(refOf(base), base, target, { fit: "ajustar" });
    const bb = bbox(base.outline), tb = bbox(target.outline);
    const bottom = apply(m, { x: (bb.minX + bb.maxX) / 2, y: bb.maxY });
    const left = apply(m, { x: bb.minX, y: (bb.minY + bb.maxY) / 2 });
    expect(bottom.y).toBeCloseTo(tb.maxY, 6); // llega al ruedo
    expect(left.x).toBeCloseTo(tb.minX, 6); // y al costado
  });
  it("una manga dibujada girada en otro talle recibe el arte girado", () => {
    const base = molds.find((m) => m.sizeLabel === "M" && m.kind === "manga_izq")!;
    const t0 = molds.find((m) => m.sizeLabel === "L" && m.kind === "manga_izq")!;
    const tb = bbox(t0.outline);
    const cx = (tb.minX + tb.maxX) / 2, cy = (tb.minY + tb.maxY) / 2;
    const rotated = { ...t0, id: "rot", outline: t0.outline.map((p) => ({ x: 2 * cx - p.x, y: 2 * cy - p.y })) };
    const mUp = designToPiece(refOf(base), base, t0);
    const mRot = designToPiece(refOf(base), base, rotated);
    // El punto más alto de la copa en el diseño cae en la copa de cada pieza.
    const capB = shoulderTop(base);
    const capUp = apply(mUp, capB);
    const capRot = apply(mRot, capB);
    expect(capUp.y).toBeLessThan(cy); // arriba en la manga derecha
    expect(capRot.y).toBeGreaterThan(cy); // abajo en la manga girada
    expect(capRot.x).toBeCloseTo(2 * cx - capUp.x, 3);
    expect(capRot.y).toBeCloseTo(2 * cy - capUp.y, 3);
  });
});

describe("talle en el ruedo", () => {
  it("va al ras de la base en todas las piezas, y arriba dado vuelta si la pieza está dibujada al revés", () => {
    const molds = sampleMolds();
    const t0 = molds.find((m) => m.sizeLabel === "L" && m.kind === "manga_izq")!;
    const tb = bbox(t0.outline);
    const cx = (tb.minX + tb.maxX) / 2, cy = (tb.minY + tb.maxY) / 2;
    const rotated = { ...t0, id: "rot", outline: t0.outline.map((p) => ({ x: 2 * cx - p.x, y: 2 * cy - p.y })) };
    const pieces = molds.map((m) => (m === t0 ? rotated : m));
    const design = defaultDesignConfig();
    design.baseSizeLabel = "M";
    const garments: GarmentRequest[] = ["M", "L"].map((s) => ({ orderItemId: s, sizeLabel: s, variant: "jugador" }));
    const { prints } = buildPrintPieces({ pieces, assembly: DEFAULT_ASSEMBLY, design, garments, measure: approxMeasurer });
    for (const p of prints) {
      const tag = p.texts.find((t) => t.kind === "talle")!;
      expect(tag, `${p.piece.kind} ${p.piece.sizeLabel}`).toBeTruthy();
      const b = bbox(p.piece.outline);
      if (p.piece.id === "rot") {
        expect(tag.rotation).toBe(180);
        expect(tag.center.y - tag.heightMm / 2 - b.minY).toBeLessThan(25); // arriba, junto al puño
      } else {
        expect(tag.rotation ?? 0).toBe(0);
        expect(b.maxY - (tag.center.y + tag.heightMm / 2)).toBeLessThan(25); // abajo, junto al ruedo
      }
    }
  });
});

describe("PDF con paños uno al lado del otro", () => {
  it("una sola página: paños de 1550 mm separados 50 cm, todos arriba", async () => {
    const garments: GarmentRequest[] = Array.from({ length: 10 }, (_, i) => ({ orderItemId: `g${i}`, sizeLabel: "M", variant: "jugador" }));
    const { prints } = buildPrintPieces({ pieces: sampleMolds(), assembly: DEFAULT_ASSEMBLY, design: defaultDesignConfig(), garments, measure: approxMeasurer });
    const L = nest(prints, { ...DEFAULT_SETTINGS, maxSegmentLengthMm: 2000 });
    const n = L.segments.length;
    expect(n).toBeGreaterThan(1);
    const { bytes } = await exportRollPdf(L, defaultDesignConfig().background, {}, { sideBySide: { gapMm: 500 } });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    const mm = 72 / 25.4;
    const pg = doc.getPage(0);
    expect(pg.getWidth() / mm).toBeCloseTo(n * 1550 + (n - 1) * 500, 0);
    expect(pg.getHeight() / mm).toBeCloseTo(Math.max(...L.segments.map((s) => s.endMm - s.startMm)), 0);
  });
});

import { compactLayout, movePiece, rotatePiece, validateLayout } from "./rollEdit";

describe("retoque manual del rollo", () => {
  const garments: GarmentRequest[] = Array.from({ length: 4 }, (_, i) => ({ orderItemId: `g${i}`, sizeLabel: i % 2 ? "M" : "L", variant: "jugador" }));
  const { prints } = buildPrintPieces({ pieces: sampleMolds(), assembly: DEFAULT_ASSEMBLY, design: defaultDesignConfig(), garments, measure: approxMeasurer });
  const L = nest(prints, { ...DEFAULT_SETTINGS, maxSegmentLengthMm: 1600 });

  it("el acomodo automático no tiene problemas", () => {
    expect(validateLayout(L)).toEqual([]);
  });
  it("mover una pieza encima de otra o fuera del ancho se marca", () => {
    const [a, b] = [0, 1];
    const ba = bbox(L.placed[a].outer), bb = bbox(L.placed[b].outer);
    const over = movePiece(L, a, bb.minX - ba.minX, bb.minY - ba.minY);
    expect(validateLayout(over).some((i) => i.idx === a && /menos de/.test(i.message))).toBe(true);
    const out = movePiece(L, a, L.settings.rollWidthMm, 0);
    expect(validateLayout(out).some((i) => i.idx === a && /ancho/.test(i.message))).toBe(true);
  });
  it("girar 180° y volver deja la pieza igual", () => {
    const r2 = rotatePiece(rotatePiece(L, 0), 0);
    const p0 = L.placed[0].outer, p2 = r2.placed[0].outer;
    expect(p2.length).toBe(p0.length);
    for (let i = 0; i < p0.length; i += 7) {
      expect(p2[i].x).toBeCloseTo(p0[i].x, 6);
      expect(p2[i].y).toBeCloseTo(p0[i].y, 6);
    }
    expect(rotatePiece(L, 0).placed[0].rotation).toBe(L.placed[0].rotation === 180 ? 0 : 180);
  });
  it("una pieza que cruza el corte entre paños se marca", () => {
    expect(L.segments.length).toBeGreaterThan(1);
    const seg = L.segments[0];
    const idx = seg.pieceIndexes[0];
    const b = bbox(L.placed[idx].outer);
    const moved = movePiece(L, idx, 0, seg.endMm - b.maxY + (b.maxY - b.minY) / 3);
    const issue = validateLayout(moved).find((i) => i.idx === idx);
    expect(issue).toBeTruthy();
  });
});

import { mockupLayout } from "./mockup";
import { exportMockupPdf } from "./exportPdf";

describe("mockup plano", () => {
  it("frente y espalda con sus mangas, en una página", async () => {
    const garments: GarmentRequest[] = [{ orderItemId: "a", sizeLabel: "L", variant: "jugador", name: "PEREZ", number: "9" }];
    const { prints } = buildPrintPieces({ pieces: sampleMolds(), assembly: DEFAULT_ASSEMBLY, design: defaultDesignConfig(), garments, measure: approxMeasurer });
    const m = mockupLayout(prints);
    expect(m.views.map((v) => v.title)).toEqual(["FRENTE", "ESPALDA"]);
    for (const v of m.views) {
      expect(v.items).toHaveLength(3); // dos mangas + cuerpo
      expect(v.items[2].print.piece.kind === "frente" || v.items[2].print.piece.kind === "espalda").toBe(true);
      expect(v.items.filter((it) => it.clip)).toHaveLength(2);
    }
    // Las vistas no se pisan: el frente termina antes de que empiece la espalda.
    const xs = (v: (typeof m.views)[number]) => v.items.flatMap((it) => it.print.piece.outline.map((p) => it.transform.a * p.x + it.transform.c * p.y + it.transform.e));
    expect(Math.max(...xs(m.views[0]).filter((x) => x < m.widthMm / 2 + 400))).toBeLessThan(Math.min(...xs(m.views[1])) + 400);
    const bytes = await exportMockupPdf(m, defaultDesignConfig().background);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });
});

import { buildContext, contextGarments } from "./contextBuild";
import { findDesign, orderContexts } from "./contexts";

describe("rollo con varios pedidos", () => {
  it("prendas de cada pedido: artículo × prenda del combo × variante", () => {
    const ctx = orderContexts(
      [{ id: "r1", description: "Combo", article_type_id: "t1" }],
      [{ requirement_id: "r1", variant: "jugador" }, { requirement_id: "r1", variant: "arquero" }],
      [{ id: "c1", article_type_id: "t1", name: "Remera", sort_order: 0 }, { id: "c2", article_type_id: "t1", name: "Short", sort_order: 1 }]
    );
    expect(ctx.map((c) => c.label)).toEqual(["Combo · Remera", "Combo · Short", "Combo · Remera · arquero", "Combo · Short · arquero"]);
  });

  it("niños y adultos por separado cuando se guardó un diseño por grupo de talles", () => {
    const reqs = [{ id: "r1", description: "Remera", article_type_id: null }];
    const items = [
      { requirement_id: "r1", variant: "jugador", size_label: "10" },
      { requirement_id: "r1", variant: "jugador", size_label: "M" },
    ];
    // Sin diseños por grupo: una sola prenda (como siempre).
    expect(orderContexts(reqs, items, []).map((c) => c.label)).toEqual(["Remera"]);
    // Con un diseño de niños guardado: niños y adultos, cada uno con su PDF base.
    const ctx = orderContexts(reqs, items, [], [{ requirement_id: "r1", component_id: null, variant: "jugador", size_group: "nino" }]);
    expect(ctx.map((c) => c.label)).toEqual(["Remera · niños", "Remera · adultos"]);
    expect(ctx.map((c) => c.key)).toEqual(["r1||jugador|nino", "r1||jugador|adulto"]);
    expect(findDesign([{ requirement_id: "r1", component_id: null, variant: "jugador", size_group: "nino" }], "r1", "", "jugador", "adulto")).toBeNull();
  });

  it("dos pedidos con diseños distintos en un mismo rollo (cada pieza con su fondo)", async () => {
    const molds = sampleMolds();
    const itemsA = [{ id: "a1", size_id: null, size_label: "M", individual_name: "PAZ", individual_number: "5", quantity: 2, variant: "jugador", requirement_id: null }];
    const itemsB = [{ id: "b1", size_id: null, size_label: "L", individual_name: null, individual_number: null, quantity: 1, variant: "jugador", requirement_id: null }];
    const tpl = BUILTIN_TEMPLATES.find((t) => t.id === "rayas_horizontales")!;
    const cfgA = defaultDesignConfig();
    cfgA.background = { ...cfgA.background, template: { id: tpl.id, params: templateDefaults(tpl), colors: tpl.defaultColors } };
    const cfgB = defaultDesignConfig();
    cfgB.background = { ...cfgB.background, color: "#00AA00" };
    const A = buildContext({ config: cfgA, pieces: molds, assembly: DEFAULT_ASSEMBLY, custom: [], garments: contextGarments(itemsA, {}, "jugador", null, "A"), measure: approxMeasurer, templateKey: "plantilla:A" });
    const B = buildContext({ config: cfgB, pieces: molds, assembly: DEFAULT_ASSEMBLY, custom: [], garments: contextGarments(itemsB, {}, "jugador", { copy_name: false, copy_number: true }, "B"), measure: approxMeasurer, templateKey: "plantilla:B" });
    expect(A.prints.every((p) => p.bgFile === "plantilla:A")).toBe(true);
    expect(B.prints.every((p) => p.bgColor === "#00AA00" && !p.bgFile)).toBe(true);
    const L = nest([...A.prints, ...B.prints], DEFAULT_SETTINGS);
    expect(L.placed).toHaveLength(A.prints.length + B.prints.length);
    expect(new Set(L.placed.map((p) => p.print.key)).size).toBe(L.placed.length); // claves únicas entre pedidos
    expect(validateLayout(L)).toEqual([]);
    const { bytes } = await exportRollPdf(L, A.design.background, { backgrounds: { "plantilla:A": await A.templatePdf! } });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(0);
  });
});

import { textToPiece } from "./exportPdf";
describe("letra del indicador de talle", () => {
  it("gira y alinea la letra sobre su punto", () => {
    const t = { center: { x: 100, y: 50 }, heightMm: 10 };
    // Horizontal centrada: el centro del texto cae en el punto.
    const m0 = textToPiece({ ...t, rotation: 0, align: "centro" }, 30);
    expect(apply(m0, { x: 15, y: 5 })).toEqual({ x: 100, y: 50 });
    // Vertical (90°): se lee hacia abajo; empezando en el punto.
    const m90 = textToPiece({ ...t, rotation: 90, align: "inicio" }, 30);
    const a = apply(m90, { x: 0, y: 5 }), b = apply(m90, { x: 30, y: 5 });
    expect(a.x).toBeCloseTo(100);
    expect(a.y).toBeCloseTo(50);
    expect(b.x).toBeCloseTo(100);
    expect(b.y).toBeCloseTo(80);
    // 270°: se lee hacia arriba.
    const m270 = textToPiece({ ...t, rotation: 270, align: "centro" }, 30);
    expect(apply(m270, { x: 30, y: 5 }).y).toBeCloseTo(35);
  });

  it("achica los talles largos al largo máximo y pasa giro y alineación", () => {
    const design = defaultDesignConfig();
    design.sizeIndicator = { ...design.sizeIndicator, enabled: true, pieceKind: "espalda", textHeightMm: 12, textMaxWidthMm: 14, textRotation: 90, textAlign: "inicio" };
    const garments: GarmentRequest[] = [{ orderItemId: "a", sizeLabel: "XXL", name: "", number: "", variant: "jugador" }];
    const molds = sampleMolds();
    const { prints } = buildPrintPieces({ pieces: molds.filter((p) => p.sizeLabel === molds[0].sizeLabel).map((p) => ({ ...p, sizeLabel: "XXL" })), assembly: DEFAULT_ASSEMBLY, design, garments, measure: approxMeasurer });
    const tag = prints.flatMap((p) => p.texts).find((t) => t.kind === "talle" && t.rotation === 90);
    expect(tag).toBeTruthy();
    expect(tag!.widthMm).toBeCloseTo(14);
    expect(tag!.heightMm).toBeLessThan(12);
    expect(tag!.align).toBe("inicio");
  });
});

import { packDtf, pngWithDpi, exportDtfPdf } from "./dtf";
describe("DTF en papel", () => {
  const s = { paperWidthMm: 580, paperHeightMm: 1000, roll: true, marginMm: 5, gapMm: 5, allowRotate: true };
  it("acomoda sin pisarse, con la distancia mínima y adentro del papel", () => {
    const L = packDtf(
      [
        { id: "esc", name: "Escudo", widthMm: 80, heightMm: 95, qty: 30 },
        { id: "num", name: "Número", widthMm: 200, heightMm: 250, qty: 6 },
        { id: "spo", name: "Sponsor", widthMm: 250, heightMm: 60, qty: 10 },
      ],
      s
    );
    expect(L.placed.length).toBe(46);
    expect(L.tooBig).toEqual([]);
    for (const p of L.placed) {
      expect(p.x).toBeGreaterThanOrEqual(5 - 1e-6);
      expect(p.y).toBeGreaterThanOrEqual(5 - 1e-6);
      expect(p.x + p.w).toBeLessThanOrEqual(575 + 1e-6);
      expect(p.y + p.h).toBeLessThanOrEqual(995 + 1e-6);
    }
    for (let i = 0; i < L.placed.length; i++)
      for (let j = i + 1; j < L.placed.length; j++) {
        const a = L.placed[i], b = L.placed[j];
        if (a.sheet !== b.sheet) continue;
        const sepX = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
        const sepY = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
        expect(Math.max(sepX, sepY)).toBeGreaterThanOrEqual(5 - 1e-6);
      }
    // Rollo: cada tramo se corta al largo usado.
    expect(L.sheets.every((sh) => sh.heightMm <= 1000)).toBe(true);
  });

  it("avisa lo que no entra y pasa a otra hoja lo que sobra", () => {
    const L = packDtf([{ id: "a", name: "Bandera", widthMm: 900, heightMm: 900, qty: 1 }, { id: "b", name: "Logo", widthMm: 270, heightMm: 400, qty: 5 }], { ...s, paperWidthMm: 297, paperHeightMm: 420, roll: false, allowRotate: false });
    expect(L.tooBig).toEqual(["Bandera"]);
    expect(L.placed.length).toBe(5);
    expect(L.sheets.length).toBe(5);
    expect(L.sheets[0]).toEqual({ widthMm: 297, heightMm: 420 });
  });

  it("PNG con 300 dpi y PDF con una página por tramo", async () => {
    // PNG mínimo 1x1 transparente.
    const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
    const out = pngWithDpi(png, 300);
    const txt = String.fromCharCode(...out);
    expect(txt.indexOf("pHYs")).toBe(37);
    expect(new DataView(out.buffer).getUint32(41)).toBe(11811);
    const L = packDtf([{ id: "p", name: "Logo", widthMm: 100, heightMm: 50, qty: 3 }], s);
    const pdf = await PDFDocument.load(await exportDtfPdf(L, [{ id: "p", kind: "png", bytes: png }]));
    expect(pdf.getPageCount()).toBe(1);
  });
});

import { fitArt, freePiecePrints } from "./freePieces";
describe("banderas (piezas sueltas a medida)", () => {
  it("ajusta el diseño a la medida: llenar, entero y estirar, respetando el dobladillo", () => {
    // Diseño 300×100 en bandera de 150×90 con dobladillo de 20.
    const cubrir = fitArt(300, 100, 1500, 900, 20, "cubrir");
    expect(cubrir.t.a).toBeCloseTo(9); // llena el alto (900/100)
    expect(apply(cubrir.t, { x: 150, y: 50 })).toEqual({ x: 770, y: 470 }); // centro del diseño al centro
    const entero = fitArt(300, 100, 1500, 900, 20, "entero");
    expect(entero.t.a).toBeCloseTo(5); // entra el ancho (1500/300)
    const est = fitArt(300, 100, 1500, 900, 0, "estirar");
    expect(apply(est.t, { x: 300, y: 100 })).toEqual({ x: 1500, y: 900 });
  });

  it("gira 90° la que es más ancha que la tela", () => {
    const files = [{ key: "f", name: "b", bytes: new Uint8Array(), pageWmm: 200, pageHmm: 100 }];
    const [p] = freePiecePrints([{ id: "1", type: "archivo", fileKey: "f", name: "Bandera", widthMm: 2000, heightMm: 1000, copies: 1, fit: "cubrir", hemMm: 20 }], files, [], 1530);
    const b = bbox(p.piece.outline);
    expect(b.maxX).toBeCloseTo(1040);
    expect(b.maxY).toBeCloseTo(2040);
    // El arte girado sigue cayendo adentro de la pieza.
    const c = apply(p.backgroundTransform, { x: 100, y: 50 });
    expect(c.x).toBeCloseTo(520);
    expect(c.y).toBeCloseTo(1020);
    expect(p.noBleed).toBe(true);
  });
});

import { guessKinds, type ImportedPiece } from "./vectorImport";
import { gridUnitY, legGridPoint, yFromShoulderTop } from "./rules";

describe("short", () => {
  // Pierna derecha vista desde afuera: trasero (cintura más alta) a la izquierda.
  const legDer = [
    { x: 140, y: 0 }, { x: 760, y: 60 }, { x: 780, y: 360 }, { x: 850, y: 470 },
    { x: 800, y: 710 }, { x: 25, y: 710 }, { x: 0, y: 470 }, { x: 70, y: 360 },
  ];
  const legIzq = legDer.map((p) => ({ x: 850 - p.x, y: p.y })).reverse();
  const pieces: PatternPiece[] = [
    { id: "d", modelId: "s", sizeLabel: "M", kind: "pierna_der", outline: legDer },
    { id: "i", modelId: "s", sizeLabel: "M", kind: "pierna_izq", outline: legIzq },
  ];

  it("reconoce las piernas y cuál es cuál", () => {
    const imp = [legDer, legIzq].map((outline, k) => ({ outline, kind: "otra", widthMm: 850, heightMm: 710, areaMm2: 1, box: { minX: k * 900, minY: 0, maxX: k * 900 + 850, maxY: 710 }, sizeLabel: null })) as unknown as ImportedPiece[];
    guessKinds(imp);
    expect(imp.map((p) => p.kind)).toEqual(["pierna_der", "pierna_izq"]);
  });

  it("arma las piernas una al lado de la otra aunque el modelo solo tenga reglas de remera", () => {
    const remeraRules = DEFAULT_ASSEMBLY.filter((r) => !r.kind.startsWith("pierna"));
    const t = assemblyTransforms(pieces, remeraRules, 1);
    const d = t.get("d")!, i = t.get("i")!;
    expect(d.e).toBeCloseTo(-425, 1); // centrada en el origen
    expect(i.e).toBeCloseTo(425, 1); // pegada a su derecha
    expect(d.f).toBeCloseTo(i.f, 5); // misma línea de base
  });

  it("en el short la grilla es 10 × 10: décimos del ancho y décimos del alto", () => {
    const leg = pieces[0];
    expect(gridUnit(leg)).toBeCloseTo(85, 5); // 850 / 10
    expect(gridUnitY(leg)).toBeCloseTo(71, 5); // 710 / 10
    expect(yFromShoulderTop(leg, 5)).toBeCloseTo(355, 5);
  });

  it("elementos del short: centro desde la base y el costado, en la grilla 10 × 10", () => {
    const leg = pieces[0]; // 850 × 710, base en y = 710
    expect(legGridPoint(leg, "izquierda", 2, 3)).toEqual({ x: 170, y: 710 - 3 * 71 });
    expect(legGridPoint(leg, "derecha", 1, 0.5).x).toBeCloseTo(850 - 85, 5);
    const el = { id: "e", label: "Escudo", pieceKind: "pierna_izq" as const, side: "derecha" as const, fromSideUnits: 2, fromShoulderTopUnits: 0, fromBaseUnits: 4, widthMm: { adulto: 60, nino: 50 }, aspect: 1 };
    const { center } = placeElement(pieces[1], el);
    expect(center.x).toBeCloseTo(850 - 2 * 85, 5);
    expect(center.y).toBeCloseTo(710 - 4 * 71, 5);
  });

  it("el número del short va en el delantero de la pierna", () => {
    const design = { ...defaultDesignConfig(), elements: [] };
    design.number = { ...design.number, pieceKinds: ["espalda", "pierna_izq"] };
    const { prints } = buildPrintPieces({ pieces, assembly: DEFAULT_ASSEMBLY, design, garments: [{ orderItemId: "a", sizeLabel: "M", number: "10", variant: "jugador" }], measure: approxMeasurer });
    const izq = prints.find((p) => p.piece.kind === "pierna_izq")!;
    const der = prints.find((p) => p.piece.kind === "pierna_der")!;
    const num = izq.texts.find((t) => t.kind === "numero")!;
    expect(num.center.x).toBeLessThan(425); // delantero de la izquierda = mitad izquierda del dibujo
    expect(der.texts.some((t) => t.kind === "numero")).toBe(false);
    expect(izq.texts.some((t) => t.kind === "talle")).toBe(true);
  });
});
