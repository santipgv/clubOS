import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createBooking, cancelBooking } from "@/lib/booking/create";
import { createCourtBlock } from "@/lib/booking/blocks";
import { markBookingPaid } from "@/lib/booking/payments";
import { addDaysToDay, clubDayMinutesToUtc, clubToday } from "@/lib/time";

/**
 * Prueba de integracion contra Postgres real. Es la unica forma de comprobar
 * lo que de verdad importa en un sistema de reservas: que dos socios pulsando
 * a la vez no acaben con la misma pista.
 */

const SUFIJO = Math.random().toString(36).slice(2, 8);
const COD_PISTA = `TEST-${SUFIJO}`.toUpperCase().slice(0, 16);

let courtId = "";
const socios: string[] = [];

/**
 * Dia sobre el que se prueba. No se fija a ciegas: la base de datos es
 * compartida y un bloqueo del club creado por otra persona dejaria estas
 * pruebas en rojo sin que hubiera ningun fallo real. Se busca el primer dia
 * de la ventana de reserva sin bloqueos que afecten a la pista.
 */
let DIA = addDaysToDay(clubToday(), 2);

async function primerDiaLibreDeBloqueos(): Promise<string> {
  for (let i = 1; i <= 6; i++) {
    const dia = addDaysToDay(clubToday(), i);
    const bloqueos = await prisma.courtBlock.count({
      where: {
        startsAt: { lt: clubDayMinutesToUtc(dia, 24 * 60) },
        endsAt: { gt: clubDayMinutesToUtc(dia, 0) },
        OR: [{ courtId: null, sport: null }, { courtId: null, sport: "PADEL" }],
      },
    });
    if (bloqueos === 0) return dia;
  }
  throw new Error(
    "No hay ningun dia libre de bloqueos en la ventana de reserva: revisa la tabla CourtBlock.",
  );
}

/**
 * Cada prueba usa socios recien creados: los limites de reservas por socio y
 * por dia son reales y, de reutilizarlos, la prueba mediria el limite en lugar
 * de lo que pretende medir.
 */
async function nuevoSocio(): Promise<string> {
  const n = socios.length + 1;
  const u = await prisma.user.create({
    data: {
      email: `test-${SUFIJO}-${n}@ejemplo.invalid`,
      firstName: "Socio",
      lastName: `Prueba ${n}`,
      status: "ACTIVE",
      role: "MEMBER",
      memberNumber: `T${SUFIJO}${n}`,
      emailVerifiedAt: new Date(),
    },
    select: { id: true },
  });
  socios.push(u.id);
  return u.id;
}

beforeAll(async () => {
  DIA = await primerDiaLibreDeBloqueos();

  const court = await prisma.court.create({
    data: {
      sport: "PADEL",
      code: COD_PISTA,
      name: `Pista de prueba ${SUFIJO}`,
      slotMinutes: 30,
      allowedDurations: [60, 90],
      maxPlayers: 4,
      isActive: true,
      schedules: {
        create: Array.from({ length: 7 }, (_, weekday) => ({
          weekday,
          opensAt: 8 * 60,
          closesAt: 23 * 60,
        })),
      },
    },
    select: { id: true },
  });
  courtId = court.id;
});

afterAll(async () => {
  await prisma.booking.deleteMany({ where: { courtId } });
  await prisma.courtBlock.deleteMany({ where: { courtId } });
  await prisma.courtSchedule.deleteMany({ where: { courtId } });
  await prisma.court.deleteMany({ where: { id: courtId } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: socios } } });
  await prisma.user.deleteMany({ where: { id: { in: socios } } });
  await prisma.$disconnect();
});

function reserva(userId: string, startMinute: number, durationMinutes = 60) {
  return createBooking({
    courtId,
    day: DIA,
    startMinute,
    durationMinutes,
    userId,
    actorId: userId,
    actorIsStaff: false,
  });
}

describe("dos socios reservando el mismo hueco a la vez", () => {
  it("solo uno se lleva la pista", async () => {
    const inicio = 10 * 60;
    const [uno, dos] = [await nuevoSocio(), await nuevoSocio()];

    const [a, b] = await Promise.all([reserva(uno, inicio), reserva(dos, inicio)]);

    const exitos = [a, b].filter((r) => r.ok);
    expect(exitos).toHaveLength(1);

    const fallo = [a, b].find((r) => !r.ok);
    expect(fallo && !fallo.ok && fallo.error).toMatch(/HUECO_OCUPADO|CONFLICTO_TEMPORAL/);

    // La verdad esta en la base de datos, no en lo que devuelva la aplicacion.
    const enBd = await prisma.booking.count({
      where: {
        courtId,
        status: { notIn: ["CANCELLED"] },
        startsAt: clubDayMinutesToUtc(DIA, inicio),
      },
    });
    expect(enBd).toBe(1);
  });

  it("una reserva solapada parcialmente tampoco entra", async () => {
    const primera = await reserva(await nuevoSocio(), 12 * 60, 60); // 12:00–13:00
    expect(primera.ok).toBe(true);

    const solapada = await reserva(await nuevoSocio(), 12 * 60 + 30, 60); // 12:30–13:30
    expect(solapada.ok).toBe(false);
    if (!solapada.ok) expect(solapada.error).toBe("HUECO_OCUPADO");
  });

  it("dos reservas consecutivas si conviven: 14-15 y 15-16 no se solapan", async () => {
    const a = await reserva(await nuevoSocio(), 14 * 60, 60);
    const b = await reserva(await nuevoSocio(), 15 * 60, 60);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
  });

  it("cancelar libera el hueco para otro socio", async () => {
    const inicio = 17 * 60;
    const titular = await nuevoSocio();
    const aspirante = await nuevoSocio();

    const original = await reserva(titular, inicio);
    expect(original.ok).toBe(true);
    if (!original.ok) return;

    const ocupado = await reserva(aspirante, inicio);
    expect(ocupado.ok).toBe(false);

    const cancelacion = await cancelBooking({
      bookingId: original.bookingId,
      actorId: titular,
      actorIsStaff: false,
    });
    expect(cancelacion.ok).toBe(true);

    const reintento = await reserva(aspirante, inicio);
    expect(reintento.ok).toBe(true);
  });
});

