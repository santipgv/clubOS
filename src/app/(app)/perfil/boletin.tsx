"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { cambiarSuscripcionBoletin, type EstadoBoletin } from "./acciones";
import { Aviso, Boton, Seccion, Tarjeta } from "@/components/ui";

function Enviar({ alta }: { alta: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Boton type="submit" tamano="sm" variante={alta ? "primario" : "secundario"} disabled={pending}>
      {pending ? "Guardando…" : alta ? "Suscribirme" : "Darme de baja"}
    </Boton>
  );
}

export function Boletin({ suscrito, desde }: { suscrito: boolean; desde: string | null }) {
  const [estado, accion] = useActionState<EstadoBoletin, FormData>(cambiarSuscripcionBoletin, {});

  return (
    <Tarjeta className="p-6">
      <Seccion>Correos del club</Seccion>

      <p className="text-sm leading-relaxed text-piedra-500">
        {suscrito
          ? "Estás suscrito a la cadena de correos del club: novedades, torneos y avisos."
          : "No estás suscrito a la cadena de correos del club. Seguirás recibiendo los correos de tus reservas y cuotas, que son parte del servicio."}
      </p>
      {desde ? <p className="mt-1 text-xs text-piedra-400">Ultimo cambio: {desde}</p> : null}

      <form action={accion} className="mt-4">
        <input type="hidden" name="suscribirse" value={suscrito ? "no" : "si"} />
        <Enviar alta={!suscrito} />
      </form>

      {estado.ok ? <div className="mt-3"><Aviso tipo="exito">{estado.ok}</Aviso></div> : null}
      {estado.error ? <div className="mt-3"><Aviso tipo="error">{estado.error}</Aviso></div> : null}
    </Tarjeta>
  );
}
