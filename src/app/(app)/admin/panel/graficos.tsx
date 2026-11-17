import type { ReactNode } from "react";
import { marcasDeEje } from "@/lib/panel";

/**
 * Graficos del panel, en HTML y CSS. Sin libreria y sin JavaScript en el
 * cliente: el texto se mantiene nitido a cualquier ancho (un SVG escalado
 * encoge las etiquetas en el movil) y la CSP de la aplicacion no necesita
 * excepciones.
 *
 * Cada marca lleva su `title` y un rotulo al pasar el raton o enfocar; cada
 * grafico tiene ademas su tabla de datos desplegable, para quien no distinga
 * colores o use lector de pantalla.
 *
 * Colores: validados con el comprobador de paletas (contraste, separacion
 * para daltonismo). Pistas y cuotas usan verde y oro, fijos:
 * son colores de datos, no de marca, y no cambian con la identidad del club.
 */

export const COLOR_SERIE = ["#2f7a3e", "#b8860b"] as const;

/** Estados: reservados para significar bien / atencion / mal. Siempre con texto. */
export const COLOR_ESTADO = {
  bien: "#0ca30c",
  atencion: "#fab219",
  mal: "#d03b3b",
  neutro: "#a3a39c",
} as const;

/**
 * Rampa secuencial en el color de marca del club, de menos a mas. Son
 * variables CSS (globals.css) para que sigan al color que elija cada club.
 */
export const RAMPA_OCUPACION = [
  { hasta: 0, color: "var(--color-marca-50)", texto: "0 %" },
  { hasta: 0.2, color: "var(--color-marca-100)", texto: "< 20 %" },
  { hasta: 0.4, color: "var(--color-marca-200)", texto: "20–40 %" },
  { hasta: 0.6, color: "var(--color-marca-300)", texto: "40–60 %" },
  { hasta: 0.8, color: "var(--color-marca-500)", texto: "60–80 %" },
  { hasta: 1, color: "var(--color-marca-700)", texto: "≥ 80 %" },
] as const;

export function colorOcupacion(o: number): string {
  if (o <= 0) return RAMPA_OCUPACION[0].color;
  return (RAMPA_OCUPACION.find((p) => p.hasta > 0 && o < p.hasta) ?? RAMPA_OCUPACION[5]).color;
}

// ---------------------------------------------------------------- formato

export function euros(cents: number, decimales = true): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: decimales ? 2 : 0,
    minimumFractionDigits: decimales ? 2 : 0,
  }).format(cents / 100);
}

/** Para ejes: 0 · 500 € · 1,2 mil € · 12 mil €. */
export function eurosCompacto(cents: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    notation: cents >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: cents >= 1_000_000 ? 1 : 0,
  }).format(cents / 100);
}

export function numero(n: number, decimales = 0): string {
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: decimales, minimumFractionDigits: decimales }).format(n);
}

export function porcentaje(p: number | null, decimales = 0): string {
  if (p === null) return "—";
  return new Intl.NumberFormat("es-ES", { style: "percent", maximumFractionDigits: decimales }).format(p);
}

// ---------------------------------------------------------------- piezas

export function Leyenda({ elementos }: { elementos: { nombre: string; color: string; icono?: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-piedra-500">
      {elementos.map((e) => (
        <li key={e.nombre} className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: e.color }} />
          {e.icono ? <span aria-hidden>{e.icono}</span> : null}
          {e.nombre}
        </li>
      ))}
    </ul>
  );
}

export function VerDatos({ children }: { children: ReactNode }) {
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer text-xs font-bold text-marca-700 hover:underline">Ver los datos en tabla</summary>
      <div className="mt-2 max-h-72 overflow-auto rounded border border-piedra-200">{children}</div>
    </details>
  );
}

// ---------------------------------------------------------------- columnas

/**
 * Columnas (apiladas si hay varias series) sobre un unico eje que empieza en
 * cero. Barras de 24 px como mucho, extremo redondeado arriba y recto en la
 * base, y 2 px de separacion entre segmentos.
 */
