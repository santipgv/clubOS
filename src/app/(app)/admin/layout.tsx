import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { puedeGestionarDeportes } from "@/lib/auth/guards";

/**
 * Puerta de entrada al area de gestion. Deja pasar tambien al colaborador de
 * deporte, que solo usa reservas y bloqueos. Cada pagina y cada accion vuelve
 * a comprobar el rol por su cuenta: este layout mejora la experiencia, no es
 * la medida de seguridad.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/entrar");
  if (!puedeGestionarDeportes(user) || user.status !== "ACTIVE") redirect("/");
  return <>{children}</>;
}
