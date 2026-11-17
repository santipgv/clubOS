"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { recordAudit } from "@/lib/audit";
import {
  contrasteConBlanco,
  esColorValido,
  LOGO_MAX_BYTES,
  LOGO_TIPOS,
  setIdentidad,
  type IdentidadClub,
} from "@/lib/club";

export type EstadoIdentidad = { error?: string; ok?: string };

const TEXTOS: Array<[keyof IdentidadClub, string, number, boolean]> = [
  // clave, nombre para el error, longitud maxima, obligatorio
  ["club.nombre", "el nombre del club", 80, true],
  ["club.nombreCorto", "el nombre corto", 30, false],
  ["club.lema", "el lema", 120, false],
  ["club.localidad", "la localidad", 80, false],
  ["club.provincia", "la provincia", 80, false],
  ["club.emailContacto", "el correo de contacto", 120, false],
];

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function guardarIdentidad(
  _previo: EstadoIdentidad,
  formData: FormData,
): Promise<EstadoIdentidad> {
  const admin = await requireAdmin();
  const cambios: Partial<IdentidadClub> = {};

  for (const [clave, nombre, max, obligatorio] of TEXTOS) {
    const valor = String(formData.get(clave) ?? "").trim();
    if (obligatorio && !valor) return { error: `Falta ${nombre}.` };
    if (valor.length > max) return { error: `${nombre[0].toUpperCase()}${nombre.slice(1)} admite como mucho ${max} caracteres.` };
    cambios[clave] = valor;
  }
  // Igual que el nombre o vacio: se guarda vacio para que siga al nombre si cambia.
  if (cambios["club.nombreCorto"] === cambios["club.nombre"]) cambios["club.nombreCorto"] = "";
  if (cambios["club.emailContacto"] && !CORREO.test(cambios["club.emailContacto"])) {
    return { error: "El correo de contacto no parece valido." };
  }

  const marca = String(formData.get("club.colorMarca") ?? "").toLowerCase();
  const acento = String(formData.get("club.colorAcento") ?? "").toLowerCase();
  if (!esColorValido(marca) || !esColorValido(acento)) {
    return { error: "Los colores deben tener el formato #rrggbb." };
  }
  // Los botones llevan texto blanco sobre el color de marca.
  if (contrasteConBlanco(marca) < 4.5) {
    return {
      error: "El color principal es demasiado claro: el texto blanco de los botones no se leeria. Elige un tono mas oscuro.",
    };
  }
  cambios["club.colorMarca"] = marca;
  cambios["club.colorAcento"] = acento;

  if (formData.get("quitarLogo") === "on") {
    cambios["club.logo"] = "";
  } else {
    const archivo = formData.get("logo");
    if (archivo instanceof File && archivo.size > 0) {
      if (!(LOGO_TIPOS as readonly string[]).includes(archivo.type)) {
        return { error: "El logotipo debe ser PNG, JPG, WebP o SVG." };
      }
      const bytes = Buffer.from(await archivo.arrayBuffer());
      if (bytes.length > LOGO_MAX_BYTES) {
        return { error: `El logotipo ocupa demasiado: como mucho ${LOGO_MAX_BYTES / 1024} KB.` };
      }
      // Se guarda como data URL: se muestra siempre dentro de <img>, donde un
      // SVG no puede ejecutar scripts, y la CSP ya admite img-src data:.
      cambios["club.logo"] = `data:${archivo.type};base64,${bytes.toString("base64")}`;
    }
  }

  await setIdentidad(cambios);

  const { "club.logo": logo, ...resto } = cambios;
  await recordAudit({
    actorId: admin.id,
    action: "club.identity_updated",
    entityType: "Setting",
    metadata: { ...resto, logo: logo === undefined ? "sin cambios" : logo ? "nuevo" : "quitado" },
  });

  // La identidad sale en el layout raiz: afecta a todas las paginas.
  revalidatePath("/", "layout");
  return { ok: "Identidad del club guardada." };
}
