import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { addDaysToDay, clubDayMinutesToUtc, clubWeekday } from "@/lib/time";
import { taxIncludedIn } from "@/lib/booking/pricing";
import { estaVencida } from "@/lib/cuotas";
import {
  TODOS_LOS_PERIODOS,
  claveDeGrupo,
  diaDelClub,
  diasDelRango,
  franjasEfectivas,
  gruposDelRango,
  indiceLunes,
  minutoDelClub,
  minutosPorHora,
  ocupacion,
  rangoAnterior,
  variacion,
  type FiltrosPanel,
} from "@/lib/panel";
import type { Prisma } from "@/generated/prisma/client";
import type { MemberType, PaymentMethod, Sport, TournamentSport } from "@/lib/types";

/**
 * Datos del panel de indicadores (ADM-1).
 *
 * Dos formas de mirar el dinero, y conviene no mezclarlas:
 *
 *  - **Cobrado** es caja: lo que entro en el periodo, por la fecha del cobro.
 *    Un recibo de cuota de enero cobrado en marzo cuenta en marzo.
 *  - **Facturado / pendiente** es actividad: lo que generaron las reservas y
 *    torneos que se jugaron en el periodo, se hayan cobrado o no.
 *
 * Las cuotas se miran por su periodo (2026-S1, 2026-S2), que es como las
 * gestiona la junta, y no por el rango de fechas.
 */

const ESTADOS_ACTIVOS = ["PENDING_PAYMENT", "CONFIRMED", "COMPLETED", "NO_SHOW"] as const;

export type SerieTemporal = { clave: string; etiqueta: string; valores: number[] }[];

export type FilaPista = {
  id: string;
  nombre: string;
  deporte: Sport;
  reservas: number;
  minutos: number;
  minutosAbiertos: number;
  ocupacion: number | null;
  facturadoCents: number;
  cobradoCents: number;
};

export type FilaDeporte = Omit<FilaPista, "id" | "nombre">;

export type CeldaCalor = { minutos: number; abiertos: number; ocupacion: number | null };

export type DatosPanel = Awaited<ReturnType<typeof cargarPanel>>;

