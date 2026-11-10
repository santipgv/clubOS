import { formatInTimeZone } from "date-fns-tz";
import { CLUB_TZ, addDaysToDay, clubWeekday, daysBetween, isValidDay } from "@/lib/time";
import type { MemberType, Sport } from "@/lib/types";

/**
 * Panel de indicadores: la parte que no toca la base de datos.
 *
 * Aqui se interpretan los filtros de la URL, se decide como agrupar las fechas
 * y se calcula la ocupacion. Todo son funciones puras para poder probarlas sin
 * Postgres. Las fechas son siempre dias locales del club (YYYY-MM-DD) y los
 * rangos incluyen el primer y el ultimo dia.
 */

// ---------------------------------------------------------------- rango

export const PRESETS = {
  hoy: "Hoy",
  "7d": "Últimos 7 días",
  "30d": "Últimos 30 días",
  mes: "Este mes",
  "mes-anterior": "Mes anterior",
  trimestre: "Últimos 3 meses",
  ano: "Este año",
  "ano-anterior": "Año anterior",
  personalizado: "Personalizado",
} as const;

export type Preset = keyof typeof PRESETS;

export const PRESET_POR_DEFECTO = "mes" satisfies Preset;

/** Un rango mas largo no aporta nada al panel y dispara el coste de las consultas. */
export const MAX_DIAS_RANGO = 3 * 366;

export type Rango = { desde: string; hasta: string; preset: Preset; dias: number };

function inicioDeMes(dia: string): string {
  return `${dia.slice(0, 7)}-01`;
}

