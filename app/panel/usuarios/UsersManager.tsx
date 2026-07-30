"use client";

import { useMemo, useState, useTransition } from "react";
import { createTeamUser, updateUserRole, deleteTeamUser } from "./actions";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { SearchInput } from "../../components/ui/SearchInput";

type TeamUser = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  created_at: string;
};

const ROLES = [
  { value: "dueno", label: "Dueño" },
  { value: "hermano", label: "Hermano" },
  { value: "empleado", label: "Empleado" },
];

export function UsersManager({
  users,
  currentUserId,
}: {
  users: TeamUser[];
  currentUserId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      [u.full_name, u.email, u.role].filter(Boolean).some((field) => field!.toLowerCase().includes(q))
    );
  }, [users, query]);

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    const form = e.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      try {
        await createTeamUser(formData);
        form.reset();
        setMessage("Usuario creado.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al crear el usuario");
      }
    });
  }

  function handleRoleChange(userId: string, role: string) {
    setError(null);
    startTransition(async () => {
      try {
        await updateUserRole(userId, role);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al cambiar el rol");
      }
    });
  }

  function handleDelete(userId: string) {
    setError(null);
    startTransition(async () => {
      try {
        await deleteTeamUser(userId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al eliminar");
      }
    });
  }

  return (
    <div className="max-w-3xl">
      {error && (
        <div className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}
      {message && (
        <div className="mb-4 rounded-md bg-green-50 px-4 py-3 text-sm text-green-800">{message}</div>
      )}

      <SearchInput value={query} onChange={setQuery} placeholder="Buscar por nombre, email o rol..." className="mb-4" />

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-zinc-500">
              <th className="px-5 py-3 font-medium">Nombre</th>
              <th className="px-5 py-3 font-medium">Email</th>
              <th className="px-5 py-3 font-medium">Rol</th>
              <th className="px-5 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user) => (
              <tr key={user.id} className="border-b border-zinc-100 last:border-0">
                <td className="px-5 py-3 text-zinc-900">{user.full_name || "—"}</td>
                <td className="px-5 py-3 text-zinc-600">{user.email}</td>
                <td className="px-5 py-3">
                  <select
                    defaultValue={user.role}
                    disabled={isPending || user.id === currentUserId}
                    onChange={(e) => handleRoleChange(user.id, e.target.value)}
                    className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
                  >
                    {ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-5 py-3">
                  {user.id !== currentUserId ? (
                    <button
                      disabled={isPending}
                      onClick={() => handleDelete(user.id)}
                      className="text-xs text-red-600"
                    >
                      Eliminar
                    </button>
                  ) : (
                    <span className="text-xs text-zinc-400">(vos)</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Agregar usuario</h2>
        <form onSubmit={handleCreate} className="flex flex-col gap-3">
          <Input name="full_name" placeholder="Nombre" />
          <Input name="email" type="email" required placeholder="Email" />
          <Input name="password" type="text" required minLength={6} placeholder="Contraseña temporal (mínimo 6 caracteres)" />
          <Select name="role" defaultValue="empleado">
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
          <Button type="submit" disabled={isPending} className="self-start">
            {isPending ? "Creando..." : "Crear usuario"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
