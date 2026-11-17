import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/lib/auth/session";
import type { Sport } from "@/lib/types";

/**
 * Un colaborador de deporte gestiona reservas y bloqueos, pero solo de sus
 * deportes. Estas pruebas llaman a las acciones de servidor reales contra
 * Postgres: lo unico simulado es quien tiene la sesion abierta.
 */

const sesion = vi.hoisted(() => ({ usuario: null as SessionUser | null }));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth/session", async (original) => ({
  ...(await original<typeof import("@/lib/auth/session")>()),
  getSessionUser: async () => sesion.usuario,
  requestContext: async () => ({ ip: null, userAgent: null }),
}));

import { prisma } from "@/lib/db";
import { ForbiddenError } from "@/lib/auth/guards";
import { filtroBloqueos, filtroReservas, filtroTorneos } from "@/lib/auth/ambito";
import { createBooking } from "@/lib/booking/create";
import { addDaysToDay, clubDayMinutesToUtc, clubToday } from "@/lib/time";
import {
  cancelarComoStaff,
  marcarNoPresentado,
  marcarPagada,
  reservarPorSocio,
} from "@/app/(app)/admin/reservas/acciones";
import { crearBloqueo, eliminarBloqueo } from "@/app/(app)/admin/bloqueos/acciones";
import { actualizarPista, crearPista, guardarTarifaPista } from "@/app/(app)/admin/pistas/acciones";
import { cobrarInscripcion, guardarTorneo } from "@/app/(app)/admin/torneos/acciones";

const SUFIJO = Math.random().toString(36).slice(2, 8);
const usuarios: string[] = [];
const pistas: Record<"PADEL" | "TENIS", string> = { PADEL: "", TENIS: "" };

let DIA = addDaysToDay(clubToday(), 2);
/** Un dia ya pasado: los bloqueos de deporte o de club creados ahi no estorban a nadie. */
const AYER = addDaysToDay(clubToday(), -1);

let socio = "";
let colaboradorPadel: SessionUser;
let colaboradorSinDeportes: SessionUser;
let staff: SessionUser;
let socioSinRol: SessionUser;

async function primerDiaLibreDeBloqueos(): Promise<string> {
  for (let i = 1; i <= 6; i++) {
    const dia = addDaysToDay(clubToday(), i);
    const bloqueos = await prisma.courtBlock.count({
      where: {
        startsAt: { lt: clubDayMinutesToUtc(dia, 24 * 60) },
        endsAt: { gt: clubDayMinutesToUtc(dia, 0) },
        courtId: null,
        OR: [{ sport: null }, { sport: { in: ["PADEL", "TENIS"] } }],
      },
    });
    if (bloqueos === 0) return dia;
  }
  throw new Error("No hay ningun dia libre de bloqueos en la ventana de reserva.");
}

async function nuevoUsuario(
  role: SessionUser["role"],
  managedSports: Sport[] = [],
): Promise<SessionUser> {
  const n = usuarios.length + 1;
  const u = await prisma.user.create({
    data: {
      email: `colab-${SUFIJO}-${n}@ejemplo.invalid`,
      firstName: "Prueba",
      lastName: `${role} ${n}`,
      status: "ACTIVE",
      role,
      managedSports,
      memberNumber: `C${SUFIJO}${n}`,
      emailVerifiedAt: new Date(),
    },
    select: {
      id: true, email: true, firstName: true, lastName: true, role: true,
      status: true, memberType: true, memberNumber: true, emailVerifiedAt: true,
      relationship: true, managedSports: true, walletBalanceCents: true,
    },
  });
  usuarios.push(u.id);
  return u;
}

async function nuevaPista(sport: "PADEL" | "TENIS"): Promise<string> {
  const court = await prisma.court.create({
    data: {
      sport,
      code: `CL-${sport.slice(0, 1)}-${SUFIJO}`.toUpperCase().slice(0, 16),
      name: `Pista ${sport} ${SUFIJO}`,
      slotMinutes: 60,
      allowedDurations: [60],
      maxPlayers: 4,
      isActive: true,
      schedules: {
        create: Array.from({ length: 7 }, (_, weekday) => ({ weekday, opensAt: 8 * 60, closesAt: 23 * 60 })),
      },
    },
    select: { id: true },
  });
  return court.id;
}

