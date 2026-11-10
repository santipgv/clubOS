"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { minutesToHHMM } from "@/lib/time";

const DURACION_FRANJA = 120;

type Hueco = {
  id: string;
  minuto: number;
  href: string;
  etiqueta: string;
  detalle: ReactNode;
};

export function FranjasHorarias({ huecos }: { huecos: Hueco[] }) {
  const [seleccion, setSeleccion] = useState<number | null>(null);
  const franjas = new Map<number, Hueco[]>();
  for (const hueco of huecos) {
    const inicio = Math.floor(hueco.minuto / DURACION_FRANJA) * DURACION_FRANJA;
    const grupo = franjas.get(inicio);
    if (grupo) grupo.push(hueco);
    else franjas.set(inicio, [hueco]);
  }
  const activa = seleccion !== null && franjas.has(seleccion) ? seleccion : franjas.keys().next().value;
  const visibles = activa === undefined ? [] : franjas.get(activa) ?? [];

  return (
    <>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Franja horaria">
        {Array.from(franjas).map(([inicio, grupo]) => (
          <button key={inicio} type="button" aria-pressed={activa === inicio} onClick={() => setSeleccion(inicio)}
            className={`rounded-md border px-3 py-2.5 text-sm font-semibold transition-colors ${activa === inicio
              ? "border-marca-700 bg-marca-700 text-white" : "border-piedra-200 bg-white text-marca-800 hover:border-marca-500"}`}>
            {minutesToHHMM(inicio)}–{minutesToHHMM(inicio + DURACION_FRANJA)} <span className="ml-1 opacity-80">({grupo.length})</span>
          </button>
        ))}
      </div>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {visibles.map(({ id, minuto, href, etiqueta, detalle }) => (
          <li key={id}>
            <Link href={href} aria-label={etiqueta}
              className="block h-full rounded-md border border-piedra-200 bg-white px-3 py-2.5 transition-colors hover:border-marca-500 hover:bg-marca-50">
              <span className="block font-mono text-lg font-bold tabular-nums text-marca-900">{minutesToHHMM(minuto)}</span>
              {detalle}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
