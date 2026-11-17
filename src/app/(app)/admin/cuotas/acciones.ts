"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/guards";
import { recordAudit } from "@/lib/audit";
import { generarCuotasDelAno, generarCuotasSemestre, type Semestre } from "@/lib/cuotas";
import { formatEuros } from "@/lib/booking/pricing";
import { TIPO_SOCIO } from "@/lib/vocabulario";
import type { MemberType } from "@/lib/types";

export type EstadoCuotas = { error?: string; ok?: string };

const TIPOS = Object.keys(TIPO_SOCIO) as MemberType[];

/** Tarifa de la cuota por categoria de socio, en importe de un semestre. */
export async function guardarTarifasCuota(
  _previo: EstadoCuotas,
  formData: FormData,
): Promise<EstadoCuotas> {
  const admin = await requireAdmin();
  const cambios: Array<{ memberType: MemberType; amountCents: number; isBilled: boolean; taxTreatment: "NOT_SUBJECT" | "EXEMPT_SPORT" | "STANDARD_21" }> = [];

  for (const tipo of TIPOS) {
    const bruto = formData.get(`importe_${tipo}`);
    if (bruto === null) continue;

    const euros = Number(bruto);
    if (!Number.isFinite(euros) || euros < 0 || euros > 10_000) {
      return { error: `El importe de ${TIPO_SOCIO[tipo].label} no es valido.` };
    }
    const tratamiento = String(formData.get(`fiscal_${tipo}`) ?? "NOT_SUBJECT");
    if (!["NOT_SUBJECT", "EXEMPT_SPORT", "STANDARD_21"].includes(tratamiento)) {
      return { error: "Tratamiento fiscal no valido." };
    }

    cambios.push({
      memberType: tipo,
      amountCents: Math.round(euros * 100),
      isBilled: formData.get(`girar_${tipo}`) === "on",
      taxTreatment: tratamiento as "NOT_SUBJECT" | "EXEMPT_SPORT" | "STANDARD_21",
    });
  }

  await prisma.$transaction(
    cambios.map((c) =>
      prisma.feeRate.upsert({
        where: { memberType: c.memberType },
        update: { amountCents: c.amountCents, isBilled: c.isBilled, taxTreatment: c.taxTreatment },
        create: c,
      }),
    ),
  );

  await recordAudit({
    actorId: admin.id,
    action: "fee_rate.updated",
    entityType: "FeeRate",
    metadata: { tarifas: cambios.length },
  });

  revalidatePath("/admin/cuotas");
  return { ok: "Tarifas guardadas. Se aplicarán a las cuotas que se generen a partir de ahora." };
}

const generacionSchema = z.object({
  ano: z.coerce.number().int().min(2020).max(2100),
  alcance: z.enum(["ANO", "S1", "S2"]),
});

export async function generarCuotas(_previo: EstadoCuotas, formData: FormData): Promise<EstadoCuotas> {
  const admin = await requireAdmin();

  const parsed = generacionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Indica un año valido." };
  const { ano, alcance } = parsed.data;

  const resultados =
    alcance === "ANO"
      ? await generarCuotasDelAno(ano)
      : [await generarCuotasSemestre(ano, alcance === "S1" ? 1 : (2 as Semestre))];

  const creadas = resultados.reduce((s, r) => s + r.creadas, 0);
  const sinTarifa = [...new Set(resultados.flatMap((r) => r.sinTarifa))];

  await recordAudit({
    actorId: admin.id,
    action: "fee.generated",
    entityType: "MembershipFee",
    metadata: { ano, alcance, creadas },
  });

  revalidatePath("/admin/cuotas");

  if (creadas === 0) {
    return {
      ok: `No habia nada que crear: las cuotas de ${resultados.map((r) => r.periodo).join(" y ")} ya estaban generadas.`,
    };
  }

  const aviso = sinTarifa.length
    ? ` Sin tarifa configurada y por tanto sin cuota: ${sinTarifa.map((t) => TIPO_SOCIO[t].label).join(", ")}.`
    : "";

  return { ok: `${creadas} cuota${creadas === 1 ? "" : "s"} creada${creadas === 1 ? "" : "s"}.${aviso}` };
}

/** Cobro en bloque de un periodo: lo normal tras confirmar la remesa del banco. */
export async function cobrarPeriodo(_previo: EstadoCuotas, formData: FormData): Promise<EstadoCuotas> {
  const admin = await requireAdmin();
  const periodo = String(formData.get("periodo") ?? "");
  if (!periodo) return { error: "Periodo no indicado." };

  const pendientes = await prisma.membershipFee.findMany({
    where: { period: periodo, status: { in: ["PENDING", "OVERDUE"] } },
    select: { id: true, amountCents: true },
  });
  if (pendientes.length === 0) return { error: "No queda ninguna cuota pendiente en ese periodo." };

  // El estado se vuelve a exigir al actualizar: una cuota cobrada en
  // ventanilla entre la lectura y esta escritura no debe perder su fecha ni su
  // medio de pago real para figurar como domiciliada.
  const { count } = await prisma.membershipFee.updateMany({
    where: { id: { in: pendientes.map((p) => p.id) }, status: { in: ["PENDING", "OVERDUE"] } },
    data: { status: "PAID", paidAt: new Date(), method: "TRANSFER", registeredById: admin.id },
  });

  const total = pendientes.reduce((s, p) => s + p.amountCents, 0);
  await recordAudit({
    actorId: admin.id,
    action: "fee.marked_paid",
    entityType: "MembershipFee",
    metadata: { periodo, cuotas: count, importeCents: total, enBloque: true },
  });

  revalidatePath("/admin/cuotas");
  return {
    ok:
      count === pendientes.length
        ? `${count} cuotas marcadas como cobradas por domiciliacion, ${formatEuros(total)} en total.`
        : `${count} cuotas marcadas como cobradas por domiciliacion. ${pendientes.length - count} se habian cobrado por otra via mientras tanto y no se han tocado.`,
  };
}
