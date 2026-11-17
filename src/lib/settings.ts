import { prisma } from "@/lib/db";

/**
 * Parametros de explotacion del club. Viven en base de datos para que la junta
 * pueda ajustarlos sin tocar codigo ni esperar a un despliegue.
 * Ver docs/ESPECIFICACIONES.md §5.
 */
export const SETTING_DEFAULTS = {
  "booking.windowDays": 7,
  "booking.minLeadMinutes": 0,
  "booking.maxActivePerMember": 2,
  "booking.maxActivePerSportPerDay": 1,
  "booking.cancelDeadlineHours": 12,
  "club.openingMinute": 8 * 60,
  "club.closingMinute": 23 * 60,
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;

export const SETTING_LABELS: Record<SettingKey, string> = {
  "booking.windowDays": "Días de antelación con los que se abre el calendario",
  "booking.minLeadMinutes": "Antelación mínima para reservar (minutos)",
  "booking.maxActivePerMember": "Reservas futuras simultaneas por socio",
  "booking.maxActivePerSportPerDay": "Reservas por socio, deporte y día",
  "booking.cancelDeadlineHours": "Horas antes de la reserva para cancelar sin incidencia",
  "club.openingMinute": "Apertura del club (minutos desde medianoche)",
  "club.closingMinute": "Cierre del club (minutos desde medianoche)",
};

export type ClubSettings = Record<SettingKey, number>;

export async function getSettings(): Promise<ClubSettings> {
  const rows = await prisma.setting.findMany();
  const stored = new Map(rows.map((r) => [r.key, r.value]));
  const out = { ...SETTING_DEFAULTS } as ClubSettings;

  for (const key of Object.keys(SETTING_DEFAULTS) as SettingKey[]) {
    const raw = stored.get(key);
    if (raw === undefined) continue;
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) out[key] = parsed;
  }
  return out;
}

export async function setSetting(key: SettingKey, value: number): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: String(value) },
    update: { value: String(value) },
  });
}
