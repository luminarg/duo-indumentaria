"use client";

import { useState, useTransition } from "react";
import {
  CheckSquare,
  Trash2,
  Palette,
  Wallet,
  Users,
  Sparkles,
} from "lucide-react";
import { Modal } from "../components/ui/Modal";
import { Button } from "../components/ui/Button";
import { markWhatsNewSeen } from "./actions";

const ITEMS = [
  {
    icon: CheckSquare,
    title: "Dashboard: las tareas primero",
    body: "El Dashboard ahora arranca con una tarjeta grande de Tareas pendientes — título, fecha de vencimiento y prioridad de un vistazo. Todo lo demás (estados de pedidos, métricas, agenda) quedó más chico, debajo.",
  },
  {
    icon: Trash2,
    title: "Borrar y editar pedidos y presupuestos",
    body: 'Desde el detalle de un pedido o un presupuesto ahora hay un botón "Borrar" (con confirmación, no se puede deshacer). Los presupuestos ya se podían editar desde su pantalla de detalle — seguí usando el formulario de siempre para corregir datos.',
  },
  {
    icon: Palette,
    title: "Color propio por presupuesto",
    body: "Al crear o editar un presupuesto podés elegirle un color particular (por ejemplo, el del club o equipo del cliente). Si lo elegís, el PDF del presupuesto sale con ese color en vez del color por defecto del negocio.",
  },
  {
    icon: Wallet,
    title: "Caja: ingresos y gastos en una pantalla",
    body: '"Compras y gastos" ahora se llama Caja. Tiene tres pestañas: Ingresos (se cargan solos cuando marcás un pedido como señado o entregado), Gastos (igual que antes, ahora se cargan desde un botón que abre un formulario) y Proveedores. Arriba de todo hay un resumen de Ingresos, Gastos y Saldo.',
  },
  {
    icon: Users,
    title: "Agenda: contactos frecuentes",
    body: "En Agenda hay una pestaña nueva, Contactos frecuentes, para guardar comisionistas, vendedores de tela o insumos, y cualquier otro contacto habitual que no sea cliente ni proveedor formal — con teléfono, email y notas.",
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
      title="Novedades del panel"
      subtitle="Lo que se agregó y cambió — explicado para que lo uses sin vueltas"
      footer={
        <Button type="button" onClick={handleClose} className="w-full justify-center">
          Entendido, empezar a usarlo
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.title} className="flex gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700">
                <Icon className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-zinc-900">{item.title}</h3>
                <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">{item.body}</p>
              </div>
            </div>
          );
        })}
        <div className="flex items-center gap-2 rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
          <Sparkles className="h-3.5 w-3.5 shrink-0" />
          Este aviso se muestra una sola vez por usuario — no vuelve a aparecer hasta la próxima tanda de novedades.
        </div>
      </div>
    </Modal>
  );
}
