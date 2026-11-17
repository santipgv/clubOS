import { prisma, isUniqueViolation, isSerializationFailure } from "@/lib/db";
import { taxIncludedIn } from "@/lib/booking/pricing";
import type { RegistrationStatus } from "@/lib/types";

/**
 * Torneos e inscripciones.
 *
 * Un torneo puede admitir solo socios o tambien acompanantes que no lo son, y
 * cada caso tiene su precio y su tratamiento fiscal: al socio se le aplica la
 * exencion del art. 20.Uno.13 LIVA y al invitado no. Como en las reservas, el
 * tratamiento se congela en la inscripcion.
 *
 * La inscripcion la hace siempre un socio, que se apunta a si mismo o trae a
 * un invitado. Asi hay siempre alguien del club responsable de cada plaza.
 */

export type FalloInscripcion =
  | "TORNEO_NO_ENCONTRADO"
  | "NO_ABIERTO"
  | "FUERA_DE_PLAZO"
  | "SIN_INVITADOS"
  | "YA_INSCRITO"
  | "SOCIO_NO_ACTIVO"
  | "CONFLICTO_TEMPORAL";

export const MENSAJES_INSCRIPCION: Record<FalloInscripcion, string> = {
  TORNEO_NO_ENCONTRADO: "Ese torneo no existe.",
  NO_ABIERTO: "Las inscripciones de este torneo no están abiertas.",
  FUERA_DE_PLAZO: "El plazo de inscripción ya ha terminado.",
  SIN_INVITADOS: "Este torneo es solo para socios.",
  YA_INSCRITO: "Ya hay una inscripción con ese nombre en este torneo.",
  SOCIO_NO_ACTIVO: "Tu alta de socio no esta activa.",
  CONFLICTO_TEMPORAL: "Ha habido mucha actividad simultanea. Vuelve a intentarlo.",
};

export type ResultadoInscripcion =
  | { ok: true; id: string; estado: RegistrationStatus; importeCents: number }
  | { ok: false; error: FalloInscripcion };

export async function inscribirEnTorneo(input: {
  tournamentId: string;
  userId: string;
  participantName: string;
  isGuest: boolean;
  /** El staff puede inscribir fuera de plazo. */
  saltarPlazo?: boolean;
}): Promise<ResultadoInscripcion> {
  const [torneo, socio] = await Promise.all([
    prisma.tournament.findUnique({ where: { id: input.tournamentId } }),
    prisma.user.findUnique({ where: { id: input.userId }, select: { status: true } }),
  ]);

  if (!torneo) return { ok: false, error: "TORNEO_NO_ENCONTRADO" };
  if (!socio || socio.status !== "ACTIVE") return { ok: false, error: "SOCIO_NO_ACTIVO" };
  if (torneo.status !== "OPEN") return { ok: false, error: "NO_ABIERTO" };
  if (input.isGuest && !torneo.allowGuests) return { ok: false, error: "SIN_INVITADOS" };

  const ahora = new Date();
  if (!input.saltarPlazo && (ahora < torneo.opensAt || ahora > torneo.closesAt)) {
    return { ok: false, error: "FUERA_DE_PLAZO" };
  }

  const precio = input.isGuest ? torneo.guestPriceCents : torneo.memberPriceCents;
  const tratamiento = input.isGuest ? torneo.guestTaxTreatment : torneo.memberTaxTreatment;

  try {
    const inscripcion = await prisma.$transaction(
      async (tx) => {
        // Las plazas se cuentan dentro de la transaccion; si se llenan mientras
        // tanto, la inscripcion cae en lista de espera en lugar de fallar.
        const ocupadas = await tx.tournamentRegistration.count({
          where: { tournamentId: torneo.id, status: "REGISTERED" },
        });
        const hayHueco = torneo.maxParticipants === 0 || ocupadas < torneo.maxParticipants;

        return tx.tournamentRegistration.create({
          data: {
            tournamentId: torneo.id,
            userId: input.userId,
            participantName: input.participantName.trim().slice(0, 120),
            isGuest: input.isGuest,
            status: hayHueco ? "REGISTERED" : "WAITLIST",
            amountCents: precio,
            taxCents: taxIncludedIn(precio, tratamiento),
            taxTreatment: tratamiento,
            paymentStatus: precio === 0 ? "NOT_REQUIRED" : "PENDING",
          },
          select: { id: true, status: true, amountCents: true },
        });
      },
      { isolationLevel: "Serializable", timeout: 10_000 },
    );

    return {
      ok: true,
      id: inscripcion.id,
      estado: inscripcion.status,
      importeCents: inscripcion.amountCents,
    };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "YA_INSCRITO" };
    if (isSerializationFailure(error)) return { ok: false, error: "CONFLICTO_TEMPORAL" };
    throw error;
  }
}

