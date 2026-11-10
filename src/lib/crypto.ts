import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import { env } from "./env";

/**
 * Cifrado simetrico para los pocos datos que no pueden guardarse en claro pero
 * si necesitan recuperarse: hoy, el numero de cuenta para domiciliar la cuota.
 *
 * Una contrasena se guarda con hash porque nunca hay que recuperarla. Un IBAN
 * hay que poder leerlo para generar la remesa, asi que se cifra con AES-256-GCM,
 * que ademas autentica: si alguien manipula el valor en la base de datos, el
 * descifrado falla en lugar de devolver basura.
 */

const ALGORITMO = "aes-256-gcm";

function clave(): Buffer {
  const bruta = env.ENCRYPTION_KEY;
  // Se admite la clave en base64 (32 bytes) o cualquier texto largo, que se
  // deriva a 32 bytes. Lo primero es lo recomendado.
  const desdeBase64 = Buffer.from(bruta, "base64");
  if (desdeBase64.length === 32) return desdeBase64;
  return createHash("sha256").update(bruta).digest();
}

/** Devuelve "iv.tag.datos", todo en base64url. */
export function encrypt(textoPlano: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITMO, clave(), iv);
  const cifrado = Buffer.concat([cipher.update(textoPlano, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, cifrado].map((b) => b.toString("base64url")).join(".");
}

export function decrypt(valor: string): string | null {
  try {
    const [iv, tag, datos] = valor.split(".").map((p) => Buffer.from(p, "base64url"));
    if (!iv || !tag || !datos) return null;
    const decipher = createDecipheriv(ALGORITMO, clave(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(datos), decipher.final()]).toString("utf8");
  } catch {
    // Clave equivocada o dato manipulado.
    return null;
  }
}