let hora = 9;
/** Cada reserva va a una hora distinta para no pisarse entre pruebas. */
async function reserva(sport: "PADEL" | "TENIS"): Promise<string> {
  const r = await createBooking({
    courtId: pistas[sport],
    day: DIA,
    startMinute: hora++ * 60,
    durationMinutes: 60,
    userId: socio,
    actorId: socio,
    actorIsStaff: true,
  });
  if (!r.ok) throw new Error(`No se pudo preparar la reserva: ${r.error}`);
  return r.bookingId;
}

async function bloqueo(datos: { courtId?: string; sport?: Sport }): Promise<string> {
  const b = await prisma.courtBlock.create({
    data: {
      courtId: datos.courtId ?? null,
      sport: datos.sport ?? null,
      startsAt: clubDayMinutesToUtc(AYER, 10 * 60),
      endsAt: clubDayMinutesToUtc(AYER, 11 * 60),
      title: `Bloqueo de prueba ${SUFIJO}`,
      createdById: staff.id,
    },
    select: { id: true },
  });
  return b.id;
}

function formulario(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

function bloqueoNuevo(campos: Record<string, string>): FormData {
  return formulario({
    day: addDaysToDay(DIA, 1),
    startMinute: String(9 * 60),
    endMinute: String(10 * 60),
    type: "MAINTENANCE",
    title: `Bloqueo de prueba ${SUFIJO}`,
    isPublic: "on",
    ...campos,
  });
}

const estadoReserva = (id: string) =>
  prisma.booking.findUniqueOrThrow({ where: { id }, select: { status: true, paymentStatus: true } });

beforeAll(async () => {
  DIA = await primerDiaLibreDeBloqueos();
  pistas.PADEL = await nuevaPista("PADEL");
  pistas.TENIS = await nuevaPista("TENIS");

  socio = (await nuevoUsuario("MEMBER")).id;
  socioSinRol = await nuevoUsuario("MEMBER");
  colaboradorPadel = await nuevoUsuario("COLLABORATOR", ["PADEL"]);
  colaboradorSinDeportes = await nuevoUsuario("COLLABORATOR", []);
  staff = await nuevoUsuario("STAFF");
});

beforeEach(() => {
  sesion.usuario = colaboradorPadel;
});

afterAll(async () => {
  const courtIds = Object.values(pistas).filter(Boolean);
  await prisma.payment.deleteMany({ where: { booking: { courtId: { in: courtIds } } } });
  await prisma.booking.deleteMany({ where: { courtId: { in: courtIds } } });
  await prisma.courtBlock.deleteMany({ where: { createdById: { in: usuarios } } });
  await prisma.tournament.deleteMany({ where: { createdById: { in: usuarios } } });
  await prisma.courtSchedule.deleteMany({ where: { courtId: { in: courtIds } } });
  await prisma.court.deleteMany({ where: { id: { in: courtIds } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: usuarios } } });
  await prisma.user.deleteMany({ where: { id: { in: usuarios } } });
  await prisma.$disconnect();
});

describe("colaborador de pádel sobre reservas", () => {
  it("solo lista las reservas de pistas de sus deportes", async () => {
    const [padel, tenis] = [await reserva("PADEL"), await reserva("TENIS")];
    const vistas = await prisma.booking.findMany({
      where: { id: { in: [padel, tenis] }, ...filtroReservas(colaboradorPadel.managedSports) },
      select: { id: true },
    });
    expect(vistas.map((r) => r.id)).toEqual([padel]);
  });

  it("no cobra una reserva de tenis, y si una de pádel", async () => {
    const tenis = await reserva("TENIS");
    expect(await marcarPagada({}, formulario({ bookingId: tenis, metodo: "CASH" }))).toEqual({
      error: "Reserva no encontrada.",
    });
    expect((await estadoReserva(tenis)).paymentStatus).not.toBe("PAID");
    expect(await prisma.payment.count({ where: { bookingId: tenis } })).toBe(0);

    const padel = await reserva("PADEL");
    expect((await marcarPagada({}, formulario({ bookingId: padel, metodo: "CASH" }))).ok).toBeTruthy();
    expect((await estadoReserva(padel)).paymentStatus).toBe("PAID");
  });

  it("no marca como no presentada una reserva de tenis, y si una de pádel", async () => {
    const tenis = await reserva("TENIS");
    expect((await marcarNoPresentado({}, formulario({ bookingId: tenis }))).error).toBeTruthy();
    expect((await estadoReserva(tenis)).status).toBe("CONFIRMED");

    const padel = await reserva("PADEL");
    expect((await marcarNoPresentado({}, formulario({ bookingId: padel }))).ok).toBeTruthy();
    expect((await estadoReserva(padel)).status).toBe("NO_SHOW");
  });

  it("no cancela una reserva de tenis, y si una de pádel", async () => {
    const tenis = await reserva("TENIS");
    expect(await cancelarComoStaff({}, formulario({ bookingId: tenis, motivo: "x" }))).toEqual({
      error: "Reserva no encontrada.",
    });
    expect((await estadoReserva(tenis)).status).toBe("CONFIRMED");

    const padel = await reserva("PADEL");
    expect((await cancelarComoStaff({}, formulario({ bookingId: padel, motivo: "x" }))).ok).toBeTruthy();
    expect((await estadoReserva(padel)).status).toBe("CANCELLED");
  });

  it("no reserva en nombre de un socio en una pista de tenis, y si en una de pádel", async () => {
    const pedir = (sport: "PADEL" | "TENIS") =>
      reservarPorSocio(
        {},
        formulario({
          socioId: socio,
          courtId: pistas[sport],
          day: DIA,
          startMinute: String(21 * 60),
          durationMinutes: "60",
        }),
      );

    expect((await pedir("TENIS")).error).toBeTruthy();
    expect(await prisma.booking.count({ where: { courtId: pistas.TENIS, startsAt: clubDayMinutesToUtc(DIA, 21 * 60) } })).toBe(0);

    expect((await pedir("PADEL")).ok).toBeTruthy();
    expect(await prisma.booking.count({ where: { courtId: pistas.PADEL, startsAt: clubDayMinutesToUtc(DIA, 21 * 60) } })).toBe(1);
  });
});