/**
 * Anula una inscripcion y, si habia lista de espera, asciende a la siguiente.
 * Hacerlo a mano se olvida siempre; hacerlo aqui no.
 */
export async function anularInscripcion(input: {
  registrationId: string;
  actorId: string;
  actorEsStaff: boolean;
}): Promise<{ ok: true; ascendida: string | null } | { ok: false; error: string }> {
  const inscripcion = await prisma.tournamentRegistration.findUnique({
    where: { id: input.registrationId },
    select: { id: true, userId: true, status: true, tournamentId: true },
  });

  if (!inscripcion) return { ok: false, error: "No hemos encontrado esa inscripción." };
  if (!input.actorEsStaff && inscripcion.userId !== input.actorId) {
    return { ok: false, error: "No hemos encontrado esa inscripción." };
  }
  if (inscripcion.status === "CANCELLED") return { ok: false, error: "Ya estaba anulada." };

  // Cada cambio de estado es condicional al estado leido. Si otra peticion lo
  // cambia entre la lectura y la escritura (otra anulacion de la misma plaza,
  // o un ascenso desde la lista de espera), la escritura no toca nada y se
  // vuelve a leer: asi no se libera dos veces la misma plaza, ni se da por
  // anulada una inscripcion que acaba de subir a la lista de inscritos.
  for (let intento = 0; intento < MAX_REINTENTOS_ANULACION; intento++) {
    const resultado = await prisma.$transaction(async (tx) => {
      const actual = await tx.tournamentRegistration.findUnique({
        where: { id: inscripcion.id },
        select: { status: true },
      });
      if (!actual || actual.status === "CANCELLED") return { tipo: "ya_anulada" as const };

      const anuladas = await tx.tournamentRegistration.updateMany({
        where: { id: inscripcion.id, status: actual.status },
        data: { status: "CANCELLED" },
      });
      if (anuladas.count === 0) return { tipo: "reintentar" as const };

      if (actual.status !== "REGISTERED") return { tipo: "anulada" as const, ascendida: null };
      return { tipo: "anulada" as const, ascendida: await ascenderSiguiente(tx, inscripcion.tournamentId) };
    });

    if (resultado.tipo === "ya_anulada") return { ok: false, error: "Ya estaba anulada." };
    if (resultado.tipo === "anulada") return { ok: true, ascendida: resultado.ascendida };
  }

  return { ok: false, error: "Ha habido mucha actividad simultanea. Vuelve a intentarlo." };
}

const MAX_REINTENTOS_ANULACION = 3;

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Sube a la primera persona de la lista de espera. El ascenso tambien es
 * condicional: si otra anulacion simultanea ya la ha subido, se pasa a la
 * siguiente en lugar de dejar la plaza libre.
 */
async function ascenderSiguiente(tx: Tx, tournamentId: string): Promise<string | null> {
  for (;;) {
    const siguiente = await tx.tournamentRegistration.findFirst({
      where: { tournamentId, status: "WAITLIST" },
      orderBy: { createdAt: "asc" },
      select: { id: true, participantName: true },
    });
    if (!siguiente) return null;

    const subidas = await tx.tournamentRegistration.updateMany({
      where: { id: siguiente.id, status: "WAITLIST" },
      data: { status: "REGISTERED" },
    });
    if (subidas.count === 1) return siguiente.participantName;
  }
}

/** Plazas libres. null = sin limite. */
export function plazasLibres(maxParticipants: number, inscritos: number): number | null {
  if (maxParticipants === 0) return null;
  return Math.max(0, maxParticipants - inscritos);
}

export function slugTorneo(nombre: string, ano: number): string {
  const base = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `${base}-${ano}`;
}
