import type { Sport } from "@/lib/types";
import { DEPORTE_A_SLUG } from "@/lib/booking/deportes";

/**
 * Constructores de URL de la aplicacion.
 *
 * Las rutas y los parametros van aqui, en un solo sitio y siempre en ASCII.
 * Escribirlos a mano en cada enlace ya costo un fallo: una correccion
 * ortografica convirtio `?dia=` en `?día=` en los enlaces mientras el servidor
 * seguia leyendo `dia`, y el calendario dejo de cambiar de dia sin dar ningun
 * error. Hay una prueba que comprueba que lo que sale de aqui no lleva tildes.
 */

export const PARAM = {
  dia: "dia",
  pista: "pista",
  inicio: "inicio",
  duracion: "duracion",
  reserva: "reserva",
  q: "q",
  filtro: "filtro",
  nueva: "nueva",
  pago: "pago",
  destino: "destino",
  error: "error",
  token: "token",
  // Panel de indicadores
  rango: "rango",
  desde: "desde",
  hasta: "hasta",
  deporte: "deporte",
  tipo: "tipo",
  agrupar: "agrupar",
  periodo: "periodo",
} as const;

/**
 * Admite tanto el valor del enum ("PADEL") como el segmento ya en minusculas
 * ("padel"): `Sport` es una union de cadenas, asi que no se pueden distinguir
 * por tipo en tiempo de ejecucion.
 */
export function rutaReservarDeporte(deporte: Sport | string, dia?: string): string {
  const slug = DEPORTE_A_SLUG[deporte as Sport] ?? deporte;
  return dia ? `/reservar/${slug}?${PARAM.dia}=${dia}` : `/reservar/${slug}`;
}

export function rutaConfirmarReserva(input: {
  deporte: string;
  pista: string;
  dia: string;
  inicio: number;
  duracion?: number;
}): string {
  const partes = [
    `${PARAM.pista}=${input.pista}`,
    `${PARAM.dia}=${input.dia}`,
    `${PARAM.inicio}=${input.inicio}`,
  ];
  if (input.duracion !== undefined) partes.push(`${PARAM.duracion}=${input.duracion}`);
  return `/reservar/${input.deporte}/confirmar?${partes.join("&")}`;
}

export function rutaAdminReservas(dia?: string): string {
  return dia ? `/admin/reservas?${PARAM.dia}=${dia}` : "/admin/reservas";
}

export function rutaFichaSocio(id: string): string {
  return `/admin/socios/${id}`;
}

/** El monedero vive dentro del perfil del socio. */
export const RUTA_MONEDERO = "/perfil#monedero";

export function rutaMisReservas(referencia?: string, pago?: "monedero" | "pendiente"): string {
  if (!referencia) return "/mis-reservas";
  const base = `/mis-reservas?${PARAM.nueva}=${referencia}`;
  return pago ? `${base}&${PARAM.pago}=${pago}` : base;
}

export const RUTA_PANEL = "/admin/panel";

/** Panel de indicadores con los filtros dados; los vacios no se escriben. */
export function rutaPanel(filtros: Partial<Record<
  "rango" | "desde" | "hasta" | "deporte" | "pista" | "tipo" | "agrupar" | "periodo",
  string | null | undefined
>>): string {
  const partes = Object.entries(filtros)
    .filter(([, v]) => v)
    .map(([k, v]) => `${PARAM[k as keyof typeof PARAM]}=${encodeURIComponent(v as string)}`);
  return partes.length ? `${RUTA_PANEL}?${partes.join("&")}` : RUTA_PANEL;
}
