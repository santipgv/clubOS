"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { TournamentSport } from "@/generated/prisma/enums";
import { prisma, isUniqueViolation } from "@/lib/db";
import { deportesGestionados, requireConfiguradorDeDeportes, requireGestorDeDeportes } from "@/lib/auth/guards";
import { filtroTorneos } from "@/lib/auth/ambito";
import { recordAudit } from "@/lib/audit";
import { erroresDeCampo } from "@/lib/validation";
import { slugTorneo } from "@/lib/torneos";
import { DAY_PATTERN } from "@/lib/time";
import { clubDayMinutesToUtc } from "@/lib/time";

export type EstadoTorneo = { error?: string; ok?: string };

const torneoSchema = z
  .object({
    id: z.string().uuid().optional().or(z.literal("")),
    name: z.string().trim().min(4, "Pon un nombre").max(120),
    description: z.string().trim().max(2000).optional().or(z.literal("")),
    sport: z.enum(TournamentSport),
    startDay: z.string().regex(DAY_PATTERN, "Fecha no valida"),
    endDay: z.string().regex(DAY_PATTERN, "Fecha no valida"),
    opensDay: z.string().regex(DAY_PATTERN, "Fecha no valida"),
    closesDay: z.string().regex(DAY_PATTERN, "Fecha no valida"),
    maxParticipants: z.coerce.number().int().min(0).max(500),
    allowGuests: z.union([z.literal("on"), z.literal("")]).optional(),
    memberEuros: z.coerce.number().min(0).max(1000),
    guestEuros: z.coerce.number().min(0).max(1000),
    memberTaxTreatment: z.enum(["EXEMPT_SPORT", "STANDARD_21", "REDUCED_10", "NOT_SUBJECT"]),
    guestTaxTreatment: z.enum(["EXEMPT_SPORT", "STANDARD_21", "REDUCED_10", "NOT_SUBJECT"]),
    status: z.enum(["DRAFT", "OPEN", "CLOSED", "FINISHED", "CANCELLED"]),
  })
  .refine((v) => v.endDay >= v.startDay, {
    message: "El torneo no puede terminar antes de empezar",
    path: ["endDay"],
  })
  .refine((v) => v.closesDay >= v.opensDay, {
    message: "El plazo de inscripción no puede cerrar antes de abrirse",
    path: ["closesDay"],
  })
  .refine((v) => v.closesDay <= v.endDay, {
    message: "El plazo de inscripción no puede terminar después del torneo",
    path: ["closesDay"],
  });

/**
 * Alta y edicion de torneos. La administracion, en cualquier deporte; el
 * colaborador, solo en los suyos: tanto el deporte que se guarda como el del
 * torneo que se edita tienen que estar en su ambito.
 */
export async function guardarTorneo(_previo: EstadoTorneo, formData: FormData): Promise<EstadoTorneo> {
  const admin = await requireConfiguradorDeDeportes();
  const ambito = deportesGestionados(admin);

  const parsed = torneoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: Object.values(erroresDeCampo(parsed.error))[0] ?? "Datos no validos." };
  const d = parsed.data;

  if (ambito !== null && !ambito.some((sport) => sport === d.sport)) {
    return { error: "Ese deporte no está entre los tuyos." };
  }

  const datos = {
    name: d.name,
    description: d.description || null,
    sport: d.sport,
    // El torneo ocupa los dias completos; el plazo, hasta el final del ultimo dia.
    startsAt: clubDayMinutesToUtc(d.startDay, 0),
    endsAt: clubDayMinutesToUtc(d.endDay, 24 * 60),
    opensAt: clubDayMinutesToUtc(d.opensDay, 0),
    closesAt: clubDayMinutesToUtc(d.closesDay, 24 * 60),
    maxParticipants: d.maxParticipants,
    allowGuests: d.allowGuests === "on",
    memberPriceCents: Math.round(d.memberEuros * 100),
    guestPriceCents: Math.round(d.guestEuros * 100),
    memberTaxTreatment: d.memberTaxTreatment,
    guestTaxTreatment: d.guestTaxTreatment,
    status: d.status,
  };

  try {
    if (d.id) {
      // El ambito va en la condicion: un colaborador no puede pasar a su deporte
      // un torneo que no es suyo.
      const actualizados = await prisma.tournament.updateMany({
        where: { id: d.id, ...filtroTorneos(ambito) },
        data: datos,
      });
      if (actualizados.count === 0) return { error: "Torneo no encontrado." };
      await recordAudit({ actorId: admin.id, action: "tournament.updated", entityType: "Tournament", entityId: d.id });
      revalidatePath("/admin/torneos");
      revalidatePath("/torneos");
      return { ok: "Torneo actualizado." };
    }

    const ano = Number(d.startDay.slice(0, 4));
    for (let intento = 0; intento < 5; intento++) {
      const slug = intento === 0 ? slugTorneo(d.name, ano) : `${slugTorneo(d.name, ano)}-${intento + 1}`;
      try {
        const torneo = await prisma.tournament.create({
          data: { ...datos, slug, createdById: admin.id },
          select: { id: true },
        });
        await recordAudit({
          actorId: admin.id,
          action: "tournament.created",
          entityType: "Tournament",
          entityId: torneo.id,
          metadata: { nombre: d.name },
        });
        revalidatePath("/admin/torneos");
        revalidatePath("/torneos");
        return {
          ok: datos.status === "OPEN"
            ? "Torneo creado y con inscripciones abiertas."
            : "Torneo creado como borrador. Ponlo en 'Inscripciones abiertas' cuando quieras que lo vean los socios.",
        };
      } catch (error) {
        if (isUniqueViolation(error)) continue;
        throw error;
      }
    }
    return { error: "No se ha podido crear: ya hay demasiados torneos con ese nombre." };
  } catch (error) {
    if (isUniqueViolation(error)) return { error: "Ya existe un torneo con ese nombre y año." };
    throw error;
  }
}

/** Cobro de una inscripcion en la caseta. */
export async function cobrarInscripcion(_previo: EstadoTorneo, formData: FormData): Promise<EstadoTorneo> {
  const staff = await requireGestorDeDeportes();
  const id = String(formData.get("registrationId") ?? "");

  const actualizadas = await prisma.tournamentRegistration.updateMany({
    where: {
      id,
      paymentStatus: { in: ["PENDING"] },
      status: { not: "CANCELLED" },
      tournament: filtroTorneos(deportesGestionados(staff)),
    },
    data: { paymentStatus: "PAID" },
  });
  if (actualizadas.count === 0) return { error: "Esa inscripción no estaba pendiente de cobro." };

  await recordAudit({
    actorId: staff.id,
    action: "tournament.registration",
    entityType: "TournamentRegistration",
    entityId: id,
    metadata: { cobrada: true },
  });

  revalidatePath("/admin/torneos");
  return { ok: "Inscripción cobrada." };
}
