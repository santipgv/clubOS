"use server";

import { revalidatePath } from "next/cache";
import { requireActiveMember, isStaff } from "@/lib/auth/guards";
import { getSessionUser } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import { anularInscripcion, inscribirEnTorneo, MENSAJES_INSCRIPCION } from "@/lib/torneos";

export type EstadoInscripcion = { error?: string; ok?: string };

export async function inscribirme(
  _previo: EstadoInscripcion,
  formData: FormData,
): Promise<EstadoInscripcion> {
  const user = await requireActiveMember();

  const tournamentId = String(formData.get("tournamentId") ?? "");
  const esInvitado = formData.get("esInvitado") === "on";
  const nombreInvitado = String(formData.get("nombreInvitado") ?? "").trim();

  if (esInvitado && nombreInvitado.length < 3) {
    return { error: "Escribe el nombre y apellidos del invitado." };
  }

  const resultado = await inscribirEnTorneo({
    tournamentId,
    userId: user.id,
    participantName: esInvitado ? nombreInvitado : `${user.firstName} ${user.lastName}`,
    isGuest: esInvitado,
  });

  if (!resultado.ok) return { error: MENSAJES_INSCRIPCION[resultado.error] };

  await recordAudit({
    actorId: user.id,
    action: "tournament.registration",
    entityType: "TournamentRegistration",
    entityId: resultado.id,
    metadata: { tournamentId, invitado: esInvitado },
  });

  revalidatePath("/torneos");
  return {
    ok:
      resultado.estado === "WAITLIST"
        ? "Las plazas estaban completas: te hemos puesto en lista de espera y te avisaremos si se libera una."
        : "Inscripción confirmada.",
  };
}

export async function anularMiInscripcion(
  _previo: EstadoInscripcion,
  formData: FormData,
): Promise<EstadoInscripcion> {
  const user = await getSessionUser();
  if (!user) return { error: "Sesión caducada." };

  const registrationId = String(formData.get("registrationId") ?? "");
  const resultado = await anularInscripcion({
    registrationId,
    actorId: user.id,
    actorEsStaff: isStaff(user),
  });

  if (!resultado.ok) return { error: resultado.error };

  await recordAudit({
    actorId: user.id,
    action: "tournament.registration_cancelled",
    entityType: "TournamentRegistration",
    entityId: registrationId,
    metadata: { ascendida: resultado.ascendida },
  });

  revalidatePath("/torneos");
  revalidatePath("/admin/torneos");
  return {
    ok: resultado.ascendida
      ? `Inscripcion anulada. Entra ${resultado.ascendida}, que estaba en lista de espera.`
      : "Inscripción anulada.",
  };
}
