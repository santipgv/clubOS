import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createBooking, cancelBooking } from "@/lib/booking/create";
import { createCourtBlock } from "@/lib/booking/blocks";
import { markBookingPaid } from "@/lib/booking/payments";
import { payBookingWithWallet, refundCancelledBooking, topUpWallet } from "@/lib/wallet";
import { addDaysToDay, clubDayMinutesToUtc, clubToday } from "@/lib/time";
import { getSettings } from "@/lib/settings";

/**
 * Integracion contra Postgres real: el saldo es dinero de los socios y lo que
 * importa es que no se descuadre cuando llegan peticiones a la vez.
 */

const SUFIJO = Math.random().toString(36).slice(2, 8);
const COD_PISTA = `MON-${SUFIJO}`.toUpperCase().slice(0, 16);
const PRECIO = 1_200;

let courtId = "";
const socios: string[] = [];
let staffId = "";
let DIA = "";
let DIA_PROXIMO = "";

async function nuevoSocio(): Promise<string> {
  const n = socios.length + 1;
  const u = await prisma.user.create({
    data: {
      email: `monedero-${SUFIJO}-${n}@ejemplo.invalid`,
      firstName: "Socio",
      lastName: `Monedero ${n}`,
      status: "ACTIVE",
      role: "MEMBER",
      memberNumber: `M${SUFIJO}${n}`,
      emailVerifiedAt: new Date(),
    },
    select: { id: true },
  });
  socios.push(u.id);
  return u.id;
}

/** Reserva con precio, como si la tarifa la cobrara. */
async function reservaDePago(userId: string, startMinute: number, dia = DIA): Promise<string> {
  const r = await createBooking({
    courtId,
    day: dia,
    startMinute,
    durationMinutes: 60,
    userId,
    actorId: staffId,
    actorIsStaff: true,
  });
  if (!r.ok) throw new Error(`No se pudo crear la reserva de prueba: ${r.error}`);
  await prisma.booking.update({
    where: { id: r.bookingId },
    data: { priceCents: PRECIO, paymentStatus: "PENDING" },
  });
  return r.bookingId;
}

async function saldo(userId: string): Promise<number> {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { walletBalanceCents: true } });
  return u.walletBalanceCents;
}

/** El saldo siempre debe ser la suma de sus asientos. */
async function cuadra(userId: string): Promise<void> {
  const suma = await prisma.walletMovement.aggregate({ where: { userId }, _sum: { amountCents: true } });
  expect(await saldo(userId)).toBe(suma._sum.amountCents ?? 0);
}

async function diaSinBloqueos(desde: number): Promise<string> {
  for (let i = desde; i <= desde + 6; i++) {
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
  throw new Error("No hay ningun dia libre de bloqueos para las pruebas del monedero.");
}

beforeAll(async () => {
  const settings = await getSettings();
  // Lejos del plazo de cancelacion, para que cancelar sea "dentro de plazo".
  DIA = await diaSinBloqueos(Math.ceil(settings["booking.cancelDeadlineHours"] / 24) + 2);
  // Hoy dentro de unas horas: siempre fuera de plazo.
  DIA_PROXIMO = clubToday();

  staffId = await nuevoSocio();
  await prisma.user.update({ where: { id: staffId }, data: { role: "STAFF" } });

  const court = await prisma.court.create({
    data: {
      sport: "PADEL",
      code: COD_PISTA,
      name: `Pista monedero ${SUFIJO}`,
      slotMinutes: 30,
      allowedDurations: [60, 90],
      maxPlayers: 4,
      isActive: true,
      schedules: {
        create: Array.from({ length: 7 }, (_, weekday) => ({ weekday, opensAt: 0, closesAt: 24 * 60 })),
      },
    },
    select: { id: true },
  });
  courtId = court.id;
});

afterAll(async () => {
  await prisma.walletMovement.deleteMany({ where: { userId: { in: socios } } });
  await prisma.booking.deleteMany({ where: { courtId } });
  await prisma.courtBlock.deleteMany({ where: { courtId } });
  await prisma.courtSchedule.deleteMany({ where: { courtId } });
  await prisma.court.deleteMany({ where: { id: courtId } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: socios } } });
  await prisma.user.deleteMany({ where: { id: { in: socios } } });
  await prisma.$disconnect();
});

