import { hash, verify } from "@node-rs/argon2";
import { z } from "zod";

/**
 * Contrasenas con Argon2id, el algoritmo recomendado hoy para almacenarlas.
 * Los parametros son los que sugiere OWASP: 19 MiB de memoria y 2 pasadas.
 * Costoso a proposito, para que probar contrasenas a lo bruto no compense.
 */
const OPCIONES = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

/**
 * Politica de contrasena.
 *
 * Se exige longitud y no se exige "una mayuscula, un número y un simbolo": las
 * reglas de composicion empujan a la gente a Club2024! y a apuntarlo en un
 * papel. Es lo que recomienda el NIST desde 2017.
 */
export const passwordSchema = z
  .string()
  .min(10, "Usa al menos 10 caracteres. Una frase corta funciona muy bien.")
  .max(128, "Demasiado larga.")
  .refine((v) => v.trim().length >= 10, "La contraseña no puede ser solo espacios");

/** Las que cualquiera probaria primero en un club de padel. */
const PROHIBIDAS = new Set([
  "contraseña", "contraseña", "password", "12345678", "1234567890", "qwertyuiop",
  "club", "club123", "miclub", "padel123", "tenis123", "clubdecampo", "administrador",
]);

export function esDemasiadoObvia(password: string, email: string): boolean {
  const normal = password.toLowerCase().replace(/[^a-z0-9ñ]/g, "");
  if (PROHIBIDAS.has(normal)) return true;
  // Reutilizar el propio correo como contrasena.
  const usuario = email.split("@")[0]?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
  return usuario.length >= 4 && normal.includes(usuario);
}

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPCIONES);
}

export async function verifyPassword(hashAlmacenado: string, password: string): Promise<boolean> {
  try {
    return await verify(hashAlmacenado, password, OPCIONES);
  } catch {
    // Hash corrupto o de otro formato: se trata como fallo, no como excepcion.
    return false;
  }
}

/**
 * Hash de descarte con el que comparar cuando la cuenta no existe o no tiene
 * contrasena. Sin esto, responder al instante delataria que ese correo no esta
 * registrado; asi el tiempo de respuesta es el mismo en todos los casos.
 */
const HASH_SENUELO =
  "$argon2id$v=19$m=19456,t=2,p=1$c2VudWVsb2Rlc2VjaG8$YvA1sQiOZ0jOTdRPMHVMKmxGSD/DfsSXVEHy1n5DXjs";

export async function quemarTiempoDeVerificacion(password: string): Promise<void> {
  await verifyPassword(HASH_SENUELO, password);
}
