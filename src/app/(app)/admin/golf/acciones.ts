"use server";

import { markGolfBookingPaid } from "@/lib/golf/payments";
import { crearBloqueoSalida } from "@/lib/golf/blocks";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma, isUniqueViolation } from "@/lib/db";
import { requireAdmin, requireStaff } from "@/lib/auth/guards";
import { recordAudit } from "@/lib/audit";
import { erroresDeCampo } from "@/lib/validation";
import { clubDayMinutesToUtc, DAY_PATTERN } from "@/lib/time";

export type EstadoGolf = { error?: string; ok?: string };

const tarifasGolfSchema = z.object({
  memberEuros: z.coerce.number().min(0).max(1000),
  guestEuros: z.coerce.number().min(0).max(1000),
  buggyEuros: z.coerce.number().min(0).max(1000),
  memberTaxTreatment: z.enum(["EXEMPT_SPORT", "STANDARD_21", "REDUCED_10", "NOT_SUBJECT"]),
  guestTaxTreatment: z.enum(["EXEMPT_SPORT", "STANDARD_21", "REDUCED_10", "NOT_SUBJECT"]),
});

const recorridoSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  code: z.string().trim().min(2).max(16).regex(/^[A-Z0-9-]+$/, "Solo mayúsculas, números y guiones"),
  name: z.string().trim().min(2).max(60),
  kind: z.enum(["RECORRIDO", "PRACTICAS", "PITCH_AND_PUTT", "PUTTING_GREEN"]),
  holes: z.coerce.number().int().min(0).max(36),
  teeIntervalMinutes: z.coerce.number().int().min(5).max(60),
  maxPlayers: z.coerce.number().int().min(1).max(8),
  ...tarifasGolfSchema.shape,
  buggiesAvailable: z.union([z.literal("on"), z.literal("")]).optional(),
  isActive: z.union([z.literal("on"), z.literal("")]).optional(),
  opensAt: z.coerce.number().int().min(0).max(1439),
  closesAt: z.coerce.number().int().min(1).max(1440),
});

function preciosRecorrido(d: z.infer<typeof tarifasGolfSchema>) {
  return {
    memberPriceCents: Math.round(d.memberEuros * 100),
    guestPriceCents: Math.round(d.guestEuros * 100),
    buggyPriceCents: Math.round(d.buggyEuros * 100),
    memberTaxTreatment: d.memberTaxTreatment,
    guestTaxTreatment: d.guestTaxTreatment,
  };
}

