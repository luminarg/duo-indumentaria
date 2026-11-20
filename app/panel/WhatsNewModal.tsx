"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Scissors,
  Ruler,
  Layers,
  Puzzle,
  Shirt,
  Printer,
  Download,
  Type,
  Wrench,
  Sparkles,
} from "lucide-react";
import { Modal } from "../components/ui/Modal";
import { Button } from "../components/ui/Button";
import { markWhatsNewSeen } from "./actions";

type Item = { icon: typeof Scissors; title: string; body: string; href?: string };

const SECTIONS: { title: string; items: Item[] }[] = [
  {
    title: "Producción: cómo se usa",
    items: [
      {
        icon: Scissors,
        title: "Del pedido al rollo",
        body: "En Producción elegís el pedido → el molde → subís el diseño del talle base (PDF de Corel) o armás uno con plantillas. La app escala el diseño a todos los talles, pone escudo, sponsors, nombre, número y el talle en el ruedo, y con \"Armar rollo\" acomoda las piezas en la tela. Después \"Descargar rollo\" (PDF) y \"Guardar rollo\" (queda en el pedido y lo pasa a sublimación).",
        href: "/panel/produccion",
      },
      {
        icon: Shirt,
        title: "Mockup para mandar al cliente",
        body: "En el mismo pedido, \"Generar mockup\": la remera Duo (foto blanca de la marca) con el diseño puesto, frente y espalda. Se baja en PNG o PDF, o queda guardado en el pedido con \"Guardar en el pedido\".",
      },
      {
        icon: Printer,
        title: "Abrir el PDF en Corel",
        body: "Importá el PDF con la opción \"Convertir objetos reutilizables en símbolos\" tildada. Así los degradés y transparencias salen bien en todos los talles. Para tocar una pieza sola: clic derecho → \"Revertir a objetos\".",
      },
    ],
  },
  {
    title: "Nuevo",
    items: [
      {
        icon: Layers,
        title: "DTF en papel",
        body: "Producción → \"DTF en papel\". Subís los diseños (PDF, PNG o JPG), ponés ancho y cantidad de cada uno, elegís el papel (rollo de 58/60/30 cm, A3, A4 u otra medida), margen y distancia mínima. \"Acomodar en el papel\" los distribuye sin pisarse; sale en PDF y en PNG sin fondo a 300 dpi (un PNG por tramo; si son varios, en un .zip).",
        href: "/panel/produccion/dtf",
      },
      {
        icon: Puzzle,
        title: "Piezas sueltas en el rollo",
        body: "Arriba de la tarjeta \"Rollo\": subí un archivo con su medida y copias (bandera, cuello, parche) o elegí una pieza del pedido para reponer una fallada (ej. \"Manga der. · M · Pérez 10\"). Se suman al armar el rollo; no quedan guardadas en el pedido.",
      },
      {
        icon: Layers,
        title: "Trabajos libres en el rollo con varios pedidos",
        body: "En \"Rollo con varios pedidos\" ahora aparecen también los trabajos libres que tengan el diseño guardado (\"Trabajo libre · cliente\"). Se tildan junto con los pedidos y van todos al mismo rollo.",
        href: "/panel/produccion/rollo-combinado",
      },
      {
        icon: Download,
        title: "Bajar un talle solo",
        body: "Al lado de \"Bajar talles\" elegí \"Solo XL\" (o el que sea): baja ese talle con el diseño escalado, sin nombre ni número — aunque ese talle no esté en el pedido. Con \"Todos los del pedido\" baja una página por talle.",
      },
    ],
  },
  {
    title: "Cambios y arreglos",
    items: [
      {
        icon: Ruler,
        title: "Ancho de tela y paños",
        body: "Antes de \"Armar rollo\" está el ancho de tela (en cm): cambialo según la tela y queda recordado en esa compu. Los paños salen por defecto uno al lado del otro, separados 50 cm, como los arma el que imprime.",
      },
      {
        icon: Type,
        title: "Letra del indicador de talle",
        body: "En la tarjeta del indicador: posición en % (desde la izquierda y desde arriba), giro (horizontal, vertical, dada vuelta), alineación y largo máximo — si el talle es largo (2XL, 10) la letra se achica sola. La fuente elegida se usa en la vista previa y en el PDF.",
      },
      {
        icon: Wrench,
        title: "Arreglos",
        body: "Los degradés con transparencia ya no salen sólidos en Corel en los talles escalados. El mockup encastra bien la manga en la sisa y no deja huecos en el cuello. Los PDF llevan el perfil de color sRGB.",
      },
    ],
  },
];

export function WhatsNewModal({ initialOpen }: { initialOpen: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  const [, startTransition] = useTransition();

  function handleClose() {
    setOpen(false);
    startTransition(() => {
      markWhatsNewSeen();
    });
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Novedades de Producción"
      subtitle="Lo que se agregó y cambió — explicado para que lo uses sin vueltas"
      footer={
        <Button type="button" onClick={handleClose} className="w-full justify-center">
          Entendido, empezar a usarlo
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        {SECTIONS.map((sec) => (
          <section key={sec.title} className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{sec.title}</h3>
            {sec.items.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="flex gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-zinc-900">{item.title}</h4>
                    <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">{item.body}</p>
                    {item.href && (
                      <Link href={item.href} onClick={handleClose} className="mt-1 inline-block text-xs font-medium text-zinc-900 underline underline-offset-2">
                        Ir ahora
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        ))}
        <div className="flex items-center gap-2 rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
          <Sparkles className="h-3.5 w-3.5 shrink-0" />
          Este aviso se muestra una sola vez por usuario — no vuelve a aparecer hasta la próxima tanda de novedades.
        </div>
      </div>
    </Modal>
  );
}
