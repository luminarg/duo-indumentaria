"use client";

import { useMemo, useState, useTransition } from "react";
import { createTask, updateTaskStatus, updateTask, deleteTask } from "./actions";
import { Card } from "../../components/ui/Card";
import { Input, Select, Textarea } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { SearchInput } from "../../components/ui/SearchInput";
import { cn } from "@/lib/cn";
import { ArrowUp, ArrowDown } from "lucide-react";

type Task = {
  id: string;
  title: string;
  description: string | null;
  status: "pendiente" | "en_curso" | "hecha";
  priority: "alta" | "media" | "baja";
  due_date: string | null;
  created_at: string;
  orderNumber: string | null;
  assignedName: string | null;
};

type OrderOption = { id: string; order_number: string };
type TeamMember = { id: string; full_name: string };

const COLUMNS = [
  { key: "pendiente", label: "Pendiente" },
  { key: "en_curso", label: "En curso" },
  { key: "hecha", label: "Hecha" },
] as const;

const PRIORITY_STYLES: Record<Task["priority"], string> = {
  alta: "bg-red-100 text-red-700",
  media: "bg-amber-100 text-amber-800",
  baja: "bg-zinc-100 text-zinc-600",
};

// Tinte de fondo por columna/estado — en rgba (no clases bg-*) porque las
// tarjetas usan el sistema "glass" (fondo semitransparente + blur definido
// en globals.css vía la clase .glass-card); un color inline pisa ese fondo
// sin tener que pelear con el orden de las clases en el CSS.
const STATUS_CARD_TINT: Record<Task["status"], string> = {
  pendiente: "rgba(254, 202, 202, 0.4)", // rojo claro
  en_curso: "rgba(186, 230, 253, 0.4)", // celeste
  hecha: "rgba(187, 247, 208, 0.4)", // verde
};

const PRIORITY_LABELS: Record<Task["priority"], string> = {
  alta: "Alta",
  media: "Media",
  baja: "Baja",
};

type SortKey = "priority" | "due_date" | "created_at" | "title";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "priority", label: "Prioridad" },
  { key: "due_date", label: "Vencimiento" },
  { key: "created_at", label: "Fecha de creación" },
  { key: "title", label: "Título" },
];

const PRIORITY_RANK: Record<Task["priority"], number> = { alta: 0, media: 1, baja: 2 };

// Orden "natural" (flecha hacia arriba) de cada criterio: prioridad alta
// primero, vencimiento más próximo primero, más nuevas primero, A→Z. La
// flecha invierte ese orden. Las tareas sin fecha de vencimiento siempre
// quedan al final.
function compareTasks(a: Task, b: Task, key: SortKey, reversed: boolean) {
  let result = 0;
  if (key === "priority") {
    result = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (result === 0) result = (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999");
  } else if (key === "due_date") {
    if (!a.due_date && !b.due_date) result = 0;
    else if (!a.due_date) return 1;
    else if (!b.due_date) return -1;
    else result = a.due_date.localeCompare(b.due_date);
  } else if (key === "created_at") {
    result = b.created_at.localeCompare(a.created_at);
  } else {
    result = a.title.localeCompare(b.title, "es", { sensitivity: "base" });
  }
  return reversed ? -result : result;
}

function isOverdue(dueDate: string | null, status: Task["status"]) {
  if (!dueDate || status === "hecha") return false;
  return new Date(`${dueDate}T00:00:00`) < new Date(new Date().toDateString());
}

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
}