describe("recargas", () => {
  it("suma al saldo y deja un asiento con el saldo resultante", async () => {
    const socio = await nuevoSocio();
    const r = await topUpWallet({ userId: socio, amountCents: 2_000, method: "CASH", actorId: staffId });
    expect(r).toEqual({ ok: true, balanceCents: 2_000 });

    const asiento = await prisma.walletMovement.findFirstOrThrow({ where: { userId: socio } });
    expect(asiento).toMatchObject({ type: "TOPUP", amountCents: 2_000, balanceAfterCents: 2_000, method: "CASH" });
  });

  it("rechaza importes nulos, negativos o desorbitados", async () => {
    const socio = await nuevoSocio();
    for (const amountCents of [0, -500, 10.5, 10_000_000]) {
      const r = await topUpWallet({ userId: socio, amountCents, method: "CASH", actorId: staffId });
      expect(r).toEqual({ ok: false, error: "IMPORTE_NO_VALIDO" });
    }
    expect(await saldo(socio)).toBe(0);
  });

  it("muchas recargas simultaneas no pierden ningun euro", async () => {
    const socio = await nuevoSocio();
    await Promise.all(
      Array.from({ length: 8 }, () =>
        topUpWallet({ userId: socio, amountCents: 500, method: "CASH", actorId: staffId }),
      ),
    );
    expect(await saldo(socio)).toBe(4_000);
    await cuadra(socio);
  });
});

describe("pagar reservas con saldo", () => {
  it("cobra el importe integro y deja la reserva pagada", async () => {
    const socio = await nuevoSocio();
    await topUpWallet({ userId: socio, amountCents: 2_000, method: "CASH", actorId: staffId });
    const reserva = await reservaDePago(socio, 8 * 60);

    const r = await payBookingWithWallet({ bookingId: reserva, actorId: socio, ownerId: socio });
    expect(r).toEqual({ ok: true, amountCents: PRECIO, balanceCents: 800 });

    const b = await prisma.booking.findUniqueOrThrow({ where: { id: reserva }, include: { payment: true } });
    expect(b.paymentStatus).toBe("PAID");
    expect(b.payment).toMatchObject({ method: "WALLET", amountCents: PRECIO, status: "PAID" });
    await cuadra(socio);
  });

  it("sin saldo suficiente no cobra nada ni marca la reserva", async () => {
    const socio = await nuevoSocio();
    await topUpWallet({ userId: socio, amountCents: 1_000, method: "CASH", actorId: staffId });
    const reserva = await reservaDePago(socio, 9 * 60);

    const r = await payBookingWithWallet({ bookingId: reserva, actorId: socio, ownerId: socio });
    expect(r).toEqual({ ok: false, error: "SALDO_INSUFICIENTE" });

    expect(await saldo(socio)).toBe(1_000);
    const b = await prisma.booking.findUniqueOrThrow({ where: { id: reserva }, include: { payment: true } });
    expect(b.paymentStatus).toBe("PENDING");
    expect(b.payment).toBeNull();
  });

  it("un socio no puede pagar la reserva de otro", async () => {
    const titular = await nuevoSocio();
    const otro = await nuevoSocio();
    await topUpWallet({ userId: otro, amountCents: 5_000, method: "CASH", actorId: staffId });
    const reserva = await reservaDePago(titular, 10 * 60);

    const r = await payBookingWithWallet({ bookingId: reserva, actorId: otro, ownerId: otro });
    expect(r).toEqual({ ok: false, error: "NO_ENCONTRADA" });
    expect(await saldo(otro)).toBe(5_000);
  });

  it("dos pagos simultaneos de la misma reserva cobran una sola vez", async () => {
    const socio = await nuevoSocio();
    await topUpWallet({ userId: socio, amountCents: 5_000, method: "CASH", actorId: staffId });
    const reserva = await reservaDePago(socio, 11 * 60);

    const resultados = await Promise.all([
      payBookingWithWallet({ bookingId: reserva, actorId: socio, ownerId: socio }),
      payBookingWithWallet({ bookingId: reserva, actorId: socio, ownerId: socio }),
    ]);
    expect(resultados.filter((r) => r.ok)).toHaveLength(1);
    expect(await saldo(socio)).toBe(5_000 - PRECIO);
    expect(await prisma.payment.count({ where: { bookingId: reserva } })).toBe(1);
    await cuadra(socio);
  });

  it("dos reservas a la vez con saldo para una sola: solo entra una y el saldo no baja de cero", async () => {
    const socio = await nuevoSocio();
    await topUpWallet({ userId: socio, amountCents: PRECIO + 100, method: "CASH", actorId: staffId });
    const [a, b] = [await reservaDePago(socio, 12 * 60), await reservaDePago(socio, 13 * 60)];

    const resultados = await Promise.all([
      payBookingWithWallet({ bookingId: a, actorId: socio, ownerId: socio }),
      payBookingWithWallet({ bookingId: b, actorId: socio, ownerId: socio }),
    ]);
    expect(resultados.filter((r) => r.ok)).toHaveLength(1);
    expect(resultados.filter((r) => !r.ok)).toEqual([{ ok: false, error: "SALDO_INSUFICIENTE" }]);
    expect(await saldo(socio)).toBe(100);
    expect(await prisma.booking.count({ where: { id: { in: [a, b] }, paymentStatus: "PAID" } })).toBe(1);
    await cuadra(socio);
  });

  it("Postgres impide un saldo negativo aunque el codigo se equivoque", async () => {
    const socio = await nuevoSocio();
    await expect(
      prisma.user.update({ where: { id: socio }, data: { walletBalanceCents: { decrement: 1 } } }),
    ).rejects.toThrow();
  });
});

