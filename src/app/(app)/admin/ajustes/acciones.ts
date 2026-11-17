"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { recordAudit } from "@/lib/audit";
import { SETTING_DEFAULTS, setSetting, type SettingKey } from "@/lib/settings";

export type EstadoAjustes = { error?: string; ok?: string };

/** Rangos admitidos. Un valor absurdo aqui rompe el calendario de todo el club. */
const LIMITES: Record<SettingKey, [number, number]> = {
  "booking.windowDays": [0, 60],
  "booking.minLeadMinutes": [0, 24 * 60],
  "booking.maxActivePerMember": [1, 20],
  "booking.maxActivePerSportPerDay": [1, 10],
  "booking.cancelDeadlineHours": [0, 168],
  "club.openingMinute": [0, 1380],
  "club.closingMinute": [60, 1440],
};

export async function guardarAjustes(_previo: EstadoAjustes, formData: FormData): Promise<EstadoAjustes> {
  const admin = await requireAdmin();
  const cambios: Partial<Record<SettingKey, number>> = {};

  for (const key of Object.keys(SETTING_DEFAULTS) as SettingKey[]) {
    const raw = formData.get(key);
    if (raw === null) continue;
    const valor = Number(raw);
    const [min, max] = LIMITES[key];
    if (!Number.isInteger(valor) || valor < min || valor > max) {
      return { error: `El valor de "${key}" debe ser un número entero entre ${min} y ${max}.` };
    }
    cambios[key] = valor;
  }

  if (cambios["club.closingMinute"]! <= cambios["club.openingMinute"]!) {
    return { error: "La hora de cierre del club debe ser posterior a la de apertura." };
  }

  for (const [key, valor] of Object.entries(cambios) as Array<[SettingKey, number]>) {
    await setSetting(key, valor);
  }

  await recordAudit({
    actorId: admin.id,
    action: "settings.updated",
    entityType: "Setting",
    metadata: cambios,
  });

  revalidatePath("/admin/ajustes");
  revalidatePath("/reservar", "layout");
  return { ok: "Ajustes guardados." };
}
