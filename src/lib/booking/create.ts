import { prisma, pgErrorCode, isSerializationFailure, PG_EXCLUSION_VIOLATION } from "@/lib/db";
import { clubDayMinutesToUtc, clubWeekday, daysBetween, clubToday, isValidDay } from "@/lib/time";
import { getSettings } from "@/lib/settings";
import { generateBookingReference } from "@/lib/auth/tokens";
import { quote } from "./pricing";
import { refundBookingInTx } from "@/lib/wallet";
import type { MemberType } from "@/lib/types";

/**
 * Creacion de reservas. Ver docs/ESPECIFICACIONES.md §6.
 *
 * Las validaciones de negocio se comprueban aqui, pero la garantia de que dos
 * socios no ocupan el mismo hueco no depende de este codigo: la impone un
 * constraint de exclusion en Postgres. Este modulo se limita a traducir esa
 * violacion a un mensaje comprensible.
 */

export type BookingFailure =
  | "PISTA_INEXISTENTE"
  | "SOCIO_NO_ACTIVO"
  | "DIA_INVALIDO"
  | "DURACION_NO_PERMITIDA"
  | "FUERA_DE_HORARIO"
  | "FUERA_DE_VENTANA"
  | "EN_EL_PASADO"
  | "BLOQUEADA"
  | "LIMITE_RESERVAS"
  | "LIMITE_DIARIO"
  | "HUECO_OCUPADO"
  | "CONFLICTO_TEMPORAL";

export const BOOKING_FAILURE_MESSAGES: Record<BookingFailure, string> = {
  PISTA_INEXISTENTE: "Esa pista no existe o no esta disponible.",
  SOCIO_NO_ACTIVO: "Tu alta de socio aún no esta activa, no puedes reservar.",
  DIA_INVALIDO: "La fecha indicada no es valida.",
  DURACION_NO_PERMITIDA: "Esa duración no esta permitida en esta pista.",
  FUERA_DE_HORARIO: "La pista no esta abierta a esa hora.",
  FUERA_DE_VENTANA: "Todavia no se puede reservar con tanta antelación.",
  EN_EL_PASADO: "No se puede reservar una hora que ya ha pasado.",
  BLOQUEADA: "Esa franja esta reservada por el club para un evento.",
  LIMITE_RESERVAS: "Has alcanzado el límite de reservas activas.",
  LIMITE_DIARIO: "Ya tienes una reserva de este deporte para ese día.",
  HUECO_OCUPADO: "Ese hueco acaba de ser reservado por otro socio.",
  CONFLICTO_TEMPORAL: "Ha habido mucha actividad simultanea. Vuelve a intentarlo.",
};

export type CreateBookingInput = {
  courtId: string;
  day: string;
  startMinute: number;
  durationMinutes: number;
  /** Socio titular de la reserva. */
  userId: string;
  /** Quien la crea: el propio socio o un miembro de staff en su nombre. */
  actorId: string;
  actorIsStaff: boolean;
  playerNames?: string[];
  guestCount?: number;
  notes?: string;
};

export type CreateBookingResult =
  | { ok: true; bookingId: string; reference: string; priceCents: number; taxCents: number }
  | { ok: false; error: BookingFailure };

