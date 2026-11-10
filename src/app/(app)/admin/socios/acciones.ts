"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma, isUniqueViolation } from "@/lib/db";
import { requireAdmin, requireStaff } from "@/lib/auth/guards";
import { recordAudit } from "@/lib/audit";
import { revokeAllSessions } from "@/lib/auth/session";
import { requestMagicLink } from "@/lib/auth/magic-link";
import { sendMemberApprovedEmail } from "@/lib/email";
import { erroresDeCampo } from "@/lib/validation";
import { DAY_PATTERN } from "@/lib/time";
import { formatEuros } from "@/lib/booking/pricing";
import { topUpWallet, WALLET_TOPUP_MAX_CENTS, WALLET_TOPUP_METHODS, type WalletTopUpMethod } from "@/lib/wallet";

export type EstadoSocio = { error?: string; ok?: string; errores?: Record<string, string> };

const SPORTS = ["PADEL", "TENIS", "CROQUET"] as const;

/** Siguiente numero de socio libre, en formato 0001. */
async function siguienteNumeroSocio(): Promise<string> {
  const socios = await prisma.user.findMany({
    where: { memberNumber: { not: null } },
    select: { memberNumber: true },
  });
  const max = socios.reduce((acc, s) => {
    const n = Number(s.memberNumber);
    return Number.isFinite(n) && n > acc ? n : acc;
  }, 0);
  return String(max + 1).padStart(4, "0");
}

function refrescar(userId?: string) {
  revalidatePath("/admin/socios");
  if (userId) revalidatePath(`/admin/socios/${userId}`);
}

// ------------------------------------------------------------------ alta

export async function aprobarSocio(_previo: EstadoSocio, formData: FormData): Promise<EstadoSocio> {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const numeroPedido = String(formData.get("memberNumber") ?? "").trim();

  const socio = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, firstName: true, status: true, memberNumber: true, joinedAt: true },
  });
  if (!socio) return { error: "Socio no encontrado." };
  if (socio.status === "ACTIVE") return { error: "Ese socio ya estaba activo." };

  for (let intento = 0; intento < 3; intento++) {
    const numero = numeroPedido || socio.memberNumber || (await siguienteNumeroSocio());
    try {
      await prisma.user.update({
        where: { id: socio.id },
        data: {
          status: "ACTIVE",
          memberNumber: numero,
          approvedAt: new Date(),
          approvedById: admin.id,
          // La antiguedad empieza a contar al aprobar el alta, salvo que la
          // junta ya hubiera fijado otra fecha (socios historicos).
          joinedAt: socio.joinedAt ?? new Date(),
          leftAt: null,
          leaveReason: null,
        },
      });

      await recordAudit({
        actorId: admin.id,
        action: "member.approved",
        entityType: "User",
        entityId: socio.id,
        metadata: { memberNumber: numero },
      });

      try {
        await sendMemberApprovedEmail(socio.email, socio.firstName, numero);
      } catch (e) {
        console.error("[socios] alta aprobada pero el correo no salio", e);
      }

      refrescar(socio.id);
      return { ok: `Socio aprobado con el número ${numero}.` };
    } catch (error) {
      if (isUniqueViolation(error) && !numeroPedido) continue;
      if (isUniqueViolation(error)) return { error: "Ese número de socio ya esta asignado a otra persona." };
      throw error;
    }
  }
  return { error: "No se pudo asignar un número de socio. Vuelve a intentarlo." };
}

export async function rechazarSocio(_previo: EstadoSocio, formData: FormData): Promise<EstadoSocio> {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const motivo = String(formData.get("motivo") ?? "").slice(0, 300);

  const socio = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
  if (!socio) return { error: "Socio no encontrado." };
  if (socio.role === "ADMIN") return { error: "No se puede rechazar a un administrador." };

  await prisma.user.update({
    where: { id: userId },
    data: { status: "REJECTED", notes: motivo || undefined },
  });
  await revokeAllSessions(userId);
  await recordAudit({ actorId: admin.id, action: "member.rejected", entityType: "User", entityId: userId, metadata: { motivo } });

  refrescar(userId);
  return { ok: "Solicitud rechazada." };
}

// ------------------------------------------------------------------ estado