describe("devoluciones al cancelar", () => {
  it("el socio cancela dentro de plazo: lo pagado vuelve a su monedero", async () => {
    const socio = await nuevoSocio();
    await topUpWallet({ userId: socio, amountCents: PRECIO, method: "CASH", actorId: staffId });
    const reserva = await reservaDePago(socio, 14 * 60);
    await payBookingWithWallet({ bookingId: reserva, actorId: socio, ownerId: socio });
    expect(await saldo(socio)).toBe(0);

    const r = await cancelBooking({ bookingId: reserva, actorId: socio, actorIsStaff: false });
    expect(r).toEqual({ ok: true, lateCancel: false, refundedCents: PRECIO });
    expect(await saldo(socio)).toBe(PRECIO);

    const b = await prisma.booking.findUniqueOrThrow({ where: { id: reserva }, include: { payment: true } });
    expect(b.paymentStatus).toBe("REFUNDED");
    expect(b.payment?.status).toBe("REFUNDED");
    await cuadra(socio);
  });

  it("lo pagado en efectivo tambien vuelve al monedero, no a la mano", async () => {
    const socio = await nuevoSocio();
    const reserva = await reservaDePago(socio, 15 * 60);
    await markBookingPaid({ bookingId: reserva, method: "CASH", registeredById: staffId });

    const r = await cancelBooking({ bookingId: reserva, actorId: socio, actorIsStaff: false });
    expect(r.ok && r.refundedCents).toBe(PRECIO);
    expect(await saldo(socio)).toBe(PRECIO);
  });

  it("una reserva sin pagar no devuelve nada", async () => {
    const socio = await nuevoSocio();
    const reserva = await reservaDePago(socio, 16 * 60);
    const r = await cancelBooking({ bookingId: reserva, actorId: socio, actorIsStaff: false });
    expect(r.ok && r.refundedCents).toBe(0);
    expect(await saldo(socio)).toBe(0);
  });

  it("fuera de plazo no hay devolucion automatica, pero el club puede devolverla despues", async () => {
    const socio = await nuevoSocio();
    // El primer hueco de hoy que aun no ha empezado: siempre fuera de plazo.
    let enHoraLocal: number | null = null;
    for (let m = 8 * 60; m <= 22 * 60; m += 30) {
      if (clubDayMinutesToUtc(DIA_PROXIMO, m).getTime() > Date.now() + 5 * 60_000) {
        enHoraLocal = m;
        break;
      }
    }
    if (enHoraLocal === null) return; // a ultima hora de la noche no queda ningun hueco hoy

    const reserva = await reservaDePago(socio, enHoraLocal, DIA_PROXIMO);
    await markBookingPaid({ bookingId: reserva, method: "CASH", registeredById: staffId });

    const r = await cancelBooking({ bookingId: reserva, actorId: socio, actorIsStaff: false });
    expect(r).toEqual({ ok: true, lateCancel: true, refundedCents: 0 });
    expect(await saldo(socio)).toBe(0);

    const devolucion = await refundCancelledBooking({ bookingId: reserva, actorId: staffId });
    expect(devolucion).toEqual({ ok: true, refundedCents: PRECIO });
    expect(await saldo(socio)).toBe(PRECIO);

    // Y no se puede devolver dos veces.
    expect(await refundCancelledBooking({ bookingId: reserva, actorId: staffId })).toEqual({
      ok: false,
      error: "NADA_QUE_DEVOLVER",
    });
    expect(await saldo(socio)).toBe(PRECIO);
  });

  it("el club cancela y decide no devolver", async () => {
    const socio = await nuevoSocio();
    const reserva = await reservaDePago(socio, 17 * 60);
    await markBookingPaid({ bookingId: reserva, method: "CASH", registeredById: staffId });

    const r = await cancelBooking({ bookingId: reserva, actorId: staffId, actorIsStaff: true, refund: false });
    expect(r.ok && r.refundedCents).toBe(0);
    expect(await saldo(socio)).toBe(0);
  });

  it("el club cancela y devuelve", async () => {
    const socio = await nuevoSocio();
    const reserva = await reservaDePago(socio, 18 * 60);
    await markBookingPaid({ bookingId: reserva, method: "TRANSFER", registeredById: staffId });

    const r = await cancelBooking({ bookingId: reserva, actorId: staffId, actorIsStaff: true, refund: true });
    expect(r.ok && r.refundedCents).toBe(PRECIO);
    expect(await saldo(socio)).toBe(PRECIO);

    const asiento = await prisma.walletMovement.findFirstOrThrow({ where: { bookingId: reserva } });
    expect(asiento.concept).toMatch(/el club canceló/);
  });

  it("cancelaciones simultaneas devuelven una sola vez", async () => {
    const socio = await nuevoSocio();
    const reserva = await reservaDePago(socio, 19 * 60);
    await markBookingPaid({ bookingId: reserva, method: "CASH", registeredById: staffId });

    await Promise.all([
      cancelBooking({ bookingId: reserva, actorId: socio, actorIsStaff: false }),
      cancelBooking({ bookingId: reserva, actorId: staffId, actorIsStaff: true, refund: true }),
      refundCancelledBooking({ bookingId: reserva, actorId: staffId }),
    ]);

    expect(await saldo(socio)).toBe(PRECIO);
    expect(await prisma.walletMovement.count({ where: { bookingId: reserva, type: "REFUND" } })).toBe(1);
    await cuadra(socio);
  });

  it("un bloqueo del club devuelve lo pagado de las reservas que cancela", async () => {
    const pagado = await nuevoSocio();
    const sinPagar = await nuevoSocio();
    const a = await reservaDePago(pagado, 20 * 60);
    const b = await reservaDePago(sinPagar, 21 * 60);
    await markBookingPaid({ bookingId: a, method: "CASH", registeredById: staffId });

    const r = await createCourtBlock({
      courtId,
      sport: null,
      startsAt: clubDayMinutesToUtc(DIA, 20 * 60),
      endsAt: clubDayMinutesToUtc(DIA, 22 * 60),
      type: "MAINTENANCE",
      title: "Riego",
      description: null,
      isPublic: true,
      createdById: staffId,
      confirmed: true,
    });
    expect(r).toMatchObject({ ok: true, cancelledBookings: 2, refundedBookings: 1, refundedCents: PRECIO });
    expect(await saldo(pagado)).toBe(PRECIO);
    expect(await saldo(sinPagar)).toBe(0);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: b } })).paymentStatus).toBe("PENDING");
  });
});
