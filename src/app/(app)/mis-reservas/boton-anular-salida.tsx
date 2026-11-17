"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { anularSalida, type EstadoSalida } from "../reservar/golf/acciones";
import { Boton } from "@/components/ui";

function Enviar() {
  const { pending } = useFormStatus();
  return (
    <Boton
      type="submit"
      variante="secundario"
      tamano="sm"
      disabled={pending}
      onClick={(e) => {
        if (!confirm("¿Anular esta salida? Las plazas vuelven a quedar libres.")) {
          e.preventDefault();
        }
      }}
    >
      {pending ? "Anulando…" : "Anular"}
    </Boton>
  );
}

export function BotonAnularSalida({ bookingId }: { bookingId: string }) {
  const [estado, accion] = useActionState<EstadoSalida, FormData>(anularSalida, {});

  return (
    <form action={accion} className="text-right">
      <input type="hidden" name="bookingId" value={bookingId} />
      <Enviar />
      {estado.error ? <p className="mt-1 text-xs font-bold text-granate-500">{estado.error}</p> : null}
      {estado.ok ? <p className="mt-1 text-xs font-bold text-marca-700">{estado.ok}</p> : null}
    </form>
  );
}