describe("operaciones administrativas concurrentes", () => {
  it("una reserva y un bloqueo simultaneos nunca quedan activos a la vez", async () => {
    const inicio = 16 * 60;
    const actor = await nuevoSocio();
    const titular = await nuevoSocio();
    const startsAt = clubDayMinutesToUtc(DIA, inicio);
    const endsAt = clubDayMinutesToUtc(DIA, inicio + 60);

    const [bookingResult, blockResult] = await Promise.all([
      reserva(titular, inicio),
      createCourtBlock({
        courtId,
        sport: null,
        startsAt,
        endsAt,
        type: "MAINTENANCE",
        title: "Bloqueo concurrente",
        description: null,
        isPublic: true,
        createdById: actor,
        confirmed: true,
      }),
    ]);

    expect(blockResult.ok).toBe(true);
    const activeBookings = await prisma.booking.count({
      where: {
        courtId,
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
        status: { in: ["PENDING_PAYMENT", "CONFIRMED"] },
      },
    });
    expect(activeBookings).toBe(0);

    if (!bookingResult.ok) {
      expect(bookingResult.error).toMatch(/BLOQUEADA|CONFLICTO_TEMPORAL/);
    }
  });

  it("dos confirmaciones simultaneas crean un solo cobro", async () => {
    const titular = await nuevoSocio();
    const staff = await nuevoSocio();
    const booking = await reserva(titular, 18 * 60);
    expect(booking.ok).toBe(true);
    if (!booking.ok) return;

    await prisma.booking.update({
      where: { id: booking.bookingId },
      data: { priceCents: 1_200, paymentStatus: "PENDING" },
    });

    const [first, second] = await Promise.all([
      markBookingPaid({ bookingId: booking.bookingId, method: "CASH", registeredById: staff }),
      markBookingPaid({ bookingId: booking.bookingId, method: "CASH", registeredById: staff }),
    ]);

    expect([first, second].filter((result) => result.ok)).toHaveLength(1);
    expect([first, second].filter((result) => !result.ok)).toEqual([
      { ok: false, error: "ALREADY_PAID" },
    ]);
    expect(await prisma.payment.count({ where: { bookingId: booking.bookingId } })).toBe(1);
    expect(
      (await prisma.booking.findUnique({
        where: { id: booking.bookingId },
        select: { paymentStatus: true },
      }))?.paymentStatus,
    ).toBe("PAID");
  });
});

describe("reglas de negocio", () => {
  it("no se puede reservar sobre un bloqueo del club", async () => {
    const inicio = 19 * 60;
    await prisma.courtBlock.create({
      data: {
        courtId,
        startsAt: clubDayMinutesToUtc(DIA, inicio),
        endsAt: clubDayMinutesToUtc(DIA, inicio + 120),
        type: "TOURNAMENT",
        title: "Torneo de prueba",
        createdById: await nuevoSocio(),
      },
    });

    const r = await reserva(await nuevoSocio(), inicio);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("BLOQUEADA");
  });

  it("rechaza duraciones que la pista no ofrece", async () => {
    const r = await reserva(await nuevoSocio(), 9 * 60, 45);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("DURACION_NO_PERMITIDA");
  });

  it("rechaza horas fuera del horario de apertura", async () => {
    const r = await reserva(await nuevoSocio(), 6 * 60, 60);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("FUERA_DE_HORARIO");
  });

  it("rechaza reservar en el pasado", async () => {
    const enElPasado = await nuevoSocio();
    const r = await createBooking({
      courtId,
      day: addDaysToDay(clubToday(), -1),
      startMinute: 10 * 60,
      durationMinutes: 60,
      userId: enElPasado,
      actorId: enElPasado,
      actorIsStaff: false,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("EN_EL_PASADO");
  });

  it("rechaza reservar mas alla de la ventana de apertura del calendario", async () => {
    const enElPasado = await nuevoSocio();
    const r = await createBooking({
      courtId,
      day: addDaysToDay(clubToday(), 45),
      startMinute: 10 * 60,
      durationMinutes: 60,
      userId: enElPasado,
      actorId: enElPasado,
      actorIsStaff: false,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("FUERA_DE_VENTANA");
  });

  it("un socio suspendido no puede reservar", async () => {
    const id = await nuevoSocio();
    await prisma.user.update({ where: { id }, data: { status: "SUSPENDED" } });

    const r = await reserva(id, 21 * 60);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("SOCIO_NO_ACTIVO");
  });
});
