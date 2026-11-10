import { describe, expect, it } from "vitest";
import { trustedClientIp } from "@/lib/auth/session";

function headers(values: Record<string, string>): { get(name: string): string | null } {
  return { get: (name) => values[name] ?? null };
}

describe("IP de cliente tras un proxy confiable", () => {
  it("en Vercel solo acepta la cabecera reservada de la plataforma", () => {
    const h = headers({
      "x-vercel-forwarded-for": "203.0.113.8",
      "x-forwarded-for": "198.51.100.99",
    });
    expect(trustedClientIp(h, { isVercel: true })).toBe("203.0.113.8");
  });

  it("fuera de Vercel no confia en cabeceras sin configuracion explicita", () => {
    const h = headers({ "x-forwarded-for": "203.0.113.8" });
    expect(trustedClientIp(h, { isVercel: false })).toBeNull();
  });

  it("acepta la cabecera declarada para un proxy propio", () => {
    const h = headers({ "x-forwarded-for": "203.0.113.8, 10.0.0.2" });
    expect(
      trustedClientIp(h, { isVercel: false, trustedProxyHeader: "x-forwarded-for" }),
    ).toBe("203.0.113.8");
  });

  it("rechaza valores que no sean direcciones IP", () => {
    const h = headers({ "x-vercel-forwarded-for": "IP-inventada" });
    expect(trustedClientIp(h, { isVercel: true })).toBeNull();
  });
});
