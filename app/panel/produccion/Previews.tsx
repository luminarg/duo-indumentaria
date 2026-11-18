"use client";

import { bbox, offset } from "@/lib/produccion/geometry";
import { gridUnit, shoulderTop } from "@/lib/produccion/rules";
import type { Poly, PrintPiece, RollLayout } from "@/lib/produccion/types";

/** Fuentes subidas ya registradas en el navegador: familia CSS y alto de mayúsculas. */
export type FontInfo = Record<string, { family: string; capRatio: number }>;

const pathD = (poly: Poly) => `M${poly.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L")} Z`;

const KIND_LABEL: Record<string, string> = {
  frente: "Frente",
  espalda: "Espalda",
  manga_izq: "Manga izq.",
  manga_der: "Manga der.",
  otra: "Pieza",
};

/**
 * Vista previa de una pieza: línea, contorno láser, grilla de 10 unidades,
 * zona segura, elementos y textos. El arte del fondo no se dibuja acá (sale
 * en el PDF); se usa el color de fondo si hay.
 */
export function PiecePreview({
  print,
  safeMarginMm,
  contourMm,
  bgColor,
  height = 260,
  fontInfo = {},
}: {
  print: PrintPiece;
  fontInfo?: FontInfo;
  safeMarginMm: number;
  contourMm: number;
  bgColor?: string | null;
  height?: number;
}) {
  const { piece } = print;
  const b = bbox(piece.outline);
  const pad = 20;
  const u = gridUnit(piece);
  const top = shoulderTop(piece);
  const outer = offset(piece.outline, contourMm);
  const inner = offset(piece.outline, -safeMarginMm);
  const clipId = `clip-${print.key.replace(/[^a-zA-Z0-9]/g, "")}`;
  const vb = `${b.minX - pad} ${b.minY - pad} ${b.maxX - b.minX + 2 * pad} ${b.maxY - b.minY + 2 * pad}`;
  const lines: number[] = [];
  for (let i = 1; i < 10; i++) lines.push(b.minX + i * u);
  const rows: number[] = [];
  for (let y = top.y + u; y < b.maxY; y += u) rows.push(y);

  return (
    <figure className="flex flex-col items-center gap-1">
      <svg viewBox={vb} height={height} className="max-w-full" role="img" aria-label={`${KIND_LABEL[piece.kind]} talle ${piece.sizeLabel}`}>
        <defs>
          <clipPath id={clipId}>
            <path d={pathD(piece.outline)} />
          </clipPath>
        </defs>
        {outer && <path d={pathD(outer)} fill="#111" />}
        <path d={pathD(piece.outline)} fill={bgColor || "#fafafa"} />
        <g clipPath={`url(#${clipId})`} stroke="#f97316" strokeOpacity={0.35} strokeWidth={1}>
          {lines.map((x) => (
            <line key={`v${x}`} x1={x} y1={b.minY} x2={x} y2={b.maxY} />
          ))}
          {rows.map((y) => (
            <line key={`h${y}`} x1={b.minX} y1={y} x2={b.maxX} y2={y} />
          ))}
        </g>
        {inner && <path d={pathD(inner)} fill="none" stroke="#0ea5e9" strokeWidth={1.2} strokeDasharray="6 5" />}
        {print.elements.map((el) => (
          <g key={el.elementId}>
            <rect
              x={el.center.x - el.widthMm / 2}
              y={el.center.y - el.heightMm / 2}
              width={el.widthMm}
              height={el.heightMm}
              fill="#f97316"
              fillOpacity={0.85}
              rx={4}
            />
            <circle cx={el.center.x} cy={el.center.y} r={3} fill="#111" />
          </g>
        ))}
        {(print.boxes ?? []).map((bx, i) => (
          <rect
            key={`b${i}`}
            x={bx.center.x - bx.widthMm / 2}
            y={bx.center.y - bx.heightMm / 2}
            width={bx.widthMm}
            height={bx.heightMm}
            fill={bx.artPath ? "#f97316" : "none"}
            fillOpacity={bx.artPath ? 0.6 : 0}
            stroke={bx.color}
            strokeWidth={Math.max(bx.strokeMm, 1.5)}
          />
        ))}
        {print.texts.map((t, i) => (
          <text
            key={i}
            x={t.center.x}
            y={t.center.y + t.heightMm / 2}
            textAnchor="middle"
            fontSize={t.heightMm / (fontInfo[t.style.font]?.capRatio ?? 0.72)}
            fontFamily={fontInfo[t.style.font] ? `"${fontInfo[t.style.font].family}"` : "Helvetica, Arial, sans-serif"}
            fontWeight={fontInfo[t.style.font] ? undefined : 700}
            fill={t.style.fill || "#111"}
          >
            {t.text}
          </text>
        ))}
      </svg>
      <figcaption className="text-xs text-zinc-500">
        {KIND_LABEL[piece.kind]} · {piece.sizeLabel}
      </figcaption>
    </figure>
  );
}

/** Vista del rollo armado: contornos de corte y talle de cada pieza. */
export function RollPreview({ layout }: { layout: RollLayout }) {
  const W = layout.settings.rollWidthMm;
  const L = Math.max(layout.lengthMm, 1);
  return (
    <svg viewBox={`0 0 ${W} ${L}`} className="w-full rounded border border-zinc-200 bg-white" role="img" aria-label="Rollo armado">
      {layout.segments.slice(1).map((s) => (
        <line key={s.startMm} x1={0} y1={s.startMm} x2={W} y2={s.startMm} stroke="#ef4444" strokeWidth={4} strokeDasharray="20 14" />
      ))}
      {layout.placed.map((p) => {
        const b = bbox(p.outer);
        return (
          <g key={p.print.key}>
            <path d={pathD(p.outer)} fill="#e4e4e7" stroke="#111" strokeWidth={3} />
            <text x={(b.minX + b.maxX) / 2} y={(b.minY + b.maxY) / 2} textAnchor="middle" fontSize={48} fill="#52525b">
              {p.print.piece.sizeLabel}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
