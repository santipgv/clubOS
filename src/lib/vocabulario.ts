import type {
  FeeStatus,
  GolfCourseKind,
  MemberType,
  PostCategory,
  Relationship,
  Role,
  Sport,
  TournamentSport,
  UserStatus,
} from "@/lib/types";

/**
 * Como se dicen en castellano las cosas que el modelo guarda en mayusculas.
 *
 * Vive en un solo sitio porque "NUMERARIO" no significa nada para un socio, y
 * la explicacion tiene que ser la misma en su perfil y en la ficha que ve la
 * junta.
 */

export const RELACION: Record<Relationship, { label: string; descripcion: string }> = {
  SOCIO: { label: "Socio", descripcion: "Pertenece al club y paga cuota." },
  EMPLEADO: { label: "Empleado", descripcion: "Trabaja en el club. No paga cuota." },
  COLABORADOR: { label: "Colaborador", descripcion: "Colabora con el club sin ser socio de pleno derecho." },
  INVITADO: { label: "Invitado", descripcion: "Acceso puntual, normalmente acompañando a un socio." },
};

export const TIPO_SOCIO: Record<MemberType, { label: string; descripcion: string }> = {
  NUMERARIO: {
    label: "Numerario",
    descripcion: "Socio de pleno derecho, con voz y voto en la asamblea.",
  },
  FAMILIAR: {
    label: "Familiar",
    descripcion: "Cónyuge o hijo de un socio numerario, incluido en su cuota.",
  },
  JUVENIL: {
    label: "Juvenil",
    descripcion: "Entre 18 y 25 años, con cuota reducida.",
  },
  INFANTIL: {
    label: "Infantil",
    descripcion: "Menor de 18 años, a cargo de un socio.",
  },
  ABONADO: {
    label: "Abonado",
    descripcion: "Acceso de temporada sin condición de socio ni derecho de voto.",
  },
  HONORARIO: {
    label: "Honorario",
    descripcion: "Distinción del club. Exento de cuota.",
  },
  INVITADO: {
    label: "Invitado",
    descripcion: "Acompañante de un socio. Paga tarifa de invitado, con IVA.",
  },
};

export const ESTADO_SOCIO: Record<UserStatus, { label: string; descripcion: string; tono: "verde" | "ambar" | "tierra" | "gris" }> = {
  PENDING: { label: "Pendiente", descripcion: "Alta solicitada, a la espera de que la apruebe la junta.", tono: "ambar" },
  ACTIVE: { label: "Activo", descripcion: "Puede reservar con normalidad.", tono: "verde" },
  SUSPENDED: { label: "Suspendido", descripcion: "No puede reservar. Reversible.", tono: "tierra" },
  BAJA: { label: "De baja", descripcion: "Ya no pertenece al club. Se conserva su histórico.", tono: "gris" },
  REJECTED: { label: "Rechazado", descripcion: "Solicitud denegada. Sin acceso.", tono: "gris" },
};

export const ROL: Record<Role, { label: string; descripcion: string }> = {
  MEMBER: { label: "Socio", descripcion: "Reserva y gestiona lo suyo." },
  COLLABORATOR: {
    label: "Colaborador de deporte",
    descripcion: "Ademas, gestiona las pistas, reservas, bloqueos y torneos de los deportes que tenga asignados.",
  },
  STAFF: { label: "Personal del club", descripcion: "Recepción: cobros, reservas de cualquier socio y bloqueos." },
  ADMIN: { label: "Administrador", descripcion: "Todo lo anterior, más socios, cuotas, tarifas y ajustes." },
};

export const DEPORTE: Record<Sport, string> = {
  PADEL: "Pádel",
  TENIS: "Tenis",
  CROQUET: "Croquet",
};

export const DEPORTE_TORNEO: Record<TournamentSport, string> = {
  ...DEPORTE,
  GOLF: "Golf",
};

export const ESTADO_CUOTA: Record<FeeStatus, { label: string; tono: "verde" | "ambar" | "tierra" | "gris" }> = {
  PENDING: { label: "Pendiente", tono: "ambar" },
  PAID: { label: "Pagada", tono: "verde" },
  OVERDUE: { label: "Vencida", tono: "tierra" },
  WAIVED: { label: "Exenta", tono: "gris" },
  REFUNDED: { label: "Devuelta", tono: "gris" },
};

export const CATEGORIA_POST: Record<PostCategory, { label: string; tono: "verde" | "ambar" | "tierra" | "gris" | "oro" }> = {
  NOTICIA: { label: "Noticia", tono: "gris" },
  EVENTO: { label: "Evento", tono: "oro" },
  AVISO: { label: "Aviso", tono: "tierra" },
};

/** Antiguedad en el club, en anos completos. */
export function anosEnElClub(desde: Date | null, ahora: Date = new Date()): number | null {
  if (!desde) return null;
  let anos = ahora.getFullYear() - desde.getFullYear();
  const mes = ahora.getMonth() - desde.getMonth();
  if (mes < 0 || (mes === 0 && ahora.getDate() < desde.getDate())) anos--;
  return Math.max(0, anos);
}

export function textoAntiguedad(desde: Date | null): string {
  const anos = anosEnElClub(desde);
  if (anos === null) return "Sin fecha de alta";
  if (anos === 0) return "Primer año en el club";
  if (anos === 1) return "1 año en el club";
  return `${anos} años en el club`;
}


/**
 * Golf no es un `Sport` mas: tiene modelo propio porque se reservan salidas y
 * no instalaciones. Por eso su vocabulario vive aparte.
 */
export const RECORRIDO_GOLF: Record<GolfCourseKind, { label: string; descripcion: string }> = {
  RECORRIDO: {
    label: "Recorrido",
    descripcion: "Campo grande. Se reserva una salida para un grupo de hasta cuatro jugadores.",
  },
  PRACTICAS: {
    label: "Campo de prácticas",
    descripcion: "Zona de tiro. Se reserva por turnos, sin recorrido.",
  },
  PITCH_AND_PUTT: {
    label: "Pitch & putt",
    descripcion: "Recorrido corto, de aproximación y putt.",
  },
  PUTTING_GREEN: {
    label: "Putting green",
    descripcion: "Green de prácticas de putt.",
  },
};

export const ESTADO_SALIDA: Record<
  "LIBRE" | "PARCIAL" | "COMPLETA" | "PASADA" | "BLOQUEADA",
  { label: string; tono: "verde" | "ambar" | "granate" | "gris" | "neutro" }
> = {
  LIBRE: { label: "Libre", tono: "verde" },
  PARCIAL: { label: "Quedan plazas", tono: "ambar" },
  COMPLETA: { label: "Completa", tono: "gris" },
  PASADA: { label: "Pasada", tono: "gris" },
  BLOQUEADA: { label: "Reservada por el club", tono: "granate" },
};
