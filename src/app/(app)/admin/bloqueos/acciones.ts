"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { deportesGestionados, requireGestorDeDeportes } from "@/lib/auth/guards";
import { filtroBloqueos, pistaEnAmbito } from "@/lib/auth/ambito";
import { recordAudit } from "@/lib/audit";
import { clubDayMinutesToUtc } from "@/lib/time";
import { bloqueoSchema, erroresDeCampo } from "@/lib/validation";
import { createCourtBlock } from "@/lib/booking/blocks";
import { formatEuros } from "@/lib/booking/pricing";

export type EstadoBloqueo = { error?: string; ok?: string; requiereConfirmacion?: number };

/**
 * Crear un bloqueo puede dejar sin pista a socios que ya habian reservado.
 * Nunca se cancelan esas reservas en silencio: se avisa del numero afectado y
 * se exige una segunda confirmacion explicita.
 *
 * Un colaborador de deporte solo bloquea pistas de sus deportes o un deporte
 * suyo entero; nunca el club, porque eso alcanza a pistas que no gestiona.
 */
export async function crearBloqueo(_previo: EstadoBloqueo, formData: FormData): Promise<EstadoBloqueo> {
  const staff = await requireGestorDeDeportes();
  const ambito = deportesGestionados(staff);

  const parsed = bloqueoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: Object.values(erroresDeCampo(parsed.error))[0] ?? "Datos no validos." };
  }
  const d = parsed.data;
  const confirmado = formData.get("confirmar") === "si";

  const courtId = d.courtId || null;
  // Si llega una pista, manda la pista (igual que en la disponibilidad): no se
  // guarda ademas un deporte que pudiera leerse como un bloqueo mas amplio.
  const sport = courtId ? null : ((d.sport || null) as "PADEL" | "TENIS" | "CROQUET" | null);

  if (ambito !== null) {
    if (courtId) {
      if (!(await pistaEnAmbito(ambito, courtId))) return { error: "Esa pista no está entre tus deportes." };
    } else if (!sport) {
      return { error: "Solo puedes bloquear pistas de tus deportes, no el club entero." };
    } else if (!ambito.includes(sport)) {
      return { error: "Ese deporte no está entre los tuyos." };
    }
  }

  if (!courtId && !sport && !confirmado) {
    return { error: "Vas a bloquear el club entero. Marca la confirmación para continuar." };
  }

  const startsAt = clubDayMinutesToUtc(d.day, d.startMinute);
  const endsAt = clubDayMinutesToUtc(d.day, d.endMinute);

  const result = await createCourtBlock({
    courtId,
    sport,
    startsAt,
    endsAt,
    type: d.type,
    title: d.title,
    description: d.description || null,
    isPublic: d.isPublic === "on",
    createdById: staff.id,
    confirmed: confirmado,
  });

  if (!result.ok) {
    return {
      requiereConfirmacion: result.requiresConfirmation,
      error: `Hay ${result.requiresConfirmation} reserva(s) de socios en esa franja. Confirma para cancelarlas y crear el bloqueo.`,
    };
  }

  await recordAudit({
    actorId: staff.id,
    action: "block.created",
    entityType: "CourtBlock",
    entityId: result.blockId,
    metadata: {
      titulo: d.title,
      reservasCanceladas: result.cancelledBookings,
      reservasDevueltas: result.refundedBookings,
      devueltoCents: result.refundedCents,
      courtId,
      sport,
    },
  });

  revalidatePath("/admin/bloqueos");
  const devolucion =
    result.refundedBookings > 0
      ? ` ${result.refundedBookings} estaban pagadas: se han devuelto ${formatEuros(result.refundedCents)} a sus monederos.`
      : "";
  return {
    ok:
      result.cancelledBookings > 0
        ? `Bloqueo creado. Se han cancelado ${result.cancelledBookings} reserva(s).${devolucion} Avisa a los socios afectados.`
        : "Bloqueo creado.",
  };
}

export async function eliminarBloqueo(_previo: EstadoBloqueo, formData: FormData): Promise<EstadoBloqueo> {
  const staff = await requireGestorDeDeportes();
  const id = String(formData.get("id") ?? "");

  // El ambito va en la propia condicion de borrado: un colaborador no puede
  // borrar un bloqueo de otro deporte ni uno del club entero.
  const borrado = await prisma.courtBlock.deleteMany({
    where: { id, ...filtroBloqueos(deportesGestionados(staff)) },
  });
  if (borrado.count === 0) return { error: "Ese bloqueo ya no existe." };

  await recordAudit({ actorId: staff.id, action: "block.deleted", entityType: "CourtBlock", entityId: id });
  revalidatePath("/admin/bloqueos");
  return { ok: "Bloqueo eliminado. Las reservas ya canceladas no se restauran." };
}
