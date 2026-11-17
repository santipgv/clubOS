import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aceptarInvitacionGolf } from "@/lib/golf/invitations";
import { crearBloqueoSalida } from "@/lib/golf/blocks";
import { markGolfBookingPaid } from "@/lib/golf/payments";
import { prisma } from "@/lib/db";
import {
  anularReservaGolf,
  hojaDeSalidas,
  presupuestoGolf,
  reservarSalida,
} from "@/lib/golf/salidas";
import { addDaysToDay, clubDayMinutesToUtc, clubToday } from "@/lib/time";

/**
 * Lo que de verdad hay que demostrar en golf no es que no haya solapes —en una
 * salida los jugadores se solapan a proposito— sino que entre todos no se pasen
 * del flight. Estas pruebas van contra Postgres real, que es donde vive la
 * garantia.
 */

const SUFIJO = Math.random().toString(36).slice(2, 8);
let courseId = "";
const socios: string[] = [];
let DIA = addDaysToDay(clubToday(), 2);

/**
 * El contador se incrementa **antes** del await: si se calculara a partir de
 * socios.length, seis llamadas concurrentes leerian el mismo valor y chocarian
 * contra la unicidad del correo.
 */
let contadorSocios = 0;

async function nuevoSocio(): Promise<string> {
  const n = ++contadorSocios;
  const u = await prisma.user.create({
    data: {
      email: `golf-${SUFIJO}-${n}@ejemplo.invalid`,
      firstName: "Jugador",
      lastName: `Prueba ${n}`,
      status: "ACTIVE",
      role: "MEMBER",
      memberNumber: `G${SUFIJO}${n}`,
      emailVerifiedAt: new Date(),
    },
    select: { id: true },
  });
  socios.push(u.id);
  return u.id;
}

/** Dia sin bloqueos: la base es compartida y otra sesion puede haber creado uno. */
async function primerDiaLibre(): Promise<string> {
  for (let i = 1; i <= 6; i++) {
    const dia = addDaysToDay(clubToday(), i);
    const bloqueos = await prisma.golfBlock.count({
      where: {
        startsAt: { lt: clubDayMinutesToUtc(dia, 24 * 60) },
        endsAt: { gt: clubDayMinutesToUtc(dia, 0) },
        courseId: null,
      },
    });
    if (bloqueos === 0) return dia;
  }
  throw new Error("No hay dia libre de bloqueos en la ventana de reserva.");
}

beforeAll(async () => {
  DIA = await primerDiaLibre();
  const course = await prisma.golfCourse.create({
    data: {
      code: `GOLF-${SUFIJO}`.toUpperCase().slice(0, 16),
      name: `Recorrido de prueba ${SUFIJO}`,
      kind: "RECORRIDO",
      holes: 18,
      teeIntervalMinutes: 10,
      maxPlayers: 4,
      memberPriceCents: 1500,
      guestPriceCents: 3000,
      buggyPriceCents: 2000,
      buggiesAvailable: true,
      isActive: true,
      schedules: {
        create: Array.from({ length: 7 }, (_, weekday) => ({
          weekday,
          opensAt: 8 * 60,
          closesAt: 20 * 60,
        })),
      },
    },
    select: { id: true },
  });
  courseId = course.id;
});

afterAll(async () => {
  await prisma.golfPayment.deleteMany({ where: { booking: { teeTime: { courseId } } } });
  await prisma.golfBooking.deleteMany({ where: { teeTime: { courseId } } });
  await prisma.golfTeeTime.deleteMany({ where: { courseId } });
  await prisma.golfBlock.deleteMany({ where: { courseId } });
  await prisma.golfSchedule.deleteMany({ where: { courseId } });
  await prisma.golfCourse.deleteMany({ where: { id: courseId } });
  await prisma.user.deleteMany({ where: { id: { in: socios } } });
  await prisma.$disconnect();
});

function reserva(userId: string, startMinute: number, players = 1, extra: Record<string, unknown> = {}) {
  return reservarSalida({
    courseId,
    day: DIA,
    startMinute,
    userId,
    actorId: userId,
    actorIsStaff: false,
    players,
    ...extra,
  });
}

