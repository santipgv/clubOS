"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { cambiarDatosBancarios, type EstadoBanco } from "./acciones";
import { Aviso, Boton, Campo, INPUT_CLASS, Seccion, Tarjeta } from "@/components/ui";

function Enviar() {
  const { pending } = useFormStatus();
  return <Boton type="submit" tamano="sm" disabled={pending}>{pending ? "Guardando…" : "Guardar cuenta"}</Boton>;
}

export function DatosBancarios({
  ibanEnmascarado,
  titular,
}: {
  ibanEnmascarado: string | null;
  titular: string | null;
}) {
  const [estado, accion] = useActionState<EstadoBanco, FormData>(cambiarDatosBancarios, {});
  const [editando, setEditando] = useState(false);

  return (
    <Tarjeta className="p-6">
      <Seccion
        accion={
          !editando ? (
            <Boton variante="fantasma" tamano="sm" onClick={() => setEditando(true)}>
              {ibanEnmascarado ? "Cambiar" : "Añadir"}
            </Boton>
          ) : null
        }
      >
        Domiciliación de la cuota
      </Seccion>

      {!editando ? (
        <dl className="space-y-1">
          <div className="flex items-baseline justify-between gap-4 py-2">
            <dt className="text-sm text-piedra-500">Cuenta</dt>
            <dd className="font-mono text-sm font-bold text-marca-900">
              {ibanEnmascarado ?? "Sin domiciliar"}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 py-2">
            <dt className="text-sm text-piedra-500">Titular</dt>
            <dd className="text-sm font-bold text-marca-900">{titular ?? "—"}</dd>
          </div>
          <p className="pt-3 text-xs leading-relaxed text-piedra-400">
            Tu numero de cuenta se guarda cifrado. Ni en esta pantalla ni en la ficha que ve el
            club se muestra completo.
          </p>
        </dl>
      ) : (
        <form action={accion} className="space-y-4">
          <div>
            <Campo etiqueta="IBAN" obligatorio ayuda="Ejemplo: ES91 2100 0418 4502 0005 1332">
              <input name="iban" autoComplete="off" spellCheck={false} className={INPUT_CLASS} />
            </Campo>
            {estado.errores?.iban ? (
              <p className="mt-1 text-sm font-bold text-granate-500">{estado.errores.iban}</p>
            ) : null}
          </div>

          <div>
            <Campo etiqueta="Titular de la cuenta" obligatorio>
              <input name="accountHolder" defaultValue={titular ?? ""} className={INPUT_CLASS} />
            </Campo>
            {estado.errores?.accountHolder ? (
              <p className="mt-1 text-sm font-bold text-granate-500">{estado.errores.accountHolder}</p>
            ) : null}
          </div>

          <div>
            <Campo etiqueta="Tu contraseña" obligatorio ayuda="Para confirmar que eres tu quien cambia la cuenta.">
              <input name="password" type="password" autoComplete="current-password" className={INPUT_CLASS} />
            </Campo>
            {estado.errores?.password ? (
              <p className="mt-1 text-sm font-bold text-granate-500">{estado.errores.password}</p>
            ) : null}
          </div>

          <div className="flex items-center gap-3 border-t border-piedra-200 pt-4">
            <Enviar />
            <Boton type="button" variante="secundario" tamano="sm" onClick={() => setEditando(false)}>
              Cancelar
            </Boton>
          </div>

          {estado.error ? <Aviso tipo="error">{estado.error}</Aviso> : null}
        </form>
      )}

      {estado.ok ? <div className="mt-3"><Aviso tipo="exito">{estado.ok}</Aviso></div> : null}
    </Tarjeta>
  );
}