export async function cambiarEstadoSocio(_previo: EstadoSocio, formData: FormData): Promise<EstadoSocio> {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const destino = String(formData.get("estado") ?? "");
  const motivo = String(formData.get("motivo") ?? "").slice(0, 300);

  if (!["ACTIVE", "SUSPENDED", "BAJA"].includes(destino)) return { error: "Estado no valido." };
  if (userId === admin.id) return { error: "No puedes cambiar tu propio estado." };

  const socio = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, memberNumber: true, status: true },
  });
  if (!socio) return { error: "Socio no encontrado." };
  if (destino === "ACTIVE" && !socio.memberNumber) {
    return { error: "Asigna primero un número de socio aprobando el alta." };
  }

  const ahora = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        status: destino as "ACTIVE" | "SUSPENDED" | "BAJA",
        leftAt: destino === "BAJA" ? ahora : null,
        leaveReason: destino === "BAJA" ? motivo || null : null,
      },
    });

    // La baja no borra nada del historico, pero si libera las pistas que ese
    // socio tuviera reservadas mas adelante.
    if (destino === "BAJA" || destino === "SUSPENDED") {
      await tx.booking.updateMany({
        where: { userId, status: { in: ["CONFIRMED", "PENDING_PAYMENT"] }, startsAt: { gt: ahora } },
        data: {
          status: "CANCELLED",
          cancelledAt: ahora,
          cancelledById: admin.id,
          cancelReason: destino === "BAJA" ? "Baja del socio" : "Socio suspendido",
        },
      });
    }
  });

  if (destino !== "ACTIVE") await revokeAllSessions(userId);

  await recordAudit({
    actorId: admin.id,
    action: destino === "SUSPENDED" ? "member.suspended" : destino === "BAJA" ? "member.left" : "member.reactivated",
    entityType: "User",
    entityId: userId,
    metadata: { motivo },
  });

  refrescar(userId);
  return {
    ok:
      destino === "BAJA"
        ? "Socio dado de baja. Su histórico de reservas y cuotas se conserva."
        : destino === "SUSPENDED"
          ? "Socio suspendido."
          : "Socio reactivado.",
  };
}

// ------------------------------------------------------------------ permisos

export async function cambiarPermisos(_previo: EstadoSocio, formData: FormData): Promise<EstadoSocio> {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const rol = String(formData.get("rol") ?? "");

  if (!["MEMBER", "COLLABORATOR", "STAFF", "ADMIN"].includes(rol)) return { error: "Rol no valido." };
  if (userId === admin.id) return { error: "No puedes cambiar tus propios permisos." };

  // Los deportes solo tienen sentido para un colaborador.
  const deportes =
    rol === "COLLABORATOR"
      ? SPORTS.filter((s) => formData.get(`deporte_${s}`) === "on")
      : [];

  if (rol === "COLLABORATOR" && deportes.length === 0) {
    return { error: "Un colaborador tiene que gestionar al menos un deporte." };
  }

  await prisma.user.update({
    where: { id: userId },
    data: { role: rol as "MEMBER" | "COLLABORATOR" | "STAFF" | "ADMIN", managedSports: deportes },
  });

  // Un cambio de permisos invalida las sesiones: se reevaluan al volver a entrar.
  await revokeAllSessions(userId);
  await recordAudit({
    actorId: admin.id,
    action: "member.role_changed",
    entityType: "User",
    entityId: userId,
    metadata: { rol, deportes },
  });

  refrescar(userId);
  return { ok: "Permisos actualizados. Se han cerrado sus sesiones abiertas." };
}

// ------------------------------------------------------------------ datos

const datosSchema = z.object({
  firstName: z.string().trim().min(2).max(80),
  lastName: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email("Correo no valido"),
  phone: z.string().trim().max(20).optional().or(z.literal("")),
  altPhone: z.string().trim().max(20).optional().or(z.literal("")),
  nationalId: z.string().trim().max(20).optional().or(z.literal("")),
  birthDate: z.string().regex(DAY_PATTERN).optional().or(z.literal("")),
  joinedAt: z.string().regex(DAY_PATTERN).optional().or(z.literal("")),
  addressLine: z.string().trim().max(160).optional().or(z.literal("")),
  postalCode: z.string().trim().max(10).optional().or(z.literal("")),
  city: z.string().trim().max(80).optional().or(z.literal("")),
  province: z.string().trim().max(80).optional().or(z.literal("")),
  relationship: z.enum(["SOCIO", "EMPLEADO", "COLABORADOR", "INVITADO"]),
  memberType: z.enum(["NUMERARIO", "FAMILIAR", "JUVENIL", "INFANTIL", "ABONADO", "HONORARIO", "INVITADO"]),
  memberNumber: z.string().trim().max(12).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

export async function actualizarSocio(_previo: EstadoSocio, formData: FormData): Promise<EstadoSocio> {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");

  const parsed = datosSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errores: erroresDeCampo(parsed.error) };
  const d = parsed.data;

  const socio = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
  if (!socio) return { error: "Socio no encontrado." };

  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        firstName: d.firstName,
        lastName: d.lastName,
        email: d.email,
        // Cambiar el correo obliga a verificarlo de nuevo: es la via de acceso.
        emailVerifiedAt: d.email === socio.email ? undefined : null,
        phone: d.phone || null,
        altPhone: d.altPhone || null,
        nationalId: d.nationalId || null,
        birthDate: d.birthDate ? new Date(`${d.birthDate}T00:00:00Z`) : null,
        joinedAt: d.joinedAt ? new Date(`${d.joinedAt}T00:00:00Z`) : null,
        addressLine: d.addressLine || null,
        postalCode: d.postalCode || null,
        city: d.city || null,
        province: d.province || null,
        relationship: d.relationship,
        memberType: d.memberType,
        memberNumber: d.memberNumber || null,
        notes: d.notes || null,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { error: "Ese correo o ese número de socio ya pertenecen a otra persona." };
    }
    throw error;
  }

  await recordAudit({
    actorId: admin.id,
    action: "member.updated",
    entityType: "User",
    entityId: userId,
    metadata: { correoCambiado: d.email !== socio.email },
  });

  refrescar(userId);
  return { ok: "Datos actualizados." };
}

