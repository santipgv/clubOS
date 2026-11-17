import { describe, expect, it } from "vitest";
import {
  esDemasiadoObvia,
  hashPassword,
  passwordSchema,
  verifyPassword,
  quemarTiempoDeVerificacion,
} from "@/lib/auth/password";

describe("politica de contrasena", () => {
  it("exige longitud suficiente", () => {
    expect(passwordSchema.safeParse("corta1").success).toBe(false);
    expect(passwordSchema.safeParse("nueve1234").success).toBe(false);
    expect(passwordSchema.safeParse("diez123456").success).toBe(true);
  });

  it("acepta frases sin exigir simbolos ni mayusculas", () => {
    expect(passwordSchema.safeParse("la pista tres al atardecer").success).toBe(true);
  });

  it("no acepta una contrasena de solo espacios", () => {
    expect(passwordSchema.safeParse("              ").success).toBe(false);
  });

  it("rechaza las contrasenas evidentes de este club", () => {
    expect(esDemasiadoObvia("club123", "ana@ejemplo.com")).toBe(true);
    expect(esDemasiadoObvia("Padel-123", "ana@ejemplo.com")).toBe(true);
    expect(esDemasiadoObvia("12345678", "ana@ejemplo.com")).toBe(true);
  });

  it("rechaza usar el propio correo como contrasena", () => {
    expect(esDemasiadoObvia("ana.garcia", "ana.garcia@ejemplo.com")).toBe(true);
    expect(esDemasiadoObvia("mi-anagarcia-clave", "ana.garcia@ejemplo.com")).toBe(true);
  });

  it("no confunde una contrasena legitima con una obvia", () => {
    expect(esDemasiadoObvia("la pista tres al atardecer", "ana@ejemplo.com")).toBe(false);
  });
});

describe("almacenamiento de contrasenas", () => {
  it("guarda un hash argon2id, nunca la contrasena", async () => {
    const h = await hashPassword("la pista tres al atardecer");
    expect(h.startsWith("$argon2id$")).toBe(true);
    expect(h).not.toContain("pista");
  });

  it("dos cuentas con la misma contrasena no comparten hash", async () => {
    const [a, b] = await Promise.all([hashPassword("misma clave larga"), hashPassword("misma clave larga")]);
    expect(a).not.toBe(b); // sal distinta en cada una
  });

  it("verifica la correcta y rechaza la equivocada", async () => {
    const h = await hashPassword("la pista tres al atardecer");
    expect(await verifyPassword(h, "la pista tres al atardecer")).toBe(true);
    expect(await verifyPassword(h, "la pista tres al amanecer")).toBe(false);
  });

  it("un hash corrupto se rechaza sin lanzar excepcion", async () => {
    expect(await verifyPassword("esto-no-es-un-hash", "cualquiera")).toBe(false);
  });

  it("el senuelo de tiempo constante no revienta", async () => {
    await expect(quemarTiempoDeVerificacion("cualquiera")).resolves.toBeUndefined();
  });
});
