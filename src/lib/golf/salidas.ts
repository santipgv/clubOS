import { prisma, isUniqueViolation, isSerializationFailure } from "@/lib/db";
import { generateBookingReference } from "@/lib/auth/tokens";
import { clubDayMinutesToUtc, clubWeekday, clubToday, daysBetween, isValidDay } from "@/lib/time";
import { getSettings } from "@/lib/settings";
import { taxIncludedIn } from "@/lib/booking/pricing";
import type { GolfInvitationPayment } from "@/generated/prisma/enums";
import type { GolfCourse, TaxTreatment } from "@/lib/types";

/**
 * Salidas de golf (tee times).
 *
 * La diferencia con el resto de deportes no es cosmetica. En padel, tenis y
 * croquet se reserva una pista **en exclusiva**: lo que hay que impedir es que
 * dos reservas se solapen, y de eso se encarga un constraint de exclusion.
 *
 * En golf varios socios **comparten** la misma salida hasta completar el
 * flight, asi que el solape no solo esta permitido: es lo normal. Lo que no
 * puede ocurrir es que entre todos se pasen del aforo. Eso es un contador, no
 * un intervalo, y se resuelve de otra manera.
 */

export type FalloGolf =
  | "RECORRIDO_NO_ENCONTRADO"
  | "SOCIO_NO_ACTIVO"
  | "DIA_INVALIDO"
  | "FUERA_DE_HORARIO"
  | "FUERA_DE_VENTANA"
  | "EN_EL_PASADO"
  | "SALIDA_NO_ALINEADA"
  | "JUGADORES_INVALIDOS"
  | "BUGGIES_NO_DISPONIBLES"
  | "SALIDA_COMPLETA"
  | "BLOQUEADA"
  | "SOCIO_INVITADO_INVALIDO"
  | "YA_TIENE_PLAZA";

export const MENSAJES_GOLF: Record<FalloGolf, string> = {
  RECORRIDO_NO_ENCONTRADO: "Ese recorrido no existe o no está disponible.",
  SOCIO_NO_ACTIVO: "Tu alta de socio aún no está activa, no puedes reservar.",
  DIA_INVALIDO: "La fecha indicada no es válida.",
  FUERA_DE_HORARIO: "El campo no está abierto a esa hora.",
  FUERA_DE_VENTANA: "Todavía no se puede reservar con tanta antelación.",
  EN_EL_PASADO: "Esa salida ya ha pasado.",
  SALIDA_NO_ALINEADA: "Esa hora no corresponde a ninguna salida del campo.",
  JUGADORES_INVALIDOS: "Revisa el número de jugadores de la reserva.",
  BUGGIES_NO_DISPONIBLES: "Este recorrido no ofrece buggies.",
  SALIDA_COMPLETA: "Esa salida acaba de completarse. Elige otra hora.",
  YA_TIENE_PLAZA: "Ya tienes una plaza o una invitación en esa salida. Revisa Mis reservas.",
  SOCIO_INVITADO_INVALIDO: "Indica el número de otro socio activo que no tenga ya plaza en esa salida.",
  BLOQUEADA: "El club ha reservado esa franja para una competición o mantenimiento.",
};

// ------------------------------------------------------------------ precio

export type PresupuestoGolf = {
  priceCents: number;
  taxCents: number;
  taxTreatment: TaxTreatment;
  desglose: { concepto: string; cantidad: number; importeCents: number }[];
};

/**
 * El precio de golf es **por jugador**, no por salida, y distingue socio de
 * invitado: el socio esta exento de IVA y el invitado no. Cuando una misma
 * reserva lleva de los dos, se queda con el tratamiento del invitado, que es
 * el mas gravoso, y la cuota de IVA se calcula solo sobre su parte.
 */
