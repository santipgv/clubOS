"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { cambiarPassword, type EstadoPassword } from "./acciones";
import { Aviso, Boton, Campo, INPUT_CLASS, Tarjeta } from "@/components/ui";

function Enviar({ tienePassword }: { tienePassword: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Boton type="submit" disabled={pending}>
      {pending ? "Guardando…" : tienePassword ? "Cambiar contraseña" : "Elegir contraseña"}
    </Boton>
  );
}

function Error({ mensaje }: { mensaje?: string }) {
  if (!mensaje) return null;
  return <p className="mt-1 text-sm font-medium text-granate-600">{mensaje}</p>;
}

export function CambioPassword({ tienePassword }: { tienePassword: boolean }) {
  const [estado, accion] = useActionState<EstadoPassword, FormData>(cambiarPassword, {});

  return (
    <Tarjeta className="p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-marca-600">
        {tienePassword ? "Cambiar contraseña" : "Elegir contraseña"}
      </h2>
      <p className="mt-2 text-sm text-marca-600">
        {tienePassword
          ? "Al cambiarla se cerrarán las sesiones abiertas en otros dispositivos."
          : "Todavia no tienes contraseña: entras con enlace por correo. Elige una y podrás acceder directamente."}
      </p>

      <form action={accion} className="mt-4 space-y-4">
        {tienePassword ? (
          <div>
            <Campo etiqueta="Contraseña actual">
              <input name="passwordActual" type="password" autoComplete="current-password" className={INPUT_CLASS} />
            </Campo>
            <Error mensaje={estado.errores?.passwordActual} />
          </div>
        ) : null}

        <div>
          <Campo etiqueta="Nueva contraseña" ayuda="Al menos 10 caracteres.">
            <input name="password" type="password" required autoComplete="new-password" className={INPUT_CLASS} />
          </Campo>
          <Error mensaje={estado.errores?.password} />
        </div>

        <div>
          <Campo etiqueta="Repite la nueva contraseña">
            <input name="passwordRepeat" type="password" required autoComplete="new-password" className={INPUT_CLASS} />
          </Campo>
          <Error mensaje={estado.errores?.passwordRepeat} />
        </div>

        <Enviar tienePassword={tienePassword} />

        {estado.error ? <Aviso tipo="error">{estado.error}</Aviso> : null}
        {estado.ok ? <Aviso tipo="exito">{estado.ok}</Aviso> : null}
      </form>
    </Tarjeta>
  );
}
