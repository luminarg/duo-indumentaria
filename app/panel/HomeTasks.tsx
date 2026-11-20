"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, Check, CheckSquare, Play, Plus } from "lucide-react";
import { createTask, updateTaskStatus } from "./tareas/actions";
import { cn } from "@/lib/cn";

export type HomeTask = {
  id: string;
  title: string;
  status: "pendiente" | "en_curso" | "hecha";
  priority: "alta" | "media" | "baja";
  due_date: string | null;
  assignedTo: string | null;
  assignedName: string | null;
  orderLabel: string | null;
};

const PRIORITY_RANK = { alta: 0, media: 1, baja: 2 } as const;
const PRIORITY_STYLE = {
  alta: "bg-red-50 text-red-700",
  media: "bg-amber-50 text-amber-800",
  baja: "bg-zinc-100 text-zinc-600",
} as const;
const PRIORITY_LABEL = { alta: "Alta", media: "Media", baja: "Baja" } as const;

function dueInfo(due: string | null, todayStr: string) {
  if (!due) return null;
  const d = Math.round((new Date(`${due}T00:00:00`).getTime() - new Date(`${todayStr}T00:00:00`).getTime()) / 86_400_000);
  if (d < 0) return { text: `Vencida hace ${-d} ${-d === 1 ? "día" : "días"}`, cls: "text-red-600 font-semibold" };
  if (d === 0) return { text: "Vence hoy", cls: "text-orange-700 font-semibold" };
  if (d === 1) return { text: "Vence mañana", cls: "text-orange-700" };
  return { text: `Vence ${new Date(`${due}T00:00:00`).toLocaleDateString("es-AR", { weekday: "short", day: "2-digit", month: "2-digit" })}`, cls: "text-zinc-500" };
}

type Action = { id: string; status: HomeTask["status"] } | { add: HomeTask };

