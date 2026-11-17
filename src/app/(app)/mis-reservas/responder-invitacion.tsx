"use client";

import { useActionState } from "react";
import { anularSalida, responderInvitacion, type EstadoSalida } from "../reservar/golf/acciones";
import { Boton } from "@/components/ui";

export function ResponderInvitacion({ bookingId }: { bookingId: string }) {
  const [aceptar, accionAceptar, aceptando] = useActionState<EstadoSalida, FormData>(responderInvitacion, {});
  const [rechazar, accionRechazar, rechazando] = useActionState<EstadoSalida, FormData>(anularSalida, {});
  const pending = aceptando || rechazando;
  const error = aceptar.error ?? rechazar.error;
  return (
    <form className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="bookingId" value={bookingId} />
      <Boton type="submit" formAction={accionAceptar} tamano="sm" disabled={pending}>
        {aceptando ? "Aceptando…" : "Aceptar"}
      </Boton>
      <Boton type="submit" formAction={accionRechazar} tamano="sm" variante="secundario" disabled={pending}>
        {rechazando ? "Rechazando…" : "Rechazar"}
      </Boton>
      {error ? <p role="alert" className="text-xs font-semibold text-granate-600">{error}</p> : null}
    </form>
  );
}
