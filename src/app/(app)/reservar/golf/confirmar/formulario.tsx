"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { confirmarSalida, type EstadoSalida } from "../acciones";
import { formatEuros } from "@/lib/booking/pricing";
import { Aviso, Boton, Campo, INPUT_CLASS, Tarjeta } from "@/components/ui";

function BotonConfirmar({ seUne }: { seUne: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Boton type="submit" tamano="lg" disabled={pending} className="w-full sm:w-auto">
      {pending ? "Reservando…" : seUne ? "Unirme a la salida" : "Confirmar salida"}
    </Boton>
  );
}

export function FormularioSalida(props: {
  courseId: string;
  day: string;
  startMinute: number;
  hora: string;
  libres: number;
  jugadoresActual: number;
  buggiesDisponibles: boolean;
  precioSocio: number;
  precioInvitado: number;
  precioBuggy: number;
  yaOcupadas: number;
}) {
  const [estado, accion] = useActionState<EstadoSalida, FormData>(confirmarSalida, {});
  const [jugadores, setJugadores] = useState(props.jugadoresActual);
  const [invitados, setInvitados] = useState(0);
  const [buggies, setBuggies] = useState(0);
  const [sociosInvitados, setSociosInvitados] = useState(0);
  const [pago, setPago] = useState<"SEPARATE" | "HOST">("SEPARATE");
  const maxInvitados = jugadores - sociosInvitados - 1;
  const total = (jugadores - invitados) * props.precioSocio + invitados * props.precioInvitado + buggies * props.precioBuggy;
  const separado = sociosInvitados > 0 && pago === "SEPARATE";
  const importeTitular = total - (separado ? sociosInvitados * props.precioSocio : 0);

  return (
    <Tarjeta className="p-6">
      <form action={accion} className="space-y-5">
        <input type="hidden" name="courseId" value={props.courseId} />
        <input type="hidden" name="day" value={props.day} />
        <input type="hidden" name="startMinute" value={props.startMinute} />

        {estado.error ? <Aviso tipo="error">{estado.error}</Aviso> : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            etiqueta="Jugadores"
            obligatorio
            ayuda={`Quedan ${props.libres} plazas en la salida de las ${props.hora}.`}
          >
            <select
              name="players"
              value={jugadores}
              onChange={(e) => {
                const n = Number(e.target.value);
                setJugadores(n);
                const socios = Math.min(sociosInvitados, n - 1);
                setSociosInvitados(socios);
                setInvitados(Math.min(invitados, n - socios - 1));
              }}
              className={INPUT_CLASS}
            >
              {Array.from({ length: props.libres }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? "jugador" : "jugadores"}
                </option>
              ))}
            </select>
          </Campo>

          <Campo
            etiqueta="De ellos, invitados no socios"
            ayuda={`Tarifa de invitado: ${formatEuros(props.precioInvitado)} por jugador.`}
          >
            <select
              name="guestCount"
              value={invitados}
              onChange={(e) => setInvitados(Number(e.target.value))}
              className={INPUT_CLASS}
            >
              {Array.from({ length: maxInvitados + 1 }, (_, i) => i).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </Campo>
        </div>

        {props.libres >= 2 ? (
          <fieldset className="space-y-3 border-t border-piedra-200 pt-4">
            <legend className="sr-only">Invitar a socios</legend>
            <Campo etiqueta="Socios que quieres invitar" ayuda="Puedes invitar hasta tres. Cada plaza se aparta hasta que el socio responda en Mis reservas.">
              <select className={INPUT_CLASS} value={sociosInvitados} onChange={(e) => {
                const socios = Number(e.target.value);
                const plazas = Math.max(jugadores, socios + 1);
                setSociosInvitados(socios);
                setJugadores(plazas);
                setInvitados(Math.min(invitados, plazas - socios - 1));
              }}>
                <option value={0}>Ninguno</option>
                {Array.from({ length: Math.min(3, props.libres - 1) }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>{n} {n === 1 ? "socio" : "socios"}</option>
                ))}
              </select>
            </Campo>
            {sociosInvitados > 0 ? (
              <>
                {Array.from({ length: sociosInvitados }, (_, i) => (
                  <Campo key={i} etiqueta={`Número de socio ${i + 1}`} obligatorio>
                    <input name="inviteMemberNumber" className={INPUT_CLASS} maxLength={40} required />
                  </Campo>
                ))}
                <Campo etiqueta="Quién paga">
                  <select name="invitePayment" className={INPUT_CLASS} value={pago}
                    onChange={(e) => setPago(e.target.value === "HOST" ? "HOST" : "SEPARATE")}>
                    <option value="SEPARATE">Cada socio paga su plaza</option>
                    <option value="HOST">Yo pago toda la reserva</option>
                  </select>
                </Campo>
              </>
            ) : null}
          </fieldset>
        ) : null}

        {props.buggiesDisponibles ? (
          <Campo etiqueta="Buggies" ayuda={`${formatEuros(props.precioBuggy)} por buggy y salida.`}>
            <select name="buggies" value={buggies} onChange={(e) => setBuggies(Number(e.target.value))} className={INPUT_CLASS}>
              {[0, 1, 2].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </Campo>
        ) : (
          <input type="hidden" name="buggies" value={0} />
        )}

        <Campo
          etiqueta="Nombres de los jugadores (opcional)"
          ayuda="Separa los nombres con comas. Ayuda al personal de campo a organizar las salidas."
        >
          <input name="playerNames" className={INPUT_CLASS} placeholder="Ana Rivas, Luis Peral" />
        </Campo>

        <div className="space-y-1 border-t border-piedra-200 pt-4 text-sm text-marca-900" aria-live="polite">
          <p><strong>Tu importe: {formatEuros(importeTitular)}</strong>{sociosInvitados > 0 && !separado ? " si aceptan todas las invitaciones" : ""}</p>
          {separado ? <p>Cada socio invitado paga {formatEuros(props.precioSocio)} por su plaza.</p> : null}
          {separado && (buggies > 0 || invitados > 0) ? <p className="text-piedra-500">Los buggies y las plazas de no socios quedan a tu cargo.</p> : null}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-piedra-200 pt-4">
          <BotonConfirmar seUne={props.yaOcupadas > 0} />
          <Link
            href={`/reservar/golf?campo=${props.courseId}&dia=${props.day}`}
            className="text-sm font-bold text-marca-700 underline underline-offset-2"
          >
            Elegir otra salida
          </Link>
        </div>
      </form>
    </Tarjeta>
  );
}