describe("aforo de la salida", () => {
  it("seis socios a la vez no caben en un flight de cuatro", async () => {
    const inicio = 9 * 60;
    const jugadores = await Promise.all(Array.from({ length: 6 }, () => nuevoSocio()));

    const resultados = await Promise.all(jugadores.map((id) => reserva(id, inicio)));

    expect(resultados.filter((r) => r.ok)).toHaveLength(4);
    for (const r of resultados.filter((r) => !r.ok)) {
      if (!r.ok) expect(r.error).toBe("SALIDA_COMPLETA");
    }

    // La verdad esta en la base de datos, no en lo que devuelva la aplicacion.
    const salida = await prisma.golfTeeTime.findUnique({
      where: { courseId_startsAt: { courseId, startsAt: clubDayMinutesToUtc(DIA, inicio) } },
      select: { playersBooked: true },
    });
    expect(salida?.playersBooked).toBe(4);
  });

  it("respeta el aforo tambien cuando cada reserva trae varios jugadores", async () => {
    const inicio = 9 * 60 + 10;

    const tres = await reserva(await nuevoSocio(), inicio, 3);
    expect(tres.ok).toBe(true);

    // 3 + 2 = 5 no cabe en un flight de 4.
    const dos = await reserva(await nuevoSocio(), inicio, 2);
    expect(dos.ok).toBe(false);
    if (!dos.ok) expect(dos.error).toBe("SALIDA_COMPLETA");

    // Pero 3 + 1 si.
    const uno = await reserva(await nuevoSocio(), inicio, 1);
    expect(uno.ok).toBe(true);
    if (uno.ok) expect(uno.ocupados).toBe(4);
  });

  it("anular devuelve las plazas a la salida", async () => {
    const inicio = 9 * 60 + 20;
    const titular = await nuevoSocio();

    const dos = await reserva(titular, inicio, 2);
    expect(dos.ok).toBe(true);
    if (!dos.ok) return;

    const lleno = await reserva(await nuevoSocio(), inicio, 3);
    expect(lleno.ok).toBe(false);

    const anulada = await anularReservaGolf({
      bookingId: dos.bookingId,
      actorId: titular,
      actorEsStaff: false,
    });
    expect(anulada.ok).toBe(true);

    const reintento = await reserva(await nuevoSocio(), inicio, 3);
    expect(reintento.ok).toBe(true);
  });

  it("una salida distinta no se ve afectada", async () => {
    const a = await reserva(await nuevoSocio(), 10 * 60, 4);
    const b = await reserva(await nuevoSocio(), 10 * 60 + 10, 4);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
  });
});

