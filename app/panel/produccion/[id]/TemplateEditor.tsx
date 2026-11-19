"use client";

import { useEffect, useState } from "react";
import { Button } from "../../../components/ui/Button";
import { Input, Select } from "../../../components/ui/Input";
import {
  BUILTIN_TEMPLATES,
  CUSTOM_PARAMS,
  findTemplate,
  renderTemplate,
  templateDefaults,
  type CanvasInfo,
  type CustomTemplate,
  type ParamDef,
  type TemplateSpec,
} from "@/lib/produccion/templates";
import { rasterizeTemplate } from "@/lib/produccion/templateRaster";

const COLOR_LABELS = ["Color 1 (fondo)", "Color 2", "Color 3", "Color 4"];

/** Elegir plantilla, ajustar sus medidas y colores, y subir plantillas propias. */
export function TemplateEditor({
  spec,
  onChange,
  canvas,
  custom,
  onUpload,
  onDeleteCustom,
  sleeveColor,
  onSleeveColor,
}: {
  spec: TemplateSpec;
  onChange: (s: TemplateSpec) => void;
  canvas: CanvasInfo;
  custom: CustomTemplate[];
  onUpload: (f: File, name: string) => void;
  onDeleteCustom: (id: string) => void;
  sleeveColor: string | null | undefined;
  onSleeveColor: (c: string | null) => void;
}) {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [uploadName, setUploadName] = useState("");

  // Miniaturas de la galería (con los colores de cada plantilla).
  useEffect(() => {
    let alive = true;
    const small = { ...canvas };
    Promise.resolve().then(() => {
      const out: Record<string, string> = {};
      for (const t of BUILTIN_TEMPLATES) out[t.id] = rasterizeTemplate(renderTemplate({ id: t.id, params: templateDefaults(t), colors: t.defaultColors }, small), small.widthMm, small.heightMm, 220);
      for (const t of custom) {
        const id = `custom:${t.id}`;
        const colors = ["#0F2C5C", "#1EA7E1", "#FFFFFF", "#C8102E"].slice(0, Math.max(1, t.slots));
        out[id] = rasterizeTemplate(renderTemplate({ id, params: { ajuste: "cubrir", zoom: 100, subir: 0 }, colors }, small, custom), small.widthMm, small.heightMm, 220);
      }
      if (alive) setThumbs(out);
    });
    return () => {
      alive = false;
    };
  }, [canvas, custom]);

  const { def, custom: ct } = findTemplate(spec.id, custom);
  const params: ParamDef[] = def ? def.params : CUSTOM_PARAMS;
  const slots = def ? def.slots : Math.max(1, ct?.slots ?? 1);

  const pick = (id: string) => {
    const f = findTemplate(id, custom);
    if (f.def) onChange({ id, params: templateDefaults(f.def), colors: [...f.def.defaultColors] });
    else if (f.custom) {
      const keep = spec.colors.length ? spec.colors : ["#0F2C5C"];
      const colors = Array.from({ length: Math.max(1, f.custom.slots) }, (_, i) => keep[i] ?? ["#0F2C5C", "#1EA7E1", "#FFFFFF", "#C8102E"][i]);
      onChange({ id, params: { ajuste: "cubrir", zoom: 100, subir: 0 }, colors });
    }
    if (id === "chevron") onSleeveColor(f.def?.defaultColors[0] ?? null);
  };
  const setParam = (k: string, v: number | string | boolean) => onChange({ ...spec, params: { ...spec.params, [k]: v } });
  const setColor = (i: number, v: string) => {
    const colors = [...spec.colors];
    while (colors.length <= i) colors.push("#FFFFFF");
    colors[i] = v.toUpperCase();
    onChange({ ...spec, colors });
  };

  const groups = new Map<string, { id: string; name: string }[]>();
  for (const t of BUILTIN_TEMPLATES) (groups.get(t.category) ?? groups.set(t.category, []).get(t.category)!).push({ id: t.id, name: t.name });
  if (custom.length) groups.set("Mis plantillas", custom.map((t) => ({ id: `custom:${t.id}`, name: t.name })));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex max-h-72 flex-col gap-3 overflow-y-auto pr-1">
        {[...groups.entries()].map(([cat, list]) => (
          <div key={cat}>
            <div className="mb-1 text-xs font-medium text-zinc-500">{cat}</div>
            <div className="grid grid-cols-3 gap-2">
              {list.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => pick(t.id)}
                  className={`flex flex-col gap-1 rounded-md border p-1 text-left text-[11px] ${spec.id === t.id ? "border-zinc-900 ring-1 ring-zinc-900" : "border-zinc-200 hover:border-zinc-400"}`}
                  title={t.name}
                >
                  {thumbs[t.id] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumbs[t.id]} alt="" className="aspect-[2/1] w-full rounded-sm object-cover" />
                  ) : (
                    <span className="aspect-[2/1] w-full rounded-sm bg-zinc-100" />
                  )}
                  <span className="truncate">{t.name}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: slots }, (_, i) => (
          <label key={i} className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
            {COLOR_LABELS[i]}
            <span className="flex items-center gap-2">
              <input type="color" value={spec.colors[i] ?? "#ffffff"} onChange={(e) => setColor(i, e.target.value)} className="h-8 w-10 rounded border border-zinc-300" />
              <input
                value={spec.colors[i] ?? ""}
                onChange={(e) => /^#[0-9a-fA-F]{6}$/.test(e.target.value) && setColor(i, e.target.value)}
                onBlur={(e) => /^#[0-9a-fA-F]{6}$/.test(e.target.value) && setColor(i, e.target.value)}
                className="w-24 rounded border border-zinc-300 px-2 py-1 font-mono text-xs text-zinc-800"
                placeholder="#RRGGBB"
              />
            </span>
          </label>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {params.map((p) => {
          const v = spec.params[p.key] ?? p.default;
          if (p.type === "range")
            return (
              <label key={p.key} className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
                <span className="flex justify-between">
                  <span>{p.label}</span>
                  <span className="font-mono text-zinc-700">
                    {String(v)}
                    {p.unit ?? ""}
                  </span>
                </span>
                <input type="range" min={p.min} max={p.max} step={p.step} value={Number(v)} onChange={(e) => setParam(p.key, Number(e.target.value))} />
              </label>
            );
          if (p.type === "select")
            return (
              <Select key={p.key} label={p.label} value={String(v)} onChange={(e) => setParam(p.key, e.target.value)}>
                {p.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            );
          return (
            <label key={p.key} className="flex items-center gap-2 text-sm text-zinc-700">
              <input type="checkbox" checked={Boolean(v)} onChange={(e) => setParam(p.key, e.target.checked)} />
              {p.label}
            </label>
          );
        })}
      </div>

      <div className="flex flex-col gap-1">
        <Select label="Mangas" value={sleeveColor ? "liso" : "diseno"} onChange={(e) => onSleeveColor(e.target.value === "liso" ? (spec.colors[0] ?? "#FFFFFF") : null)}>
          <option value="diseno">Con el diseño</option>
          <option value="liso">Color liso</option>
        </Select>
        {sleeveColor && (
          <label className="flex items-center gap-2 text-xs text-zinc-600">
            Color de las mangas
            <input type="color" value={sleeveColor} onChange={(e) => onSleeveColor(e.target.value.toUpperCase())} className="h-7 w-10 rounded border border-zinc-300" />
          </label>
        )}
      </div>

      <details className="rounded-md border border-zinc-200 p-2 text-sm">
        <summary className="cursor-pointer text-zinc-700">Subir una plantilla propia</summary>
        <div className="mt-2 flex flex-col gap-2 text-xs text-zinc-600">
          <p>
            Dibujala en Corel (cualquier tamaño) y exportala a SVG o PDF. Pintá con <b>rojo puro</b> (#FF0000) lo que va en Color 1, <b>verde puro</b> (#00FF00) en Color 2,
            <b> azul puro</b> (#0000FF) en Color 3 y <b>amarillo puro</b> (#FFFF00) en Color 4. Los demás colores quedan fijos.
          </p>
          <Input label="Nombre" value={uploadName} onChange={(e) => setUploadName(e.target.value)} placeholder="Rayo lateral" />
          <input
            type="file"
            accept=".svg,image/svg+xml,application/pdf"
            className="block w-full text-sm"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f, uploadName.trim() || f.name.replace(/\.(svg|pdf)$/i, ""));
              e.target.value = "";
            }}
          />
          {ct && (
            <Button variant="secondary" type="button" onClick={() => onDeleteCustom(ct.id)}>
              Borrar «{ct.name}»
            </Button>
          )}
        </div>
      </details>
    </div>
  );
}
