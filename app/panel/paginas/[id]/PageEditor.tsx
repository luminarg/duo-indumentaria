"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bold, Heading2, Heading3, List, Link2, ImagePlus, Minus, Eye, Pencil } from "lucide-react";
import { updatePage, deletePage, uploadPageImage } from "../actions";
import { slugify } from "@/lib/sitePages";
import { Card } from "../../../components/ui/Card";
import { Input, Textarea } from "../../../components/ui/Input";
import { Button } from "../../../components/ui/Button";
import { PageContent } from "../../../components/PageContent";
import { cn } from "@/lib/cn";

type SitePage = {
  id: string;
  title: string;
  slug: string;
  content: string;
  published: boolean;
  show_in_menu: boolean;
  sort_order: number;
  seo_title: string | null;
  seo_description: string | null;
};

export function PageEditor({ page, siteUrl }: { page: SitePage; siteUrl: string }) {
  const router = useRouter();
  const [title, setTitle] = useState(page.title);
  const [slug, setSlug] = useState(page.slug);
  // Mientras no toques la dirección a mano, se arma sola a partir del título.
  const [slugTouched, setSlugTouched] = useState(!page.slug.startsWith("nueva-pagina-"));
  const [content, setContent] = useState(page.content);
  const [published, setPublished] = useState(page.published);
  const [showInMenu, setShowInMenu] = useState(page.show_in_menu);
  const [sortOrder, setSortOrder] = useState(page.sort_order);
  const [seoTitle, setSeoTitle] = useState(page.seo_title ?? "");
  const [seoDescription, setSeoDescription] = useState(page.seo_description ?? "");
  const [mode, setMode] = useState<"editar" | "vista">("editar");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [savedSlug, setSavedSlug] = useState(page.slug);
  const [isPending, startTransition] = useTransition();
  const [isUploading, startUpload] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleTitleChange(value: string) {
    setTitle(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  // Inserta formato de Markdown donde está el cursor (o alrededor del
  // texto seleccionado), así no hace falta saber la sintaxis.
  function wrapSelection(before: string, after: string, placeholder: string) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = content.slice(start, end) || placeholder;
    const next = content.slice(0, start) + before + selected + after + content.slice(end);
    setContent(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  }

  function prefixLine(prefix: string, placeholder: string) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const lineStart = content.lastIndexOf("\n", start - 1) + 1;
    const lineEnd = content.indexOf("\n", start);
    const line = content.slice(lineStart, lineEnd === -1 ? content.length : lineEnd);
    const newLine = prefix + (line.replace(/^(#{1,3} |- )/, "") || placeholder);
    const next = content.slice(0, lineStart) + newLine + content.slice(lineEnd === -1 ? content.length : lineEnd);
    setContent(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(lineStart + newLine.length, lineStart + newLine.length);
    });
  }

  function insertBlock(text: string) {
    const ta = textareaRef.current;
    const pos = ta ? ta.selectionStart : content.length;
    const needsNewline = pos > 0 && content[pos - 1] !== "\n";
    const insert = (needsNewline ? "\n\n" : "") + text + "\n\n";
    setContent(content.slice(0, pos) + insert + content.slice(pos));
    requestAnimationFrame(() => {
      ta?.focus();
      ta?.setSelectionRange(pos + insert.length, pos + insert.length);
    });
  }

  function handleImageSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    const formData = new FormData();
    formData.append("image", file);
    startUpload(async () => {
      const result = await uploadPageImage(formData);
      if (!result.ok) setError(result.error);
      else insertBlock(`![${file.name.replace(/\.[^.]+$/, "")}](${result.url})`);
      if (fileRef.current) fileRef.current.value = "";
    });
  }

  function handleSave() {
    setError(null);
    setMessage(null);
    const formData = new FormData();
    formData.append("title", title);
    formData.append("slug", slug);
    formData.append("content", content);
    if (published) formData.append("published", "on");
    if (showInMenu) formData.append("show_in_menu", "on");
    formData.append("sort_order", String(sortOrder));
    formData.append("seo_title", seoTitle);
    formData.append("seo_description", seoDescription);
    startTransition(async () => {
      const result = await updatePage(page.id, formData);
      if (!result.ok) {
        setError(result.error);
      } else {
        setSlug(result.slug);
        setSavedSlug(result.slug);
        setMessage(published ? "Guardado — la página ya está publicada." : "Guardado como borrador.");
        router.refresh();
      }
    });
  }

  function handleDelete() {
    if (!window.confirm(`¿Borrar la página "${title}"? No se puede deshacer.`)) return;
    startTransition(async () => {
      const result = await deletePage(page.id);
      if (!result.ok) setError(result.error);
      else router.push("/panel/paginas");
    });
  }

  const toolbarButton =
    "flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50";

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      {error && <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
      {message && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-green-50 px-4 py-3 text-sm text-green-800">
          {message}
          {published && (
            <a href={`/${savedSlug}`} target="_blank" rel="noopener noreferrer" className="font-medium underline">
              Ver página
            </a>
          )}
        </div>
      )}

      <Card className="grid gap-3 sm:grid-cols-2">
        <Input label="Título" value={title} onChange={(e) => handleTitleChange(e.target.value)} />
        <div className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
          Dirección
          <div className="mt-1 flex items-center rounded-md border border-zinc-300 bg-white text-sm">
            <span className="pl-3 text-zinc-400">/</span>
            <input
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"));
              }}
              className="w-full rounded-md px-1 py-2 text-zinc-900 focus:outline-none"
            />
          </div>
          <span className="truncate text-[11px] font-normal text-zinc-400">
            {siteUrl.replace(/^https?:\/\//, "")}/{slug || "…"}
          </span>
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
          Publicada (visible en el sitio)
        </label>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input type="checkbox" checked={showInMenu} onChange={(e) => setShowInMenu(e.target.checked)} />
            Mostrar en el menú
          </label>
          <label className="flex items-center gap-2 text-xs text-zinc-500">
            Orden
            <input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
              className="w-16 rounded-md border border-zinc-300 px-2 py-1 text-sm"
            />
          </label>
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-zinc-900">Contenido</h2>
          <div className="flex rounded-md border border-zinc-200 bg-zinc-50 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setMode("editar")}
              className={cn("flex items-center gap-1 rounded px-2.5 py-1", mode === "editar" && "bg-white shadow-sm")}
            >
              <Pencil className="h-3.5 w-3.5" /> Editar
            </button>
            <button
              type="button"
              onClick={() => setMode("vista")}
              className={cn("flex items-center gap-1 rounded px-2.5 py-1", mode === "vista" && "bg-white shadow-sm")}
            >
              <Eye className="h-3.5 w-3.5" /> Vista previa
            </button>
          </div>
        </div>

        {mode === "editar" ? (
          <>
            <div className="mb-2 flex flex-wrap gap-1.5">
              <button type="button" className={toolbarButton} onClick={() => prefixLine("## ", "Título de sección")}>
                <Heading2 className="h-3.5 w-3.5" /> Título
              </button>
              <button type="button" className={toolbarButton} onClick={() => prefixLine("### ", "Subtítulo")}>
                <Heading3 className="h-3.5 w-3.5" /> Subtítulo
              </button>
              <button type="button" className={toolbarButton} onClick={() => wrapSelection("**", "**", "texto en negrita")}>
                <Bold className="h-3.5 w-3.5" /> Negrita
              </button>
              <button type="button" className={toolbarButton} onClick={() => prefixLine("- ", "elemento de la lista")}>
                <List className="h-3.5 w-3.5" /> Lista
              </button>
              <button
                type="button"
                className={toolbarButton}
                onClick={() => wrapSelection("[", "](https://)", "texto del link")}
              >
                <Link2 className="h-3.5 w-3.5" /> Link
              </button>
              <button
                type="button"
                className={toolbarButton}
                disabled={isUploading}
                onClick={() => fileRef.current?.click()}
              >
                <ImagePlus className="h-3.5 w-3.5" /> {isUploading ? "Subiendo..." : "Imagen"}
              </button>
              <button type="button" className={toolbarButton} onClick={() => insertBlock("---")}>
                <Minus className="h-3.5 w-3.5" /> Separador
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelected} />
            </div>
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Escribí el contenido de la página. Usá los botones de arriba para dar formato."
              className="min-h-[22rem] w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-sm leading-relaxed text-zinc-900 focus:border-zinc-500 focus:outline-none"
            />
            <p className="mt-1.5 text-[11px] text-zinc-400">
              Dejá una línea en blanco entre párrafos. Los símbolos (## , **, - ) son el formato: se ven bien en la
              vista previa y en el sitio.
            </p>
          </>
        ) : (
          <div className="min-h-[22rem] rounded-md border border-zinc-200 bg-white p-5 text-zinc-900">
            <h1 className="mb-4 text-3xl font-black tracking-tight">{title}</h1>
            {content.trim() ? (
              <PageContent content={content} />
            ) : (
              <p className="text-sm text-zinc-400">Todavía no hay contenido.</p>
            )}
          </div>
        )}
      </Card>

      <Card className="grid gap-3">
        <h2 className="text-sm font-semibold text-zinc-900">Google (opcional)</h2>
        <Input
          label="Título para Google"
          value={seoTitle}
          onChange={(e) => setSeoTitle(e.target.value)}
          placeholder={title}
          hint="Si lo dejás vacío se usa el título de la página."
        />
        <Textarea
          label="Descripción para Google"
          value={seoDescription}
          onChange={(e) => setSeoDescription(e.target.value)}
          hint={`${seoDescription.length}/160 — resumen corto que aparece debajo del título en los resultados.`}
        />
      </Card>

      <div className="flex items-center justify-between gap-3">
        <Button type="button" onClick={handleSave} disabled={isPending}>
          {isPending ? "Guardando..." : "Guardar"}
        </Button>
        <button type="button" onClick={handleDelete} disabled={isPending} className="text-sm text-red-600 hover:underline">
          Borrar página
        </button>
      </div>
    </div>
  );
}
