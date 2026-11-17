"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { solicitarAcceso, type EstadoAcceso } from "../acciones";
import { Aviso, Boton, Campo, INPUT_CLASS, Tarjeta } from "@/components/ui";

function BotonEnviar() {
  const { pending } = useFormStatus();
  return (
    <Boton type="submit" tamano="lg" className="w-full" disabled={pending}>
      {pending ? "Enviando…" : "Enviarme el enlace"}
    </Boton>
  );
}

export function FormularioEnlace() {
  const [estado, accion] = useActionState<EstadoAcceso, FormData>(solicitarAcceso, {});

  if (estado.ok) {
    return (
      <Tarjeta className="p-6">
        <Aviso tipo="exito">
          <p className="font-semibold">Revisa tu correo.</p>
          <p className="mt-1">
            Si esa dirección pertenece a un socio, en unos segundos recibirás un enlace de acceso.
            Caduca en 15 minutos y solo puede usarse una vez.
          </p>
        </Aviso>
      </Tarjeta>
    );
  }

  return (
    <Tarjeta className="p-6">
      <form action={accion} className="space-y-4" noValidate>
        {estado.mensaje ? <Aviso tipo="error">{estado.mensaje}</Aviso> : null}

        <Campo
          etiqueta="Correo electrónico"
          ayuda="Te enviaremos un enlace de un solo uso. Una vez dentro podrás elegir contraseña desde tu perfil."
        >
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            autoFocus
            inputMode="email"
            placeholder="socio@ejemplo.com"
            className={INPUT_CLASS}
          />
        </Campo>
        {estado.errores?.email ? (
          <p className="text-sm font-medium text-granate-600">{estado.errores.email}</p>
        ) : null}

        <BotonEnviar />
      </form>

      <div className="mt-5 border-t border-piedra-200 pt-4 text-center text-sm">
        <Link href="/entrar" className="font-semibold text-marca-700 underline underline-offset-2">
          Volver al acceso con contraseña
        </Link>
      </div>
    </Tarjeta>
  );
}
