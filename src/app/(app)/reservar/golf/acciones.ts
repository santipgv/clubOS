"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActiveMember, isStaff } from "@/lib/auth/guards";
import { getSessionUser } from "@/lib/auth/session";
import { aceptarInvitacionGolf } from "@/lib/golf/invitations";
import { recordAudit } from "@/lib/audit";
import { anularReservaGolf, reservarSalida, MENSAJES_GOLF } from "@/lib/golf/salidas";
import { erroresDeCampo } from "@/lib/validation";
import { DAY_PATTERN } from "@/lib/time";

export type EstadoSalida = { error?: string; ok?: string };

const salidaSchema = z.object({
  courseId: z.string().uuid("Recorrido no válido"),
  day: z.string().regex(DAY_PATTERN, "Fecha no válida"),
  startMinute: z.coerce.number().int().min(0).max(1439),
  players: z.coerce.number().int().min(1).max(8),
  guestCount: z.coerce.number().int().min(0).max(8).optional(),
  buggies: z.coerce.number().int().min(0).max(4).optional(),
  playerNames: z.string().max(300).optional(),
  inviteMemberNumbers: z.array(z.string().trim().min(1, "Indica el número de cada socio invitado.").max(40)).max(3, "Puedes invitar hasta tres socios."),
  invitePayment: z.enum(["SEPARATE", "HOST"]).optional(),
});

export async function confirmarSalida(
  _previo: EstadoSalida,
  formData: FormData,
): Promise<EstadoSalida> {
  const user = await requireActiveMember();

  const parsed = salidaSchema.safeParse({ ...Object.fromEntries(formData), inviteMemberNumbers: formData.getAll("inviteMemberNumber") });
  if (!parsed.success) {
    return { error: Object.values(erroresDeCampo(parsed.error))[0] ?? "Datos no válidos." };
  }
  const d = parsed.data;

  if (d.invitePayment && !d.inviteMemberNumbers.length) return { error: "Indica los números de socio de tus acompañantes." };
  if (d.inviteMemberNumbers.length > 0 && !d.invitePayment) return { error: "Elige quién paga la salida." };

  const resultado = await reservarSalida({
    courseId: d.courseId,
    day: d.day,
    startMinute: d.startMinute,
    userId: user.id,
    actorId: user.id,
    // Un socio reservando para sí mismo nunca se salta sus propios límites.
    actorIsStaff: false,
    players: d.players,
    guestCount: d.guestCount,
    buggies: d.buggies,
    invite: d.inviteMemberNumbers.length > 0 && d.invitePayment
      ? { memberNumbers: d.inviteMemberNumbers, payment: d.invitePayment }
      : undefined,
    playerNames: (d.playerNames ?? "").split(",").map((n) => n.trim()).filter(Boolean),
  });

  if (!resultado.ok) return { error: MENSAJES_GOLF[resultado.error] };

  await recordAudit({
    actorId: user.id,
    action: "golf.booked",
    entityType: "GolfBooking",
    entityId: resultado.bookingId,
    metadata: {
      referencia: resultado.reference,
      dia: d.day,
      salida: d.startMinute,
      jugadores: d.players,
      invitacion: d.invitePayment,
    },
  });

  revalidatePath("/mis-reservas");
  revalidatePath("/reservar/golf");
  revalidatePath("/admin/pistas");
  redirect(`/mis-reservas?nueva=${resultado.reference}`);
}

export async function anularSalida(
  _previo: EstadoSalida,
  formData: FormData,
): Promise<EstadoSalida> {
  const user = await getSessionUser();
  if (!user) return { error: "Sesión caducada." };

  const bookingId = String(formData.get("bookingId") ?? "");
  const resultado = await anularReservaGolf({
    bookingId,
    actorId: user.id,
    actorEsStaff: isStaff(user),
  });

  if (!resultado.ok) {
    const mensajes = {
      NO_ENCONTRADA: "No hemos encontrado esa salida.",
      YA_ANULADA: "Esa salida ya estaba anulada.",
      YA_EMPEZADA: "No se puede anular una salida que ya ha empezado.",
      PAGA_TITULAR: "El titular puede anular esta reserva conjunta.",
    } as const;
    return { error: mensajes[resultado.error] };
  }

  await recordAudit({
    actorId: user.id,
    action: "golf.cancelled",
    entityType: "GolfBooking",
    entityId: bookingId,
    metadata: { plazasLiberadas: resultado.liberados },
  });

  revalidatePath("/mis-reservas");
  revalidatePath("/reservar/golf");
  revalidatePath("/admin/pistas");
  return { ok: `Salida anulada. Se liberan ${resultado.liberados} plaza(s).` };
}

export async function responderInvitacion(_previo: EstadoSalida, formData: FormData): Promise<EstadoSalida> {
  const user = await requireActiveMember();
  const parsed = z.object({ bookingId: z.string().uuid() })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invitación no válida." };
  const { bookingId } = parsed.data;
  if (!await aceptarInvitacionGolf({ bookingId, userId: user.id })) {
    return { error: "Esta invitación ya no está disponible." };
  }
  await recordAudit({ actorId: user.id, action: "golf.invitation_accepted", entityType: "GolfBooking", entityId: bookingId });
  revalidatePath("/mis-reservas");
  revalidatePath("/reservar/golf");
  revalidatePath("/admin/pistas");
  return { ok: "Invitación aceptada." };
}