export function presupuestoGolf(
  course: Pick<
    GolfCourse,
    "memberPriceCents" | "guestPriceCents" | "memberTaxTreatment" | "guestTaxTreatment" | "buggyPriceCents"
  >,
  input: { players: number; guestCount: number; buggies: number },
): PresupuestoGolf {
  const socios = Math.max(0, input.players - input.guestCount);
  const invitados = Math.max(0, input.guestCount);

  const importeSocios = socios * course.memberPriceCents;
  const importeInvitados = invitados * course.guestPriceCents;
  const importeBuggies = input.buggies * course.buggyPriceCents;

  const desglose = [
    { concepto: "Jugadores socios", cantidad: socios, importeCents: importeSocios },
    { concepto: "Jugadores invitados", cantidad: invitados, importeCents: importeInvitados },
    { concepto: "Buggies", cantidad: input.buggies, importeCents: importeBuggies },
  ].filter((linea) => linea.cantidad > 0);

  // El IVA del invitado se calcula sobre su parte; la del socio va exenta.
  const taxCents =
    taxIncludedIn(importeSocios, course.memberTaxTreatment) +
    taxIncludedIn(importeInvitados + importeBuggies, course.guestTaxTreatment);

  return {
    priceCents: importeSocios + importeInvitados + importeBuggies,
    taxCents,
    taxTreatment: invitados > 0 ? course.guestTaxTreatment : course.memberTaxTreatment,
    desglose,
  };
}

// ------------------------------------------------------------------ huecos

export type EstadoSalida = "LIBRE" | "PARCIAL" | "COMPLETA" | "PASADA" | "BLOQUEADA";

export type Salida = {
  startMinute: number;
  startsAt: Date;
  hora: string;
  estado: EstadoSalida;
  ocupados: number;
  libres: number;
  aforo: number;
  /// Quien va en la salida. Solo con nombre si es tuya o eres del club.
  acompanantes: { nombre: string; jugadores: number; esTuya: boolean }[];
  bloqueoTitulo: string | null;
};

export type HojaDeSalidas = {
  day: string;
  course: GolfCourse;
  salidas: Salida[];
  ventanaDias: number;
};

/**
 * Hoja de salidas del dia: todos los huecos que genera el horario del
 * recorrido separados por su intervalo, con lo que lleva ocupado cada uno.
 */
export async function hojaDeSalidas(input: {
  courseId: string;
  day: string;
  viewerId: string | null;
  viewerIsStaff: boolean;
}): Promise<HojaDeSalidas | null> {
  const { courseId, day, viewerId, viewerIsStaff } = input;

  const course = await prisma.golfCourse.findFirst({
    where: { id: courseId, isActive: true },
    include: { schedules: { where: { weekday: clubWeekday(day), isActive: true }, orderBy: { opensAt: "asc" } } },
  });
  if (!course) return null;

  const settings = await getSettings();
  const inicioDia = clubDayMinutesToUtc(day, 0);
  const finDia = clubDayMinutesToUtc(day, 24 * 60);

  const [teeTimes, bloqueos] = await Promise.all([
    prisma.golfTeeTime.findMany({
      where: { courseId, startsAt: { gte: inicioDia, lt: finDia } },
      include: {
        bookings: {
          where: { status: { notIn: ["CANCELLED", "INVITED"] } },
          select: {
            players: true,
            userId: true,
            user: { select: { firstName: true, lastName: true } },
          },
        },
      },
    }),
    prisma.golfBlock.findMany({
      where: {
        startsAt: { lt: finDia },
        endsAt: { gt: inicioDia },
        OR: [{ courseId }, { courseId: null }],
      },
      select: { startsAt: true, endsAt: true, title: true, isPublic: true },
    }),
  ]);

  const porInstante = new Map(teeTimes.map((t) => [t.startsAt.getTime(), t]));
  const primeraSalida = Date.now() + settings["booking.minLeadMinutes"] * 60_000;
  const salidas: Salida[] = [];

  for (const horario of course.schedules) {
    for (
      let minuto = horario.opensAt;
      minuto < horario.closesAt;
      minuto += course.teeIntervalMinutes
    ) {
      const startsAt = clubDayMinutesToUtc(day, minuto);
      const teeTime = porInstante.get(startsAt.getTime());
      const ocupados = teeTime?.playersBooked ?? 0;

      const bloqueo = bloqueos.find((b) => b.startsAt <= startsAt && b.endsAt > startsAt);

      let estado: EstadoSalida;
      if (bloqueo) estado = "BLOQUEADA";
      else if (startsAt.getTime() <= primeraSalida) estado = "PASADA";
      else if (ocupados >= course.maxPlayers) estado = "COMPLETA";
      else if (ocupados > 0) estado = "PARCIAL";
      else estado = "LIBRE";

      salidas.push({
        startMinute: minuto,
        startsAt,
        hora: `${String(Math.floor(minuto / 60)).padStart(2, "0")}:${String(minuto % 60).padStart(2, "0")}`,
        estado,
        ocupados,
        libres: Math.max(0, course.maxPlayers - ocupados),
        aforo: course.maxPlayers,
        acompanantes: (teeTime?.bookings ?? []).map((b) => {
          const esTuya = viewerId !== null && b.userId === viewerId;
          return {
            // Para unirse a una salida hace falta saber con quien se juega.
            // Fuera de eso, el nombre solo lo ve el club o el propio titular.
            nombre: esTuya || viewerIsStaff
              ? `${b.user.firstName} ${b.user.lastName}`
              : `${b.user.firstName} ${b.user.lastName.charAt(0)}.`,
            jugadores: b.players,
            esTuya,
          };
        }),
        bloqueoTitulo: bloqueo ? (bloqueo.isPublic || viewerIsStaff ? bloqueo.title : "No disponible") : null,
      });
    }
  }

  return { day, course, salidas, ventanaDias: settings["booking.windowDays"] };
}

