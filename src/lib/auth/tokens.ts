import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Token opaco de 32 bytes. Es lo unico que viaja; en BD solo queda su hash. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Comparacion en tiempo constante, para no filtrar informacion por latencia. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** Referencia legible de reserva: TIR-XXXXXX, sin caracteres ambiguos. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateBookingReference(): string {
  const bytes = randomBytes(6);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return `TIR-${out}`;
}
