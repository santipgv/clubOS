/**
 * Validacion de IBAN por el algoritmo del ISO 13616: se mueven los cuatro
 * primeros caracteres al final, se sustituyen las letras por numeros y el
 * resultado debe dar 1 al dividirlo entre 97.
 *
 * Comprobarlo aqui evita que una remesa entera se devuelva por un digito mal
 * tecleado en el formulario de alta.
 */

/** Longitud del IBAN por pais. Solo los que puede usar un socio del club. */
const LONGITUDES: Record<string, number> = {
  ES: 24, PT: 25, FR: 27, DE: 22, IT: 27, GB: 22, NL: 18, BE: 16,
  AD: 24, CH: 21, IE: 22, LU: 20, AT: 20, DK: 18, FI: 18, NO: 15,
  PL: 28, SE: 24, MC: 27, SM: 27,
};

export function normalizeIban(entrada: string): string {
  return entrada.replace(/[\s-]/g, "").toUpperCase();
}

export function isValidIban(entrada: string): boolean {
  const iban = normalizeIban(entrada);

  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(iban)) return false;

  const pais = iban.slice(0, 2);
  const esperada = LONGITUDES[pais];
  if (!esperada || iban.length !== esperada) return false;

  const reordenado = iban.slice(4) + iban.slice(0, 4);
  const numerico = reordenado.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));

  // El numero excede lo que aguanta un entero de JavaScript, asi que el modulo
  // se calcula por tramos.
  let resto = 0;
  for (const digito of numerico) {
    resto = (resto * 10 + Number(digito)) % 97;
  }
  return resto === 1;
}

/** "ES91 2100 0418 4502 0005 1332" — con espacios cada cuatro caracteres. */
export function formatIban(entrada: string): string {
  return normalizeIban(entrada).replace(/(.{4})/g, "$1 ").trim();
}

/** "ES91 **** **** **** **** 1332" — lo que se muestra en pantalla. */
export function maskIban(entrada: string): string {
  const iban = normalizeIban(entrada);
  if (iban.length < 8) return "····";
  const grupos = formatIban(iban).split(" ");
  return [grupos[0], ...grupos.slice(1, -1).map(() => "····"), grupos[grupos.length - 1]].join(" ");
}

export function ibanLast4(entrada: string): string {
  return normalizeIban(entrada).slice(-4);
}

/**
 * Enmascarado a partir solo de los cuatro ultimos dígitos guardados en claro.
 * Se usa para pintar la cuenta sin tener que descifrar el IBAN completo, que
 * es lo que hace falta en casi todas las pantallas.
 */
export function maskFromLast4(last4: string | null): string | null {
  if (!last4) return null;
  return `···· ···· ···· ···· ${last4}`;
}
