"use client";

import { useState } from "react";
import type { Salida } from "@/lib/golf/salidas";
import { FranjasHorarias } from "@/components/franjas-horarias";
import { INPUT_CLASS, Vacio } from "@/components/ui";

type Hueco = Pick<Salida, "startMinute" | "hora" | "estado" | "libres" | "acompanantes">;

export function HojaSalidas({ courseId, day, maxPlayers, salidas }: {
  courseId: string; day: string; maxPlayers: number; salidas: Hueco[];
}) {
  const [plazas, setPlazas] = useState(1);
  const disponibles = salidas.filter((s) => (s.estado === "LIBRE" || s.estado === "PARCIAL") && s.libres >= plazas);

  if (salidas.length === 0) return <Vacio>El campo no abre este día.</Vacio>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-marca-900">
          <label htmlFor="golf-plazas">Jugadores</label>
          <select id="golf-plazas" className={`${INPUT_CLASS} w-auto`} value={plazas} onChange={(e) => setPlazas(Number(e.target.value))}>
            {Array.from({ length: maxPlayers }, (_, i) => i + 1).map((n) => <option key={n}>{n}</option>)}
          </select>
        </div>
        <p className="text-sm text-piedra-500" aria-live="polite">
          {disponibles.length} {disponibles.length === 1 ? "salida disponible" : "salidas disponibles"}
        </p>
      </div>
      {disponibles.length === 0 ? <Vacio>No hay salidas con esas plazas. Prueba otro día o reduce el número de jugadores.</Vacio> : (
        <FranjasHorarias huecos={disponibles.map((s) => ({
          id: String(s.startMinute),
          minuto: s.startMinute,
          href: `/reservar/golf/confirmar?campo=${courseId}&dia=${day}&salida=${s.startMinute}&jugadores=${plazas}`,
          etiqueta: `Reservar a las ${s.hora}, ${s.libres} plazas libres`,
          detalle: (
            <>
              <span className="block text-sm text-marca-700">{s.estado === "PARCIAL" ? "Unirme · " : ""}{s.libres} {s.libres === 1 ? "plaza" : "plazas"}</span>
              {s.acompanantes.length > 0 ? <span className="block text-xs text-piedra-500">{s.acompanantes.map((a) => a.esTuya ? "Tu reserva" : a.nombre).join(" · ")}</span> : null}
            </>
          ),
        }))} />
      )}
    </div>
  );
}
