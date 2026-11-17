import { describe, expect, it } from "vitest";
import { periodoDe, vencimientoDe, etiquetaSemestre, estaVencida, inicioDelDiaDelClub } from "@/lib/cuotas";

describe("calendario de cuotas", () => {
  it("nombra los periodos por año y semestre", () => {
    expect(periodoDe(2026, 1)).toBe("2026-S1");
    expect(periodoDe(2026, 2)).toBe("2026-S2");
  });

  it("vence el 5 de enero y el 5 de julio", () => {
    expect(vencimientoDe(2026, 1).toISOString().slice(0, 10)).toBe("2026-01-05");
    expect(vencimientoDe(2026, 2).toISOString().slice(0, 10)).toBe("2026-07-05");
  });

  it("los periodos se ordenan solos alfabeticamente", () => {
    const ordenados = ["2025-S2", "2026-S1", "2025-S1", "2026-S2"].sort();
    expect(ordenados).toEqual(["2025-S1", "2025-S2", "2026-S1", "2026-S2"]);
  });

  it("describe el semestre en castellano", () => {
    expect(etiquetaSemestre(2026, 1)).toContain("enero–junio");
    expect(etiquetaSemestre(2026, 2)).toContain("julio–diciembre");
  });
});

describe("vencimiento de una cuota", () => {
  const vence = vencimientoDe(2026, 1); // 5 de enero

  it("sigue en plazo durante todo el dia de vencimiento", () => {
    // 00:30 en Madrid del dia 5 = 23:30 UTC del dia 4
    expect(estaVencida(vence, new Date("2026-01-04T23:30:00Z"))).toBe(false);
    // 08:00 UTC del dia 5: antes se daba por vencida
    expect(estaVencida(vence, new Date("2026-01-05T08:00:00Z"))).toBe(false);
    // 23:30 en Madrid del dia 5
    expect(estaVencida(vence, new Date("2026-01-05T22:30:00Z"))).toBe(false);
  });

  it("vence al empezar el dia siguiente en hora del club", () => {
    // 00:30 en Madrid del dia 6 = 23:30 UTC del dia 5
    expect(estaVencida(vence, new Date("2026-01-05T23:30:00Z"))).toBe(true);
  });

  it("toma el dia del club, no el dia UTC", () => {
    expect(inicioDelDiaDelClub(new Date("2026-07-05T22:30:00Z")).toISOString()).toBe("2026-07-06T00:00:00.000Z");
  });
});