export async function cargarPanel(f: FiltrosPanel) {
  const { desde, hasta } = f.rango;
  const inicio = clubDayMinutesToUtc(desde, 0);
  const fin = clubDayMinutesToUtc(addDaysToDay(hasta, 1), 0);
  const anterior = rangoAnterior(f.rango);
  const inicioAnt = clubDayMinutesToUtc(anterior.desde, 0);
  const finAnt = inicio;

  // Filtros de reserva comunes a todas las consultas de pistas.
  const filtroPista: Prisma.BookingWhereInput = {
    ...(f.pistaId ? { courtId: f.pistaId } : {}),
    ...(f.deporte ? { court: { sport: f.deporte } } : {}),
    ...(f.tipoSocio ? { user: { memberType: f.tipoSocio } } : {}),
  };
  const filtroSocio: Prisma.UserWhereInput = f.tipoSocio ? { memberType: f.tipoSocio } : {};
  const filtroTorneo: Prisma.TournamentWhereInput = f.deporte ? { sport: f.deporte } : {};

  const [
    settings,
    pistas,
    reservas,
    pagos,
    cuotasCobradas,
    inscripciones,
    periodosCuota,
    sociosPorEstado,
    sociosActivosPorTipo,
    altas,
    bajas,
    // periodo anterior, solo totales
    pagosAnt,
    cuotasAnt,
    reservasAnt,
  ] = await Promise.all([
    getSettings(),
    prisma.court.findMany({
      where: {
        isActive: true,
        ...(f.deporte ? { sport: f.deporte } : {}),
        ...(f.pistaId ? { id: f.pistaId } : {}),
      },
      orderBy: [{ sport: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        sport: true,
        schedules: { where: { isActive: true }, select: { weekday: true, opensAt: true, closesAt: true } },
      },
    }),
    prisma.booking.findMany({
      where: { startsAt: { gte: inicio, lt: fin }, ...filtroPista },
      select: {
        startsAt: true,
        endsAt: true,
        status: true,
        paymentStatus: true,
        priceCents: true,
        courtId: true,
        court: { select: { name: true, sport: true } },
      },
    }),
    prisma.payment.findMany({
      where: { status: "PAID", paidAt: { gte: inicio, lt: fin }, booking: filtroPista },
      select: { amountCents: true, paidAt: true, method: true, booking: { select: { taxCents: true, courtId: true } } },
    }),
    prisma.membershipFee.findMany({
      where: { status: "PAID", paidAt: { gte: inicio, lt: fin }, user: filtroSocio },
      select: { amountCents: true, paidAt: true, taxTreatment: true, method: true },
    }),
    // Sin filtrar por estado: una inscripcion anulada, o un torneo cancelado,
    // no devuelve lo que ya se cobro (no hay flujo de devolucion). Lo cobrado
    // tiene que seguir contando; la actividad (inscritos, facturado) no.
    prisma.tournamentRegistration.findMany({
      where: {
        tournament: { startsAt: { gte: inicio, lt: fin }, ...filtroTorneo },
        user: filtroSocio,
      },
      select: {
        status: true,
        isGuest: true,
        amountCents: true,
        taxCents: true,
        paymentStatus: true,
        tournament: { select: { id: true, name: true, sport: true, startsAt: true, maxParticipants: true, status: true } },
      },
    }),
    prisma.membershipFee.findMany({
      distinct: ["period"],
      select: { period: true, dueDate: true },
      orderBy: { period: "desc" },
    }),
    prisma.user.groupBy({
      by: ["status"],
      where: { relationship: "SOCIO", ...filtroSocio },
      _count: { _all: true },
    }),
    prisma.user.groupBy({
      by: ["memberType"],
      where: { relationship: "SOCIO", status: "ACTIVE", ...filtroSocio },
      _count: { _all: true },
    }),
    prisma.user.count({
      where: { relationship: "SOCIO", approvedAt: { gte: inicio, lt: fin }, ...filtroSocio },
    }),
    prisma.user.count({
      where: { relationship: "SOCIO", leftAt: { gte: inicio, lt: fin }, ...filtroSocio },
    }),
    prisma.payment.aggregate({
      where: { status: "PAID", paidAt: { gte: inicioAnt, lt: finAnt }, booking: filtroPista },
      _sum: { amountCents: true },
    }),
    prisma.membershipFee.aggregate({
      where: { status: "PAID", paidAt: { gte: inicioAnt, lt: finAnt }, user: filtroSocio },
      _sum: { amountCents: true },
    }),
    prisma.booking.count({
      where: { startsAt: { gte: inicioAnt, lt: finAnt }, status: { in: [...ESTADOS_ACTIVOS] }, ...filtroPista },
    }),
  ]);

  // ------------------------------------------------------------ cuotas por periodo

  const ahora = new Date();
  // Por defecto, el periodo mas reciente que ya ha vencido: es el que tiene
  // sentido perseguir. Si ninguno ha vencido aun, el mas reciente.
  const periodoPorDefecto =
    periodosCuota.find((p) => p.dueDate <= ahora)?.period ?? periodosCuota[0]?.period ?? null;
  const periodoCuota =
    f.periodoCuota === TODOS_LOS_PERIODOS
      ? null
      : f.periodoCuota && periodosCuota.some((p) => p.period === f.periodoCuota)
        ? f.periodoCuota
        : periodoPorDefecto;

  const cuotas = await prisma.membershipFee.findMany({
    where: { ...(periodoCuota ? { period: periodoCuota } : {}), user: filtroSocio },
    select: {
      amountCents: true,
      status: true,
      dueDate: true,
      user: { select: { id: true, firstName: true, lastName: true, memberNumber: true, memberType: true } },
    },
  });

  // ------------------------------------------------------------ reservas

  const activas = reservas.filter((r) => (ESTADOS_ACTIVOS as readonly string[]).includes(r.status));
  const canceladas = reservas.length - activas.length;
  const noPresentados = activas.filter((r) => r.status === "NO_SHOW").length;
  const minutosReservados = activas.reduce((s, r) => s + (r.endsAt.getTime() - r.startsAt.getTime()) / 60_000, 0);
  const facturadoPistas = activas.reduce((s, r) => s + r.priceCents, 0);
  const pendientePistas = activas
    .filter((r) => r.paymentStatus === "PENDING")
    .reduce((s, r) => s + r.priceCents, 0);
  const reservasDePago = activas.filter((r) => r.priceCents > 0);

  // Horas abiertas: dia a dia, porque el horario cambia por dia de la semana.
  const dias = diasDelRango(desde, hasta);
  const diasPorSemana = new Array(7).fill(0) as number[];
  for (const d of dias) diasPorSemana[clubWeekday(d)]++;

  const apertura = settings["club.openingMinute"];
  const cierre = settings["club.closingMinute"];

  // Mapa de calor: dia de la semana (lunes primero) x hora.
  const calorAbiertos = Array.from({ length: 7 }, () => new Map<number, number>());
  const calorReservados = Array.from({ length: 7 }, () => new Map<number, number>());

  const abiertosPorPista = new Map<string, number>();
  for (const pista of pistas) {
    let total = 0;
    for (let wd = 0; wd < 7; wd++) {
      if (diasPorSemana[wd] === 0) continue;
      const franjas = franjasEfectivas(pista.schedules.filter((s) => s.weekday === wd), apertura, cierre);
      for (const fr of franjas) {
        total += (fr.closesAt - fr.opensAt) * diasPorSemana[wd];
        for (const [h, min] of minutosPorHora(fr.opensAt, fr.closesAt)) {
          const fila = calorAbiertos[indiceLunes(wd)];
          fila.set(h, (fila.get(h) ?? 0) + min * diasPorSemana[wd]);
        }
      }
    }
    abiertosPorPista.set(pista.id, total);
  }

  const idsPistas = new Set(pistas.map((p) => p.id));
  for (const r of activas) {
    // Solo pistas activas: una pista dada de baja no tiene horas abiertas con
    // las que comparar y falsearia la ocupacion.
    if (!idsPistas.has(r.courtId)) continue;
    const dia = diaDelClub(r.startsAt);
    const ini = minutoDelClub(r.startsAt);
    const dur = (r.endsAt.getTime() - r.startsAt.getTime()) / 60_000;
    const fila = calorReservados[indiceLunes(clubWeekday(dia))];
    for (const [h, min] of minutosPorHora(ini, ini + dur)) fila.set(h, (fila.get(h) ?? 0) + min);
  }

  const horasCalor = [...new Set(calorAbiertos.flatMap((m) => [...m.keys()]))].sort((a, b) => a - b);
  const mapaCalor: CeldaCalor[][] = calorAbiertos.map((abiertos, i) =>
    horasCalor.map((h) => {
      const min = calorReservados[i].get(h) ?? 0;
      const ab = abiertos.get(h) ?? 0;
      return { minutos: min, abiertos: ab, ocupacion: ocupacion(min, ab) };
    }),
  );

  // Por pista y por deporte.
  const cobradoPorPista = new Map<string, number>();
  for (const p of pagos) {
    cobradoPorPista.set(p.booking.courtId, (cobradoPorPista.get(p.booking.courtId) ?? 0) + p.amountCents);
  }

  const filasPista: FilaPista[] = pistas.map((p) => {
    const suyas = activas.filter((r) => r.courtId === p.id);
    const minutos = suyas.reduce((s, r) => s + (r.endsAt.getTime() - r.startsAt.getTime()) / 60_000, 0);
    const abiertos = abiertosPorPista.get(p.id) ?? 0;
    return {
      id: p.id,
      nombre: p.name,
      deporte: p.sport,
      reservas: suyas.length,
      minutos,
      minutosAbiertos: abiertos,
      ocupacion: ocupacion(minutos, abiertos),
      facturadoCents: suyas.reduce((s, r) => s + r.priceCents, 0),
      cobradoCents: cobradoPorPista.get(p.id) ?? 0,
    };
  });

  const filasDeporte = new Map<Sport, FilaDeporte>();
  for (const fila of filasPista) {
    const actual = filasDeporte.get(fila.deporte) ?? {
      deporte: fila.deporte, reservas: 0, minutos: 0, minutosAbiertos: 0, ocupacion: null,
      facturadoCents: 0, cobradoCents: 0,
    };
    actual.reservas += fila.reservas;
    actual.minutos += fila.minutos;
    actual.minutosAbiertos += fila.minutosAbiertos;
    actual.facturadoCents += fila.facturadoCents;
    actual.cobradoCents += fila.cobradoCents;
    actual.ocupacion = ocupacion(actual.minutos, actual.minutosAbiertos);
    filasDeporte.set(fila.deporte, actual);
  }

  const minutosAbiertosTotales = [...abiertosPorPista.values()].reduce((s, v) => s + v, 0);
  const minutosReservadosEnActivas = filasPista.reduce((s, p) => s + p.minutos, 0);

  // ------------------------------------------------------------ dinero

  const cobradoPistas = pagos.reduce((s, p) => s + p.amountCents, 0);
  const cobradoCuotas = cuotasCobradas.reduce((s, c) => s + c.amountCents, 0);
  const inscripcionesPagadas = inscripciones.filter((i) => i.paymentStatus === "PAID");
  const cobradoTorneos = inscripcionesPagadas.reduce((s, i) => s + i.amountCents, 0);
  const pendienteTorneos = inscripciones
    .filter((i) => i.paymentStatus === "PENDING" && i.status === "REGISTERED" && i.tournament.status !== "CANCELLED")
    .reduce((s, i) => s + i.amountCents, 0);

  const ivaPistas = pagos.reduce((s, p) => s + p.booking.taxCents, 0);
  const ivaCuotas = cuotasCobradas.reduce((s, c) => s + taxIncludedIn(c.amountCents, c.taxTreatment), 0);
  const ivaTorneos = inscripcionesPagadas.reduce((s, i) => s + i.taxCents, 0);

  const cobradoTotal = cobradoPistas + cobradoCuotas + cobradoTorneos;
  const cobradoAnterior = (pagosAnt._sum.amountCents ?? 0) + (cuotasAnt._sum.amountCents ?? 0);

  // Medios de pago de pistas y cuotas juntos: es lo que recepcion cuadra.
  const porMetodo = new Map<PaymentMethod, number>();
  for (const p of pagos) porMetodo.set(p.method, (porMetodo.get(p.method) ?? 0) + p.amountCents);
  for (const c of cuotasCobradas) {
    const m = c.method ?? "MANUAL";
    porMetodo.set(m, (porMetodo.get(m) ?? 0) + c.amountCents);
  }

  // ------------------------------------------------------------ series

  const grupos = gruposDelRango(desde, hasta, f.agrupacion);
  const indice = new Map(grupos.map((g, i) => [g.clave, i]));
  const ingresosSerie: SerieTemporal = grupos.map((g) => ({ ...g, valores: [0, 0] }));
  const reservasSerie: SerieTemporal = grupos.map((g) => ({ ...g, valores: [0] }));

  const sumar = (serie: SerieTemporal, fecha: Date, posicion: number, valor: number) => {
    const i = indice.get(claveDeGrupo(diaDelClub(fecha), f.agrupacion));
    if (i !== undefined) serie[i].valores[posicion] += valor;
  };
  for (const p of pagos) sumar(ingresosSerie, p.paidAt, 0, p.amountCents);
  for (const c of cuotasCobradas) if (c.paidAt) sumar(ingresosSerie, c.paidAt, 1, c.amountCents);
  for (const r of activas) sumar(reservasSerie, r.startsAt, 0, 1);

  // ------------------------------------------------------------ cuotas

  type Resumen = { recibos: number; giradoCents: number; cobradoCents: number; pendienteCents: number; vencidoCents: number; exentoCents: number };
  const vacio = (): Resumen => ({ recibos: 0, giradoCents: 0, cobradoCents: 0, pendienteCents: 0, vencidoCents: 0, exentoCents: 0 });
  const totalCuotas = vacio();
  const cuotasPorTipo = new Map<MemberType, Resumen>();
  const deudores = new Map<string, { id: string; nombre: string; numero: string | null; tipo: MemberType; recibos: number; importeCents: number; desde: Date }>();

  for (const c of cuotas) {
    const vencida = c.status === "OVERDUE" || (c.status === "PENDING" && estaVencida(c.dueDate, ahora));
    const fila = cuotasPorTipo.get(c.user.memberType) ?? vacio();
    for (const r of [totalCuotas, fila]) {
      r.recibos++;
      if (c.status === "WAIVED" || c.status === "REFUNDED") {
        r.exentoCents += c.amountCents;
        continue;
      }
      r.giradoCents += c.amountCents;
      if (c.status === "PAID") r.cobradoCents += c.amountCents;
      else if (vencida) r.vencidoCents += c.amountCents;
      else r.pendienteCents += c.amountCents;
    }
    cuotasPorTipo.set(c.user.memberType, fila);

    if (vencida) {
      const d = deudores.get(c.user.id) ?? {
        id: c.user.id,
        nombre: `${c.user.lastName}, ${c.user.firstName}`,
        numero: c.user.memberNumber,
        tipo: c.user.memberType,
        recibos: 0,
        importeCents: 0,
        desde: c.dueDate,
      };
      d.recibos++;
      d.importeCents += c.amountCents;
      if (c.dueDate < d.desde) d.desde = c.dueDate;
      deudores.set(c.user.id, d);
    }
  }

  // ------------------------------------------------------------ torneos

  const porTorneo = new Map<string, { nombre: string; deporte: TournamentSport; fecha: Date; plazas: number; cancelado: boolean; inscritos: number; espera: number; invitados: number; facturadoCents: number; cobradoCents: number }>();
  for (const i of inscripciones) {
    const cancelado = i.tournament.status === "CANCELLED";
    // Un torneo cancelado solo aparece si dejo dinero cobrado.
    if (cancelado && i.paymentStatus !== "PAID") continue;
    const t = porTorneo.get(i.tournament.id) ?? {
      nombre: i.tournament.name, deporte: i.tournament.sport, fecha: i.tournament.startsAt,
      plazas: i.tournament.maxParticipants, cancelado, inscritos: 0, espera: 0, invitados: 0, facturadoCents: 0, cobradoCents: 0,
    };
    // Lo cobrado cuenta siempre, igual que en el total de ingresos.
    if (i.paymentStatus === "PAID") t.cobradoCents += i.amountCents;
    if (!cancelado && i.status === "WAITLIST") t.espera++;
    else if (!cancelado && i.status === "REGISTERED") {
      t.inscritos++;
      if (i.isGuest) t.invitados++;
      t.facturadoCents += i.amountCents;
    }
    porTorneo.set(i.tournament.id, t);
  }

  // ------------------------------------------------------------ socios

  const porEstado = new Map(sociosPorEstado.map((s) => [s.status, s._count._all]));

  return {
    dinero: {
      cobradoTotal,
      cobradoPistas,
      cobradoCuotas,
      cobradoTorneos,
      variacionCobrado: variacion(cobradoPistas + cobradoCuotas, cobradoAnterior),
      pendientePistas,
      pendienteTorneos,
      facturadoPistas,
      ivaCents: ivaPistas + ivaCuotas + ivaTorneos,
      porMetodo: [...porMetodo.entries()].sort((a, b) => b[1] - a[1]),
    },
    reservas: {
      total: activas.length,
      canceladas,
      tasaCancelacion: reservas.length ? canceladas / reservas.length : null,
      noPresentados,
      tasaNoPresentados: activas.length ? noPresentados / activas.length : null,
      horas: minutosReservados / 60,
      ocupacion: ocupacion(minutosReservadosEnActivas, minutosAbiertosTotales),
      importeMedioCents: reservasDePago.length
        ? Math.round(reservasDePago.reduce((s, r) => s + r.priceCents, 0) / reservasDePago.length)
        : null,
      variacion: variacion(activas.length, reservasAnt),
      anterior: reservasAnt,
    },
    series: { ingresos: ingresosSerie, reservas: reservasSerie },
    calor: { horas: horasCalor, filas: mapaCalor },
    pistas: filasPista,
    deportes: [...filasDeporte.values()],
    cuotas: {
      periodo: periodoCuota,
      periodos: periodosCuota.map((p) => p.period),
      total: totalCuotas,
      porTipo: [...cuotasPorTipo.entries()].map(([tipo, r]) => ({ tipo, ...r })),
      deudores: [...deudores.values()].sort((a, b) => b.importeCents - a.importeCents),
    },
    torneos: [...porTorneo.values()].sort((a, b) => a.fecha.getTime() - b.fecha.getTime()),
    socios: {
      activos: porEstado.get("ACTIVE") ?? 0,
      pendientes: porEstado.get("PENDING") ?? 0,
      suspendidos: porEstado.get("SUSPENDED") ?? 0,
      altas,
      bajas,
      porTipo: sociosActivosPorTipo
        .map((s) => ({ tipo: s.memberType, n: s._count._all }))
        .sort((a, b) => b.n - a.n),
    },
    anterior,
  };
}
