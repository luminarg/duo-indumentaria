import ReactMarkdown from "react-markdown";

// Renderiza el contenido (Markdown) de una página del sitio. Se usa en la
// página pública y en la vista previa del editor del panel, así se ven
// igual. Hereda el color de texto del contenedor (por eso funciona tanto
// sobre el fondo del sitio como sobre el fondo claro del panel). No permite
// HTML crudo — solo el formato de Markdown — así es seguro.
export function PageContent({ content }: { content: string }) {
  return (
    <div className="flex flex-col gap-4 leading-relaxed">
      <ReactMarkdown
        components={{
          h1: ({ children }) => <h2 className="mt-4 text-3xl font-black tracking-tight">{children}</h2>,
          h2: ({ children }) => <h2 className="mt-4 text-2xl font-bold tracking-tight">{children}</h2>,
          h3: ({ children }) => <h3 className="mt-2 text-lg font-semibold">{children}</h3>,
          p: ({ children }) => <p className="opacity-90">{children}</p>,
          ul: ({ children }) => <ul className="ml-5 flex list-disc flex-col gap-1 opacity-90">{children}</ul>,
          ol: ({ children }) => <ol className="ml-5 flex list-decimal flex-col gap-1 opacity-90">{children}</ol>,
          a: ({ href, children }) => (
            <a
              href={href}
              className="font-medium underline underline-offset-2"
              target={href?.startsWith("http") ? "_blank" : undefined}
              rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}
            >
              {children}
            </a>
          ),
          img: ({ src, alt }) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={typeof src === "string" ? src : ""} alt={alt ?? ""} className="w-full rounded-xl object-cover" />
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-current/30 pl-4 italic opacity-80">{children}</blockquote>
          ),
          hr: () => <hr className="my-2 border-current/15" />,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