// Formulario de edición que reemplaza el contenido de la tarjeta mientras se
// edita (título, detalle, prioridad y vencimiento).
function TaskEditForm({ task, onDone }: { task: Task; onDone: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateTask(task.id, formData);
      if (!result.ok) setError(result.error);
      else onDone();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      {error && <div className="rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-800">{error}</div>}
      <Input name="title" defaultValue={task.title} required placeholder="Título" />
      <Textarea name="description" defaultValue={task.description ?? ""} placeholder="Detalle (opcional)" />
      <div className="grid grid-cols-2 gap-2">
        <Select name="priority" defaultValue={task.priority}>
          <option value="alta">Prioridad alta</option>
          <option value="media">Prioridad media</option>
          <option value="baja">Prioridad baja</option>
        </Select>
        <Input type="date" name="due_date" defaultValue={task.due_date ?? ""} />
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Guardando..." : "Guardar"}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={onDone} disabled={isPending}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

export function TareasBoard({
  tasks,
  orders,
  teamMembers,
}: {
  tasks: Task[];
  orders: OrderOption[];
  teamMembers: TeamMember[];
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("priority");
  const [sortReversed, setSortReversed] = useState(false);

  const filteredTasks = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = !q
      ? tasks
      : tasks.filter((t) =>
          [t.title, t.description, t.orderNumber, t.assignedName]
            .filter(Boolean)
            .some((field) => field!.toLowerCase().includes(q))
        );
    return [...filtered].sort((a, b) => compareTasks(a, b, sortKey, sortReversed));
  }, [tasks, query, sortKey, sortReversed]);

  function runAction(action: () => Promise<void>, onSuccess?: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        onSuccess?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ocurrió un error");
      }
    });
  }

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    runAction(() => createTask(formData), () => {
      form.reset();
      setShowForm(false);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

      <Card>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-900">Nueva tarea</h2>
          <Button type="button" size="sm" variant="secondary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Cancelar" : "+ Agregar"}
          </Button>
        </div>
        {showForm && (
          <form onSubmit={handleCreate} className="mt-3 grid gap-3 sm:grid-cols-2">
            <Input name="title" placeholder="Título" required className="sm:col-span-2" />
            <Textarea name="description" placeholder="Descripción (opcional)" className="sm:col-span-2" />
            <Select name="priority" defaultValue="media">
              <option value="alta">Prioridad alta</option>
              <option value="media">Prioridad media</option>
              <option value="baja">Prioridad baja</option>
            </Select>
            <Input type="date" name="due_date" />
            <Select name="order_id" defaultValue="">
              <option value="">Sin pedido asociado</option>
              {orders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.order_number}
                </option>
              ))}
            </Select>
            <Select name="assigned_to" defaultValue="">
              <option value="">Sin asignar</option>
              {teamMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name}
                </option>
              ))}
            </Select>
            <Button type="submit" disabled={isPending} size="sm" className="self-start sm:col-span-2">
              Crear tarea
            </Button>
          </form>
        )}
      </Card>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex-1">
          <SearchInput value={query} onChange={setQuery} placeholder="Buscar por título, pedido o responsable..." />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-zinc-500">Ordenar por</span>
          <select
            value={sortKey}
            onChange={(e) => {
              setSortKey(e.target.value as SortKey);
              setSortReversed(false);
            }}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setSortReversed((v) => !v)}
            title={sortReversed ? "Orden invertido — tocá para volver" : "Tocá para invertir el orden"}
            aria-label="Invertir orden"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
          >
            {sortReversed ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {COLUMNS.map((col) => {
          const columnTasks = filteredTasks.filter((t) => t.status === col.key);
          return (
            <div key={col.key} className="flex flex-col gap-3">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-sm font-semibold text-zinc-700">{col.label}</h3>
                <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs text-zinc-600">
                  {columnTasks.length}
                </span>
              </div>

              <div className="flex flex-col gap-3">
                {columnTasks.length === 0 && (
                  <p className="rounded-md border border-dashed border-zinc-300 px-3 py-6 text-center text-xs text-zinc-400">
                    Sin tareas
                  </p>
                )}
                {columnTasks.map((task) => {
                  const overdue = isOverdue(task.due_date, task.status);
                  return (
                    <Card
                      key={task.id}
                      className="flex flex-col gap-2"
                      style={{ backgroundColor: STATUS_CARD_TINT[task.status] }}
                    >
                      {editingId === task.id ? (
                        <TaskEditForm task={task} onDone={() => setEditingId(null)} />
                      ) : (
                      <>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-zinc-900">{task.title}</p>
                        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", PRIORITY_STYLES[task.priority])}>
                          {PRIORITY_LABELS[task.priority]}
                        </span>
                      </div>
                      {task.description && (
                        <p className="whitespace-pre-wrap text-xs text-zinc-500">{task.description}</p>
                      )}
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500">
                        {task.due_date && (
                          <span className={overdue ? "font-medium text-red-600" : ""}>
                            Vence {formatDate(task.due_date)}
                            {overdue ? " · vencida" : ""}
                          </span>
                        )}
                        {task.orderNumber && <span>{task.orderNumber}</span>}
                        {task.assignedName && <span>{task.assignedName}</span>}
                      </div>

                      <div className="mt-1 flex items-center gap-3 border-t border-zinc-100 pt-2 text-xs">
                        {col.key !== "pendiente" && (
                          <button
                            disabled={isPending}
                            onClick={() => runAction(() => updateTaskStatus(task.id, "pendiente"))}
                            className="text-zinc-500 hover:underline"
                          >
                            Pendiente
                          </button>
                        )}
                        {col.key !== "en_curso" && (
                          <button
                            disabled={isPending}
                            onClick={() => runAction(() => updateTaskStatus(task.id, "en_curso"))}
                            className="text-zinc-500 hover:underline"
                          >
                            En curso
                          </button>
                        )}
                        {col.key !== "hecha" && (
                          <button
                            disabled={isPending}
                            onClick={() => runAction(() => updateTaskStatus(task.id, "hecha"))}
                            className="text-green-700 hover:underline"
                          >
                            Marcar hecha
                          </button>
                        )}
                        <button
                          disabled={isPending}
                          onClick={() => setEditingId(task.id)}
                          className="ml-auto text-zinc-700 hover:underline"
                        >
                          Editar
                        </button>
                        <button
                          disabled={isPending}
                          onClick={() => {
                            if (confirm("¿Borrar esta tarea?")) runAction(() => deleteTask(task.id));
                          }}
                          className="text-red-600 hover:underline"
                        >
                          Borrar
                        </button>
                      </div>
                      </>
                      )}
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
