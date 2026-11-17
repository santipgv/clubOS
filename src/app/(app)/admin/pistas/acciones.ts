"use server";

import { z } from "zod";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { deportesGestionados, requireAdmin, requireConfiguradorDeDeportes } from "@/lib/auth/guards";
import { pistaEnAmbito } from "@/lib/auth/ambito";
import { recordAudit } from "@/lib/audit";
import { pistaSchema, erroresDeCampo } from "@/lib/validation";
import { isUniqueViolation } from "@/lib/db";

export type EstadoPista = { error?: string; ok?: string };

function parseDuraciones(raw: string, slotMinutes: number): number[] | null {
  const valores = raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0 && n <= 240);
  if (valores.length === 0) return null;
  if (valores.some((v) => v % slotMinutes !== 0)) return null;
  return [...new Set(valores)].sort((a, b) => a - b);
}

export async function crearPista(_previo: EstadoPista, formData: FormData): Promise<EstadoPista> {
  const admin = await requireAdmin();

  const parsed = pistaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: Object.values(erroresDeCampo(parsed.error))[0] ?? "Datos no validos." };

  const d = parsed.data;
  if (d.closesAt <= d.opensAt) return { error: "La hora de cierre debe ser posterior a la de apertura." };

  const duraciones = parseDuraciones(d.allowedDurations, d.slotMinutes);
  if (!duraciones) {
    return { error: `Las duraciones deben ser multiplos de ${d.slotMinutes} minutos. Ejemplo: 60, 90.` };
  }

  try {
    const pista = await prisma.court.create({
      data: {
        sport: d.sport,
        code: d.code,
        name: d.name,
        surface: d.surface || null,
        isIndoor: d.isIndoor === "on",
        slotMinutes: d.slotMinutes,
        allowedDurations: duraciones,
        maxPlayers: d.maxPlayers,
        sortOrder: 99,
        schedules: {
          create: Array.from({ length: 7 }, (_, weekday) => ({
            weekday,
            opensAt: d.opensAt,
            closesAt: d.closesAt,
          })),
        },
      },
      select: { id: true },
    });

    await recordAudit({ actorId: admin.id, action: "court.created", entityType: "Court", entityId: pista.id, metadata: { code: d.code } });
    revalidatePath("/admin/pistas");
    return { ok: `Pista ${d.name} creada con horario de todos los dias.` };
  } catch (error) {
    if (isUniqueViolation(error)) return { error: "Ya existe una pista con ese código." };
    throw error;
  }
}

/**
 * La administracion edita cualquier pista; el colaborador, solo las de sus
 * deportes. Crear pistas y tocar tarifas sigue siendo cosa de la
 * administracion: una pista sin tarifa saldria gratis.
 */
export async function actualizarPista(_previo: EstadoPista, formData: FormData): Promise<EstadoPista> {
  const admin = await requireConfiguradorDeDeportes();
  const courtId = String(formData.get("courtId") ?? "");

  if (!(await pistaEnAmbito(deportesGestionados(admin), courtId))) return { error: "Pista no encontrada." };

  const pista = await prisma.court.findUnique({ where: { id: courtId }, select: { id: true, slotMinutes: true } });
  if (!pista) return { error: "Pista no encontrada." };

  const nombre = String(formData.get("name") ?? "").trim();
  const duracionesRaw = String(formData.get("allowedDurations") ?? "");
  const activa = formData.get("isActive") === "on";

  if (nombre.length < 2) return { error: "El nombre es demasiado corto." };
  const duraciones = parseDuraciones(duracionesRaw, pista.slotMinutes);
  if (!duraciones) return { error: `Las duraciones deben ser multiplos de ${pista.slotMinutes} minutos.` };

  // Horario por dia de la semana.
  const horarios = Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    opensAt: Number(formData.get(`opensAt_${weekday}`)),
    closesAt: Number(formData.get(`closesAt_${weekday}`)),
    isActive: formData.get(`abierto_${weekday}`) === "on",
  }));

  if (horarios.some((h) => !Number.isInteger(h.opensAt) || !Number.isInteger(h.closesAt) || h.closesAt <= h.opensAt)) {
    return { error: "Revisa las horas: el cierre debe ser posterior a la apertura en todos los días." };
  }

  await prisma.$transaction([
    prisma.court.update({
      where: { id: courtId },
      data: { name: nombre, allowedDurations: duraciones, isActive: activa },
    }),
    prisma.courtSchedule.deleteMany({ where: { courtId } }),
    prisma.courtSchedule.createMany({ data: horarios.map((h) => ({ ...h, courtId })) }),
  ]);

  await recordAudit({ actorId: admin.id, action: "court.updated", entityType: "Court", entityId: courtId, metadata: { nombre, activa } });
  revalidatePath("/admin/pistas");
  revalidatePath("/reservar", "layout");
  return { ok: "Pista actualizada." };
}

