"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { crearSocioManual, type EstadoSocio } from "./acciones";
import { Aviso, Boton, Campo, INPUT_CLASS, Seccion, Tarjeta } from "@/components/ui";

function Enviar({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return (
    <Boton type="submit" tamano="sm" disabled={pending}>
      {pending ? "…" : children}
    </Boton>
  );
}

/** Alta desde secretaría: para quien no se da de alta por internet. */
export function AltaManual() {
  const [estado, accion] = useActionState<EstadoSocio, FormData>(crearSocioManual, {});

  return (
    <section>
      <Seccion>Alta desde secretaría</Seccion>
      <Tarjeta className="p-5">
        <form action={accion} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
          <Campo etiqueta="Nombre" obligatorio>
            <input name="firstName" required className={INPUT_CLASS} />
          </Campo>
          <Campo etiqueta="Apellidos" obligatorio>
            <input name="lastName" required className={INPUT_CLASS} />
          </Campo>
          <Campo etiqueta="Correo" obligatorio>
            <input name="email" type="email" required className={INPUT_CLASS} />
          </Campo>
          <Campo etiqueta="Relación">
            <select name="relationship" defaultValue="SOCIO" className={INPUT_CLASS}>
              <option value="SOCIO">Socio</option>
              <option value="EMPLEADO">Empleado</option>
              <option value="COLABORADOR">Colaborador</option>
              <option value="INVITADO">Invitado</option>
            </select>
          </Campo>
          <Enviar>Dar de alta</Enviar>
        </form>

        <p className="mt-3 text-xs text-piedra-400">
          Se crea la ficha activa y se le envia un enlace para que entre y elija contraseña. El
          resto de datos se completan luego desde su ficha.
        </p>

        {estado.error ? <div className="mt-3"><Aviso tipo="error">{estado.error}</Aviso></div> : null}
        {estado.ok ? <div className="mt-3"><Aviso tipo="exito">{estado.ok}</Aviso></div> : null}
      </Tarjeta>
    </section>
  );
}
