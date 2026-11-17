import { prisma } from "@/lib/db";
import {
  clubDayMinutesToUtc,
  clubWeekday,
  minutesToHHMM,
} from "@/lib/time";
import { getSettings, type ClubSettings } from "@/lib/settings";
import { quote, type Quote } from "./pricing";
import type { BlockType, Court, MemberType, PaymentStatus, Sport } from "@/lib/types";

/**
 * Motor de disponibilidad. Construye la rejilla de un dia para un deporte.
 *
 * Todo el razonamiento horario se hace en minutos locales del club y solo se
 * convierte a UTC en la frontera con la base de datos.
 */

export type SlotState = "LIBRE" | "PASADA" | "RESERVADA" | "PAGADA" | "BLOQUEADA" | "CERRADA";

export type Slot = {
  startMinute: number;
  endMinute: number;
  startsAt: Date;
  state: SlotState;
  /** Reserva que ocupa el hueco, si la hay. */
  bookingId: string | null;
  bookingReference: string | null;
  /** Nombre del titular: solo se revela a staff o si la reserva es tuya. */
  holderName: string | null;
  isOwn: boolean;
  blockTitle: string | null;
  blockType: BlockType | null;
};

export type CourtAvailability = {
  court: Pick<Court, "id" | "name" | "code" | "sport" | "surface" | "isIndoor" | "hasLighting" | "slotMinutes" | "allowedDurations" | "maxPlayers">;
  slots: Slot[];
};

export type DayAvailability = {
  day: string;
  sport: Sport;
  /** Union ordenada de todos los minutos de inicio presentes, para alinear columnas. */
  timeline: { minute: number; label: string }[];
  courts: CourtAvailability[];
  firstBookableAt: number;
  settings: ClubSettings;
};

