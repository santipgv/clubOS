import { describe, expect, it } from "vitest";
import {
  contrasteConBlanco,
  esColorValido,
  IDENTIDAD_DEFAULTS,
  resolverIdentidad,
  ubicacion,
} from "@/lib/club";
import { zonaHoraria } from "@/lib/time";

describe("identidad del club", () => {
  it("sin nada guardado usa la identidad de fabrica", () => {
    expect(resolverIdentidad(new Map())).toEqual(IDENTIDAD_DEFAULTS);
  });

  it("aplica lo guardado y el nombre corto cae al nombre completo", () => {
    const club = resolverIdentidad(new Map([["club.nombre", "Club Náutico Ejemplo"]]));
    expect(club["club.nombre"]).toBe("Club Náutico Ejemplo");
    expect(club["club.nombreCorto"]).toBe("Club Náutico Ejemplo");
  });

  it("descarta un color guardado que no es #rrggbb", () => {
    const club = resolverIdentidad(new Map([["club.colorMarca", "red; background:url(x)"]]));
    expect(club["club.colorMarca"]).toBe(IDENTIDAD_DEFAULTS["club.colorMarca"]);
  });

  it("valida colores", () => {
    expect(esColorValido("#1f4e5f")).toBe(true);
    expect(esColorValido("#FFF")).toBe(false);
    expect(esColorValido("1f4e5f")).toBe(false);
  });

  it("mide el contraste del color principal con el texto blanco", () => {
    expect(contrasteConBlanco("#000000")).toBeCloseTo(21, 0);
    expect(contrasteConBlanco("#ffffff")).toBeCloseTo(1, 5);
    expect(contrasteConBlanco(IDENTIDAD_DEFAULTS["club.colorMarca"])).toBeGreaterThanOrEqual(4.5);
    // Un amarillo no sirve de fondo para un boton con texto blanco.
    expect(contrasteConBlanco("#f2c230")).toBeLessThan(4.5);
  });

  it("compone la ubicacion sin comas sueltas", () => {
    const base = resolverIdentidad(new Map());
    expect(ubicacion(base)).toBe("");
    expect(ubicacion({ ...base, "club.localidad": "Valdemoro" })).toBe("Valdemoro");
    expect(ubicacion({ ...base, "club.localidad": "Valdemoro", "club.provincia": "Madrid" })).toBe("Valdemoro, Madrid");
  });
});

describe("zona horaria del club", () => {
  it("por defecto es Europe/Madrid", () => {
    expect(zonaHoraria(undefined)).toBe("Europe/Madrid");
    expect(zonaHoraria("  ")).toBe("Europe/Madrid");
  });

  it("acepta una zona IANA y rechaza una inventada", () => {
    expect(zonaHoraria("Atlantic/Canary")).toBe("Atlantic/Canary");
    expect(() => zonaHoraria("Marte/Olympus")).toThrow(/NEXT_PUBLIC_CLUB_TIMEZONE/);
  });
});