describe("colaborador de pádel sobre bloqueos", () => {
  const creados = (where: object) =>
    prisma.courtBlock.count({ where: { createdById: colaboradorPadel.id, ...where } });

  it("no bloquea una pista de tenis", async () => {
    const r = await crearBloqueo({}, bloqueoNuevo({ courtId: pistas.TENIS, confirmar: "si" }));
    expect(r.error).toBeTruthy();
    expect(await creados({ courtId: pistas.TENIS })).toBe(0);
  });

  it("no bloquea una pista de tenis aunque la acompañe de su deporte", async () => {
    const r = await crearBloqueo({}, bloqueoNuevo({ courtId: pistas.TENIS, sport: "PADEL", confirmar: "si" }));
    expect(r.error).toBeTruthy();
    expect(await creados({})).toBe(0);
  });

  it("no bloquea el tenis entero", async () => {
    const r = await crearBloqueo({}, bloqueoNuevo({ sport: "TENIS", confirmar: "si" }));
    expect(r.error).toBeTruthy();
    expect(await creados({ sport: "TENIS" })).toBe(0);
  });

  it("no bloquea el club entero, ni confirmandolo", async () => {
    const r = await crearBloqueo({}, bloqueoNuevo({ confirmar: "si" }));
    expect(r.error).toBeTruthy();
    expect(await creados({ courtId: null, sport: null })).toBe(0);
  });

  it("bloquea una pista de pádel", async () => {
    const r = await crearBloqueo({}, bloqueoNuevo({ courtId: pistas.PADEL }));
    expect(r.ok).toBeTruthy();
    expect(await creados({ courtId: pistas.PADEL })).toBe(1);
  });

  it("solo lista los bloqueos de sus deportes", async () => {
    const ids = {
      pistaPadel: await bloqueo({ courtId: pistas.PADEL }),
      padel: await bloqueo({ sport: "PADEL" }),
      pistaTenis: await bloqueo({ courtId: pistas.TENIS }),
      tenis: await bloqueo({ sport: "TENIS" }),
      club: await bloqueo({}),
    };
    const vistos = await prisma.courtBlock.findMany({
      where: { id: { in: Object.values(ids) }, ...filtroBloqueos(colaboradorPadel.managedSports) },
      select: { id: true },
    });
    expect(vistos.map((b) => b.id).sort()).toEqual([ids.pistaPadel, ids.padel].sort());
  });

  it("no borra bloqueos de tenis ni del club, y si los de pádel", async () => {
    for (const ajeno of [
      await bloqueo({ courtId: pistas.TENIS }),
      await bloqueo({ sport: "TENIS" }),
      await bloqueo({}),
    ]) {
      expect(await eliminarBloqueo({}, formulario({ id: ajeno }))).toEqual({ error: "Ese bloqueo ya no existe." });
      expect(await prisma.courtBlock.count({ where: { id: ajeno } })).toBe(1);
    }

    for (const propio of [await bloqueo({ courtId: pistas.PADEL }), await bloqueo({ sport: "PADEL" })]) {
      expect((await eliminarBloqueo({}, formulario({ id: propio }))).ok).toBeTruthy();
      expect(await prisma.courtBlock.count({ where: { id: propio } })).toBe(0);
    }
  });
});

