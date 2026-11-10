import { prisma } from "@/lib/db";
import { clubToday } from "@/lib/time";
import type { MemberType } from "@/lib/types";

/**
 * Cuotas de socio.
 *
 * El club gira dos cuotas al ano, con vencimiento el 5 de enero y el 5 de
 * julio. Las cuotas concretas no se escriben a mano: se generan a partir de la
 * tarifa de cada categoria de socio (FeeRate).
 *
 * La generacion es idempotente: la clave unica (socio, periodo, concepto) hace
 * que volver a lanzarla no duplique nada, asi que puede ejecutarse desde un
 * boton, desde una tarea programada o dos veces seguidas sin miedo.
 */

export type Semestre = 1 | 2;

export const CONCEPTO_CUOTA = "Cuota semestral de socio";

/** "2026-S1" */
export function periodoDe(ano: number, semestre: Semestre): string {
  return `${ano}-S${semestre}`;
}

/** 5 de enero para el primer semestre, 5 de julio para el segundo. */
export function vencimientoDe(ano: number, semestre: Semestre): Date {
  return new Date(Date.UTC(ano, semestre === 1 ? 0 : 6, 5));
}

export function etiquetaSemestre(ano: number, semestre: Semestre): string {
  return semestre === 1
    ? `Primer semestre de ${ano} (enero–junio)`
    : `Segundo semestre de ${ano} (julio–diciembre)`;
}

export type ResultadoGeneracion = {
  periodo: string;
  creadas: number;
  yaExistian: number;
  sinTarifa: MemberType[];
};

/**
 * Crea las cuotas de un semestre para todos los socios activos que tengan
 * tarifa. No toca a empleados ni a quien este de baja, y no pisa las cuotas ya
 * existentes aunque hayan cambiado de importe: lo ya girado, girado esta.
 */
export async function generarCuotasSemestre(
  ano: number,
  semestre: Semestre,
): Promise<ResultadoGeneracion> {
  const periodo = periodoDe(ano, semestre);
  const dueDate = vencimientoDe(ano, semestre);

  const [socios, tarifas, existentes] = await Promise.all([
    prisma.user.findMany({
      where: { status: "ACTIVE", relationship: "SOCIO" },
      select: { id: true, memberType: true },
    }),
    prisma.feeRate.findMany(),
    prisma.membershipFee.findMany({
      where: { period: periodo, concept: CONCEPTO_CUOTA },
      select: { userId: true },
    }),
  ]);

  const porTipo = new Map(tarifas.map((t) => [t.memberType, t]));
  const yaTienen = new Set(existentes.map((e) => e.userId));
  const sinTarifa = new Set<MemberType>();

  const nuevas = socios.flatMap((socio) => {
    if (yaTienen.has(socio.id)) return [];
    const tarifa = porTipo.get(socio.memberType);
    if (!tarifa) {
      sinTarifa.add(socio.memberType);
      return [];
    }
    // Honorarios y demas categorias exentas no generan recibo.
    if (!tarifa.isBilled || tarifa.amountCents === 0) return [];

    return [{
      userId: socio.id,
      period: periodo,
      concept: CONCEPTO_CUOTA,
      amountCents: tarifa.amountCents,
      taxTreatment: tarifa.taxTreatment,
      dueDate,
      status: "PENDING" as const,
    }];
  });

  const creadas = nuevas.length
    ? await prisma.membershipFee.createMany({ data: nuevas, skipDuplicates: true })
    : { count: 0 };

  return {
    periodo,
    creadas: creadas.count,
    yaExistian: socios.filter((s) => yaTienen.has(s.id)).length,
    sinTarifa: [...sinTarifa],
  };
}

/** Genera los dos semestres de un ano. Es lo que se lanza en enero. */
export async function generarCuotasDelAno(ano: number): Promise<ResultadoGeneracion[]> {
  return [
    await generarCuotasSemestre(ano, 1),
    await generarCuotasSemestre(ano, 2),
  ];
}

/**
 * Pasa a vencidas las cuotas cuyo plazo ha terminado. Se llama al abrir la
 * pantalla de cuotas y desde la tarea programada, para que el estado que ve la
 * junta sea el real y no dependa de que alguien se acuerde.
 */
export async function marcarCuotasVencidas(): Promise<number> {
  const { count } = await prisma.membershipFee.updateMany({
    where: { status: "PENDING", dueDate: { lt: inicioDelDiaDelClub() } },
    data: { status: "OVERDUE" },
  });
  return count;
}

/**
 * Hoy, en el calendario del club, como lo guarda una columna `@db.Date`
 * (medianoche UTC). Una cuota vence al terminar su dia de vencimiento: la del
 * 5 de enero sigue al corriente durante todo el 5 de enero.
 *
 * Compararla con `new Date()` la daba por vencida desde las 00:00 UTC del
 * propio dia 5, es decir, el mismo dia en que el socio aun estaba en plazo.
 */
export function inicioDelDiaDelClub(now: Date = new Date()): Date {
  return new Date(`${clubToday(now)}T00:00:00.000Z`);
}

/** Una cuota pendiente cuyo dia de vencimiento ya ha terminado. */
export function estaVencida(dueDate: Date, now: Date = new Date()): boolean {
  return dueDate < inicioDelDiaDelClub(now);
}

/** Resumen por periodo, para la pantalla de cuotas. */
export async function resumenPorPeriodo() {
  const filas = await prisma.membershipFee.groupBy({
    by: ["period", "status"],
    _count: { status: true },
    _sum: { amountCents: true },
    orderBy: { period: "desc" },
  });

  const mapa = new Map<
    string,
    { periodo: string; total: number; importeTotal: number; cobrado: number; pendiente: number; vencidas: number }
  >();

  for (const f of filas) {
    const actual = mapa.get(f.period) ?? {
      periodo: f.period, total: 0, importeTotal: 0, cobrado: 0, pendiente: 0, vencidas: 0,
    };
    const n = f._count.status;
    const importe = f._sum.amountCents ?? 0;

    actual.total += n;
    actual.importeTotal += importe;
    if (f.status === "PAID") actual.cobrado += importe;
    if (f.status === "PENDING") actual.pendiente += importe;
    if (f.status === "OVERDUE") { actual.pendiente += importe; actual.vencidas += n; }

    mapa.set(f.period, actual);
  }

  return [...mapa.values()].sort((a, b) => b.periodo.localeCompare(a.periodo));
}
