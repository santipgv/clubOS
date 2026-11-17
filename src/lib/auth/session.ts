import { cookies, headers } from "next/headers";
import { isIP } from "node:net";
import { prisma } from "@/lib/db";
import { env, isProduction } from "@/lib/env";
import { generateToken, hashToken } from "./tokens";
import type { Role, UserStatus, MemberType, Relationship, Sport } from "@/lib/types";
import { canAuthenticate } from "./policy";

/**
 * `__Host-` obliga al navegador a exigir Secure y path "/", y prohibe que un
 * subdominio sobrescriba la cookie. En desarrollo (http) ese prefijo es
 * invalido, asi que solo se usa en produccion.
 */
export const SESSION_COOKIE = isProduction ? "__Host-club_session" : "club_session";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias
const RENEW_THRESHOLD_MS = 24 * 60 * 60 * 1000; // renovacion deslizante diaria

export type SessionUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  status: UserStatus;
  memberType: MemberType;
  memberNumber: string | null;
  emailVerifiedAt: Date | null;
  relationship: Relationship;
  managedSports: Sport[];
  /** Saldo del monedero, para mostrarlo junto al nombre en la cabecera. */
  walletBalanceCents: number;
};

export async function requestContext(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  return {
    ip: trustedClientIp(h),
    userAgent: h.get("user-agent")?.slice(0, 512) ?? null,
  };
}

type HeaderReader = { get(name: string): string | null };

/**
 * Vercel genera x-vercel-forwarded-for y evita que un cliente lo suplante.
 * En otros entornos se falla cerrado salvo que se declare el proxy confiable.
 */
export function trustedClientIp(
  h: HeaderReader,
  deployment: { isVercel: boolean; trustedProxyHeader?: "x-forwarded-for" | "x-real-ip" } = {
    isVercel: process.env.VERCEL === "1",
    trustedProxyHeader: env.TRUSTED_PROXY_IP_HEADER,
  },
): string | null {
  const header = deployment.isVercel ? "x-vercel-forwarded-for" : deployment.trustedProxyHeader;
  if (!header) return null;

  const candidate = h.get(header)?.split(",")[0]?.trim();
  if (!candidate || isIP(candidate) === 0) return null;
  return candidate;
}

export async function createSession(userId: string): Promise<boolean> {
  const token = generateToken();
  const { ip, userAgent } = await requestContext();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { status: true },
    });
    if (!user || !canAuthenticate(user.status)) return false;

    await tx.session.create({
      data: { userId, tokenHash: hashToken(token), expiresAt, ip, userAgent },
    });
    return true;
  });
  if (!created) return false;

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  return true;
}

/**
 * Devuelve el usuario de la sesion actual leyendolo **siempre de la base de
 * datos**. El rol y el estado nunca se guardan en la cookie: si la junta
 * suspende a un socio, el cambio surte efecto en la siguiente peticion.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      expiresAt: true,
      revokedAt: true,
      lastSeenAt: true,
      user: {
        select: {
          id: true, email: true, firstName: true, lastName: true, role: true,
          status: true, memberType: true, memberNumber: true, emailVerifiedAt: true,
          relationship: true, managedSports: true, walletBalanceCents: true,
        },
      },
    },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  if (!canAuthenticate(session.user.status)) return null;

  if (Date.now() - session.lastSeenAt.getTime() > RENEW_THRESHOLD_MS) {
    await prisma.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date(), expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
    });
  }

  return session.user;
}

export async function destroyCurrentSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.updateMany({
      where: { tokenHash: hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  store.delete(SESSION_COOKIE);
}

/** Cierra todas las sesiones de un socio (cambio de rol, suspension, robo de cuenta). */
export async function revokeAllSessions(userId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
