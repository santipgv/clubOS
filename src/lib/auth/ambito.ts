import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { Sport } from "@/lib/types";
import { DEPORTE_NOMBRE } from "@/lib/booking/deportes";

/**
 * Ambito de gestion: los deportes sobre los que alguien puede actuar en
 * reservas y bloqueos. `null` significa todos (staff y administracion); una
 * lista, solo esos deportes (colaborador). Una lista vacia no da acceso a nada.
 *
 * Los filtros se aplican en la propia consulta para que lo que queda fuera del
 * ambito no llegue ni a leerse. Ocultarlo en la pagina no basta: cada accion
 * vuelve a comprobarlo en el servidor.
 */
export type Ambito = Sport[] | null;

export function filtroPistas(ambito: Ambito): Prisma.CourtWhereInput {
  return ambito === null ? {} : { sport: { in: ambito } };
}

export function filtroTorneos(ambito: Ambito): Prisma.TournamentWhereInput {
  return ambito === null ? {} : { sport: { in: ambito } };
}

export function filtroReservas(ambito: Ambito): Prisma.BookingWhereInput {
  return ambito === null ? {} : { court: filtroPistas(ambito) };
}

/**
 * Un bloqueo de pista pertenece al deporte de esa pista; uno de deporte, a ese
 * deporte. El cierre del club entero (sin pista ni deporte) queda fuera de
 * cualquier ambito limitado. Si un bloqueo tiene pista, manda la pista, igual
 * que en la disponibilidad y en la creacion de reservas.
 */
export function filtroBloqueos(ambito: Ambito): Prisma.CourtBlockWhereInput {
  if (ambito === null) return {};
  return {
    OR: [
      { courtId: { not: null }, court: filtroPistas(ambito) },
      { courtId: null, sport: { in: ambito } },
    ],
  };
}

export async function pistaEnAmbito(ambito: Ambito, courtId: string): Promise<boolean> {
  if (!courtId) return false;
  const n = await prisma.court.count({ where: { id: courtId, ...filtroPistas(ambito) } });
  return n > 0;
}

export async function reservaEnAmbito(ambito: Ambito, bookingId: string): Promise<boolean> {
  if (!bookingId) return false;
  const n = await prisma.booking.count({ where: { id: bookingId, ...filtroReservas(ambito) } });
  return n > 0;
}

/** Deportes que se pueden elegir en los formularios de gestion. */
export function deportesElegibles(ambito: Ambito): Sport[] {
  const todos = Object.keys(DEPORTE_NOMBRE) as Sport[];
  return ambito === null ? todos : todos.filter((s) => ambito.includes(s));
}
