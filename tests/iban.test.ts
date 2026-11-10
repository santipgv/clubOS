import { describe, expect, it } from "vitest";
import { isValidIban, normalizeIban, formatIban, maskIban, maskFromLast4, ibanLast4 } from "@/lib/iban";
import { encrypt, decrypt } from "@/lib/crypto";

describe("validacion de IBAN", () => {
  it("acepta cuentas espanolas correctas", () => {
    expect(isValidIban("ES9121000418450200051332")).toBe(true);
    expect(isValidIban("ES91 2100 0418 4502 0005 1332")).toBe(true);
    expect(isValidIban("es91-2100-0418-4502-0005-1332")).toBe(true);
  });

  it("detecta un digito mal tecleado", () => {
    // Un solo caracter cambiado respecto al anterior.
    expect(isValidIban("ES9121000418450200051333")).toBe(false);
  });

  it("detecta dos cifras transpuestas", () => {
    expect(isValidIban("ES9121000418450200051323")).toBe(false);
  });

  it("rechaza longitudes que no son las del pais", () => {
    expect(isValidIban("ES912100041845020005133")).toBe(false);
    expect(isValidIban("ES91210004184502000513322")).toBe(false);
  });

  it("rechaza paises desconocidos y basura", () => {
    expect(isValidIban("XX9121000418450200051332")).toBe(false);
    expect(isValidIban("")).toBe(false);
    expect(isValidIban("no es una cuenta")).toBe(false);
  });

  it("acepta otros paises de la zona SEPA", () => {
    expect(isValidIban("DE89370400440532013000")).toBe(true);
    expect(isValidIban("PT50000201231234567890154")).toBe(true);
  });
});

describe("presentacion del IBAN", () => {
  const iban = "ES9121000418450200051332";

  it("normaliza espacios y minusculas", () => {
    expect(normalizeIban(" es91 2100 0418 4502 0005 1332 ")).toBe(iban);
  });

  it("agrupa de cuatro en cuatro", () => {
    expect(formatIban(iban)).toBe("ES91 2100 0418 4502 0005 1332");
  });

  it("enmascara todo menos el principio y el final", () => {
    const enmascarado = maskIban(iban);
    expect(enmascarado).toBe("ES91 ···· ···· ···· ···· 1332");
    expect(enmascarado).not.toContain("2100");
    expect(enmascarado).not.toContain("0418");
  });

  it("extrae los ultimos cuatro digitos", () => {
    expect(ibanLast4(iban)).toBe("1332");
  });

  it("puede enmascarar solo con los cuatro ultimos, sin descifrar nada", () => {
    expect(maskFromLast4("1332")).toBe("···· ···· ···· ···· 1332");
    expect(maskFromLast4(null)).toBeNull();
  });
});

describe("cifrado de datos bancarios", () => {
  const iban = "ES9121000418450200051332";

  it("el valor cifrado no contiene el original", () => {
    const cifrado = encrypt(iban);
    expect(cifrado).not.toContain(iban);
    expect(cifrado).not.toContain("2100");
  });

  it("descifra a lo mismo que se cifro", () => {
    expect(decrypt(encrypt(iban))).toBe(iban);
  });

  it("cifrar dos veces el mismo dato da resultados distintos", () => {
    expect(encrypt(iban)).not.toBe(encrypt(iban)); // vector de inicializacion distinto
  });

  it("un valor manipulado no se descifra, devuelve null", () => {
    const cifrado = encrypt(iban);
    const [iv, tag, datos] = cifrado.split(".");
    const manipulado = [iv, tag, datos.slice(0, -2) + "AA"].join(".");
    expect(decrypt(manipulado)).toBeNull();
  });

  it("basura no revienta, devuelve null", () => {
    expect(decrypt("esto-no-va-a-descifrar")).toBeNull();
  });
});
