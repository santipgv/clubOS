"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { pagarConMonedero, type EstadoPago } from "./acciones";
import { Boton } from "@/components/ui";

function Enviar() {
  const { pending } = useFormStatus();
  return (
    <Boton type="submit" tamano="sm" disabled={pending}>
      {pending ? "Pagando…" : "Pagar con monedero"}
    </Boton>
  );
}

export function BotonPagarMonedero({ bookingId }: { bookingId: string }) {
  const [estado, accion] = useActionState<EstadoPago, FormData>(pagarConMonedero, {});

  return (
    <form action={accion} className="text-right">
      <input type="hidden" name="bookingId" value={bookingId} />
      <Enviar />
      {estado.error ? <p className="mt-1 max-w-56 text-xs font-medium text-granate-600">{estado.error}</p> : null}
    </form>
  );
}
