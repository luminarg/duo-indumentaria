import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { UsersManager } from "./UsersManager";
import { PageHeader } from "../../components/ui/PageHeader";
import { EmptyState } from "../../components/ui/EmptyState";

export default async function UsuariosPage() {
  const supabase = await createClient();
  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();

  const { data: myProfile } = currentUser
    ? await supabase.from("profiles").select("role").eq("id", currentUser.id).single()
    : { data: null };

  if (myProfile?.role !== "dueno") {
    return (
      <div>
        <PageHeader title="Usuarios" />
        <EmptyState message='Esta sección es solo para el rol "dueño".' />
      </div>
    );
  }

  const admin = createAdminClient();
  const [{ data: authUsers }, { data: profiles }] = await Promise.all([
    admin.auth.admin.listUsers(),
    admin.from("profiles").select("id, full_name, role, created_at"),
  ]);

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
  const users = (authUsers?.users ?? []).map((u) => ({
    id: u.id,
    email: u.email ?? "",
    full_name: profileMap.get(u.id)?.full_name ?? "",
    role: profileMap.get(u.id)?.role ?? "empleado",
    created_at: u.created_at,
  }));

  return (
    <div>
      <PageHeader title="Usuarios" description="Gestioná quién tiene acceso al panel y con qué rol." />
      <UsersManager users={users} currentUserId={currentUser?.id ?? ""} />
    </div>
  );
}