export async function createBooking(input: CreateBookingInput): Promise<CreateBookingResult> {
  if (!isValidDay(input.day)) return { ok: false, error: "DIA_INVALIDO" };

  const settings = await getSettings();

  const [court, member] = await Promise.all([
    prisma.court.findFirst({
      where: { id: input.courtId, isActive: true },
      include: { schedules: { where: { weekday: clubWeekday(input.day), isActive: true } } },
    }),
    prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true, status: true, memberType: true },
    }),
  ]);

  if (!court) return { ok: false, error: "PISTA_INEXISTENTE" };
  if (!member || member.status !== "ACTIVE") return { ok: false, error: "SOCIO_NO_ACTIVO" };

  const endMinute = input.startMinute + input.durationMinutes;

  if (
    !court.allowedDurations.includes(input.durationMinutes) ||
    input.durationMinutes % court.slotMinutes !== 0 ||
    input.startMinute % court.slotMinutes !== 0
  ) {
    return { ok: false, error: "DURACION_NO_PERMITIDA" };
  }

  // La reserva debe caber entera dentro de una unica franja de apertura.
  const franja = court.schedules.find(
    (s) =>
      input.startMinute >= Math.max(s.opensAt, settings["club.openingMinute"]) &&
      endMinute <= Math.min(s.closesAt, settings["club.closingMinute"]),
  );
  if (!franja) return { ok: false, error: "FUERA_DE_HORARIO" };

  const startsAt = clubDayMinutesToUtc(input.day, input.startMinute);
  const endsAt = clubDayMinutesToUtc(input.day, endMinute);
  const ahora = Date.now();

  if (startsAt.getTime() < ahora + settings["booking.minLeadMinutes"] * 60_000) {
    return { ok: false, error: "EN_EL_PASADO" };
  }

  // El staff puede reservar mas alla de la ventana de apertura (torneos, clases).
  if (!input.actorIsStaff) {
    const antelacion = daysBetween(clubToday(), input.day);
    if (antelacion > settings["booking.windowDays"]) return { ok: false, error: "FUERA_DE_VENTANA" };
  }

  const rules = await prisma.priceRule.findMany({
    where: { OR: [{ courtId: court.id }, { courtId: null, sport: court.sport }, { courtId: null, sport: null }] },
  });
  const presupuesto = quote(rules, {
    courtId: court.id,
    sport: court.sport,
    memberType: member.memberType as MemberType,
    weekday: clubWeekday(input.day),
    startMinute: input.startMinute,
    endMinute,
  });

  return attempt();

  async function attempt(intento = 0): Promise<CreateBookingResult> {
    try {
      const booking = await prisma.$transaction(
        async (tx) => {
          // 1. Bloqueos del club. No se pueden cubrir con el constraint de
          //    exclusion porque viven en otra tabla, de ahi la transaccion
          //    serializable.
          const bloqueo = await tx.courtBlock.findFirst({
            where: {
              startsAt: { lt: endsAt },
              endsAt: { gt: startsAt },
              OR: [{ courtId: court!.id }, { courtId: null, sport: court!.sport }, { courtId: null, sport: null }],
            },
            select: { id: true },
          });
          if (bloqueo) throw new BusinessRuleError("BLOQUEADA");

          // 2. Limites por socio. El staff reservando en nombre de un socio
          //    (clases, invitados) no los aplica.
          if (!input.actorIsStaff) {
            const activas = await tx.booking.count({
              where: {
                userId: input.userId,
                status: { in: ["PENDING_PAYMENT", "CONFIRMED"] },
                endsAt: { gt: new Date() },
              },
            });
            if (activas >= settings["booking.maxActivePerMember"]) {
              throw new BusinessRuleError("LIMITE_RESERVAS");
            }

            const mismoDia = await tx.booking.count({
              where: {
                userId: input.userId,
                status: { in: ["PENDING_PAYMENT", "CONFIRMED"] },
                court: { sport: court!.sport },
                startsAt: { gte: clubDayMinutesToUtc(input.day, 0), lt: clubDayMinutesToUtc(input.day, 24 * 60) },
              },
            });
            if (mismoDia >= settings["booking.maxActivePerSportPerDay"]) {
              throw new BusinessRuleError("LIMITE_DIARIO");
            }
          }

          // 3. Insercion. Si otro socio se ha adelantado, Postgres rechaza
          //    esta sentencia con 23P01.
          return tx.booking.create({
            data: {
              reference: generateBookingReference(),
              courtId: court!.id,
              userId: input.userId,
              createdById: input.actorId,
              startsAt,
              endsAt,
              status: "CONFIRMED",
              paymentStatus: presupuesto.priceCents === 0 ? "NOT_REQUIRED" : "PENDING",
              priceCents: presupuesto.priceCents,
              taxCents: presupuesto.taxCents,
              taxTreatment: presupuesto.taxTreatment,
              playerNames: (input.playerNames ?? []).slice(0, court!.maxPlayers),
              guestCount: Math.max(0, input.guestCount ?? 0),
              notes: input.notes?.slice(0, 500),
            },
            select: { id: true, reference: true },
          });
        },
        { isolationLevel: "Serializable", timeout: 10_000 },
      );

      return {
        ok: true,
        bookingId: booking.id,
        reference: booking.reference,
        priceCents: presupuesto.priceCents,
        taxCents: presupuesto.taxCents,
      };
    } catch (error) {
      if (error instanceof BusinessRuleError) return { ok: false, error: error.failure };

      // Otro socio se adelanto: el constraint de exclusion lo ha impedido.
      if (pgErrorCode(error) === PG_EXCLUSION_VIOLATION) {
        return { ok: false, error: "HUECO_OCUPADO" };
      }

      // Dos transacciones serializables han chocado. Postgres pide reintentar,
      // con una espera creciente y algo de azar para no volver a colisionar.
      if (isSerializationFailure(error)) {
        if (intento >= MAX_REINTENTOS) return { ok: false, error: "CONFLICTO_TEMPORAL" };
        await esperar(25 * (intento + 1) + Math.random() * 25);
        return attempt(intento + 1);
      }

      throw error;
    }
  }
}

