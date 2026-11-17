"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { confirmarReserva, type EstadoReserva } from "./acciones";
import { Aviso, Boton, Campo, INPUT_CLASS, Tarjeta } from "@/components/ui";
import { minutesToHHMM } from "@/lib/time";

function BotonConfirmar() {
  const { pending } = useFormStatus();
  return (
    <Boton type="submit" tamano="lg" disabled={pending} className="w-full sm:w-auto">
      {pending ? "Reservando…" : "Confirmar reserva"}
    </Boton>
  );
}

export function FormularioConfirmacion(props: {
  slugDeporte: string;
  courtId: string;
  courtName: string;
  maxPlayers: number;
  day: string;
  startMinute: number;
  duraciones: number[];
  duracionActual: number;
  /** Importe y saldo ya formateados; saldo null si no alcanza o no hay nada que pagar. */
  importe: string | null;
  saldo: string | null;
}) {
  const [estado, accion] = useActionState<EstadoReserva, FormData>(confirmarReserva, {});

  return (
    <Tarjeta className="p-6">
      <form action={accion} className="space-y-5">
        <input type="hidden" name="courtId" value={props.courtId} />
        <input type="hidden" name="day" value={props.day} />
        <input type="hidden" name="startMinute" value={props.startMinute} />

        {estado.error ? <Aviso tipo="error">{estado.error}</Aviso> : null}

        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-marca-800">Duracion</legend>
          <div className="flex flex-wrap gap-2">
            {props.duraciones.map((d) => (
              <Link
                key={d}
                href={`/reservar/${props.slugDeporte}/confirmar?pista=${props.courtId}&dia=${props.day}&inicio=${props.startMinute}&duracion=${d}`}
                scroll={false}
                className={`rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors ${
                  d === props.duracionActual
                    ? "border-marca-700 bg-marca-700 text-piedra-50"
                    : "border-piedra-300 bg-white text-marca-700 hover:border-marca-400"
                }`}
              >
                {d} min
                <span className="ml-1.5 font-normal opacity-80">
                  · hasta {minutesToHHMM(props.startMinute + d)}
                </span>
              </Link>
            ))}
          </div>
          <input type="hidden" name="durationMinutes" value={props.duracionActual} />
        </fieldset>

        <Campo
          etiqueta="Jugadores (opcional)"
          ayuda={`Separa los nombres con comas. Máximo ${props.maxPlayers} en esta pista.`}
        >
          <input name="playerNames" className={INPUT_CLASS} placeholder="Ana Rivas, Luis Peral" />
        </Campo>

        <Campo etiqueta="Invitados no socios" ayuda="Se aplica tarifa de invitado y no goza de la exención de IVA.">
          <input name="guestCount" type="number" min={0} max={8} defaultValue={0} className={INPUT_CLASS} />
        </Campo>

        {props.importe && props.saldo ? (
          <label className="flex items-start gap-3 rounded-md border border-marca-200 bg-marca-50 px-4 py-3 text-sm text-marca-800">
            <input type="checkbox" name="pagarConMonedero" value="si" defaultChecked className="mt-0.5 h-4 w-4" />
            <span>
              <span className="block font-bold">Pagar ya {props.importe} con mi monedero</span>
              <span className="block text-xs text-marca-600">Tienes {props.saldo} de saldo.</span>
            </span>
          </label>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 border-t border-piedra-200 pt-4">
          <BotonConfirmar />
          <Link
            href={`/reservar/${props.slugDeporte}?dia=${props.day}`}
            className="text-sm font-semibold text-marca-700 underline underline-offset-2"
          >
            Elegir otro hueco
          </Link>
        </div>
      </form>
    </Tarjeta>
  );
}