/** Formulario de edicion de pista: mismo horario todos los dias. */
function edicionPista(courtId: string, name: string): FormData {
  const campos: Record<string, string> = { courtId, name, allowedDurations: "60", isActive: "on" };
  for (let d = 0; d < 7; d++) {
    campos[`opensAt_${d}`] = String(8 * 60);
    campos[`closesAt_${d}`] = String(23 * 60);
    campos[`abierto_${d}`] = "on";
  }
  return formulario(campos);
}

const nombrePista = async (id: string) =>
  (await prisma.court.findUniqueOrThrow({ where: { id }, select: { name: true } })).name;

describe("colaborador de pádel sobre pistas", () => {
  it("no edita una pista de tenis, y si una de pádel", async () => {
    const antes = await nombrePista(pistas.TENIS);
    expect(await actualizarPista({}, edicionPista(pistas.TENIS, "Tenis renombrada"))).toEqual({
      error: "Pista no encontrada.",
    });
    expect(await nombrePista(pistas.TENIS)).toBe(antes);

    expect((await actualizarPista({}, edicionPista(pistas.PADEL, `Padel editada ${SUFIJO}`))).ok).toBeTruthy();
    expect(await nombrePista(pistas.PADEL)).toBe(`Padel editada ${SUFIJO}`);
  });

  it("no crea pistas ni toca tarifas: eso sigue siendo de la administracion", async () => {
    await expect(crearPista({}, formulario({ sport: "PADEL" }))).rejects.toThrow(ForbiddenError);
    await expect(guardarTarifaPista({}, formulario({ sport: "PADEL" }))).rejects.toThrow(ForbiddenError);
  });
});

function datosTorneo(campos: Record<string, string>): FormData {
  const inicio = addDaysToDay(clubToday(), 30);
  return formulario({
    name: `Torneo de prueba ${SUFIJO}`,
    sport: "PADEL",
    startDay: inicio,
    endDay: inicio,
    opensDay: clubToday(),
    closesDay: inicio,
    maxParticipants: "0",
    memberEuros: "10",
    guestEuros: "0",
    memberTaxTreatment: "EXEMPT_SPORT",
    guestTaxTreatment: "STANDARD_21",
    status: "DRAFT",
    ...campos,
  });
}

let numTorneo = 0;
async function torneo(sport: Sport): Promise<string> {
  const inicio = clubDayMinutesToUtc(addDaysToDay(clubToday(), 30), 0);
  const t = await prisma.tournament.create({
    data: {
      slug: `prueba-${SUFIJO}-${++numTorneo}`,
      name: `Torneo ${sport} ${SUFIJO}`,
      sport,
      startsAt: inicio,
      endsAt: inicio,
      opensAt: inicio,
      closesAt: inicio,
      memberPriceCents: 1000,
      createdById: staff.id,
    },
    select: { id: true },
  });
  return t.id;
}

async function inscripcion(tournamentId: string): Promise<string> {
  const r = await prisma.tournamentRegistration.create({
    data: { tournamentId, userId: socio, participantName: "Participante", amountCents: 1000 },
    select: { id: true },
  });
  return r.id;
}

