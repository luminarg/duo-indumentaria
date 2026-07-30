import { login } from "./actions";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <Card>
        <h1 className="text-lg font-semibold text-zinc-900">Panel — Duo Indumentaria</h1>
        <p className="mt-1 text-sm text-zinc-500">Ingresá con tu cuenta del equipo.</p>

        {error && (
          <div className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
        )}

        <form action={login} className="mt-6 flex flex-col gap-3">
          <Input name="email" type="email" required placeholder="Email" />
          <Input name="password" type="password" required placeholder="Contraseña" />
          <Button type="submit" className="mt-1">
            Ingresar
          </Button>
        </form>
      </Card>
    </div>
  );
}