/**
 * Envia al socio un enlace para que entre y elija contrasena nueva.
 *
 * El club no fija contrasenas ajenas: si un administrador pudiera hacerlo,
 * podria entrar en la cuenta de cualquier socio. Se le manda el mismo enlace
 * de un solo uso que usaria el propio socio.
 */
export async function enviarRestablecerPassword(_previo: EstadoSocio, formData: FormData): Promise<EstadoSocio> {
  const staff = await requireStaff();
  const userId = String(formData.get("userId") ?? "");

  const socio = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, status: true },
  });
  if (!socio) return { error: "Socio no encontrado." };
  if (socio.status === "REJECTED") return { error: "Esa cuenta no tiene acceso." };

  const resultado = await requestMagicLink(socio.email);
  if (!resultado.ok) return { error: "Se han enviado demasiados enlaces a ese correo. Espera un rato." };

  await recordAudit({
    actorId: staff.id,
    action: "member.password_reset_sent",
    entityType: "User",
    entityId: userId,
  });

  return { ok: `Enviado a ${socio.email}. Al entrar podrá elegir contraseña desde su perfil.` };
}

// ------------------------------------------------------------------ alta manual

export async function crearSocioManual(_previo: EstadoSocio, formData: FormData): Promise<EstadoSocio> {
  const admin = await requireAdmin();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const relationship = String(formData.get("relationship") ?? "SOCIO");

  if (!email.includes("@") || firstName.length < 2 || lastName.length < 2) {
    return { error: "Revisa el correo, el nombre y los apellidos." };
  }
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    return { error: "Ya existe una ficha con ese correo." };
  }

  const esSocio = relationship === "SOCIO";
  const numero = esSocio ? await siguienteNumeroSocio() : null;

  const socio = await prisma.user.create({
    data: {
      email, firstName, lastName,
      status: "ACTIVE",
      role: "MEMBER",
      relationship: relationship as "SOCIO" | "EMPLEADO" | "COLABORADOR" | "INVITADO",
      memberNumber: numero,
      memberType: esSocio ? "NUMERARIO" : "ABONADO",
      approvedAt: new Date(),
      approvedById: admin.id,
      createdById: admin.id,
      joinedAt: new Date(),
      acceptedTermsAt: new Date(),
    },
    select: { id: true },
  });

  await recordAudit({
    actorId: admin.id,
    action: "member.approved",
    entityType: "User",
    entityId: socio.id,
    metadata: { alta: "manual", memberNumber: numero, relationship },
  });

  // Sin contrasena: se le envia el enlace para que entre y elija la suya.
  await requestMagicLink(email);

  refrescar(socio.id);
  return {
    ok: `${firstName} ${lastName} dado de alta${numero ? ` con el numero ${numero}` : ""}. Le hemos enviado un enlace de acceso.`,
  };
}

// ------------------------------------------------------------------ cuotas

const cuotaSchema = z.object({
  userId: z.string().uuid(),
  period: z.string().trim().min(4).max(20),
  concept: z.string().trim().min(3).max(80),
  amountEuros: z.coerce.number().min(0).max(10_000),
  dueDate: z.string().regex(DAY_PATTERN, "Fecha no valida"),
});