// ------------------------------------------------------------------ reservar

export type ResultadoGolf =
  | { ok: true; bookingId: string; reference: string; priceCents: number; taxCents: number; ocupados: number }
  | { ok: false; error: FalloGolf };

type FilaReserva = { id: string; reference: string; teeTimeId: string; players_booked: number };

export async function reservarSalida(input: {
  courseId: string;
  day: string;
  startMinute: number;
  userId: string;
  actorId: string;
  actorIsStaff: boolean;
  players: number;
  guestCount?: number;
  buggies?: number;
  playerNames?: string[];
  notes?: string;
  invite?: { memberNumbers: string[]; payment: GolfInvitationPayment };
  /// Uso interno: reintentos por colisión de referencia o serialización.
  intento?: number;
}): Promise<ResultadoGolf> {
  if (!isValidDay(input.day)) return { ok: false, error: "DIA_INVALIDO" };

  const settings = await getSettings();
  const [course, socio] = await Promise.all([
    prisma.golfCourse.findFirst({
      where: { id: input.courseId, isActive: true },
      include: { schedules: { where: { weekday: clubWeekday(input.day), isActive: true } } },
    }),
    prisma.user.findUnique({ where: { id: input.userId }, select: { status: true } }),
  ]);

  if (!course) return { ok: false, error: "RECORRIDO_NO_ENCONTRADO" };
  if (!socio || socio.status !== "ACTIVE") return { ok: false, error: "SOCIO_NO_ACTIVO" };

  const guestCount = Math.max(0, input.guestCount ?? 0);
  const buggies = Math.max(0, input.buggies ?? 0);

  if (
    !Number.isInteger(input.players) ||
    input.players < 1 ||
    input.players > course.maxPlayers ||
    guestCount > input.players
  ) {
    return { ok: false, error: "JUGADORES_INVALIDOS" };
  }
  const numerosSocio = input.invite?.memberNumbers ?? [];
  if (numerosSocio.length > 0 && (numerosSocio.length > 3 || guestCount + numerosSocio.length >= input.players)) {
    return { ok: false, error: "JUGADORES_INVALIDOS" };
  }
  if (new Set(numerosSocio).size !== numerosSocio.length) {
    return { ok: false, error: "SOCIO_INVITADO_INVALIDO" };
  }
  if (buggies > 0 && !course.buggiesAvailable) return { ok: false, error: "BUGGIES_NO_DISPONIBLES" };

  // La salida tiene que caer en el horario y alineada con el intervalo.
  const horario = course.schedules.find(
    (h) => input.startMinute >= h.opensAt && input.startMinute < h.closesAt,
  );
  if (!horario) return { ok: false, error: "FUERA_DE_HORARIO" };
  if ((input.startMinute - horario.opensAt) % course.teeIntervalMinutes !== 0) {
    return { ok: false, error: "SALIDA_NO_ALINEADA" };
  }

  const startsAt = clubDayMinutesToUtc(input.day, input.startMinute);
  if (startsAt.getTime() < Date.now() + settings["booking.minLeadMinutes"] * 60_000) {
    return { ok: false, error: "EN_EL_PASADO" };
  }
  if (!input.actorIsStaff) {
    const antelacion = daysBetween(clubToday(), input.day);
    if (antelacion > settings["booking.windowDays"]) return { ok: false, error: "FUERA_DE_VENTANA" };
  }

  const players = input.players - numerosSocio.length;
  const presupuesto = presupuestoGolf(course, { players, guestCount, buggies });
  const reference = generateBookingReference();
  const nombres = (input.playerNames ?? []).slice(0, players);

  try {
    /**
     * Apuntarse a la salida y crear la reserva ocurren en **una sola
     * sentencia**, y de ahi sale la garantia de aforo.
     *
     * `ON CONFLICT ... DO UPDATE ... WHERE` toma el cerrojo de la fila y vuelve
     * a evaluar la condicion sobre el valor ya actualizado, asi que dos socios
     * que pulsen a la vez no pueden pasar los dos. Si la condicion falla no
     * vuelve ninguna fila, el INSERT de la reserva no encuentra origen y no
     * inserta nada: o entran los dos pasos o no entra ninguno.
     *
     * El aislamiento serializable se comparte con crearBloqueoGolf:
     * si un bloqueo concurrente invalida esta lectura, se reintenta.
     */
    const result = await prisma.$transaction(async (tx) => {
      const mismaSalida = { status: { not: "CANCELLED" as const }, teeTime: { courseId: course.id, startsAt } };
      const previa = await tx.golfBooking.findFirst({
        where: { ...mismaSalida, userId: input.userId }, select: { id: true },
      });
      if (previa) return { fallo: "YA_TIENE_PLAZA" as const };
      let invitados: { id: string }[] = [];
      if (numerosSocio.length > 0) {
        invitados = await tx.user.findMany({
          where: {
            id: { not: input.userId }, status: "ACTIVE", memberNumber: { in: numerosSocio },
            golfBookings: { none: mismaSalida },
          },
          select: { id: true },
        });
        if (invitados.length !== numerosSocio.length) return { fallo: "SOCIO_INVITADO_INVALIDO" as const };
      }
      const filas = await tx.$queryRaw<FilaReserva[]>`
      WITH salida AS (
        INSERT INTO "GolfTeeTime" ("id", "courseId", "startsAt", "playersBooked", "createdAt")
        SELECT gen_random_uuid()::text, ${course.id}, ${startsAt}, ${input.players}, now()
        WHERE NOT EXISTS (
          SELECT 1 FROM "GolfBlock" b
          WHERE b."startsAt" <= ${startsAt} AND b."endsAt" > ${startsAt}
            AND (b."courseId" = ${course.id} OR b."courseId" IS NULL)
        )
        ON CONFLICT ("courseId", "startsAt")
        DO UPDATE SET "playersBooked" = "GolfTeeTime"."playersBooked" + ${input.players}
        WHERE "GolfTeeTime"."playersBooked" + ${input.players} <= ${course.maxPlayers}
        RETURNING "id", "playersBooked"
      )
      INSERT INTO "GolfBooking" (
        "id", "reference", "teeTimeId", "userId", "createdById",
        "players", "guestCount", "buggies", "playerNames",
        "status", "paymentStatus", "priceCents", "taxCents", "taxTreatment",
        "notes", "createdAt", "updatedAt"
      )
      SELECT
        gen_random_uuid()::text, ${reference}, salida."id", ${input.userId}, ${input.actorId},
        ${players}, ${guestCount}, ${buggies}, ${nombres}::text[],
        'CONFIRMED'::"GolfBookingStatus",
        ${presupuesto.priceCents === 0 ? "NOT_REQUIRED" : "PENDING"}::"PaymentStatus",
        ${presupuesto.priceCents}, ${presupuesto.taxCents},
        ${presupuesto.taxTreatment}::"TaxTreatment",
        ${input.notes?.slice(0, 500) ?? null}, now(), now()
      FROM salida
      RETURNING "id", "reference", "teeTimeId", (SELECT "playersBooked" FROM salida) AS players_booked
      `;
      const fila = filas[0];
      if (fila && input.invite && invitados.length > 0) {
        const payment = input.invite.payment;
        const individual = presupuestoGolf(course, { players: 1, guestCount: 0, buggies: 0 });
        await tx.golfBooking.createMany({ data: invitados.map((invitado) => ({
          reference: generateBookingReference(), teeTimeId: fila.teeTimeId,
          userId: invitado.id, createdById: input.actorId, status: "INVITED",
          invitedByBookingId: fila.id, invitationPayment: payment,
          priceCents: individual.priceCents, taxCents: individual.taxCents, taxTreatment: individual.taxTreatment,
          paymentStatus: individual.priceCents === 0 ? "NOT_REQUIRED" : "PENDING",
        })) });
      }
      return { fila };
    }, { isolationLevel: "Serializable" });

    if (result.fallo) return { ok: false, error: result.fallo };
    const fila = result.fila;
    if (!fila) {
      // Sin fila: o la salida esta llena, o hay un bloqueo encima.
      const bloqueada = await prisma.golfBlock.count({
        where: {
          startsAt: { lte: startsAt },
          endsAt: { gt: startsAt },
          OR: [{ courseId: course.id }, { courseId: null }],
        },
      });
      return { ok: false, error: bloqueada > 0 ? "BLOQUEADA" : "SALIDA_COMPLETA" };
    }

    return {
      ok: true,
      bookingId: fila.id,
      reference: fila.reference,
      priceCents: presupuesto.priceCents,
      taxCents: presupuesto.taxCents,
      ocupados: Number(fila.players_booked),
    };
  } catch (error) {
    // Colisiones de referencia y conflictos serializables se reintentan con
    // un límite. Cada intento vuelve a validar bloqueos y disponibilidad.
    const intento = input.intento ?? 0;
    if ((isUniqueViolation(error) || isSerializationFailure(error)) && intento < 5) {
      await new Promise((resolve) => setTimeout(resolve, 25 * (intento + 1)));
      return reservarSalida({ ...input, playerNames: nombres, intento: intento + 1 });
    }
    throw error;
  }
}

