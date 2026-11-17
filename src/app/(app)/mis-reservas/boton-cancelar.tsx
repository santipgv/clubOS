"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { cancelarMiReserva, type EstadoCancelacion } from "./acciones";
import { Boton } from "@/components/ui";

function Enviar({ aviso }: { aviso: string }) {
  const { pending } = useFormStatus();
  return (
    <Boton
      type="submit"
      variante="secundario"
      tamano="sm"
      disabled={pending}
      onClick={(e) => {
        if (!confirm(aviso)) e.preventDefault();
      }}
    >
      {pending ? "Cancelando…" : "Cancelar"}
    </Boton>
  );
}

/**
 * `importe` es lo pagado (null si no hay nada pagado). El aviso dice antes de
 * cancelar si ese dinero vuelve al monedero o no, para que nadie se lleve la
 * sorpresa despues.
 */
export function BotonCancelar({
  bookingId,
  importe,
  fueraDePlazo,
}: {
  bookingId: string;
  importe: string | null;
  fueraDePlazo: boolean;
}) {
  const [estado, accion] = useActionState<EstadoCancelacion, FormData>(cancelarMiReserva, {});

  const aviso = !importe
    ? "¿Seguro que quieres cancelar esta reserva?"
    : fueraDePlazo
      ? `Estás fuera del plazo de cancelación: los ${importe} pagados NO se devolverán a tu monedero. ¿Cancelar igualmente?`
      : `Se devolverán ${importe} a tu monedero. ¿Seguro que quieres cancelar esta reserva?`;

  return (
    <form action={accion} className="text-right">
      <input type="hidden" name="bookingId" value={bookingId} />
      <Enviar aviso={aviso} />
      {estado.error ? <p className="mt-1 text-xs font-medium text-granate-600">{estado.error}</p> : null}
    </form>
  );
}
