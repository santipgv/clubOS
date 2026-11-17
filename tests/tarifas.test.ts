import { describe, expect, it } from "vitest";
import { quote, taxIncludedIn } from "@/lib/booking/pricing";
import type { PriceRule } from "@/lib/types";

function regla(over: Partial<PriceRule>): PriceRule {
  return {
    id: crypto.randomUUID(),
    courtId: null,
    sport: "PADEL",
    memberType: null,
    weekdayMask: 127,
    fromMinute: 0,
    toMinute: 1440,
    priceCents: 800,
    taxTreatment: "EXEMPT_SPORT",
    validFrom: null,
    validTo: null,
    priority: 0,
    label: null,
    createdAt: new Date(),
    ...over,
  } as PriceRule;
}

const ctx = {
  courtId: "pista-1",
  sport: "PADEL" as const,
  memberType: "NUMERARIO" as const,
  weekday: 3,
  startMinute: 10 * 60,
  endMinute: 11 * 60,
};

describe("IVA contenido en el precio", () => {
  it("no extrae nada de un servicio exento", () => {
    expect(taxIncludedIn(1000, "EXEMPT_SPORT")).toBe(0);
    expect(taxIncludedIn(1000, "NOT_SUBJECT")).toBe(0);
  });

  it("extrae el 21 % contenido en un precio con impuestos incluidos", () => {
    // 16,00 € con IVA => base 13,22 €, cuota 2,78 €.
    expect(taxIncludedIn(1600, "STANDARD_21")).toBe(278);
  });
});

describe("resolucion de tarifas", () => {
  it("cobra por horas y no por reserva", () => {
    const r = quote([regla({ priceCents: 800 })], { ...ctx, endMinute: 11 * 60 + 30 });
    expect(r.priceCents).toBe(1200); // 90 minutos a 8 €/h
  });

  it("sin tarifa aplicable, la pista queda incluida en la cuota", () => {
    const r = quote([], ctx);
    expect(r.priceCents).toBe(0);
    expect(r.taxTreatment).toBe("EXEMPT_SPORT");
  });

  it("la regla de mayor prioridad gana", () => {
    const r = quote(
      [regla({ priceCents: 800 }), regla({ priceCents: 1600, priority: 10, taxTreatment: "STANDARD_21" })],
      ctx,
    );
    expect(r.priceCents).toBe(1600);
    expect(r.taxCents).toBe(278);
  });

  it("a igual prioridad, gana la regla de la pista concreta", () => {
    const r = quote(
      [regla({ priceCents: 800 }), regla({ priceCents: 1000, courtId: "pista-1" })],
      ctx,
    );
    expect(r.priceCents).toBe(1000);
  });

  it("el invitado paga tarifa propia y con IVA", () => {
    const r = quote(
      [regla({ priceCents: 800 }), regla({ priceCents: 1600, memberType: "INVITADO", taxTreatment: "STANDARD_21", priority: 10 })],
      { ...ctx, memberType: "INVITADO" },
    );
    expect(r.priceCents).toBe(1600);
    expect(r.taxTreatment).toBe("STANDARD_21");
  });

  it("ignora las reglas cuya franja horaria no cubre toda la reserva", () => {
    const r = quote([regla({ priceCents: 1200, fromMinute: 18 * 60, toMinute: 22 * 60 })], ctx);
    expect(r.priceCents).toBe(0);
  });

  it("ignora las reglas caducadas", () => {
    const r = quote([regla({ priceCents: 1200, validTo: new Date("2020-01-01") })], ctx);
    expect(r.priceCents).toBe(0);
  });

  it("ignora las reglas que no aplican a ese dia de la semana", () => {
    const soloFinDeSemana = (1 << 0) | (1 << 6);
    const r = quote([regla({ priceCents: 1200, weekdayMask: soloFinDeSemana })], ctx);
    expect(r.priceCents).toBe(0);
  });
});
