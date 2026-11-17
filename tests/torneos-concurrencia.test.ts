import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { anularInscripcion } from "@/lib/torneos";

/**
 * Anulaciones de inscripciones simultaneas, contra Postgres real.
 *
 * Lo que tiene que cumplirse siempre: nunca hay mas inscritos que plazas, una
 * plaza liberada se cubre una sola vez, y quien recibe "anulada" queda de
 * verdad anulado aunque otra peticion le estuviera subiendo de la lista de
 * espera en ese mismo instante.
 */

const SUFIJO = Math.random().toString(36).slice(2, 8);
let creadorId = "";
const usuarios: string[] = [];
const torneos: string[] = [];

async function nuevoSocio(): Promise<string> {
  const n = usuarios.length + 1;
  const u = await prisma.user.create({
    data: {
      email: `torneo-${SUFIJO}-${n}@ejemplo.invalid`,
      firstName: "Socio",
      lastName: `Torneo ${n}`,
      status: "ACTIVE",
      memberNumber: `TT${SUFIJO}${n}`,
    },
    select: { id: true },
  });
  usuarios.push(u.id);
  return u.id;
}

/** Torneo de una plaza con una persona inscrita y `enEspera` en la lista. */
async function torneoLleno(enEspera: number) {
  const ahora = Date.now();
  const t = await prisma.tournament.create({
    data: {
      slug: `prueba-${SUFIJO}-${torneos.length}`,
      name: "Torneo de prueba",
      sport: "PADEL",
      startsAt: new Date(ahora + 7 * 86_400_000),
      endsAt: new Date(ahora + 8 * 86_400_000),
      opensAt: new Date(ahora - 86_400_000),
      closesAt: new Date(ahora + 6 * 86_400_000),
      maxParticipants: 1,
      status: "OPEN",
      createdById: creadorId,
    },
    select: { id: true },
  });
  torneos.push(t.id);

  const inscribir = async (status: "REGISTERED" | "WAITLIST", orden: number) => {
    const userId = await nuevoSocio();
    const r = await prisma.tournamentRegistration.create({
      data: {
        tournamentId: t.id,
        userId,
        participantName: `Participante ${orden}`,
        status,
        createdAt: new Date(ahora + orden * 1000),
      },
      select: { id: true, userId: true },
    });
    return r;
  };

  const inscrito = await inscribir("REGISTERED", 0);
  const espera = [];
  for (let i = 1; i <= enEspera; i++) espera.push(await inscribir("WAITLIST", i));
  return { torneoId: t.id, inscrito, espera };
}

async function estados(torneoId: string) {
  const filas = await prisma.tournamentRegistration.findMany({
    where: { tournamentId: torneoId },
    select: { id: true, status: true },
  });
  return new Map(filas.map((f) => [f.id, f.status]));
}

beforeAll(async () => {
  creadorId = await nuevoSocio();
});

afterAll(async () => {
  await prisma.tournamentRegistration.deleteMany({ where: { tournamentId: { in: torneos } } });
  await prisma.tournament.deleteMany({ where: { id: { in: torneos } } });
  await prisma.user.deleteMany({ where: { id: { in: usuarios } } });
});

describe("anulacion de inscripciones simultaneas", () => {
  it("dos anulaciones de la misma plaza solo ascienden a una persona", async () => {
    const { torneoId, inscrito, espera } = await torneoLleno(2);

    const resultados = await Promise.all([
      anularInscripcion({ registrationId: inscrito.id, actorId: inscrito.userId, actorEsStaff: false }),
      anularInscripcion({ registrationId: inscrito.id, actorId: inscrito.userId, actorEsStaff: false }),
    ]);

    expect(resultados.filter((r) => r.ok)).toHaveLength(1);
    const e = await estados(torneoId);
    expect([...e.values()].filter((s) => s === "REGISTERED")).toHaveLength(1);
    expect(e.get(espera[0].id)).toBe("REGISTERED");
    expect(e.get(espera[1].id)).toBe("WAITLIST");
  });

  it("quien recibe 'anulada' queda anulado aunque le estuvieran ascendiendo a la vez", async () => {
    // Se repite porque la carrera depende del orden en que Postgres atiende
    // las dos transacciones; con varias vueltas se cubren ambos ordenes.
    for (let vuelta = 0; vuelta < 8; vuelta++) {
      const { torneoId, inscrito, espera } = await torneoLleno(2);
      const [primero] = espera;

      const [, anulacionPrimero] = await Promise.all([
        anularInscripcion({ registrationId: inscrito.id, actorId: inscrito.userId, actorEsStaff: false }),
        anularInscripcion({ registrationId: primero.id, actorId: primero.userId, actorEsStaff: false }),
      ]);

      const e = await estados(torneoId);
      if (anulacionPrimero.ok) expect(e.get(primero.id)).toBe("CANCELLED");
      // Nunca mas inscritos que plazas, y la plaza no se queda vacia si queda gente esperando.
      expect([...e.values()].filter((s) => s === "REGISTERED")).toHaveLength(1);
    }
  });
});
