import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { createSession, requestContext } from "./session";
import { rateLimit } from "./rate-limit";
import { verifyPassword, quemarTiempoDeVerificacion } from "./password";
import { normalizeEmail } from "./magic-link";
import { canAuthenticate } from "./policy";

export type LoginResult =
  | { ok: true; status: string }
  | { ok: false; reason: "credenciales" | "limite"; retryAfterSeconds?: number };

/**
 * Acceso con correo y contrasena.
 *
 * Todos los caminos que no dan acceso devuelven exactamente el mismo motivo
 * ("credenciales") y tardan aproximadamente lo mismo. Distinguir entre "ese
 * correo no existe", "existe pero no tiene contrasena" y "la contrasena no es
 * esa" convertiria este formulario en un buscador de socios del club.
 */
export async function loginWithPassword(
  rawEmail: string,
  password: string,
): Promise<LoginResult> {
  const email = normalizeEmail(rawEmail);
  const { ip } = await requestContext();

  const porEmail = await rateLimit(`login:email:${email}`, 8, 15 * 60);
  if (!porEmail.allowed) return { ok: false, reason: "limite", retryAfterSeconds: porEmail.retryAfterSeconds };

  const porIp = await rateLimit(`login:ip:${ip ?? "desconocida"}`, 25, 15 * 60);
  if (!porIp.allowed) return { ok: false, reason: "limite", retryAfterSeconds: porIp.retryAfterSeconds };

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, status: true, passwordHash: true, emailVerifiedAt: true },
  });

  if (!user || !user.passwordHash || !canAuthenticate(user.status)) {
    await quemarTiempoDeVerificacion(password);
    return { ok: false, reason: "credenciales" };
  }

  if (!(await verifyPassword(user.passwordHash, password))) {
    await recordAudit({
      actorId: user.id,
      action: "auth.login_failed",
      entityType: "User",
      entityId: user.id,
    });
    return { ok: false, reason: "credenciales" };
  }

  // createSession vuelve a consultar el estado dentro de su transaccion. Asi
  // una baja concurrente no puede colarse entre esta lectura y la sesion.
  if (!(await createSession(user.id))) {
    return { ok: false, reason: "credenciales" };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      lastLoginAt: new Date(),
      // Entrar con la contrasena que se eligio en el registro confirma que la
      // cuenta es de quien dijo serlo.
      emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
    },
  });

  await recordAudit({ actorId: user.id, action: "auth.login", entityType: "User", entityId: user.id });

  return { ok: true, status: user.status };
}
