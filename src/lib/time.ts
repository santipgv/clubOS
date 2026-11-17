import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

/**
 * Todo instante se guarda en UTC. La rejilla de reservas, en cambio, se razona
 * en hora local del club: "el sábado a las 10:00" debe seguir siendo las 10:00
 * despues del cambio de hora. Estas funciones son el unico puente entre ambos.
 */
export const CLUB_TZ = zonaHoraria(process.env.NEXT_PUBLIC_CLUB_TIMEZONE);

/**
 * Zona horaria del club, por variable de entorno y no en Ajustes: cambiarla
 * con reservas ya hechas moveria la hora de pared de todas ellas. Lleva el
 * prefijo NEXT_PUBLIC_ porque la rejilla tambien la usa en el navegador.
 */
export function zonaHoraria(valor: string | undefined): string {
  const tz = valor?.trim() || "Europe/Madrid";
  try {
    new Intl.DateTimeFormat("es-ES", { timeZone: tz });
  } catch {
    throw new Error(`NEXT_PUBLIC_CLUB_TIMEZONE no es una zona horaria valida: "${tz}"`);
  }
  return tz;
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** Fecha local del club en formato YYYY-MM-DD. */
export function clubToday(now: Date = new Date()): string {
  return formatInTimeZone(now, CLUB_TZ, "yyyy-MM-dd");
}

/**
 * Convierte un dia local (YYYY-MM-DD) + minutos desde medianoche a un instante UTC.
 *
 * Los minutos se aplican sobre la hora de pared, no sumando milisegundos a la
 * medianoche: el dia en que entra el horario de verano dura 23 horas, y sumar
 * 600 minutos a las 00:00 daria las 11:00 en lugar de las 10:00.
 *
 * Se admiten minutos >= 1440 (util para marcar el final del dia) y se
 * trasladan al dia siguiente.
 */
export function clubDayMinutesToUtc(day: string, minutes: number): Date {
  const diasExtra = Math.floor(minutes / (24 * 60));
  const restante = minutes - diasExtra * 24 * 60;
  const diaReal = diasExtra === 0 ? day : addDaysToDay(day, diasExtra);
  const hh = String(Math.floor(restante / 60)).padStart(2, "0");
  const mm = String(restante % 60).padStart(2, "0");
  // En la hora ambigua de octubre (02:00-03:00 ocurre dos veces) se toma la
  // primera. El club esta cerrado a esa hora, asi que no afecta a reservas.
  return fromZonedTime(`${diaReal}T${hh}:${mm}:00`, CLUB_TZ);
}

/** Dia de la semana local del club: 0 = domingo … 6 = sabado. */
export function clubWeekday(day: string): number {
  return toZonedTime(fromZonedTime(`${day}T12:00:00`, CLUB_TZ), CLUB_TZ).getDay();
}

export function formatClubTime(date: Date): string {
  return formatInTimeZone(date, CLUB_TZ, "HH:mm");
}

export function formatClubDate(date: Date): string {
  return formatInTimeZone(date, CLUB_TZ, "dd/MM/yyyy");
}

export function formatClubDateTime(date: Date): string {
  return formatInTimeZone(date, CLUB_TZ, "dd/MM/yyyy HH:mm");
}

/** "sábado 23 de agosto" — para cabeceras de la rejilla. */
export function formatClubDayLong(day: string): string {
  const d = fromZonedTime(`${day}T12:00:00`, CLUB_TZ);
  const nombreDia = DIAS[clubWeekday(day)];
  return `${nombreDia} ${formatInTimeZone(d, CLUB_TZ, "d")} de ${MESES[Number(formatInTimeZone(d, CLUB_TZ, "M")) - 1]}`;
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Suma dias a una fecha local YYYY-MM-DD sin salir del calendario local. */
export function addDaysToDay(day: string, days: number): string {
  const d = fromZonedTime(`${day}T12:00:00`, CLUB_TZ);
  return formatInTimeZone(new Date(d.getTime() + days * 86_400_000), CLUB_TZ, "yyyy-MM-dd");
}

/** Numero de dias entre dos fechas locales (b - a). */
export function daysBetween(a: string, b: string): number {
  const da = fromZonedTime(`${a}T12:00:00`, CLUB_TZ).getTime();
  const db = fromZonedTime(`${b}T12:00:00`, CLUB_TZ).getTime();
  return Math.round((db - da) / 86_400_000);
}

/**
 * "20 de agosto de 2026". date-fns formatea los meses en ingles salvo que se
 * le pase un locale; para tres formatos sale mas barato tener aqui los nombres.
 */
export function formatClubDateLong(date: Date, conAno = false): string {
  const dia = formatInTimeZone(date, CLUB_TZ, "d");
  const mes = MESES[Number(formatInTimeZone(date, CLUB_TZ, "M")) - 1];
  const ano = formatInTimeZone(date, CLUB_TZ, "yyyy");
  return conAno ? `${dia} de ${mes} de ${ano}` : `${dia} de ${mes}`;
}

export const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDay(day: string): boolean {
  if (!DAY_PATTERN.test(day)) return false;
  const d = new Date(`${day}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && formatInTimeZone(d, "UTC", "yyyy-MM-dd") === day;
}
