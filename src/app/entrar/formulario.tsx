"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { entrarConContrasena, type EstadoAcceso } from "./acciones";
import { Aviso, Boton, Campo, INPUT_CLASS, Tarjeta } from "@/components/ui";

function BotonEntrar() {
  const { pending } = useFormStatus();
  return (
    <Boton type="submit" tamano="lg" className="w-full" disabled={pending}>
      {pending ? "Entrando…" : "Entrar"}
    </Boton>
  );
}

export function FormularioAcceso({ mensajeError }: { mensajeError?: string }) {
  const [estado, accion] = useActionState<EstadoAcceso, FormData>(entrarConContrasena, {});

  return (
    <Tarjeta className="p-6">
      <form action={accion} className="space-y-4" noValidate>
        {mensajeError ? <Aviso tipo="error">{mensajeError}</Aviso> : null}
        {estado.mensaje ? <Aviso tipo="error">{estado.mensaje}</Aviso> : null}

        <div>
          <Campo etiqueta="Correo electrónico">
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              autoFocus
              inputMode="email"
              placeholder="socio@ejemplo.com"
              className={INPUT_CLASS}
              aria-invalid={Boolean(estado.errores?.email)}
            />
          </Campo>
          {estado.errores?.email ? (
            <p className="mt-1 text-sm font-medium text-granate-600">{estado.errores.email}</p>
          ) : null}
        </div>

        <div>
          <Campo etiqueta="Contraseña">
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className={INPUT_CLASS}
              aria-invalid={Boolean(estado.errores?.password)}
            />
          </Campo>
          {estado.errores?.password ? (
            <p className="mt-1 text-sm font-medium text-granate-600">{estado.errores.password}</p>
          ) : null}
        </div>

        <BotonEntrar />
      </form>

      <div className="mt-5 border-t border-piedra-200 pt-4 text-center text-sm">
        <Link href="/entrar/enlace" className="font-semibold text-marca-700 underline underline-offset-2">
          Entrar con un enlace por correo
        </Link>
        <p className="mt-1 text-xs text-marca-500">
          Útil si has olvidado la contraseña o aún no has elegido ninguna.
        </p>
      </div>
    </Tarjeta>
  );
}
