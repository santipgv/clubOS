"use server";

import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { requestMagicLink } from "@/lib/auth/magic-link";
import { rateLimit } from "@/lib/auth/rate-limit";
import { requestContext } from "@/lib/auth/session";
import { registroSchema, erroresDeCampo } from "@/lib/validation";
import { esDemasiadoObvia, hashPassword } from "@/lib/auth/password";
import { encrypt } from "@/lib/crypto";
import { ibanLast4, normalizeIban } from "@/lib/iban";

export type EstadoRegistro = { ok?: boolean; errores?: Record<string, string>; mensaje?: string };

export async function registrarSocio(
  _previo: EstadoRegistro,
  formData: FormData,
): Promise<EstadoRegistro> {
  const parsed = registroSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errores: erroresDeCampo(parsed.error) };

  const { ip } = await requestContext();
  const limite = await rateLimit(`registro:ip:${ip ?? "desconocida"}`, 5, 60 * 60);
  if (!limite.allowed) {
    return { mensaje: "Demasiadas solicitudes desde esta conexion. Prueba más tarde." };
  }

  const datos = parsed.data;

  if (esDemasiadoObvia(datos.password, datos.email)) {
    return { errores: { password: "Esa contraseña es demasiado fácil de adivinar. Elige otra." } };
  }

  const existente = await prisma.user.findUnique({
    where: { email: datos.email },
    select: { id: true },
  });

  if (!existente) {
    const iban = normalizeIban(datos.iban);

    const user = await prisma.user.create({
      data: {
        email: datos.email,
        passwordHash: await hashPassword(datos.password),
        passwordUpdatedAt: new Date(),
        firstName: datos.firstName,
        lastName: datos.lastName,
        nationalId: datos.nationalId,
        birthDate: new Date(`${datos.birthDate}T00:00:00Z`),
        phone: datos.phone,
        altPhone: datos.altPhone || null,
        addressLine: datos.addressLine,
        postalCode: datos.postalCode,
        city: datos.city,
        province: datos.province,
        // El IBAN se cifra; solo se guardan en claro los cuatro ultimos
        // dígitos, que son los que hacen falta para mostrarlo.
        ibanEncrypted: encrypt(iban),
        ibanLast4: ibanLast4(iban),
        accountHolder: datos.accountHolder,
        acceptedTermsAt: new Date(),
        status: "PENDING",
        role: "MEMBER",
        relationship: "SOCIO",
      },
      select: { id: true },
    });

    await recordAudit({
      actorId: user.id,
      action: "member.registered",
      entityType: "User",
      entityId: user.id,
      // Nunca se registra el IBAN en la auditoria, solo que se aporto uno.
      metadata: { email: datos.email, conDomiciliacion: true },
    });
  }

  // En ambos casos se envia un enlace para verificar el correo y se responde lo
  // mismo: si la respuesta variara, este formulario seria un comprobador de
  // correos de socios. Al que ya existia no se le toca ningun dato.
  await requestMagicLink(datos.email);
  return { ok: true };
}
