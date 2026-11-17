"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { crearBloqueo, eliminarBloqueo, type EstadoBloqueo } from "./acciones";
import { Aviso, Boton, Campo, INPUT_CLASS, Tarjeta } from "@/components/ui";
import { minutesToHHMM } from "@/lib/time";
import { DEPORTE_NOMBRE } from "@/lib/booking/deportes";
import type { Sport } from "@/lib/types";

const HORAS = Array.from({ length: 31 }, (_, i) => 8 * 60 + i * 30);

function Enviar({ children, variante = "primario" }: { children: string; variante?: "primario" | "peligro" }) {
  const { pending } = useFormStatus();
  return (
    <Boton type="submit" variante={variante} tamano="sm" disabled={pending}>
      {pending ? "…" : children}
    </Boton>
  );
}

/**
 * Las pistas y deportes que llegan ya vienen filtrados por el ambito de quien
 * gestiona; `permiteClub` solo es cierto para el personal del club. El servidor
 * vuelve a comprobarlo todo: esto solo evita ofrecer lo que se rechazaria.
 */
export function FormularioBloqueo({
  pistas,
  deportes,
  permiteClub,
  hoy,
}: {
  pistas: Array<{ id: string; name: string; sport: string }>;
  deportes: Sport[];
  permiteClub: boolean;
  hoy: string;
}) {
  const [estado, accion] = useActionState<EstadoBloqueo, FormData>(crearBloqueo, {});
  const [alcance, setAlcance] = useState("pista");

  return (
    <Tarjeta className="p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-marca-600">Nuevo bloqueo</h2>

      <form action={accion} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Campo etiqueta="Alcance">
          <select
            value={alcance}
            onChange={(e) => setAlcance(e.target.value)}
            className={INPUT_CLASS}
          >
            <option value="pista">Una pista</option>
            <option value="deporte">Todas las pistas de un deporte</option>
            {permiteClub ? <option value="club">Todo el club</option> : null}
          </select>
        </Campo>

        {alcance === "pista" ? (
          <Campo etiqueta="Pista">
            <select name="courtId" required className={INPUT_CLASS}>
              {pistas.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </Campo>
        ) : alcance === "deporte" ? (
          <Campo etiqueta="Deporte">
            <select name="sport" required className={INPUT_CLASS}>
              {deportes.map((d) => (
                <option key={d} value={d}>{DEPORTE_NOMBRE[d]}</option>
              ))}
            </select>
          </Campo>
        ) : (
          <div className="flex items-end pb-2 text-sm text-granate-600">
            Se bloquearán todas las pistas del club.
          </div>
        )}

        <Campo etiqueta="Día">
          <input type="date" name="day" defaultValue={hoy} required className={INPUT_CLASS} />
        </Campo>

        <Campo etiqueta="Tipo">
          <select name="type" defaultValue="EVENT" className={INPUT_CLASS}>
            <option value="TOURNAMENT">Torneo</option>
            <option value="CLASS">Clase</option>
            <option value="MAINTENANCE">Mantenimiento</option>
            <option value="CLOSURE">Cierre</option>
            <option value="EVENT">Evento</option>
          </select>
        </Campo>

        <Campo etiqueta="Desde">
          <select name="startMinute" defaultValue={String(9 * 60)} className={INPUT_CLASS}>
            {HORAS.map((m) => <option key={m} value={m}>{minutesToHHMM(m)}</option>)}
          </select>
        </Campo>

        <Campo etiqueta="Hasta">
          <select name="endMinute" defaultValue={String(14 * 60)} className={INPUT_CLASS}>
            {HORAS.slice(1).concat([23 * 60]).map((m) => <option key={m} value={m}>{minutesToHHMM(m)}</option>)}
          </select>
        </Campo>

        <div className="sm:col-span-2">
          <Campo etiqueta="Título" ayuda="Es lo que veran los socios en la rejilla si el bloqueo es publico.">
            <input name="title" required maxLength={120} placeholder="Torneo social de primavera" className={INPUT_CLASS} />
          </Campo>
        </div>

        <div className="sm:col-span-2 lg:col-span-4">
          <Campo etiqueta="Descripción interna (opcional)">
            <input name="description" maxLength={500} className={INPUT_CLASS} />
          </Campo>
        </div>

        <div className="sm:col-span-2 lg:col-span-4 flex flex-wrap items-center gap-4 border-t border-piedra-200 pt-4">
          <label className="flex items-center gap-2 text-sm text-marca-700">
            <input type="checkbox" name="isPublic" defaultChecked className="size-4 accent-[var(--color-marca-700)]" />
            Mostrar el titulo a los socios
          </label>
          <label className="flex items-center gap-2 text-sm text-granate-600">
            <input type="checkbox" name="confirmar" value="si" className="size-4 accent-[var(--color-granate-500)]" />
            Confirmo cancelar las reservas afectadas
          </label>
          <Enviar>Crear bloqueo</Enviar>
        </div>
      </form>

      {estado.error ? <div className="mt-3"><Aviso tipo="error">{estado.error}</Aviso></div> : null}
      {estado.ok ? <div className="mt-3"><Aviso tipo="exito">{estado.ok}</Aviso></div> : null}
    </Tarjeta>
  );
}

export function BotonEliminar({ id }: { id: string }) {
  const [estado, accion] = useActionState<EstadoBloqueo, FormData>(eliminarBloqueo, {});
  return (
    <form
      action={accion}
      onSubmit={(e) => {
        if (!confirm("¿Eliminar este bloqueo? Las reservas ya canceladas no se recuperan.")) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Enviar variante="peligro">Eliminar</Enviar>
      {estado.error ? <p className="mt-1 text-xs text-granate-600">{estado.error}</p> : null}
    </form>
  );
}
