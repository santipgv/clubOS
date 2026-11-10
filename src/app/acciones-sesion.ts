"use server";

import { redirect } from "next/navigation";
import { getSessionUser, destroyCurrentSession } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";

export async function cerrarSesion() {
  const user = await getSessionUser();
  await destroyCurrentSession();
  if (user) {
    await recordAudit({ actorId: user.id, action: "auth.logout", entityType: "User", entityId: user.id });
  }
  redirect("/entrar");
}
