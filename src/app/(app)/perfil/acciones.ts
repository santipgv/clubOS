"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/guards";
import { recordAudit } from "@/lib/audit";
import { cambioPasswordSchema, datosBancariosSchema, erroresDeCampo } from "@/lib/validation";
import { encrypt } from "@/lib/crypto";
import { ibanLast4, normalizeIban } from "@/lib/iban";
import { esDemasiadoObvia, hashPassword, verifyPassword } from "@/lib/auth/password";

export async function cerrarOtrasSesiones() {
  const user = await requireUser();
  const { SESSION_COOKIE } = await import("@/lib/auth/session");
  const { cookies } = await import("next/headers");
  const { hashToken } = await import("@/lib/auth/tokens");

  const actual = (await cookies()).get(SESSION_COOKIE)?.value;

  await prisma.session.updateMany({
    where: {
      userId: user.id,
      revokedAt: null,
      ...(actual ? { NOT: { tokenHash: hashToken(actual) } } : {}),
    },
    data: { revokedAt: new Date() },
  });

  await recordAudit({
    actorId: user.id,
    action: "auth.session_revoked",
    entityType: "User",
    entityId: user.id,
    metadata: { alcance: "otras" },
  });

  revalidatePath("/perfil");
}


export type EstadoPassword = { error?: string; errores?: Record<string, string>; ok?: string };

/**
 * Elegir o cambiar contrasena.
 *
 * Quien ya tiene una debe demostrarlo escribiendola: si no, bastaria con una
 * sesion olvidada en un ordenador prestado para quedarse con la cuenta. Quien
 * no tiene ninguna ha llegado por enlace magico, y eso ya prueba que controla
 * el correo.
 */
export async function cambiarPassword(
  _previo: EstadoPassword,
  formData: FormData,
): Promise<EstadoPassword> {
  const sesion = await requireUser();

  const parsed = cambioPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errores: erroresDeCampo(parsed.error) };

  const user = await prisma.user.findUnique({
    where: { id: sesion.id },
    select: { id: true, email: true, passwordHash: true },
  });
  if (!user) return { error: "No hemos podido cargar tu cuenta." };

  if (user.passwordHash) {
    const actual = parsed.data.passwordActual ?? "";
    if (!actual || !(await verifyPassword(user.passwordHash, actual))) {
      return { errores: { passwordActual: "La contraseña actual no es correcta." } };
    }
  }

  if (esDemasiadoObvia(parsed.data.password, user.email)) {
    return { errores: { password: "Esa contraseña es demasiado fácil de adivinar. Elige otra." } };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(parsed.data.password),
      passwordUpdatedAt: new Date(),
    },
  });

  // Cambiar la contrasena expulsa al resto de dispositivos: es justo lo que se
  // espera de este boton cuando alguien cree que le han entrado en la cuenta.
  await cerrarOtrasSesiones();

  await recordAudit({
    actorId: user.id,
    action: user.passwordHash ? "auth.password_changed" : "auth.password_set",
    entityType: "User",
    entityId: user.id,
  });

  revalidatePath("/perfil");
  return { ok: "Contraseña guardada. Se han cerrado el resto de sesiones." };
}


export type EstadoBanco = { errores?: Record<string, string>; error?: string; ok?: string };

/**
 * Cambio de la cuenta de domiciliacion.
 *
 * Se pide la contrasena: cambiar la cuenta a la que el club gira la cuota es
 * justo lo que haria alguien que se hubiera colado en una sesion abierta.
 */
export async function cambiarDatosBancarios(
  _previo: EstadoBanco,
  formData: FormData,
): Promise<EstadoBanco> {
  const sesion = await requireUser();

  const parsed = datosBancariosSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errores: erroresDeCampo(parsed.error) };

  const user = await prisma.user.findUnique({
    where: { id: sesion.id },
    select: { id: true, passwordHash: true },
  });
  if (!user) return { error: "No hemos podido cargar tu cuenta." };

  if (user.passwordHash) {
    const password = String(formData.get("password") ?? "");
    if (!password || !(await verifyPassword(user.passwordHash, password))) {
      return { errores: { password: "La contraseña no es correcta." } };
    }
  }

  const iban = normalizeIban(parsed.data.iban);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      ibanEncrypted: encrypt(iban),
      ibanLast4: ibanLast4(iban),
      accountHolder: parsed.data.accountHolder,
    },
  });

  // La auditoria guarda que hubo cambio y los cuatro ultimos dígitos, nunca
  // el IBAN completo.
  await recordAudit({
    actorId: user.id,
    action: "member.bank_updated",
    entityType: "User",
    entityId: user.id,
    metadata: { last4: ibanLast4(iban) },
  });

  revalidatePath("/perfil");
  return { ok: "Cuenta actualizada. La proxima cuota se girará a esta." };
}


export type EstadoBoletin = { error?: string; ok?: string };

/**
 * Alta y baja en la cadena de correos del club.
 *
 * El consentimiento es opcional y reversible desde aqui en un clic, y ademas
 * se genera un token para el enlace de baja del pie de cada correo: el RGPD
 * exige que darse de baja sea al menos tan facil como darse de alta.
 */
export async function cambiarSuscripcionBoletin(
  _previo: EstadoBoletin,
  formData: FormData,
): Promise<EstadoBoletin> {
  const sesion = await requireUser();
  const alta = formData.get("suscribirse") === "si";

  const { randomBytes } = await import("node:crypto");

  await prisma.user.update({
    where: { id: sesion.id },
    data: {
      newsletterOptIn: alta,
      newsletterUpdatedAt: new Date(),
      // El token se renueva en cada alta: un enlace de baja antiguo deja de valer.
      newsletterUnsubToken: alta ? randomBytes(24).toString("base64url") : null,
    },
  });

  await recordAudit({
    actorId: sesion.id,
    action: "newsletter.changed",
    entityType: "User",
    entityId: sesion.id,
    metadata: { alta },
  });

  revalidatePath("/perfil");
  return {
    ok: alta
      ? "Suscrito. Recibiras los avisos y novedades del club en tu correo."
      : "Dado de baja. No volverás a recibir correos del club, salvo los de tus reservas y cuotas.",
  };
}