export function HomeTasks({ tasks, todayStr, userId }: { tasks: HomeTask[]; todayStr: string; userId: string | null }) {
  const [list, apply] = useOptimistic(tasks, (state: HomeTask[], a: Action) =>
    "add" in a ? [a.add, ...state] : state.map((t) => (t.id === a.id ? { ...t, status: a.status } : t))
  );
  const [, startTransition] = useTransition();
  const [onlyMine, setOnlyMine] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // Hechas en esta visita: el servidor ya no las trae (filtra "hecha"), así
  // que se guardan acá para poder deshacer.
  const [recentDone, setRecentDone] = useState<string[]>([]);

  const setStatus = (id: string, status: HomeTask["status"]) => {
    if (status === "hecha") setRecentDone((r) => [...r, id]);
    if (status === "pendiente") setRecentDone((r) => r.filter((x) => x !== id));
    startTransition(async () => {
      apply({ id, status });
      try {
        await updateTaskStatus(id, status);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo actualizar la tarea");
      }
    });
  };

  const add = (fd: FormData) => {
    const title = String(fd.get("title") || "").trim();
    if (!title) return;
    formRef.current?.reset();
    startTransition(async () => {
      apply({
        add: {
          id: `tmp-${Date.now()}`,
          title,
          status: "pendiente",
          priority: (String(fd.get("priority")) as HomeTask["priority"]) || "media",
          due_date: String(fd.get("due_date") || "") || null,
          assignedTo: null,
          assignedName: null,
          orderLabel: null,
        },
      });
      try {
        await createTask(fd);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo crear la tarea");
      }
    });
  };

  const visible = list
    .filter((t) => t.status !== "hecha" && !recentDone.includes(t.id))
    .filter((t) => !onlyMine || (userId && t.assignedTo === userId))
    .sort((a, b) => {
      const ov = (t: HomeTask) => (t.due_date && t.due_date <= todayStr ? 0 : 1);
      return (
        ov(a) - ov(b) ||
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
        (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999")
      );
    });
  const doneNow = recentDone;
  const overdue = visible.filter((t) => t.due_date && t.due_date < todayStr).length;
  const mineCount = list.filter((t) => t.status !== "hecha" && userId && t.assignedTo === userId).length;

  return (
    <section className="glass-card overflow-hidden rounded-2xl border-2 !border-[#102C5B]/15 p-0">
      <div className="flex flex-wrap items-center gap-2 bg-[#102C5B] px-5 py-3.5 text-white">
        <CheckSquare className="h-5 w-5 text-[#00AEEF]" />
        <h2 className="text-base font-extrabold">Tareas</h2>
        <span className="rounded-md bg-white/15 px-2 py-0.5 text-xs font-bold">{visible.length} pendientes</span>
        {overdue > 0 && <span className="rounded-md bg-red-500 px-2 py-0.5 text-xs font-bold">{overdue} vencidas</span>}
        <div className="ml-auto flex items-center gap-1 rounded-lg bg-white/10 p-0.5 text-xs font-semibold">
          <button type="button" onClick={() => setOnlyMine(false)} className={cn("rounded-md px-2.5 py-1", !onlyMine ? "bg-white text-[#102C5B]" : "text-white/80")}>
            Todas
          </button>
          <button type="button" onClick={() => setOnlyMine(true)} className={cn("rounded-md px-2.5 py-1", onlyMine ? "bg-white text-[#102C5B]" : "text-white/80")}>
            Mías ({mineCount})
          </button>
        </div>
        <Link href="/panel/tareas" className="flex items-center gap-1 text-sm font-semibold text-white/90 hover:text-white">
          Tablero <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <form ref={formRef} action={add} className="flex flex-wrap items-center gap-2 border-b border-zinc-100 bg-[#F7F9FC] px-5 py-3">
        <Plus className="h-4 w-4 text-zinc-400" />
        <input name="title" required placeholder="Nueva tarea… (Enter para agregar)" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-400" />
        <select name="priority" defaultValue="media" className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs">
          <option value="alta">Alta</option>
          <option value="media">Media</option>
          <option value="baja">Baja</option>
        </select>
        <input type="date" name="due_date" className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs" />
        <button type="submit" className="rounded-md bg-[#102C5B] px-3 py-1 text-xs font-semibold text-white hover:bg-[#0c2247]">
          Agregar
        </button>
      </form>

      {error && <p className="border-b border-red-100 bg-red-50 px-5 py-2 text-xs text-red-700">{error}</p>}

      {visible.length ? (
        <ul className="max-h-[420px] overflow-y-auto">
          {visible.map((t) => {
            const due = dueInfo(t.due_date, todayStr);
            const pending = t.id.startsWith("tmp-");
            return (
              <li key={t.id} className={cn("flex items-center gap-3 border-b border-zinc-100 px-5 py-2.5 last:border-b-0", pending && "opacity-60")}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setStatus(t.id, "hecha")}
                  title="Marcar como hecha"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 border-zinc-300 text-transparent transition-colors hover:border-green-600 hover:bg-green-50 hover:text-green-600"
                >
                  <Check className="h-4 w-4" />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-zinc-900">{t.title}</div>
                  <div className="flex flex-wrap gap-x-2 text-xs text-zinc-500">
                    {due && <span className={due.cls}>{due.text}</span>}
                    {t.assignedName && <span>· {t.assignedName}</span>}
                    {t.orderLabel && <span>· {t.orderLabel}</span>}
                  </div>
                </div>
                {t.status === "en_curso" ? (
                  <span className="shrink-0 rounded-md bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700">En curso</span>
                ) : (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setStatus(t.id, "en_curso")}
                    title="Empezar"
                    className="hidden shrink-0 items-center gap-1 rounded-md border border-zinc-200 px-2 py-0.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 sm:flex"
                  >
                    <Play className="h-3 w-3" /> Empezar
                  </button>
                )}
                <span className={cn("shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold", PRIORITY_STYLE[t.priority])}>{PRIORITY_LABEL[t.priority]}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-5 py-6 text-sm text-zinc-500">{onlyMine ? "No tenés tareas asignadas pendientes." : "No hay tareas pendientes. 🎉"}</p>
      )}

      {doneNow.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 bg-green-50/60 px-5 py-2 text-xs text-green-800">
          <Check className="h-3.5 w-3.5" />
          {doneNow.length === 1 ? "1 tarea hecha recién" : `${doneNow.length} tareas hechas recién`}
          <button type="button" onClick={() => setStatus(doneNow[doneNow.length - 1], "pendiente")} className="ml-auto font-semibold underline">
            Deshacer
          </button>
        </div>
      )}
    </section>
  );
}