const MAX_REINTENTOS = 3;

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class BusinessRuleError extends Error {
  constructor(readonly failure: BookingFailure) {
    super(failure);
    this.name = "BusinessRuleError";
  }
}

export type CancelResult =
  | { ok: true; lateCancel: boolean; refundedCents: number }
  | { ok: false; error: "NO_ENCONTRADA" | "YA_CANCELADA" | "YA_EMPEZADA" };

/**
 * Cancelacion. Un socio solo puede cancelar lo suyo y solo antes de que
 * empiece; el staff puede cancelar cualquier reserva. Cancelar fuera de plazo
 * se permite, pero queda marcado para que la junta pueda aplicar su politica.
 *
 * Si la reserva estaba pagada, lo pagado vuelve al monedero del socio en la
 * misma transaccion que la cancela. `refund` decide si se devuelve; si no se
 * indica, se aplica la politica del club: se devuelve cuando se cancela dentro
 * de plazo. Fuera de plazo el club puede devolverlo despues desde el panel.
 */
export async function cancelBooking(input: {
  bookingId: string;
  actorId: string;
  actorIsStaff: boolean;
  reason?: string;
  refund?: boolean;
}): Promise<CancelResult> {
  const booking = await prisma.booking.findUnique({
    where: { id: input.bookingId },
    select: { id: true, userId: true, status: true, startsAt: true, reference: true },
  });

  // A un socio se le responde "no encontrada" tambien cuando la reserva es de
  // otro: confirmar que existe ya seria filtrar informacion.
  if (!booking) return { ok: false, error: "NO_ENCONTRADA" };
  if (!input.actorIsStaff && booking.userId !== input.actorId) {
    return { ok: false, error: "NO_ENCONTRADA" };
  }
  if (booking.status === "CANCELLED") return { ok: false, error: "YA_CANCELADA" };
  if (!input.actorIsStaff && booking.startsAt.getTime() <= Date.now()) {
    return { ok: false, error: "YA_EMPEZADA" };
  }

  const settings = await getSettings();
  const margenMs = settings["booking.cancelDeadlineHours"] * 3_600_000;
  const lateCancel = booking.startsAt.getTime() - Date.now() < margenMs;
  const devolver = input.refund ?? !lateCancel;
  const porElClub = input.actorIsStaff && booking.userId !== input.actorId;

  return prisma.$transaction(async (tx): Promise<CancelResult> => {
    const actualizadas = await tx.booking.updateMany({
      where: { id: booking.id, status: { not: "CANCELLED" } },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelledById: input.actorId,
        cancelReason: input.reason?.slice(0, 300) ?? (lateCancel ? "Cancelación fuera de plazo" : null),
      },
    });
    if (actualizadas.count === 0) return { ok: false, error: "YA_CANCELADA" };

    const refundedCents = devolver
      ? await refundBookingInTx(tx, {
          bookingId: booking.id,
          actorId: input.actorId,
          concept: porElClub
            ? `Devolución: el club canceló la reserva ${booking.reference}`
            : `Devolución: cancelaste la reserva ${booking.reference}`,
        })
      : 0;

    return { ok: true, lateCancel, refundedCents };
  });
}
