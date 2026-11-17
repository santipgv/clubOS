import { describe, expect, it } from "vitest";
import {
  MAX_DIAS_RANGO,
  agrupacionPorDefecto,
  claveDeGrupo,
  diaDelClub,
  franjasEfectivas,
  gruposDelRango,
  lunesDe,
  marcasDeEje,
  minutoDelClub,
  minutosPorHora,
  ocupacion,
  rangoAnterior,
  resolverFiltros,
  resolverRango,
  variacion,
} from "@/lib/panel";

const HOY = "2026-11-07"; // sabado

describe("rango de fechas del panel", () => {
  it("por defecto es el mes en curso completo", () => {
    expect(resolverRango({}, HOY)).toEqual({ desde: "2026-11-01", hasta: "2026-11-30", preset: "mes", dias: 30 });
  });

  it("resuelve los periodos predefinidos", () => {
    expect(resolverRango({ rango: "hoy" }, HOY)).toMatchObject({ desde: HOY, hasta: HOY, dias: 1 });
    expect(resolverRango({ rango: "7d" }, HOY)).toMatchObject({ desde: "2026-11-01", hasta: HOY, dias: 7 });
    expect(resolverRango({ rango: "mes-anterior" }, HOY)).toMatchObject({ desde: "2026-10-01", hasta: "2026-10-31" });
    expect(resolverRango({ rango: "mes-anterior" }, "2026-01-15")).toMatchObject({ desde: "2025-12-01", hasta: "2025-12-31" });
    expect(resolverRango({ rango: "ano" }, HOY)).toMatchObject({ desde: "2026-01-01", hasta: "2026-12-31", dias: 365 });
    expect(resolverRango({ rango: "ano-anterior" }, HOY)).toMatchObject({ desde: "2025-01-01", hasta: "2025-12-31" });
  });

  it("febrero de un ano bisiesto acaba el 29", () => {
    expect(resolverRango({ rango: "mes" }, "2028-02-10")).toMatchObject({ hasta: "2028-02-29", dias: 29 });
  });

  it("un periodo predefinido manda sobre las fechas sueltas", () => {
    expect(resolverRango({ rango: "hoy", desde: "2026-01-01", hasta: "2026-01-31" }, HOY).desde).toBe(HOY);
  });

  it("acepta fechas personalizadas y las ordena si vienen al reves", () => {
    expect(resolverRango({ rango: "personalizado", desde: "2026-03-31", hasta: "2026-03-01" }, HOY)).toEqual({
      desde: "2026-03-01", hasta: "2026-03-31", preset: "personalizado", dias: 31,
    });
  });

  it("ignora fechas invalidas y no deja pedir rangos enormes", () => {
    expect(resolverRango({ rango: "personalizado", desde: "2026-02-30", hasta: "2026-03-01" }, HOY).preset).toBe("mes");
    expect(resolverRango({ rango: "personalizado", desde: "2000-01-01", hasta: HOY }, HOY).dias).toBe(MAX_DIAS_RANGO);
  });

  it("compara con el periodo inmediatamente anterior de la misma duracion", () => {
    const r = resolverRango({ rango: "mes" }, HOY);
    expect(rangoAnterior(r)).toEqual({ desde: "2026-10-02", hasta: "2026-10-31" });
  });

  it("el rango cruza bien el cambio de hora de octubre", () => {
    const r = resolverRango({ rango: "personalizado", desde: "2026-10-24", hasta: "2026-10-26" }, HOY);
    expect(r.dias).toBe(3);
    expect(gruposDelRango(r.desde, r.hasta, "dia").map((g) => g.clave)).toEqual(["2026-10-24", "2026-10-25", "2026-10-26"]);
  });
});

