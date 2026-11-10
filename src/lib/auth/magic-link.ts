import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { sendMagicLinkEmail } from "@/lib/email";
import { recordAudit } from "@/lib/audit";
import { createSession, requestContext } from "./session";
import { generateToken, hashToken } from "./tokens";
import { rateLimit, purgeRateLimits } from "./rate-limit";
import { canAuthenticate } from "./policy";

const TOKEN_TTL_MS = 15 * 60 * 1000;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Emite un enlace de acceso.
 *
 * Devuelve siempre el mismo resultado exista o no la cuenta: si la respuesta
 * cambiara, cualquiera podria averiguar que correos pertenecen a socios del
 * club probando direcciones una por una.
 */
export async function requestMagicLink(rawEmail: string): Promise<
  { ok: true } | { ok: false; retryAfterSeconds: number }
> {
  const email = normalizeEmail(rawEmail);
  const { ip } = await requestContext();

  const porEmail = await rateLimit(`magic:email:${email}`, 5, 15 * 60);
  if (!porEmail.allowed) return { ok: false, retryAfterSeconds: porEmail.retryAfterSeconds };

  const porIp = await rateLimit(`magic:ip:${ip ?? "desconocida"}`, 15, 15 * 60);
  if (!porIp.allowed) return { ok: false, retryAfterSeconds: porIp.retryAfterSeconds };

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, status: true, emailVerifiedAt: true },
  });

  // Cuenta inexistente o sin acceso: no se envia nada, pero se responde igual.
  if (user && canAuthenticate(user.status)) {
    // Invalida los enlaces anteriores: solo el ultimo solicitado sirve.
    await prisma.magicLinkToken.updateMany({
      where: { email, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    const token = generateToken();
    await prisma.magicLinkToken.create({
      data: {
        email,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
        requestIp: ip,
      },
    });

    const url = `${env.APP_URL}/entrar/verificar?token=${encodeURIComponent(token)}`;
    await sendMagicLinkEmail(email, url, user.emailVerifiedAt === null);
    await recordAudit({
      actorId: user.id,
      action: "auth.magic_link_requested",
      entityType: "User",
      entityId: user.id,
    });
  }

  void purgeRateLimits().catch(() => {});
  return { ok: true };
}

export type ConsumeResult =
  | { ok: true; userId: string; status: string }
  | { ok: false; reason: "inválido" | "caducado" | "usado" | "bloqueado" | "limite" };

/** Canjea el token por una sesion. Un token solo puede usarse una vez. */
export async function consumeMagicLink(token: string): Promise<ConsumeResult> {
  const { ip } = await requestContext();
  const limite = await rateLimit(`verify:ip:${ip ?? "desconocida"}`, 20, 60 * 60);
  if (!limite.allowed) return { ok: false, reason: "limite" };

  const record = await prisma.magicLinkToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });

  if (!record) return { ok: false, reason: "inválido" };
  if (record.consumedAt) return { ok: false, reason: "usado" };
  if (record.expiresAt < new Date()) return { ok: false, reason: "caducado" };

  // Marcado atomico: si dos peticiones llegan a la vez, solo una lo consume.
  const claimed = await prisma.magicLinkToken.updateMany({
    where: { id: record.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (claimed.count === 0) return { ok: false, reason: "usado" };

  const user = await prisma.user.findUnique({
    where: { email: record.email },
    select: { id: true, status: true, emailVerifiedAt: true },
  });
  if (!user) return { ok: false, reason: "inválido" };
  if (!canAuthenticate(user.status)) return { ok: false, reason: "bloqueado" };

  // La sesion comprueba de nuevo el estado de forma transaccional para cerrar
  // la carrera con una baja administrativa concurrente.
  if (!(await createSession(user.id))) return { ok: false, reason: "bloqueado" };

  await prisma.user.update({
    where: { id: user.id },
    data: {
      lastLoginAt: new Date(),
      emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
    },
  });

  await recordAudit({
    actorId: user.id,
    action: "auth.login",
    entityType: "User",
    entityId: user.id,
  });

  return { ok: true, userId: user.id, status: user.status };
}