function finDeMes(dia: string): string {
  const [ano, mes] = dia.split("-").map(Number);
  const siguiente = mes === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 1).padStart(2, "0")}-01`;
  return addDaysToDay(siguiente, -1);
}

function rangoDePreset(preset: Exclude<Preset, "personalizado">, hoy: string): [string, string] {
  switch (preset) {
    case "hoy":
      return [hoy, hoy];
    case "7d":
      return [addDaysToDay(hoy, -6), hoy];
    case "30d":
      return [addDaysToDay(hoy, -29), hoy];
    case "mes":
      return [inicioDeMes(hoy), finDeMes(hoy)];
    case "mes-anterior": {
      const ultimoDelAnterior = addDaysToDay(inicioDeMes(hoy), -1);
      return [inicioDeMes(ultimoDelAnterior), ultimoDelAnterior];
    }
    case "trimestre":
      return [addDaysToDay(hoy, -89), hoy];
    case "ano":
      return [`${hoy.slice(0, 4)}-01-01`, `${hoy.slice(0, 4)}-12-31`];
    case "ano-anterior": {
      const ano = Number(hoy.slice(0, 4)) - 1;
      return [`${ano}-01-01`, `${ano}-12-31`];
    }
  }
}

/**
 * Interpreta el rango de la URL. Un preset manda sobre las fechas sueltas;
 * las fechas solo se leen con "personalizado". Cualquier valor que no cuadre
 * cae en el preset por defecto en lugar de dar error: es una pantalla de
 * consulta y lo razonable es ensenar algo.
 */
export function resolverRango(
  params: { rango?: string; desde?: string; hasta?: string },
  hoy: string,
): Rango {
  const preset = (params.rango && params.rango in PRESETS ? params.rango : null) as Preset | null;

  if (preset === "personalizado" || (!preset && params.desde && params.hasta)) {
    const { desde, hasta } = params;
    if (desde && hasta && isValidDay(desde) && isValidDay(hasta)) {
      const [a, b] = desde <= hasta ? [desde, hasta] : [hasta, desde];
      const limitado = daysBetween(a, b) + 1 > MAX_DIAS_RANGO ? addDaysToDay(b, -(MAX_DIAS_RANGO - 1)) : a;
      return { desde: limitado, hasta: b, preset: "personalizado", dias: daysBetween(limitado, b) + 1 };
    }
  }

  const elegido: Exclude<Preset, "personalizado"> =
    preset && preset !== "personalizado" ? preset : PRESET_POR_DEFECTO;
  const [desde, hasta] = rangoDePreset(elegido, hoy);
  return { desde, hasta, preset: elegido, dias: daysBetween(desde, hasta) + 1 };
}

/** El periodo de la misma duracion inmediatamente anterior, para comparar. */
export function rangoAnterior(rango: Rango): { desde: string; hasta: string } {
  const hasta = addDaysToDay(rango.desde, -1);
  return { desde: addDaysToDay(hasta, -(rango.dias - 1)), hasta };
}

/** Todos los dias del rango, en orden. */
export function diasDelRango(desde: string, hasta: string): string[] {
  const n = daysBetween(desde, hasta) + 1;
  return Array.from({ length: Math.max(0, n) }, (_, i) => addDaysToDay(desde, i));
}

// ---------------------------------------------------------------- agrupacion

export const AGRUPACIONES = { dia: "Por día", semana: "Por semana", mes: "Por mes" } as const;
export type Agrupacion = keyof typeof AGRUPACIONES;

/** Lo legible por defecto: unas decenas de columnas como mucho. */
export function agrupacionPorDefecto(dias: number): Agrupacion {
  if (dias <= 45) return "dia";
  if (dias <= 190) return "semana";
  return "mes";
}

export function resolverAgrupacion(valor: string | undefined, dias: number): Agrupacion {
  return valor && valor in AGRUPACIONES ? (valor as Agrupacion) : agrupacionPorDefecto(dias);
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Las semanas empiezan en lunes, como en el calendario del club. */
export function lunesDe(dia: string): string {
  return addDaysToDay(dia, -((clubWeekday(dia) + 6) % 7));
}

export function claveDeGrupo(dia: string, agrupacion: Agrupacion): string {
  if (agrupacion === "dia") return dia;
  if (agrupacion === "semana") return lunesDe(dia);
  return dia.slice(0, 7);
}

export function etiquetaDeGrupo(clave: string, agrupacion: Agrupacion): string {
  if (agrupacion === "mes") {
    const [ano, mes] = clave.split("-");
    return `${MESES_CORTOS[Number(mes) - 1]} ${ano.slice(2)}`;
  }
  // En semanas, la clave es el lunes que la abre.
  const [, mes, dia] = clave.split("-");
  return `${dia}/${mes}`;
}

/** Grupos que cubren el rango, aunque esten vacios: un hueco en la serie es informacion. */
export function gruposDelRango(
  desde: string,
  hasta: string,
  agrupacion: Agrupacion,
): { clave: string; etiqueta: string }[] {
  const vistas = new Set<string>();
  const grupos: { clave: string; etiqueta: string }[] = [];
  for (const dia of diasDelRango(desde, hasta)) {
    const clave = claveDeGrupo(dia, agrupacion);
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    grupos.push({ clave, etiqueta: etiquetaDeGrupo(clave, agrupacion) });
  }
  return grupos;
}

/** Dia local del club en que cae un instante. */
export function diaDelClub(fecha: Date): string {
  return formatInTimeZone(fecha, CLUB_TZ, "yyyy-MM-dd");
}

/** Minuto local del club (0-1439) en que cae un instante. */
export function minutoDelClub(fecha: Date): number {
  const [h, m] = formatInTimeZone(fecha, CLUB_TZ, "HH:mm").split(":").map(Number);
  return h * 60 + m;
}

// ---------------------------------------------------------------- ocupacion

export type Franja = { opensAt: number; closesAt: number };

/**
 * Minutos que una pista esta abierta en un dia de la semana, ya recortados al
 * horario general del club. Es la misma regla que usa el motor de reservas.
 */
export function franjasEfectivas(
  franjas: Franja[],
  aperturaClub: number,
  cierreClub: number,
): Franja[] {
  return franjas
    .map((f) => ({ opensAt: Math.max(f.opensAt, aperturaClub), closesAt: Math.min(f.closesAt, cierreClub) }))
    .filter((f) => f.closesAt > f.opensAt);
}

/** Reparte un intervalo [inicio, fin) de minutos entre las horas que toca. */
export function minutosPorHora(inicio: number, fin: number): Map<number, number> {
  const out = new Map<number, number>();
  for (let h = Math.floor(inicio / 60); h * 60 < fin; h++) {
    const desde = Math.max(inicio, h * 60);
    const hasta = Math.min(fin, (h + 1) * 60);
    if (hasta > desde) out.set(h, (out.get(h) ?? 0) + (hasta - desde));
  }
  return out;
}

/** Ocupacion en tanto por uno, acotada a [0, 1]. Sin horas abiertas no hay ocupacion. */
export function ocupacion(minutosReservados: number, minutosAbiertos: number): number | null {
  if (minutosAbiertos <= 0) return null;
  return Math.min(1, Math.max(0, minutosReservados / minutosAbiertos));
}

/** Variacion relativa entre dos periodos. null si no hay base con que comparar. */
export function variacion(actual: number, anterior: number): number | null {
  if (anterior === 0) return actual === 0 ? 0 : null;
  return (actual - anterior) / anterior;
}

// ---------------------------------------------------------------- ejes

/** Marcas redondas para un eje que empieza en cero. */
export function marcasDeEje(maximo: number, cuantas = 4): number[] {
  if (maximo <= 0) return [0];
  const bruto = maximo / cuantas;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const paso = [1, 2, 2.5, 5, 10].map((f) => f * potencia).find((p) => p >= bruto) ?? bruto;
  const marcas: number[] = [];
  for (let v = 0; v < maximo + paso; v += paso) {
    marcas.push(Math.round(v * 100) / 100);
    if (v >= maximo) break;
  }
  return marcas;
}

// ---------------------------------------------------------------- filtros

export const DIAS_SEMANA_LUNES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/** Indice 0 = lunes a partir del 0 = domingo de Date#getDay. */
export function indiceLunes(weekday: number): number {
  return (weekday + 6) % 7;
}

export type FiltrosPanel = {
  rango: Rango;
  agrupacion: Agrupacion;
  deporte: Sport | null;
  pistaId: string | null;
  tipoSocio: MemberType | null;
  /** Periodo de cuotas concreto, "todos", o null para el mas reciente ya vencido. */
  periodoCuota: string | null;
};

export const TODOS_LOS_PERIODOS = "todos";

const DEPORTES: Sport[] = ["PADEL", "TENIS", "CROQUET"];
const TIPOS: MemberType[] = ["NUMERARIO", "FAMILIAR", "JUVENIL", "INFANTIL", "ABONADO", "HONORARIO", "INVITADO"];

export function resolverFiltros(
  params: Record<string, string | string[] | undefined>,
  hoy: string,
): FiltrosPanel {
  const uno = (k: string) => {
    const v = params[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const rango = resolverRango({ rango: uno("rango"), desde: uno("desde"), hasta: uno("hasta") }, hoy);
  const deporte = uno("deporte");
  const tipo = uno("tipo");
  const periodo = uno("periodo");
  const pista = uno("pista");
  return {
    rango,
    agrupacion: resolverAgrupacion(uno("agrupar"), rango.dias),
    deporte: deporte && (DEPORTES as string[]).includes(deporte) ? (deporte as Sport) : null,
    pistaId: pista && /^[0-9a-f-]{36}$/i.test(pista) ? pista : null,
    tipoSocio: tipo && (TIPOS as string[]).includes(tipo) ? (tipo as MemberType) : null,
    periodoCuota:
      periodo === TODOS_LOS_PERIODOS || (periodo && /^\d{4}(-[A-Z0-9]{1,3})?$/.test(periodo)) ? periodo : null,
  };
}