describe("agrupacion de la serie temporal", () => {
  it("elige una agrupacion legible segun la duracion", () => {
    expect(agrupacionPorDefecto(30)).toBe("dia");
    expect(agrupacionPorDefecto(90)).toBe("semana");
    expect(agrupacionPorDefecto(365)).toBe("mes");
  });

  it("las semanas empiezan en lunes", () => {
    expect(lunesDe("2026-11-07")).toBe("2026-11-02"); // sabado
    expect(lunesDe("2026-11-08")).toBe("2026-11-02"); // domingo
    expect(lunesDe("2026-11-09")).toBe("2026-11-09"); // lunes
    expect(claveDeGrupo("2026-11-07", "mes")).toBe("2026-11");
  });

  it("devuelve todos los grupos del rango, tambien los vacios", () => {
    const grupos = gruposDelRango("2026-01-01", "2026-03-31", "mes");
    expect(grupos.map((g) => g.clave)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(grupos[0].etiqueta).toBe("ene 26");
  });
});

describe("hora local del club", () => {
  it("una reserva a las 23:30 UTC del 31 de octubre es del 1 de noviembre en Madrid", () => {
    const fecha = new Date("2026-10-31T23:30:00Z");
    expect(diaDelClub(fecha)).toBe("2026-11-01");
    expect(minutoDelClub(fecha)).toBe(30);
  });
});

describe("ocupacion", () => {
  it("recorta el horario de la pista al del club", () => {
    expect(franjasEfectivas([{ opensAt: 7 * 60, closesAt: 24 * 60 }], 8 * 60, 23 * 60)).toEqual([
      { opensAt: 480, closesAt: 1380 },
    ]);
    expect(franjasEfectivas([{ opensAt: 6 * 60, closesAt: 7 * 60 }], 8 * 60, 23 * 60)).toEqual([]);
  });

  it("reparte una reserva de hora y media entre las horas que toca", () => {
    expect([...minutosPorHora(9 * 60 + 30, 11 * 60)]).toEqual([[9, 30], [10, 60]]);
    expect([...minutosPorHora(10 * 60, 11 * 60)]).toEqual([[10, 60]]);
  });

  it("sin horas abiertas no hay ocupacion, y nunca pasa del 100 %", () => {
    expect(ocupacion(60, 0)).toBeNull();
    expect(ocupacion(30, 60)).toBe(0.5);
    expect(ocupacion(90, 60)).toBe(1);
  });

  it("la variacion no se inventa un porcentaje cuando antes no habia nada", () => {
    expect(variacion(10, 0)).toBeNull();
    expect(variacion(0, 0)).toBe(0);
    expect(variacion(15, 10)).toBeCloseTo(0.5);
  });
});

describe("ejes", () => {
  it("las marcas son redondas y cubren el maximo", () => {
    expect(marcasDeEje(0)).toEqual([0]);
    expect(marcasDeEje(37)).toEqual([0, 10, 20, 30, 40]);
    const euros = marcasDeEje(123_456);
    expect(euros[0]).toBe(0);
    expect(euros[euros.length - 1]).toBeGreaterThanOrEqual(123_456);
  });
});

describe("filtros de la URL", () => {
  it("descarta valores que no existen en vez de fallar", () => {
    const f = resolverFiltros({ deporte: "GOLF", tipo: "VIP", pista: "'; drop", periodo: "<script>", agrupar: "anio" }, HOY);
    expect(f.deporte).toBeNull();
    expect(f.tipoSocio).toBeNull();
    expect(f.pistaId).toBeNull();
    expect(f.periodoCuota).toBeNull();
    expect(f.agrupacion).toBe("dia");
  });

  it("acepta los valores validos", () => {
    const f = resolverFiltros(
      { rango: "ano", deporte: "PADEL", tipo: "JUVENIL", periodo: "2026-S1", agrupar: "semana" },
      HOY,
    );
    expect(f).toMatchObject({ deporte: "PADEL", tipoSocio: "JUVENIL", periodoCuota: "2026-S1", agrupacion: "semana" });
    expect(resolverFiltros({ periodo: "todos" }, HOY).periodoCuota).toBe("todos");
  });
});