export async function getDayAvailability(input: {
  sport: Sport;
  courtId?: string;
  day: string;
  viewerId: string | null;
  viewerIsStaff: boolean;
}): Promise<DayAvailability> {
  const { sport, day, viewerId, viewerIsStaff } = input;
  const settings = await getSettings();
  const weekday = clubWeekday(day);

  const dayStart = clubDayMinutesToUtc(day, 0);
  const dayEnd = clubDayMinutesToUtc(day, 24 * 60);

  const courts = await prisma.court.findMany({
    where: { sport, id: input.courtId, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { schedules: { where: { weekday, isActive: true }, orderBy: { opensAt: "asc" } } },
  });

  const courtIds = courts.map((c) => c.id);

  const [bookings, blocks] = await Promise.all([
    prisma.booking.findMany({
      where: {
        courtId: { in: courtIds },
        status: { in: ["PENDING_PAYMENT", "CONFIRMED", "COMPLETED", "NO_SHOW"] },
        startsAt: { lt: dayEnd },
        endsAt: { gt: dayStart },
      },
      select: {
        id: true, reference: true, courtId: true, startsAt: true, endsAt: true,
        paymentStatus: true, userId: true,
        user: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.courtBlock.findMany({
      where: {
        startsAt: { lt: dayEnd },
        endsAt: { gt: dayStart },
        OR: [{ courtId: { in: courtIds } }, { courtId: null, sport }, { courtId: null, sport: null }],
      },
      select: {
        id: true, courtId: true, sport: true, startsAt: true, endsAt: true,
        type: true, title: true, isPublic: true,
      },
    }),
  ]);

  const now = Date.now();

  const availability: CourtAvailability[] = courts.map((court) => {
    const slots: Slot[] = [];
    const courtBookings = bookings.filter((b) => b.courtId === court.id);
    const courtBlocks = blocks.filter((b) => b.courtId === null || b.courtId === court.id);

    for (const schedule of court.schedules) {
      const desde = Math.max(schedule.opensAt, settings["club.openingMinute"]);
      const hasta = Math.min(schedule.closesAt, settings["club.closingMinute"]);

      for (let m = desde; m + court.slotMinutes <= hasta; m += court.slotMinutes) {
        const startsAt = clubDayMinutesToUtc(day, m);
        const endsAt = clubDayMinutesToUtc(day, m + court.slotMinutes);

        const booking = courtBookings.find((b) => b.startsAt < endsAt && b.endsAt > startsAt);
        const block = courtBlocks.find((b) => b.startsAt < endsAt && b.endsAt > startsAt);

        let state: SlotState = "LIBRE";
        if (booking) state = booking.paymentStatus === "PAID" ? "PAGADA" : "RESERVADA";
        else if (block) state = "BLOQUEADA";
        else if (startsAt.getTime() <= now) state = "PASADA";

        const isOwn = booking?.userId === viewerId && viewerId !== null;
        const puedeVerNombre = viewerIsStaff || isOwn;

        slots.push({
          startMinute: m,
          endMinute: m + court.slotMinutes,
          startsAt,
          state,
          bookingId: booking && puedeVerNombre ? booking.id : null,
          bookingReference: booking && puedeVerNombre ? booking.reference : null,
          holderName: booking && puedeVerNombre
            ? `${booking.user.firstName} ${booking.user.lastName}`
            : null,
          isOwn: Boolean(isOwn),
          blockTitle: block ? (block.isPublic || viewerIsStaff ? block.title : "No disponible") : null,
          blockType: block?.type ?? null,
        });
      }
    }

    return {
      court: {
        id: court.id, name: court.name, code: court.code, sport: court.sport,
        surface: court.surface, isIndoor: court.isIndoor, hasLighting: court.hasLighting,
        slotMinutes: court.slotMinutes, allowedDurations: court.allowedDurations,
        maxPlayers: court.maxPlayers,
      },
      slots,
    };
  });

  const minutos = [...new Set(availability.flatMap((c) => c.slots.map((s) => s.startMinute)))].sort(
    (a, b) => a - b,
  );

  return {
    day,
    sport,
    timeline: minutos.map((minute) => ({ minute, label: minutesToHHMM(minute) })),
    courts: availability,
    firstBookableAt: now + settings["booking.minLeadMinutes"] * 60_000,
    settings,
  };
}

/**
 * Duraciones que caben empezando en un minuto dado: todos los huecos
 * consecutivos deben estar libres y dentro del horario de la pista.
 */
export function durationsAvailableAt(
  courtAvailability: CourtAvailability,
  startMinute: number,
): number[] {
  const { court, slots } = courtAvailability;
  const porMinuto = new Map(slots.map((s) => [s.startMinute, s]));

  return court.allowedDurations
    .filter((duracion) => duracion % court.slotMinutes === 0)
    .filter((duracion) => {
      const necesarios = duracion / court.slotMinutes;
      for (let i = 0; i < necesarios; i++) {
        const slot = porMinuto.get(startMinute + i * court.slotMinutes);
        if (!slot || slot.state !== "LIBRE") return false;
      }
      return true;
    })
    .sort((a, b) => a - b);
}

/** Presupuesto de un hueco concreto, para mostrarlo antes de confirmar. */
export async function quoteSlot(input: {
  courtId: string;
  sport: Sport;
  memberType: MemberType;
  day: string;
  startMinute: number;
  durationMinutes: number;
}): Promise<Quote> {
  const rules = await prisma.priceRule.findMany({
    where: { OR: [{ courtId: input.courtId }, { courtId: null, sport: input.sport }, { courtId: null, sport: null }] },
  });
  return quote(rules, {
    courtId: input.courtId,
    sport: input.sport,
    memberType: input.memberType,
    weekday: clubWeekday(input.day),
    startMinute: input.startMinute,
    endMinute: input.startMinute + input.durationMinutes,
  });
}

export const PAYMENT_STATE_LABEL: Record<PaymentStatus, string> = {
  NOT_REQUIRED: "Incluida",
  PENDING: "Reservado",
  PAID: "Pagado",
  REFUNDED: "Devuelto",
};