export function Columnas({
  datos,
  series,
  formato,
  titulo,
}: {
  datos: { clave: string; etiqueta: string; valores: number[] }[];
  series: { nombre: string; color: string }[];
  formato: (v: number) => string;
  titulo: string;
}) {
  const totales = datos.map((d) => d.valores.reduce((s, v) => s + v, 0));
  const maximo = Math.max(0, ...totales);
  const marcas = marcasDeEje(maximo);
  const tope = marcas[marcas.length - 1] || 1;
  const formatoEje = formato;

  // Con muchas columnas no caben todas las etiquetas: se muestra una de cada N.
  // Siete caben tambien en el ancho de un movil sin pisarse.
  const cadaN = Math.max(1, Math.ceil(datos.length / 7));
  const anchoMinimo = datos.length > 60 ? datos.length * 8 : undefined;

  return (
    <figure aria-label={titulo}>
      {series.length > 1 ? (
        <div className="mb-3">
          <Leyenda elementos={series} />
        </div>
      ) : null}

      {/* El margen superior deja sitio a la etiqueta mas alta del eje, que
          sobresale media linea por encima del area del grafico. */}
      <div className="mt-3 flex gap-2">
        {/* Eje vertical */}
        <div className="relative h-48 w-16 shrink-0 text-right text-[11px] tabular-nums text-piedra-400">
          {marcas.map((m) => (
            // `bottom` coloca el borde inferior de la etiqueta en la linea;
            // bajarla media altura la deja centrada sobre ella.
            <span key={m} className="absolute right-0 translate-y-1/2" style={{ bottom: `${(m / tope) * 100}%` }}>
              {formatoEje(m)}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1 overflow-x-auto">
          <div style={{ minWidth: anchoMinimo }}>
            <div className="relative h-48">
              {marcas.map((m) => (
                <div
                  key={m}
                  aria-hidden
                  className={`absolute inset-x-0 h-px translate-y-1/2 ${m === 0 ? "bg-piedra-300" : "bg-piedra-200"}`}
                  style={{ bottom: `${(m / tope) * 100}%` }}
                />
              ))}

              <ol className="absolute inset-0 flex items-end">
                {datos.map((d, i) => {
                  const total = totales[i];
                  const resumen = `${d.etiqueta}: ${
                    series.length > 1
                      ? series.map((s, j) => `${s.nombre} ${formato(d.valores[j])}`).join(" · ") + ` · Total ${formato(total)}`
                      : formato(total)
                  }`;
                  return (
                    <li
                      key={d.clave}
                      tabIndex={0}
                      title={resumen}
                      aria-label={resumen}
                      className="group relative flex h-full flex-1 items-end justify-center outline-none hover:bg-marca-50 focus-visible:bg-marca-50"
                    >
                      <div
                        className="flex w-[60%] max-w-6 flex-col-reverse gap-[2px]"
                        style={{ height: `${(total / tope) * 100}%` }}
                      >
                        {d.valores.map((v, j) =>
                          v > 0 ? (
                            <div
                              key={j}
                              className={`w-full ${j === lastNonZero(d.valores) ? "rounded-t" : ""}`}
                              style={{ flexGrow: v, flexBasis: 0, minHeight: 2, backgroundColor: series[j].color }}
                            />
                          ) : null,
                        )}
                      </div>
                      {/* Rotulo al pasar o enfocar */}
                      <span
                        role="presentation"
                        className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden w-max max-w-56 -translate-x-1/2 rounded bg-marca-900 px-2 py-1 text-[11px] leading-snug text-white shadow group-hover:block group-focus-visible:block"
                      >
                        <strong className="block">{d.etiqueta}</strong>
                        {series.map((s, j) => (
                          <span key={s.nombre} className="flex items-center gap-1.5">
                            <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: s.color }} />
                            {s.nombre}: {formato(d.valores[j])}
                          </span>
                        ))}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>

            <ol aria-hidden className="mt-1 flex text-[11px] tabular-nums text-piedra-400">
              {datos.map((d, i) => (
                <li key={d.clave} className="flex-1 overflow-visible whitespace-nowrap text-center">
                  {i % cadaN === 0 ? d.etiqueta : ""}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>

      <VerDatos>
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-piedra-100 text-piedra-500">
            <tr>
              <th className="px-3 py-1.5">Periodo</th>
              {series.map((s) => (
                <th key={s.nombre} className="px-3 py-1.5 text-right">{s.nombre}</th>
              ))}
              {series.length > 1 ? <th className="px-3 py-1.5 text-right">Total</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-piedra-100 tabular-nums">
            {datos.map((d, i) => (
              <tr key={d.clave}>
                <td className="px-3 py-1">{d.clave}</td>
                {d.valores.map((v, j) => (
                  <td key={j} className="px-3 py-1 text-right">{formato(v)}</td>
                ))}
                {series.length > 1 ? <td className="px-3 py-1 text-right font-bold">{formato(totales[i])}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </VerDatos>
    </figure>
  );
}

function lastNonZero(valores: number[]): number {
  for (let i = valores.length - 1; i >= 0; i--) if (valores[i] > 0) return i;
  return -1;
}

// ---------------------------------------------------------------- medidor

/** Barra fina de proporcion, con la pista en un tono claro de la misma rampa. */
export function Medidor({ valor, etiqueta }: { valor: number | null; etiqueta: string }) {
  const v = valor ?? 0;
  return (
    <div className="flex items-center gap-2">
      <div
        role="meter"
        aria-label={etiqueta}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(v * 100)}
        className="h-2 w-20 overflow-hidden rounded-full bg-marca-100"
      >
        <div className="h-full rounded-full bg-marca-600" style={{ width: `${v * 100}%` }} />
      </div>
      <span className="w-10 text-right tabular-nums">{porcentaje(valor)}</span>
    </div>
  );
}

// ---------------------------------------------------------------- barra segmentada

/**
 * Un todo repartido en partes (p. ej. lo girado en cuotas: cobrado, pendiente,
 * vencido). 28 px, cada parte con su bloque y su cuota dentro si cabe.
 */
export function BarraSegmentada({
  partes,
  formato,
  titulo,
}: {
  partes: { nombre: string; valor: number; color: string; textoOscuro?: boolean; icono?: string }[];
  formato: (v: number) => string;
  titulo: string;
}) {
  const total = partes.reduce((s, p) => s + p.valor, 0);
  if (total === 0) return null;
  return (
    <figure aria-label={titulo}>
      <div className="flex h-7 w-full gap-[2px]">
        {partes
          .filter((p) => p.valor > 0)
          .map((p) => {
            const parte = p.valor / total;
            const texto = `${p.nombre}: ${formato(p.valor)} (${porcentaje(parte)})`;
            return (
              <div
                key={p.nombre}
                title={texto}
                aria-label={texto}
                role="img"
                className={`flex items-center overflow-hidden rounded px-2 text-[11px] font-bold ${p.textoOscuro ? "text-marca-900" : "text-white"}`}
                style={{ width: `${parte * 100}%`, backgroundColor: p.color }}
              >
                {parte >= 0.15 ? porcentaje(parte) : ""}
              </div>
            );
          })}
      </div>
      <div className="mt-2">
        <Leyenda elementos={partes.map((p) => ({ nombre: p.nombre, color: p.color, icono: p.icono }))} />
      </div>
    </figure>
  );
}