// ------------------------------------------------------------------ anular

export type ResultadoAnulacion =
  | { ok: true; liberados: number }
  | { ok: false; error: "NO_ENCONTRADA" | "YA_ANULADA" | "YA_EMPEZADA" | "PAGA_TITULAR" };

/** Devuelve las plazas y anula las invitaciones que dependen del titular. */
export async function anularReservaGolf(input: {
  bookingId: string;
  actorId: string;
  actorEsStaff: boolean;
  motivo?: string;
}): Promise<ResultadoAnulacion> {
  for (let retry = 0; ; retry++) {
    try {
      return await prisma.$transaction(async (tx): Promise<ResultadoAnulacion> => {
        const reserva = await tx.golfBooking.findUnique({
          where: { id: input.bookingId },
          select: {
            id: true, userId: true, status: true, invitationPayment: true, teeTimeId: true,
            teeTime: { select: { startsAt: true } },
            invitedBookings: {
              where: { OR: [{ status: "INVITED" }, { invitationPayment: "HOST" }] },
              select: { id: true },
            },
          },
        });
        if (!reserva || (!input.actorEsStaff && reserva.userId !== input.actorId)) {
          return { ok: false, error: "NO_ENCONTRADA" };
        }
        if (reserva.status === "CANCELLED") return { ok: false, error: "YA_ANULADA" };
        if (!input.actorEsStaff && reserva.teeTime.startsAt.getTime() <= Date.now()) {
          return { ok: false, error: "YA_EMPEZADA" };
        }
        if (reserva.invitationPayment === "HOST" && reserva.status !== "INVITED") {
          return { ok: false, error: "PAGA_TITULAR" };
        }
        const ids = [reserva.id, ...reserva.invitedBookings.map((invitada) => invitada.id)];
        const anuladas = await tx.golfBooking.updateManyAndReturn({
          where: { id: { in: ids }, status: { not: "CANCELLED" } },
          data: {
            status: "CANCELLED", cancelledAt: new Date(), cancelledById: input.actorId,
            cancelReason: input.motivo?.slice(0, 300),
          },
          select: { players: true },
        });
        const liberados = anuladas.reduce((n, b) => n + b.players, 0);
        await tx.golfTeeTime.update({
          where: { id: reserva.teeTimeId }, data: { playersBooked: { decrement: liberados } },
        });
        return { ok: true, liberados };
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (!isSerializationFailure(error) || retry >= 5) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25 * (retry + 1)));
    }
  }
}
