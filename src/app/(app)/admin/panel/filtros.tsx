"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { PARAM, RUTA_PANEL } from "@/lib/rutas";

type Opcion = { valor: string; texto: string };

/**
 * Filtros del panel. Es un formulario GET normal: la URL resultante se puede
 * guardar o enviar, y sin JavaScript sigue funcionando con el boton.
 *
 * Con JavaScript solo hace dos cosas comodas: elegir un periodo predefinido
 * aplica el filtro al momento, y tocar una fecha pasa a "Personalizado"
 * (si no, el periodo elegido mandaria sobre las fechas y no pasaria nada).
 */
export function FiltrosPanel({
  valores,
  presets,
  agrupaciones,
  deportes,
  pistas,
  tipos,
  periodos,
}: {
  valores: {
    rango: string;
    desde: string;
    hasta: string;
    deporte: string;
    pista: string;
    tipo: string;
    agrupar: string;
    periodo: string;
  };
  presets: Opcion[];
  agrupaciones: Opcion[];
  deportes: Opcion[];
  pistas: (Opcion & { deporte: string })[];
  tipos: Opcion[];
  periodos: Opcion[];
}) {
  const form = useRef<HTMLFormElement>(null);
  const [rango, setRango] = useState(valores.rango);
  const [deporte, setDeporte] = useState(valores.deporte);

  const pistasVisibles = deporte ? pistas.filter((p) => p.deporte === deporte) : pistas;
  const enviar = () => form.current?.requestSubmit();

  const claseCampo =
    "w-full rounded-md border border-piedra-300 bg-white px-2.5 py-2 text-sm text-marca-900 focus:border-marca-500 focus:outline-none";
  const claseEtiqueta = "mb-1 block text-xs font-bold text-marca-800";

  return (
    <form
      ref={form}
      method="get"
      action={RUTA_PANEL}
      className="mb-8 grid grid-cols-2 gap-3 rounded-lg border border-piedra-200 bg-white p-4 sm:grid-cols-4 lg:grid-cols-8"
    >
      <label className="col-span-2 sm:col-span-2 lg:col-span-2">
        <span className={claseEtiqueta}>Periodo</span>
        <select
          name={PARAM.rango}
          value={rango}
          onChange={(e) => {
            setRango(e.target.value);
            if (e.target.value !== "personalizado") queueMicrotask(enviar);
          }}
          className={claseCampo}
        >
          {presets.map((o) => (
            <option key={o.valor} value={o.valor}>{o.texto}</option>
          ))}
        </select>
      </label>

      <label>
        <span className={claseEtiqueta}>Desde</span>
        <input
          type="date"
          name={PARAM.desde}
          defaultValue={valores.desde}
          onChange={() => setRango("personalizado")}
          className={claseCampo}
        />
      </label>
      <label>
        <span className={claseEtiqueta}>Hasta</span>
        <input
          type="date"
          name={PARAM.hasta}
          defaultValue={valores.hasta}
          onChange={() => setRango("personalizado")}
          className={claseCampo}
        />
      </label>

      <label>
        <span className={claseEtiqueta}>Deporte</span>
        <select
          name={PARAM.deporte}
          value={deporte}
          onChange={(e) => setDeporte(e.target.value)}
          className={claseCampo}
        >
          <option value="">Todos</option>
          {deportes.map((o) => (
            <option key={o.valor} value={o.valor}>{o.texto}</option>
          ))}
        </select>
      </label>

      <label>
        <span className={claseEtiqueta}>Pista</span>
        <select
          name={PARAM.pista}
          defaultValue={valores.pista}
          key={deporte}
          className={claseCampo}
        >
          <option value="">Todas</option>
          {pistasVisibles.map((o) => (
            <option key={o.valor} value={o.valor}>{o.texto}</option>
          ))}
        </select>
      </label>

      <label>
        <span className={claseEtiqueta}>Tipo de socio</span>
        <select name={PARAM.tipo} defaultValue={valores.tipo} className={claseCampo}>
          <option value="">Todos</option>
          {tipos.map((o) => (
            <option key={o.valor} value={o.valor}>{o.texto}</option>
          ))}
        </select>
      </label>

      <label>
        <span className={claseEtiqueta}>Agrupar</span>
        <select name={PARAM.agrupar} defaultValue={valores.agrupar} className={claseCampo}>
          <option value="">Automático</option>
          {agrupaciones.map((o) => (
            <option key={o.valor} value={o.valor}>{o.texto}</option>
          ))}
        </select>
      </label>

      <label className="col-span-2 sm:col-span-2 lg:col-span-2">
        <span className={claseEtiqueta}>Cuotas del periodo</span>
        <select name={PARAM.periodo} defaultValue={valores.periodo} className={claseCampo}>
          <option value="">El último vencido</option>
          {periodos.map((o) => (
            <option key={o.valor} value={o.valor}>{o.texto}</option>
          ))}
        </select>
      </label>

      <div className="col-span-2 flex items-end gap-2 sm:col-span-4 lg:col-span-6 lg:justify-end">
        <Link
          href={RUTA_PANEL}
          className="rounded-md border border-piedra-300 bg-white px-4 py-2 text-sm font-bold text-marca-700 hover:bg-marca-50"
        >
          Limpiar
        </Link>
        <button className="rounded-md bg-marca-700 px-4 py-2 text-sm font-bold text-white hover:bg-marca-800">
          Aplicar filtros
        </button>
      </div>
    </form>
  );
}
