import { cache, type CSSProperties } from "react";
import { prisma } from "@/lib/db";

/**
 * Identidad del club: lo que cambia de una instalacion a otra sin tocar codigo.
 *
 * Cada club tiene su propio despliegue y su propia base de datos, asi que la
 * identidad vive en la tabla `Setting`, igual que las reglas de reserva, y la
 * edita el administrador en Ajustes. Lo que no puede cambiar en caliente sin
 * romper datos (la zona horaria) va por variable de entorno: ver lib/time.ts.
 */
export const IDENTIDAD_DEFAULTS = {
  "club.nombre": "Club Deportivo",
  "club.nombreCorto": "Club Deportivo",
  "club.lema": "Socios y reservas de pistas",
  "club.localidad": "",
  "club.provincia": "",
  "club.emailContacto": "",
  /** Imagen en data URL (PNG, JPG, WebP o SVG). Vacio: se muestra el nombre. */
  "club.logo": "",
  /** Color de botones, cabeceras y enlaces. Debe admitir texto blanco encima. */
  "club.colorMarca": "#1f4e5f",
  /** Color de realce: insignias, eventos. Nunca texto sobre blanco. */
  "club.colorAcento": "#f2c230",
} as const;

export type ClaveIdentidad = keyof typeof IDENTIDAD_DEFAULTS;
export type IdentidadClub = Record<ClaveIdentidad, string>;

export const CLAVES_IDENTIDAD = Object.keys(IDENTIDAD_DEFAULTS) as ClaveIdentidad[];

/** Tamano maximo del logotipo una vez codificado. Se sirve en cada pagina. */
export const LOGO_MAX_BYTES = 150 * 1024;
export const LOGO_TIPOS = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"] as const;

const HEX = /^#[0-9a-f]{6}$/i;

export function esColorValido(valor: string): boolean {
  return HEX.test(valor);
}

/**
 * Contraste WCAG entre un color y el blanco. El color de marca se usa de fondo
 * de los botones con texto blanco, y por debajo de 4,5 deja de leerse.
 */
export function contrasteConBlanco(hex: string): number {
  const canal = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminancia = 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5);
  return 1.05 / (luminancia + 0.05);
}

/** Aplica los valores guardados sobre los de fabrica, descartando los invalidos. */
export function resolverIdentidad(guardados: Map<string, string>): IdentidadClub {
  const out = { ...IDENTIDAD_DEFAULTS } as IdentidadClub;
  for (const clave of CLAVES_IDENTIDAD) {
    const valor = guardados.get(clave)?.trim();
    if (!valor) continue;
    if ((clave === "club.colorMarca" || clave === "club.colorAcento") && !esColorValido(valor)) continue;
    out[clave] = valor;
  }
  // Sin nombre corto propio, el corto es el nombre completo.
  if (!guardados.get("club.nombreCorto")?.trim()) out["club.nombreCorto"] = out["club.nombre"];
  return out;
}

/**
 * Una sola consulta por peticion aunque la pidan el layout, la cabecera y el
 * pie. Si la base de datos no responde (por ejemplo al generar paginas en el
 * build) se usa la identidad de fabrica: la marca no debe tirar la aplicacion.
 */
export const getIdentidad = cache(async (): Promise<IdentidadClub> => {
  try {
    const filas = await prisma.setting.findMany({ where: { key: { in: CLAVES_IDENTIDAD } } });
    return resolverIdentidad(new Map(filas.map((f) => [f.key, f.value])));
  } catch (error) {
    console.error("No se pudo leer la identidad del club; se usa la de fabrica.", error);
    return { ...IDENTIDAD_DEFAULTS };
  }
});

export async function setIdentidad(cambios: Partial<IdentidadClub>): Promise<void> {
  await prisma.$transaction(
    Object.entries(cambios).map(([key, value]) =>
      prisma.setting.upsert({ where: { key }, create: { key, value: value ?? "" }, update: { value: value ?? "" } }),
    ),
  );
}

/** Variables CSS que alimentan la paleta de globals.css. */
export function estiloMarca(identidad: IdentidadClub): CSSProperties {
  return {
    "--club-marca": identidad["club.colorMarca"],
    "--club-acento": identidad["club.colorAcento"],
  } as CSSProperties;
}

/** "Valdemoro, Madrid", "Valdemoro" o "". */
export function ubicacion(identidad: IdentidadClub): string {
  return [identidad["club.localidad"], identidad["club.provincia"]].filter(Boolean).join(", ");
}