// ------------------------------------------------------------------ tarifas de pista

const tarifaSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  courtId: z.string().uuid().optional().or(z.literal("")),
  sport: z.enum(["PADEL", "TENIS", "CROQUET"]).optional().or(z.literal("")),
  memberType: z
    .enum(["NUMERARIO", "FAMILIAR", "JUVENIL", "INFANTIL", "ABONADO", "HONORARIO", "INVITADO"])
    .optional()
    .or(z.literal("")),
  label: z.string().trim().max(60).optional().or(z.literal("")),
  precioEuros: z.coerce.number().min(0).max(1000),
  taxTreatment: z.enum(["EXEMPT_SPORT", "STANDARD_21", "REDUCED_10", "NOT_SUBJECT"]),
  fromMinute: z.coerce.number().int().min(0).max(1440),
  toMinute: z.coerce.number().int().min(0).max(1440),
  priority: z.coerce.number().int().min(0).max(100),
});

/**
 * Alta o edicion de una tarifa de pista.
 *
 * El precio se guarda por hora y con impuestos incluidos; el tratamiento
 * fiscal se elige aqui y queda congelado en cada reserva que lo use. Ver §9 de
 * las especificaciones.
 */
export async function guardarTarifaPista(_previo: EstadoPista, formData: FormData): Promise<EstadoPista> {
  const admin = await requireAdmin();

  const parsed = tarifaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: Object.values(erroresDeCampo(parsed.error))[0] ?? "Datos no validos." };
  const d = parsed.data;

  if (d.toMinute <= d.fromMinute) {
    return { error: "La franja horaria de la tarifa termina antes de empezar." };
  }
  if (!d.courtId && !d.sport) {
    return { error: "Elige a que pista o a que deporte se aplica la tarifa." };
  }

  const datos = {
    // Si se apunta a una pista concreta, el deporte sobra: lo dice la pista.
    courtId: d.courtId || null,
    sport: d.courtId ? null : (d.sport as "PADEL" | "TENIS" | "CROQUET"),
    memberType: (d.memberType || null) as
      | "NUMERARIO" | "FAMILIAR" | "JUVENIL" | "INFANTIL" | "ABONADO" | "HONORARIO" | "INVITADO" | null,
    label: d.label || null,
    priceCents: Math.round(d.precioEuros * 100),
    taxTreatment: d.taxTreatment,
    fromMinute: d.fromMinute,
    toMinute: d.toMinute,
    priority: d.priority,
  };

  if (d.id) {
    await prisma.priceRule.update({ where: { id: d.id }, data: datos });
  } else {
    await prisma.priceRule.create({ data: datos });
  }

  await recordAudit({
    actorId: admin.id,
    action: "price_rule.updated",
    entityType: "PriceRule",
    entityId: d.id || null,
    metadata: { precioCents: datos.priceCents, fiscal: datos.taxTreatment },
  });

  revalidatePath("/admin/pistas");
  revalidatePath("/reservar", "layout");
  return { ok: d.id ? "Tarifa actualizada." : "Tarifa creada." };
}

export async function eliminarTarifaPista(_previo: EstadoPista, formData: FormData): Promise<EstadoPista> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");

  const borradas = await prisma.priceRule.deleteMany({ where: { id } });
  if (borradas.count === 0) return { error: "Esa tarifa ya no existe." };

  await recordAudit({ actorId: admin.id, action: "price_rule.updated", entityType: "PriceRule", entityId: id, metadata: { eliminada: true } });
  revalidatePath("/admin/pistas");
  revalidatePath("/reservar", "layout");
  return { ok: "Tarifa eliminada. Las reservas ya hechas conservan su precio." };
}