export async function guardarTarifasGolf(_previo: EstadoGolf, formData: FormData): Promise<EstadoGolf> {
  const admin = await requireAdmin();
  const parsed = tarifasGolfSchema.extend({ id: z.string().uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: Object.values(erroresDeCampo(parsed.error))[0] ?? "Tarifas no válidas." };

  const { id } = parsed.data;
  const data = preciosRecorrido(parsed.data);
  const actualizadas = await prisma.golfCourse.updateMany({ where: { id }, data });
  if (actualizadas.count === 0) return { error: "Ese recorrido ya no existe." };

  await recordAudit({
    actorId: admin.id,
    action: "golf.course_updated",
    entityType: "GolfCourse",
    entityId: id,
    metadata: { tarifas: data },
  });
  revalidatePath("/admin/pistas");
  revalidatePath("/reservar/golf");
  revalidatePath("/reservar/golf/confirmar");
  return { ok: "Tarifas de golf guardadas." };
}

export async function guardarRecorrido(_previo: EstadoGolf, formData: FormData): Promise<EstadoGolf> {
  const admin = await requireAdmin();

  const parsed = recorridoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: Object.values(erroresDeCampo(parsed.error))[0] ?? "Datos no válidos." };
  const d = parsed.data;

  if (d.closesAt <= d.opensAt) return { error: "La hora de cierre debe ser posterior a la de apertura." };

  const datos = {
    code: d.code,
    name: d.name,
    kind: d.kind,
    holes: d.holes,
    teeIntervalMinutes: d.teeIntervalMinutes,
    maxPlayers: d.maxPlayers,
    ...preciosRecorrido(d),
    buggiesAvailable: d.buggiesAvailable === "on",
    isActive: d.isActive === "on",
  };

  try {
    if (d.id) {
      // El horario se rehace entero: son siete filas, no compensa diferenciarlas.
      await prisma.$transaction([
        prisma.golfCourse.update({ where: { id: d.id }, data: datos }),
        prisma.golfSchedule.deleteMany({ where: { courseId: d.id } }),
        prisma.golfSchedule.createMany({
          data: Array.from({ length: 7 }, (_, weekday) => ({
            courseId: d.id as string,
            weekday,
            opensAt: d.opensAt,
            closesAt: d.closesAt,
          })),
        }),
      ]);
      await recordAudit({
        actorId: admin.id,
        action: "golf.course_updated",
        entityType: "GolfCourse",
        entityId: d.id,
        metadata: { nombre: d.name },
      });
      revalidatePath("/admin/pistas");
      revalidatePath("/reservar/golf");
      revalidatePath("/reservar/golf/confirmar");
      return { ok: "Recorrido actualizado." };
    }

    const creado = await prisma.golfCourse.create({
      data: {
        ...datos,
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

    await recordAudit({
      actorId: admin.id,
      action: "golf.course_updated",
      entityType: "GolfCourse",
      entityId: creado.id,
      metadata: { nombre: d.name, creado: true },
    });

    revalidatePath("/admin/pistas");
    revalidatePath("/reservar/golf");
    return { ok: `Recorrido ${d.name} creado con horario de todos los días.` };
  } catch (error) {
    if (isUniqueViolation(error)) return { error: "Ya existe un recorrido con ese código." };
    throw error;
  }
}

const bloqueoSchema = z
  .object({
    courseId: z.string().uuid().optional().or(z.literal("")),
    day: z.string().regex(DAY_PATTERN, "Fecha no válida"),
    startMinute: z.coerce.number().int().min(0).max(1439),
    endMinute: z.coerce.number().int().min(1).max(1440),
    type: z.enum(["MAINTENANCE", "TOURNAMENT", "CLASS", "CLOSURE", "EVENT"]),
    title: z.string().trim().min(3, "Pon un título descriptivo").max(120),
    description: z.string().max(500).optional(),
    isPublic: z.union([z.literal("on"), z.literal("")]).optional(),
  })
  .refine((v) => v.endMinute > v.startMinute, {
    message: "La hora de fin debe ser posterior a la de inicio",
    path: ["endMinute"],
  });

/**
 * Bloquea salidas. Como en las pistas, no se cancelan reservas en silencio: si
 * la franja tiene gente apuntada se avisa y hace falta confirmación expresa.
 */
export async function crearBloqueoGolf(_previo: EstadoGolf, formData: FormData): Promise<EstadoGolf> {
  const staff = await requireStaff();

  const parsed = bloqueoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: Object.values(erroresDeCampo(parsed.error))[0] ?? "Datos no válidos." };
  const d = parsed.data;
  const confirmado = formData.get("confirmar") === "si";

  const courseId = d.courseId || null;
  const startsAt = clubDayMinutesToUtc(d.day, d.startMinute);
  const endsAt = clubDayMinutesToUtc(d.day, d.endMinute);

  const resultado = await crearBloqueoSalida({
    courseId, startsAt, endsAt, type: d.type, title: d.title,
    description: d.description || null, isPublic: d.isPublic === "on",
    createdById: staff.id, confirmed: confirmado,
  });
  if (!resultado.ok) {
    return { error: `Hay ${resultado.requiresConfirmation} reserva(s) de socios en esas salidas. Confirma para anularlas y crear el bloqueo.` };
  }
  const bloqueo = { id: resultado.blockId };
  const anuladas = resultado.cancelledBookings;

  await recordAudit({
    actorId: staff.id,
    action: "golf.block_created",
    entityType: "GolfBlock",
    entityId: bloqueo.id,
    metadata: { titulo: d.title, reservasAnuladas: anuladas, courseId },
  });

  revalidatePath("/admin/pistas");
  revalidatePath("/reservar/golf");
  revalidatePath("/mis-reservas");
  return {
    ok:
      anuladas > 0
        ? `Bloqueo creado. Se han anulado ${anuladas} reserva(s). Avisa a los socios afectados.`
        : "Bloqueo creado.",
  };
}

export async function eliminarBloqueoGolf(_previo: EstadoGolf, formData: FormData): Promise<EstadoGolf> {
  const staff = await requireStaff();
  const id = String(formData.get("id") ?? "");

  const borrado = await prisma.golfBlock.deleteMany({ where: { id } });
  if (borrado.count === 0) return { error: "Ese bloqueo ya no existe." };

  await recordAudit({ actorId: staff.id, action: "golf.block_created", entityType: "GolfBlock", entityId: id, metadata: { eliminado: true } });
  revalidatePath("/admin/pistas");
  revalidatePath("/reservar/golf");
  return { ok: "Bloqueo eliminado. Las reservas ya anuladas no se recuperan." };
}

export async function cobrarSalida(_previo: EstadoGolf, formData: FormData): Promise<EstadoGolf> {
  const staff = await requireStaff();
  const parsed = z.object({
    bookingId: z.string().uuid(),
    metodo: z.enum(["CASH", "TRANSFER", "MANUAL", "CREDIT"]),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Datos de cobro no válidos." };
  const result = await markGolfBookingPaid({
    bookingId: parsed.data.bookingId,
    method: parsed.data.metodo,
    registeredById: staff.id,
  });
  if (!result.ok) {
    return { error: result.error === "NOT_FOUND" ? "Reserva no encontrada."
      : result.error === "CANCELLED" ? "No se cobra una reserva cancelada."
      : result.error === "INVITATION_PENDING" ? "Espera a que el socio responda a la invitación."
      : result.error === "NO_PAYMENT" ? "Esta reserva no tiene importe pendiente."
      : "Esa reserva ya figura como pagada." };
  }
  await recordAudit({
    actorId: staff.id, action: "golf.marked_paid", entityType: "GolfBooking",
    entityId: parsed.data.bookingId,
    metadata: { metodo: parsed.data.metodo, importeCents: result.amountCents },
  });
  revalidatePath("/admin/pistas");
  revalidatePath("/mis-reservas");
  return { ok: "Cobro registrado." };
}