export async function crearCuota(_previo: EstadoSocio, formData: FormData): Promise<EstadoSocio> {
  const admin = await requireAdmin();

  const parsed = cuotaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: Object.values(erroresDeCampo(parsed.error))[0] ?? "Datos no validos." };
  const d = parsed.data;

  try {
    const cuota = await prisma.membershipFee.create({
      data: {
        userId: d.userId,
        period: d.period,
        concept: d.concept,
        amountCents: Math.round(d.amountEuros * 100),
        dueDate: new Date(`${d.dueDate}T00:00:00Z`),
        status: "PENDING",
      },
      select: { id: true },
    });

    await recordAudit({
      actorId: admin.id,
      action: "fee.created",
      entityType: "MembershipFee",
      entityId: cuota.id,
      metadata: { userId: d.userId, periodo: d.period, importeCents: Math.round(d.amountEuros * 100) },
    });

    refrescar(d.userId);
    return { ok: `Cuota de ${d.period} creada.` };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { error: "Ya existe una cuota de ese periodo y concepto para este socio." };
    }
    throw error;
  }
}

export async function marcarCuotaPagada(_previo: EstadoSocio, formData: FormData): Promise<EstadoSocio> {
  const staff = await requireStaff();
  const feeId = String(formData.get("feeId") ?? "");
  const metodo = String(formData.get("metodo") ?? "TRANSFER");

  if (!["CASH", "TRANSFER", "CARD_STRIPE", "MANUAL", "CREDIT"].includes(metodo)) {
    return { error: "Método de cobro no valido." };
  }

  const actualizadas = await prisma.membershipFee.updateMany({
    where: { id: feeId, status: { in: ["PENDING", "OVERDUE"] } },
    data: {
      status: "PAID",
      paidAt: new Date(),
      method: metodo as "CASH" | "TRANSFER" | "CARD_STRIPE" | "MANUAL" | "CREDIT",
      registeredById: staff.id,
    },
  });
  if (actualizadas.count === 0) return { error: "Esa cuota ya estaba cobrada." };

  const cuota = await prisma.membershipFee.findUnique({ where: { id: feeId }, select: { userId: true } });
  await recordAudit({
    actorId: staff.id,
    action: "fee.marked_paid",
    entityType: "MembershipFee",
    entityId: feeId,
    metadata: { metodo },
  });

  refrescar(cuota?.userId);
  return { ok: "Cuota marcada como pagada." };
}

// ------------------------------------------------------------------ monedero

/** "20", "20,5" o "20.50" → centimos. null si no es un importe en euros valido. */
function eurosACentimos(texto: string): number | null {
  const limpio = texto.trim().replace(/\s|€/g, "");
  if (!/^\d{1,5}([.,]\d{1,2})?$/.test(limpio)) return null;
  const [enteros, decimales = ""] = limpio.split(/[.,]/);
  return Number(enteros) * 100 + Number(decimales.padEnd(2, "0"));
}

/**
 * Recarga del monedero en recepcion, tras cobrar en efectivo o transferencia.
 * La puede anotar cualquier persona de staff, igual que el cobro de una pista.
 */
export async function recargarMonedero(_previo: EstadoSocio, formData: FormData): Promise<EstadoSocio> {
  const staff = await requireStaff();
  const userId = String(formData.get("userId") ?? "");
  const metodo = String(formData.get("metodo") ?? "CASH");
  const importe = eurosACentimos(String(formData.get("importe") ?? ""));

  if (importe === null || importe <= 0) return { error: "Indica un importe en euros, por ejemplo 20 o 20,50." };
  if (!(WALLET_TOPUP_METHODS as readonly string[]).includes(metodo)) {
    return { error: "Método de cobro no valido." };
  }

  const resultado = await topUpWallet({
    userId,
    amountCents: importe,
    method: metodo as WalletTopUpMethod,
    actorId: staff.id,
  });
  if (!resultado.ok) {
    if (resultado.error === "IMPORTE_NO_VALIDO") {
      return { error: `La recarga debe estar entre 0,01 € y ${formatEuros(WALLET_TOPUP_MAX_CENTS)}.` };
    }
    if (resultado.error === "SOCIO_INEXISTENTE") return { error: "Socio no encontrado." };
    return { error: "Método de cobro no valido." };
  }

  await recordAudit({
    actorId: staff.id,
    action: "wallet.topped_up",
    entityType: "User",
    entityId: userId,
    metadata: { importeCents: importe, metodo, saldoCents: resultado.balanceCents },
  });

  refrescar(userId);
  return { ok: `Recarga de ${formatEuros(importe)} anotada. Saldo actual: ${formatEuros(resultado.balanceCents)}.` };
}
