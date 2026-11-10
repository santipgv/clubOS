import { redirect } from "next/navigation";
import { getSessionUser, type SessionUser } from "./session";
import type { Sport } from "@/lib/types";

/**
 * Toda accion protegida empieza por una de estas funciones. La comprobacion
 * vive en el servidor y sobre datos frescos de BD; ocultar un boton en el
 * cliente no es una medida de seguridad.
 */

export class ForbiddenError extends Error {
  constructor(message = "No tienes permiso para realizar esta acción.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/entrar");
  return user;
}

/** Socio operativo: aprobado por la junta y no suspendido. Es quien puede reservar. */
export async function requireActiveMember(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.status !== "ACTIVE") redirect("/pendiente");
  return user;
}

export async function requireStaff(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "STAFF" && user.role !== "ADMIN") throw new ForbiddenError();
  if (user.status !== "ACTIVE") throw new ForbiddenError();
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new ForbiddenError();
  if (user.status !== "ACTIVE") throw new ForbiddenError();
  return user;
}

export function isStaff(user: SessionUser | null): boolean {
  return user?.role === "STAFF" || user?.role === "ADMIN";
}

/**
 * Un colaborador es un socio al que la junta encarga un deporte: ve y gestiona
 * las reservas y bloqueos de sus pistas, pero no toca socios ni cuotas.
 */
export function puedeGestionarDeportes(user: SessionUser | null): boolean {
  return isStaff(user) || user?.role === "COLLABORATOR";
}

/** Deportes sobre los que esta persona puede actuar. null = todos. */
export function deportesGestionados(user: SessionUser): Sport[] | null {
  if (isStaff(user)) return null;
  if (user.role === "COLLABORATOR") return user.managedSports;
  return [];
}

export async function requireGestorDeDeportes(): Promise<SessionUser> {
  const user = await requireUser();
  if (!puedeGestionarDeportes(user)) throw new ForbiddenError();
  if (user.status !== "ACTIVE") throw new ForbiddenError();
  return user;
}

/**
 * Configurar pistas (horarios, duraciones, activarlas) y torneos. Lo hace la
 * administracion para todo el club y el colaborador para sus deportes. El
 * personal de recepcion no: cobra y reserva, pero no cambia la oferta.
 */
export function puedeConfigurarDeportes(user: SessionUser | null): boolean {
  return user?.role === "ADMIN" || user?.role === "COLLABORATOR";
}

export async function requireConfiguradorDeDeportes(): Promise<SessionUser> {
  const user = await requireUser();
  if (!puedeConfigurarDeportes(user)) throw new ForbiddenError();
  if (user.status !== "ACTIVE") throw new ForbiddenError();
  return user;
}
