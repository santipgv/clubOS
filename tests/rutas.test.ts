import { describe, expect, it } from "vitest";
import {
  PARAM,
  rutaAdminReservas,
  rutaConfirmarReserva,
  rutaFichaSocio,
  rutaMisReservas,
  rutaPanel,
  rutaReservarDeporte,
} from "@/lib/rutas";

/**
 * Una correccion ortografica automatica convirtio `?dia=` en `?día=` en los
 * enlaces, pero no en el servidor, que seguia leyendo `dia`: el calendario
 * dejo de cambiar de dia y no salto ningun error por ninguna parte. Estas
 * pruebas hacen que un fallo asi salga en rojo.
 */

const SOLO_ASCII = /^[\x20-\x7E]*$/;

describe("las URLs no llevan tildes ni caracteres raros", () => {
  const rutas = [
    rutaReservarDeporte("PADEL", "2026-08-22"),
    rutaReservarDeporte("tenis"),
    rutaConfirmarReserva({ deporte: "padel", pista: "abc", dia: "2026-08-22", inicio: 600 }),
    rutaConfirmarReserva({ deporte: "padel", pista: "abc", dia: "2026-08-22", inicio: 600, duracion: 90 }),
    rutaAdminReservas("2026-08-22"),
    rutaFichaSocio("abc"),
    rutaMisReservas("TIR-ABC123"),
    rutaPanel({ rango: "personalizado", desde: "2026-01-01", hasta: "2026-03-31", deporte: "PADEL", periodo: "2026-S1" }),
  ];

  for (const ruta of rutas) {
    it(`${ruta} es ASCII puro`, () => {
      expect(SOLO_ASCII.test(ruta)).toBe(true);
    });
  }

  it("los nombres de parametro son ASCII", () => {
    for (const [clave, valor] of Object.entries(PARAM)) {
      expect(SOLO_ASCII.test(valor), `${clave} = ${valor}`).toBe(true);
    }
  });
});

describe("construccion de rutas", () => {
  it("el panel solo escribe los filtros con valor", () => {
    expect(rutaPanel({})).toBe("/admin/panel");
    expect(rutaPanel({ rango: "mes", deporte: null, tipo: "" })).toBe("/admin/panel?rango=mes");
  });

  it("traduce el deporte a su segmento de URL", () => {
    expect(rutaReservarDeporte("PADEL", "2026-08-22")).toBe("/reservar/padel?dia=2026-08-22");
    expect(rutaReservarDeporte("CROQUET")).toBe("/reservar/croquet");
  });

  it("incluye la duracion solo cuando se indica", () => {
    const sin = rutaConfirmarReserva({ deporte: "tenis", pista: "p1", dia: "2026-08-22", inicio: 540 });
    expect(sin).toBe("/reservar/tenis/confirmar?pista=p1&dia=2026-08-22&inicio=540");
    const con = rutaConfirmarReserva({ deporte: "tenis", pista: "p1", dia: "2026-08-22", inicio: 540, duracion: 60 });
    expect(con).toContain("&duracion=60");
  });
});

/**
 * Los nombres de los campos de formulario son un contrato entre el navegador y
 * la accion de servidor, igual que los parametros de URL. Una tilde de mas en
 * uno de los dos lados rompe el formulario sin dar ningun error: el campo
 * simplemente llega vacio. Ya paso con `?dia=` y con `name="día"`.
 */
describe("los nombres de campo de formulario son ASCII", async () => {
  const { readFileSync, readdirSync, statSync } = await import("node:fs");
  const { join } = await import("node:path");

  function ficheros(directorio: string): string[] {
    return readdirSync(directorio).flatMap((entrada) => {
      const ruta = join(directorio, entrada);
      if (entrada === "generated") return [];
      if (statSync(ruta).isDirectory()) return ficheros(ruta);
      return ruta.endsWith(".tsx") || ruta.endsWith(".ts") ? [ruta] : [];
    });
  }

  const sospechosos = ficheros("src").flatMap((ruta) => {
    const contenido = readFileSync(ruta, "utf8");
    const nombres = [...contenido.matchAll(/\bname="([^"]*)"/g)].map((m) => m[1]);
    const claves = [...contenido.matchAll(/formData\.get\("([^"]*)"\)/g)].map((m) => m[1]);
    return [...nombres, ...claves]
      .filter((valor) => !/^[\x20-\x7E]*$/.test(valor))
      .map((valor) => `${ruta}: ${valor}`);
  });

  it("no hay ningun nombre de campo con tildes", () => {
    expect(sospechosos).toEqual([]);
  });
});