describe("reglas de la salida", () => {
  it("rechaza una hora que no cae en el intervalo de salidas", async () => {
    const r = await reserva(await nuevoSocio(), 9 * 60 + 7);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("SALIDA_NO_ALINEADA");
  });

  it("rechaza fuera del horario del campo", async () => {
    const r = await reserva(await nuevoSocio(), 6 * 60);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("FUERA_DE_HORARIO");
  });

  it("rechaza mas jugadores de los que caben en un flight", async () => {
    const r = await reserva(await nuevoSocio(), 11 * 60, 5);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("JUGADORES_INVALIDOS");
  });

  it("rechaza mas invitados que jugadores", async () => {
    const r = await reserva(await nuevoSocio(), 11 * 60, 2, { guestCount: 3 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("JUGADORES_INVALIDOS");
  });

  it("no deja reservar sobre un bloqueo del club", async () => {
    const inicio = 12 * 60;
    await prisma.golfBlock.create({
      data: {
        courseId,
        startsAt: clubDayMinutesToUtc(DIA, inicio),
        endsAt: clubDayMinutesToUtc(DIA, inicio + 120),
        type: "TOURNAMENT",
        title: "Competicion de prueba",
        createdById: socios[0],
      },
    });

    const r = await reserva(await nuevoSocio(), inicio);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("BLOQUEADA");
  });

  it("rechaza una salida en el pasado", async () => {
    const r = await reservarSalida({
      courseId,
      day: addDaysToDay(clubToday(), -1),
      startMinute: 9 * 60,
      userId: await nuevoSocio(),
      actorId: socios[0],
      actorIsStaff: false,
      players: 1,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("EN_EL_PASADO");
  });
});

describe("precio por jugador", () => {
  const campo = {
    memberPriceCents: 1500,
    guestPriceCents: 3000,
    memberTaxTreatment: "EXEMPT_SPORT" as const,
    guestTaxTreatment: "STANDARD_21" as const,
    buggyPriceCents: 2000,
  };

  it("cobra por jugador, no por salida", () => {
    const uno = presupuestoGolf(campo, { players: 1, guestCount: 0, buggies: 0 });
    const cuatro = presupuestoGolf(campo, { players: 4, guestCount: 0, buggies: 0 });
    expect(uno.priceCents).toBe(1500);
    expect(cuatro.priceCents).toBe(6000);
  });

  it("distingue socio de invitado en el mismo flight", () => {
    const r = presupuestoGolf(campo, { players: 4, guestCount: 2, buggies: 0 });
    // 2 socios × 15 € + 2 invitados × 30 €
    expect(r.priceCents).toBe(2 * 1500 + 2 * 3000);
  });

  it("el socio va exento y el invitado no", () => {
    const soloSocios = presupuestoGolf(campo, { players: 2, guestCount: 0, buggies: 0 });
    expect(soloSocios.taxCents).toBe(0);
    expect(soloSocios.taxTreatment).toBe("EXEMPT_SPORT");

    const conInvitado = presupuestoGolf(campo, { players: 2, guestCount: 1, buggies: 0 });
    // El IVA sale solo de los 30 € del invitado: 30 - 30/1,21 = 5,21 €
    expect(conInvitado.taxCents).toBe(521);
    expect(conInvitado.taxTreatment).toBe("STANDARD_21");
  });

  it("suma los buggies y los desglosa", () => {
    const r = presupuestoGolf(campo, { players: 2, guestCount: 0, buggies: 1 });
    expect(r.priceCents).toBe(2 * 1500 + 2000);
    expect(r.desglose.map((d) => d.concepto)).toContain("Buggies");
  });

  it("no cobra lineas vacias", () => {
    const r = presupuestoGolf(campo, { players: 1, guestCount: 0, buggies: 0 });
    expect(r.desglose).toHaveLength(1);
  });
});

describe("hoja de salidas", () => {
  it("genera los huecos separados por el intervalo del campo", async () => {
    const hoja = await hojaDeSalidas({ courseId, day: DIA, viewerId: null, viewerIsStaff: false });
    expect(hoja).not.toBeNull();
    if (!hoja) return;

    // De 8:00 a 20:00 cada 10 minutos: 72 salidas.
    expect(hoja.salidas).toHaveLength(72);
    expect(hoja.salidas[0].hora).toBe("08:00");
    expect(hoja.salidas[1].hora).toBe("08:10");
    expect(hoja.salidas.at(-1)?.hora).toBe("19:50");
  });

  it("marca lo ocupado, lo completo y lo bloqueado", async () => {
    const hoja = await hojaDeSalidas({ courseId, day: DIA, viewerId: null, viewerIsStaff: false });
    if (!hoja) return;

    const nueve = hoja.salidas.find((s) => s.hora === "09:00");
    expect(nueve?.estado).toBe("COMPLETA");
    expect(nueve?.libres).toBe(0);

    const bloqueada = hoja.salidas.find((s) => s.hora === "12:00");
    expect(bloqueada?.estado).toBe("BLOQUEADA");
  });
});


describe("bloqueos concurrentes", () => {
  function bloquear(startMinute: number, createdById: string, confirmed = true) {
    return crearBloqueoSalida({
      courseId, startsAt: clubDayMinutesToUtc(DIA, startMinute),
      endsAt: clubDayMinutesToUtc(DIA, startMinute + 10),
      type: "MAINTENANCE", title: "Bloqueo concurrente",
      description: null, isPublic: true, createdById, confirmed,
    });
  }

  it("exige confirmación y conserva las reservas cuando no se confirma", async () => {
    const user = await nuevoSocio();
    const r = await reserva(user, 14 * 60);
    expect(r.ok).toBe(true);
    expect(await bloquear(14 * 60, user, false)).toEqual({ ok: false, requiresConfirmation: 1 });
  });

  it("no deja reservas confirmadas dentro de un bloqueo concurrente", async () => {
    const user = await nuevoSocio();
    for (let n = 0; n < 6; n++) {
      const minute = 15 * 60 + n * 10;
      const [, block] = await Promise.all([reserva(user, minute), bloquear(minute, user)]);
      expect(block.ok).toBe(true);
      const tee = await prisma.golfTeeTime.findUnique({
        where: { courseId_startsAt: { courseId, startsAt: clubDayMinutesToUtc(DIA, minute) } },
        include: { bookings: { where: { status: "CONFIRMED" } } },
      });
      expect(tee?.bookings ?? []).toHaveLength(0);
      expect(tee?.playersBooked ?? 0).toBe(0);
    }
  });

  it("cancelar y bloquear a la vez devuelve cada plaza una sola vez", async () => {
    const user = await nuevoSocio();
    for (let n = 0; n < 6; n++) {
      const minute = 16 * 60 + n * 10;
      const r = await reserva(user, minute, 2);
      expect(r.ok).toBe(true);
      if (!r.ok) throw new Error("No se creó la reserva");
      await Promise.all([
        anularReservaGolf({ bookingId: r.bookingId, actorId: user, actorEsStaff: false }),
        bloquear(minute, user),
      ]);
      const tee = await prisma.golfTeeTime.findUniqueOrThrow({
        where: { courseId_startsAt: { courseId, startsAt: clubDayMinutesToUtc(DIA, minute) } },
      });
      expect(tee.playersBooked).toBe(0);
    }
  });
});

describe("cobro de golf", () => {
  it("dos cobros simultáneos registran un único pago con el importe y el empleado", async () => {
    const user = await nuevoSocio();
    const r = await reserva(user, 17 * 60, 2);
    if (!r.ok) throw new Error("No se creó la reserva");
    const results = await Promise.all(Array.from({ length: 2 }, () => markGolfBookingPaid({
      bookingId: r.bookingId, method: "CASH", registeredById: user,
    })));
    expect(results.filter((v) => v.ok)).toHaveLength(1);
    const booking = await prisma.golfBooking.findUniqueOrThrow({
      where: { id: r.bookingId }, include: { payment: true },
    });
    expect(booking.paymentStatus).toBe("PAID");
    expect(booking.payment).toMatchObject({ amountCents: 3000, method: "CASH", registeredById: user });
    expect(await prisma.golfPayment.count({ where: { bookingId: r.bookingId } })).toBe(1);
  });

  it("no cobra una reserva cancelada ni crea el pago", async () => {
    const user = await nuevoSocio();
    const r = await reserva(user, 17 * 60 + 10);
    if (!r.ok) throw new Error("No se creó la reserva");
    await anularReservaGolf({ bookingId: r.bookingId, actorId: user, actorEsStaff: false });
    expect(await markGolfBookingPaid({ bookingId: r.bookingId, method: "TRANSFER", registeredById: user }))
      .toEqual({ ok: false, error: "CANCELLED" });
    expect(await prisma.golfPayment.count({ where: { bookingId: r.bookingId } })).toBe(0);
  });
});


describe("invitaciones entre socios", () => {
  async function invitar(minute: number, payment: "SEPARATE" | "HOST") {
    const host = await nuevoSocio();
    const guest = await nuevoSocio();
    const socio = await prisma.user.findUniqueOrThrow({ where: { id: guest }, select: { memberNumber: true } });
    const booking = await reserva(host, minute, 2, { invite: { memberNumbers: [socio.memberNumber!], payment } });
    if (!booking.ok) throw new Error(`No se creó la invitación: ${booking.error}`);
    const invited = await prisma.golfBooking.findFirstOrThrow({ where: { invitedByBookingId: booking.bookingId } });
    return { host, guest, booking, invited };
  }

  function cobrar(bookingId: string, registeredById: string) {
    return markGolfBookingPaid({ bookingId, registeredById, method: "CASH" });
  }

  it("aparta la plaza e impide que se ocupe o acepte por otro socio", async () => {
    const minuto = 18 * 60;
    const { host, guest, invited } = await invitar(minuto, "SEPARATE");
    const hoja = await hojaDeSalidas({ courseId, day: DIA, viewerId: null, viewerIsStaff: false });
    expect(hoja?.salidas.find((s) => s.startMinute === minuto)).toMatchObject({ ocupados: 2, libres: 2 });
    expect(await reserva(await nuevoSocio(), minuto, 3)).toEqual({ ok: false, error: "SALIDA_COMPLETA" });
    expect(await reserva(guest, minuto)).toEqual({ ok: false, error: "YA_TIENE_PLAZA" });
    expect(await aceptarInvitacionGolf({ bookingId: invited.id, userId: host })).toBe(false);
    expect(await cobrar(invited.id, host)).toEqual({ ok: false, error: "INVITATION_PENDING" });
  });

  it("cobra cada plaza a su socio y mantiene la reserva independiente al anular el titular", async () => {
    const { host, guest, booking, invited } = await invitar(18 * 60 + 10, "SEPARATE");
    expect(await aceptarInvitacionGolf({ bookingId: invited.id, userId: guest })).toBe(true);
    expect(await cobrar(booking.bookingId, host)).toEqual({ ok: true, amountCents: 1500 });
    expect(await cobrar(invited.id, host)).toEqual({ ok: true, amountCents: 1500 });
    expect(await anularReservaGolf({ bookingId: booking.bookingId, actorId: host, actorEsStaff: false }))
      .toEqual({ ok: true, liberados: 1 });
    expect(await prisma.golfBooking.findUnique({ where: { id: invited.id } })).toMatchObject({ status: "CONFIRMED" });
  });

  it("en pago conjunto el titular abona ambas plazas y aceptar dos veces no duplica el importe", async () => {
    const { host, guest, booking, invited } = await invitar(18 * 60 + 20, "HOST");
    expect(await cobrar(booking.bookingId, host)).toEqual({ ok: false, error: "INVITATION_PENDING" });
    const respuestas = await Promise.all(Array.from({ length: 2 }, () => aceptarInvitacionGolf({ bookingId: invited.id, userId: guest })));
    expect(respuestas.filter(Boolean)).toHaveLength(1);
    expect(await cobrar(booking.bookingId, host)).toEqual({ ok: true, amountCents: 3000 });
    expect(await cobrar(invited.id, host)).toEqual({ ok: false, error: "NO_PAYMENT" });
    expect(await anularReservaGolf({ bookingId: booking.bookingId, actorId: host, actorEsStaff: false }))
      .toEqual({ ok: true, liberados: 2 });
  });

  it("rechazar libera la plaza y deja al titular solo su parte", async () => {
    const minuto = 18 * 60 + 30;
    const { host, guest, booking, invited } = await invitar(minuto, "HOST");
    expect(await anularReservaGolf({ bookingId: invited.id, actorId: guest, actorEsStaff: false }))
      .toEqual({ ok: true, liberados: 1 });
    expect(await cobrar(booking.bookingId, host)).toEqual({ ok: true, amountCents: 1500 });
    expect((await reserva(await nuevoSocio(), minuto, 3)).ok).toBe(true);
    expect(await aceptarInvitacionGolf({ bookingId: invited.id, userId: guest })).toBe(false);
  });

  it("aparta tres plazas y cobra al titular solo por los socios que aceptan", async () => {
    const minute = 18 * 60 + 50;
    const host = await nuevoSocio();
    const guests = await Promise.all(Array.from({ length: 3 }, () => nuevoSocio()));
    const socios = await prisma.user.findMany({ where: { id: { in: guests } }, select: { memberNumber: true } });
    const memberNumbers = socios.map((s) => s.memberNumber!);

    expect(await reserva(host, minute, 4, {
      invite: { memberNumbers: [memberNumbers[0], memberNumbers[0]], payment: "HOST" },
    })).toEqual({ ok: false, error: "SOCIO_INVITADO_INVALIDO" });

    const booking = await reserva(host, minute, 4, { invite: { memberNumbers, payment: "HOST" } });
    if (!booking.ok) throw new Error(booking.error);
    const [first, second, third] = await prisma.golfBooking.findMany({
      where: { invitedByBookingId: booking.bookingId },
    });
    expect(await reserva(await nuevoSocio(), minute)).toEqual({ ok: false, error: "SALIDA_COMPLETA" });
    expect(await Promise.all([first, second].map((invite) => aceptarInvitacionGolf({
      bookingId: invite.id, userId: invite.userId,
    })))).toEqual([true, true]);
    expect(await cobrar(booking.bookingId, host)).toEqual({ ok: false, error: "INVITATION_PENDING" });
    expect(await anularReservaGolf({ bookingId: third.id, actorId: third.userId, actorEsStaff: false }))
      .toEqual({ ok: true, liberados: 1 });
    expect(await cobrar(booking.bookingId, host)).toEqual({ ok: true, amountCents: 4500 });
    expect(await anularReservaGolf({ bookingId: booking.bookingId, actorId: host, actorEsStaff: false }))
      .toEqual({ ok: true, liberados: 3 });
  });

  it("el bloqueo del club anula también la plaza apartada", async () => {
    const minute = 18 * 60 + 40;
    const { host, guest, invited } = await invitar(minute, "SEPARATE");
    const block = await crearBloqueoSalida({
      courseId, startsAt: clubDayMinutesToUtc(DIA, minute), endsAt: clubDayMinutesToUtc(DIA, minute + 10),
      type: "MAINTENANCE", title: "Bloqueo con invitación", description: null,
      isPublic: true, createdById: host, confirmed: true,
    });
    expect(block).toMatchObject({ ok: true, cancelledBookings: 2 });
    expect(await aceptarInvitacionGolf({ bookingId: invited.id, userId: guest })).toBe(false);
    expect(await prisma.golfTeeTime.findUnique({ where: { id: invited.teeTimeId } })).toMatchObject({ playersBooked: 0 });
  });
});
