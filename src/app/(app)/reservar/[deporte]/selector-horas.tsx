"use client";

import { useState } from "react";
import { FranjasHorarias } from "@/components/franjas-horarias";
import { Campo, INPUT_CLASS, Vacio } from "@/components/ui";
import { minutesToHHMM } from "@/lib/time";

export type HoraDePista = {
  pistaId: string;
  pista: string;
  minuto: number;
  duraciones: number[];
};

export function SelectorHoras({ horas, pistas, deporte, day }: {
  horas: HoraDePista[];
  pistas: { id: string; name: string }[];
  deporte: string;
  day: string;
}) {
  const [pista, setPista] = useState("");
  const [duracion, setDuracion] = useState(0);
  const duraciones = [...new Set(horas.flatMap((h) => h.duraciones))].sort((a, b) => a - b);
  const disponibles = horas.filter((h) =>
    (!pista || h.pistaId === pista) && (!duracion || h.duraciones.includes(duracion)),
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Pista">
          <select className={INPUT_CLASS} value={pista} onChange={(e) => setPista(e.target.value)}>
            <option value="">Todas las pistas</option>
            {pistas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Duración">
          <select className={INPUT_CLASS} value={duracion} onChange={(e) => setDuracion(Number(e.target.value))}>
            <option value={0}>Cualquier duración</option>
            {duraciones.map((d) => <option key={d} value={d}>{d} min</option>)}
          </select>
        </Campo>
      </div>
      <p className="text-sm text-piedra-500" aria-live="polite">
        {disponibles.length} {disponibles.length === 1 ? "hueco disponible" : "huecos disponibles"}
      </p>
      {disponibles.length === 0 ? (
        <Vacio>No hay huecos para esta selección. Prueba otro día, pista o duración.</Vacio>
      ) : (
        <FranjasHorarias huecos={disponibles.map((h) => ({
          id: `${h.pistaId}:${h.minuto}`,
          minuto: h.minuto,
          href: `/reservar/${deporte}/confirmar?pista=${h.pistaId}&dia=${day}&inicio=${h.minuto}${duracion ? `&duracion=${duracion}` : ""}`,
          etiqueta: `Reservar ${h.pista} a las ${minutesToHHMM(h.minuto)}`,
          detalle: (
            <>
              <span className="block text-sm text-marca-700">{h.pista}</span>
              <span className="block text-xs text-piedra-500">{duracion || h.duraciones.join(" / ")} min</span>
            </>
          ),
        }))} />
      )}
    </div>
  );
}
