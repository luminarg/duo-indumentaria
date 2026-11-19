"use client";

import { useMemo, useRef, useState } from "react";
import { RotateCw, Undo2 } from "lucide-react";
import { bbox } from "@/lib/produccion/geometry";
import { movePiece, rotatePiece, validateLayout, type PieceIssue } from "@/lib/produccion/rollEdit";
import type { Poly, RollLayout } from "@/lib/produccion/types";
import { Button } from "../../components/ui/Button";

const pathD = (poly: Poly) => (poly.length ? "M" + poly.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L") + " Z" : "");

const KIND_COLORS: Record<string, string> = { frente: "#dbeafe", espalda: "#dcfce7", manga_izq: "#fef3c7", manga_der: "#fde68a", otra: "#e4e4e7" };

/**
 * Vista del rollo con retoque a mano: tocar una pieza la selecciona,
 * arrastrarla la mueve y "Girar 180°" la da vuelta. Cada cambio se valida
 * (separación, ancho útil, paños); si algo no cumple, la pieza queda en rojo
 * y no se puede exportar hasta corregirlo.
 */
export function RollEditor({
  layout,
  onChange,
  labelOf,
}: {
  layout: RollLayout;
  onChange: (l: RollLayout) => void;
  /** Texto de cada pieza (por defecto, el talle). */
  labelOf?: (idx: number) => string;
}) {
  const W = layout.settings.rollWidthMm;
  const L = Math.max(layout.lengthMm, 1);
  const svgRef = useRef<SVGSVGElement>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ idx: number; x0: number; y0: number; dx: number; dy: number } | null>(null);
  const [history, setHistory] = useState<RollLayout[]>([]);
  const issues: PieceIssue[] = useMemo(() => validateLayout(layout), [layout]);
  const bad = useMemo(() => new Map(issues.map((i) => [i.idx, i.message])), [issues]);

  const toMm = (e: React.PointerEvent) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const m = svg.getScreenCTM();
    const p = m ? pt.matrixTransform(m.inverse()) : pt;
    return { x: p.x, y: p.y };
  };

  const commit = (next: RollLayout) => {
    setHistory((h) => [...h.slice(-30), layout]);
    onChange(next);
  };

  const onDown = (idx: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = toMm(e);
    setSelected(idx);
    setDrag({ idx, x0: p.x, y0: p.y, dx: 0, dy: 0 });
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const p = toMm(e);
    setDrag({ ...drag, dx: p.x - drag.x0, dy: p.y - drag.y0 });
  };
  const onUp = () => {
    if (!drag) return;
    const dx = Math.round(drag.dx * 2) / 2;
    const dy = Math.round(drag.dy * 2) / 2;
    setDrag(null);
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
    commit(movePiece(layout, drag.idx, dx, dy));
  };
  const nudge = (dx: number, dy: number) => selected !== null && commit(movePiece(layout, selected, dx, dy));

  const sel = selected !== null ? layout.placed[selected] : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-xs text-zinc-500">Retoque a mano: tocá una pieza y arrastrala, o usá los botones.</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" type="button" disabled={selected === null} onClick={() => selected !== null && commit(rotatePiece(layout, selected))}>
            <RotateCw className="mr-1 h-4 w-4" /> Girar 180°
          </Button>
          {[
            ["←", -5, 0],
            ["→", 5, 0],
            ["↑", 0, -5],
            ["↓", 0, 5],
          ].map(([t, dx, dy]) => (
            <Button key={t as string} variant="secondary" size="sm" type="button" disabled={selected === null} onClick={() => nudge(dx as number, dy as number)} title="Mover 5 mm">
              {t}
            </Button>
          ))}
          <Button
            variant="secondary"
            size="sm"
            type="button"
            disabled={!history.length}
            onClick={() => {
              const prev = history[history.length - 1];
              setHistory((h) => h.slice(0, -1));
              if (prev) onChange(prev);
            }}
          >
            <Undo2 className="mr-1 h-4 w-4" /> Deshacer
          </Button>
        </div>
      </div>
      {sel && (
        <p className={`text-xs ${bad.has(selected!) ? "text-red-600" : "text-zinc-600"}`}>
          {sel.print.piece.kind.replace("_", " ")} · talle {sel.print.piece.sizeLabel}
          {sel.rotation === 180 ? " · girada 180°" : ""}
          {bad.has(selected!) ? ` — ${bad.get(selected!)}` : " — ok"}
        </p>
      )}
      {issues.length > 0 && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-800">
          {issues.length} {issues.length === 1 ? "pieza no cumple" : "piezas no cumplen"} las reglas (en rojo). Corregilas antes de exportar.
        </p>
      )}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${L}`}
        className="w-full touch-none select-none rounded border border-zinc-200 bg-white"
        role="img"
        aria-label="Rollo armado"
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
        onPointerDown={(e) => {
          if (e.target === svgRef.current) setSelected(null);
        }}
      >
        <rect x={layout.settings.edgeMarginMm} y={0} width={W - 2 * layout.settings.edgeMarginMm} height={L} fill="none" stroke="#e4e4e7" strokeWidth={3} strokeDasharray="12 10" pointerEvents="none" />
        {layout.segments.slice(1).map((s) => (
          <line key={s.startMm} x1={0} y1={s.startMm} x2={W} y2={s.startMm} stroke="#ef4444" strokeWidth={4} strokeDasharray="20 14" pointerEvents="none" />
        ))}
        {layout.segments.map((s) =>
          s.collars ? (
            <g key={"c" + s.startMm} pointerEvents="none">
              {Array.from({ length: s.collars.strips }, (_, i) => (
                <rect
                  key={i}
                  x={layout.settings.edgeMarginMm}
                  y={s.collars!.startMm + i * s.collars!.stripHeightMm}
                  width={W - 2 * layout.settings.edgeMarginMm}
                  height={s.collars!.stripHeightMm}
                  fill={s.collars!.color}
                  stroke={s.collars!.separatorColor}
                  strokeWidth={3}
                />
              ))}
            </g>
          ) : null
        )}
        {layout.placed.map((p, i) => {
          const b = bbox(p.outer);
          const moving = drag?.idx === i;
          const isBad = bad.has(i);
          return (
            <g key={p.print.key} transform={moving ? `translate(${drag!.dx} ${drag!.dy})` : undefined} onPointerDown={onDown(i)} style={{ cursor: "grab" }}>
              <path
                d={pathD(p.outer)}
                fill={isBad ? "#fecaca" : (KIND_COLORS[p.print.piece.kind] ?? "#e4e4e7")}
                stroke={selected === i ? "#2563eb" : isBad ? "#dc2626" : "#111"}
                strokeWidth={selected === i ? 8 : 3}
              />
              <text x={(b.minX + b.maxX) / 2} y={(b.minY + b.maxY) / 2} textAnchor="middle" dominantBaseline="middle" fontSize={44} fill="#3f3f46" pointerEvents="none">
                {labelOf ? labelOf(i) : p.print.piece.sizeLabel}
                {p.rotation === 180 ? " ↻" : ""}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
