"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input, Select } from "../../components/ui/Input";
import { freePiecePrints, readFreeFile, type FreeFile, type FreePiece } from "@/lib/produccion/freePieces";
import type { PrintPiece } from "@/lib/produccion/types";

const KIND: Record<string, string> = { frente: "Frente", espalda: "Espalda", manga_izq: "Manga izq.", manga_der: "Manga der.", pierna_izq: "Pierna izq.", pierna_der: "Pierna der.", otra: "Pieza" };

/**
 * Piezas sueltas para sumar al rollo: un archivo con su medida (bandera,
 * cuello, parche) o la reposición de una pieza del pedido que salió fallada.
 * Avisa al padre con las piezas listas para acomodar y los archivos para el PDF.
 */
export function FreePieces({
  prints,
  labelOf,
  usableWidthMm,
  onChange,
}: {
  prints: PrintPiece[];
  /** Cómo nombrar la prenda de una pieza (pedido, nombre, número). */
  labelOf?: (p: PrintPiece) => string;
  /** Ancho útil de la tela: lo que no entra a lo ancho se gira 90°. */
  usableWidthMm?: number;
  onChange: (extra: { prints: PrintPiece[]; files: Record<string, Uint8Array> }) => void;
}) {
  const [items, setItems] = useState<FreePiece[]>([]);
  const [files, setFiles] = useState<FreeFile[]>([]);
  const [repoKey, setRepoKey] = useState("");
  const [repoCopies, setRepoCopies] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const extra = useMemo(() => freePiecePrints(items, files, prints, usableWidthMm), [items, files, prints, usableWidthMm]);
  // Avisa solo cuando cambian las piezas sueltas (no cuando cambian las del
  // pedido: el rollo combinado las actualiza justo después de armar, y eso
  // borraba el rollo recién armado).
  useEffect(() => {
    onChange({ prints: extra, files: Object.fromEntries(files.map((f) => [f.key, f.bytes])) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, files, usableWidthMm]);

  const options = useMemo(
    () =>
      prints.map((p) => ({
        key: p.key,
        label: `${KIND[p.piece.kind] ?? p.piece.kind} · ${p.piece.sizeLabel}${labelOf ? ` · ${labelOf(p)}` : p.garment.name || p.garment.number ? ` · ${[p.garment.name, p.garment.number].filter(Boolean).join(" ")}` : ""}`,
      })),
    [prints, labelOf]
  );

  const onFile = async (f: File) => {
    setError(null);
    try {
      const read = await readFreeFile(f.name, await f.arrayBuffer(), f.type);
      const key = `libre-archivo:${Date.now()}:${f.name}`;
      setFiles((x) => [...x, { ...read, key }]);
      const name = f.name.replace(/\.[^.]+$/, "");
      setItems((x) => [
        ...x,
        { id: String(Date.now()), type: "archivo", fileKey: key, name, widthMm: Math.round(read.pageWmm), heightMm: Math.round(read.pageHmm), copies: 1 },
      ]);
    } catch (e) {
      setError("No se pudo leer el archivo: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  const patch = (id: string, p: Partial<Extract<FreePiece, { type: "archivo" }>> & { copies?: number }) =>
    setItems((x) => x.map((it) => (it.id === id ? ({ ...it, ...p } as FreePiece) : it)));

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-medium text-zinc-900">Piezas sueltas para el rollo</h2>
        <p className="text-xs text-zinc-500">
          Banderas, cuellos, parches o la reposición de una pieza fallada. Se suman al rollo al armarlo (no quedan guardadas en el pedido).
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-zinc-700">
          Archivo (PDF, PNG o JPG)
          <input type="file" accept="application/pdf,image/png,image/jpeg" className="mt-1 block text-sm" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
        </label>
        {options.length > 0 && (
          <>
            <div className="min-w-64 flex-1">
              <Select label="Reponer una pieza del pedido" value={repoKey} onChange={(e) => setRepoKey(e.target.value)}>
                <option value="">Elegí la pieza…</option>
                {options.map((o) => (
                  <option key={o.key} value={o.key}>{o.label}</option>
                ))}
              </Select>
            </div>
            <div className="w-24">
              <Input label="Copias" type="number" min={1} value={repoCopies} onChange={(e) => setRepoCopies(Math.max(1, Number(e.target.value) || 1))} />
            </div>
            <Button
              variant="secondary"
              type="button"
              disabled={!repoKey}
              onClick={() => {
                const o = options.find((x) => x.key === repoKey);
                if (!o) return;
                setItems((x) => [...x, { id: String(Date.now()), type: "reposicion", printKey: o.key, label: o.label, copies: repoCopies }]);
                setRepoKey("");
                setRepoCopies(1);
              }}
            >
              Sumar reposición
            </Button>
          </>
        )}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {items.length > 0 && (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-zinc-500">
            <tr>
              <th className="py-1 font-medium">Pieza</th>
              <th className="py-1 font-medium">Ancho (cm)</th>
              <th className="py-1 font-medium">Alto (cm)</th>
              <th className="py-1 font-medium">Copias</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-t border-zinc-100">
                <td className="py-1.5 pr-2">{it.type === "archivo" ? it.name : `Reposición: ${it.label}`}</td>
                <td className="py-1.5 pr-2">
                  {it.type === "archivo" ? (
                    <input
                      type="number"
                      step={0.5}
                      className="w-20 rounded border border-zinc-300 px-2 py-1"
                      value={it.widthMm / 10}
                      onChange={(e) => {
                        const w = Math.max(1, Number(e.target.value) * 10);
                        const f = files.find((x) => x.key === it.fileKey);
                        // Mantiene la proporción del archivo.
                        patch(it.id, { widthMm: w, heightMm: f ? Math.round((w * f.pageHmm) / f.pageWmm) : it.heightMm });
                      }}
                    />
                  ) : (
                    "—"
                  )}
                </td>
                <td className="py-1.5 pr-2">
                  {it.type === "archivo" ? (
                    <input
                      type="number"
                      step={0.5}
                      className="w-20 rounded border border-zinc-300 px-2 py-1"
                      value={it.heightMm / 10}
                      onChange={(e) => patch(it.id, { heightMm: Math.max(1, Number(e.target.value) * 10) })}
                    />
                  ) : (
                    "—"
                  )}
                </td>
                <td className="py-1.5 pr-2">
                  <input
                    type="number"
                    min={1}
                    className="w-16 rounded border border-zinc-300 px-2 py-1"
                    value={it.copies}
                    onChange={(e) => patch(it.id, { copies: Math.max(1, Number(e.target.value) || 1) })}
                  />
                </td>
                <td className="py-1.5 text-right">
                  <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => setItems((x) => x.filter((y) => y.id !== it.id))}>
                    Quitar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
