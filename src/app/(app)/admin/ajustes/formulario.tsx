"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { guardarAjustes, type EstadoAjustes } from "./acciones";
import { Aviso, Boton, Campo, INPUT_CLASS, Tarjeta } from "@/components/ui";
import type { ClubSettings } from "@/lib/settings";

function Enviar() {
  const { pending } = useFormStatus();
  return <Boton type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar ajustes"}</Boton>;
}

export function FormularioAjustes({
  settings,
  etiquetas,
}: {
  settings: ClubSettings;
  etiquetas: Record<string, string>;
}) {
  const [estado, accion] = useActionState<EstadoAjustes, FormData>(guardarAjustes, {});

  return (
    <Tarjeta className="p-6">
      <form action={accion} className="space-y-4">
        {(Object.keys(settings) as Array<keyof ClubSettings>).map((key) => (
          <Campo key={key} etiqueta={etiquetas[key] ?? key} ayuda={key}>
            <input name={key} type="number" defaultValue={settings[key]} className={INPUT_CLASS} />
          </Campo>
        ))}

        <div className="border-t border-piedra-200 pt-4">
          <Enviar />
        </div>

        {estado.error ? <Aviso tipo="error">{estado.error}</Aviso> : null}
        {estado.ok ? <Aviso tipo="exito">{estado.ok}</Aviso> : null}
      </form>
    </Tarjeta>
  );
}