describe("colaborador de pádel sobre torneos", () => {
  it("no crea un torneo de tenis, y si uno de pádel", async () => {
    expect((await guardarTorneo({}, datosTorneo({ sport: "TENIS" }))).error).toBeTruthy();
    expect(await prisma.tournament.count({ where: { createdById: colaboradorPadel.id, sport: "TENIS" } })).toBe(0);

    expect((await guardarTorneo({}, datosTorneo({ sport: "PADEL" }))).ok).toBeTruthy();
    expect(await prisma.tournament.count({ where: { createdById: colaboradorPadel.id, sport: "PADEL" } })).toBe(1);
  });

  it("permite crear torneos de golf a administración y los excluye del ámbito de pádel", async () => {
    const datos = { name: `Torneo de golf ${SUFIJO}`, sport: "GOLF" };
    expect(await guardarTorneo({}, datosTorneo(datos))).toEqual({ error: "Ese deporte no está entre los tuyos." });

    const admin = await nuevoUsuario("ADMIN");
    sesion.usuario = admin;
    expect((await guardarTorneo({}, datosTorneo(datos))).ok).toBeTruthy();
    const golf = await prisma.tournament.findFirstOrThrow({ where: { createdById: admin.id, sport: "GOLF" } });

    sesion.usuario = colaboradorPadel;
    expect(await prisma.tournament.count({
      where: { id: golf.id, ...filtroTorneos(colaboradorPadel.managedSports) },
    })).toBe(0);
    expect(await guardarTorneo({}, datosTorneo({ id: golf.id, sport: "PADEL" })))
      .toEqual({ error: "Torneo no encontrado." });
  });

  it("no edita un torneo de tenis, ni pasandolo a pádel", async () => {
    const tenis = await torneo("TENIS");
    expect(await guardarTorneo({}, datosTorneo({ id: tenis, sport: "PADEL", name: "Robado" }))).toEqual({
      error: "Torneo no encontrado.",
    });
    const despues = await prisma.tournament.findUniqueOrThrow({ where: { id: tenis } });
    expect(despues.sport).toBe("TENIS");
    expect(despues.name).not.toBe("Robado");
  });

  it("edita un torneo de pádel", async () => {
    const padel = await torneo("PADEL");
    expect((await guardarTorneo({}, datosTorneo({ id: padel, name: `Editado ${SUFIJO}` }))).ok).toBeTruthy();
    expect((await prisma.tournament.findUniqueOrThrow({ where: { id: padel } })).name).toBe(`Editado ${SUFIJO}`);
  });

  it("no cobra inscripciones de un torneo de tenis, y si de uno de pádel", async () => {
    const deTenis = await inscripcion(await torneo("TENIS"));
    expect((await cobrarInscripcion({}, formulario({ registrationId: deTenis }))).error).toBeTruthy();
    expect((await prisma.tournamentRegistration.findUniqueOrThrow({ where: { id: deTenis } })).paymentStatus).toBe("PENDING");

    const dePadel = await inscripcion(await torneo("PADEL"));
    expect((await cobrarInscripcion({}, formulario({ registrationId: dePadel }))).ok).toBeTruthy();
    expect((await prisma.tournamentRegistration.findUniqueOrThrow({ where: { id: dePadel } })).paymentStatus).toBe("PAID");
  });

  it("solo lista los torneos de sus deportes", async () => {
    const [padel, tenis] = [await torneo("PADEL"), await torneo("TENIS")];
    const vistos = await prisma.tournament.findMany({
      where: { id: { in: [padel, tenis] }, ...filtroTorneos(colaboradorPadel.managedSports) },
      select: { id: true },
    });
    expect(vistos.map((t) => t.id)).toEqual([padel]);
  });
});

describe("otros perfiles", () => {
  it("recepcion cobra inscripciones de cualquier deporte, pero no edita pistas ni torneos", async () => {
    sesion.usuario = staff;
    const deTenis = await inscripcion(await torneo("TENIS"));
    expect((await cobrarInscripcion({}, formulario({ registrationId: deTenis }))).ok).toBeTruthy();
    await expect(actualizarPista({}, edicionPista(pistas.TENIS, "x"))).rejects.toThrow(ForbiddenError);
    await expect(guardarTorneo({}, datosTorneo({}))).rejects.toThrow(ForbiddenError);
  });

  it("un colaborador sin deportes asignados no actua sobre nada", async () => {
    sesion.usuario = colaboradorSinDeportes;
    const padel = await reserva("PADEL");
    expect((await marcarNoPresentado({}, formulario({ bookingId: padel }))).error).toBeTruthy();
    expect((await crearBloqueo({}, bloqueoNuevo({ courtId: pistas.PADEL }))).error).toBeTruthy();
  });

  it("un socio sin rol de gestion recibe un rechazo", async () => {
    sesion.usuario = socioSinRol;
    const padel = await reserva("PADEL");
    await expect(marcarPagada({}, formulario({ bookingId: padel, metodo: "CASH" }))).rejects.toThrow(ForbiddenError);
    await expect(eliminarBloqueo({}, formulario({ id: "x" }))).rejects.toThrow(ForbiddenError);
  });

  it("el personal del club sigue actuando sobre cualquier deporte", async () => {
    sesion.usuario = staff;
    const tenis = await reserva("TENIS");
    expect((await marcarNoPresentado({}, formulario({ bookingId: tenis }))).ok).toBeTruthy();

    const club = await bloqueo({});
    expect((await eliminarBloqueo({}, formulario({ id: club }))).ok).toBeTruthy();
  });
});
