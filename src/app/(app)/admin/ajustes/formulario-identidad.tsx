"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { guardarIdentidad, type EstadoIdentidad } from "./acciones-identidad";
import { Aviso, Boton, Campo, INPUT_CLASS, Tarjeta } from "@/components/ui";
import type { IdentidadClub } from "@/lib/club";

function Enviar() {
  const { pending } = useFormStatus();
  return <Boton type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar identidad"}</Boton>;
}

function Color({ nombre, etiqueta, ayuda, valor }: { nombre: string; etiqueta: string; ayuda: string; valor: string }) {
  const [color, setColor] = useState(valor);
  return (
    <Campo etiqueta={etiqueta} ayuda={ayuda}>
      <div className="flex items-center gap-3">
        <input
          type="color"
          aria-label={`${etiqueta}, selector`}
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="h-10 w-14 cursor-pointer rounded border border-piedra-300 bg-white p-1"
        />
        <input
          name={nombre}
          value={color}
          onChange={(e) => setColor(e.target.value)}
          pattern="#[0-9a-fA-F]{6}"
          className={`${INPUT_CLASS} font-mono`}
        />
      </div>
    </Campo>
  );
}

export function FormularioIdentidad({ identidad }: { identidad: IdentidadClub }) {
  const [estado, accion] = useActionState<EstadoIdentidad, FormData>(guardarIdentidad, {});

  return (
    <Tarjeta className="p-6">
      <h2 className="mb-1 text-lg font-bold text-marca-900">Identidad del club</h2>
      <p className="mb-5 text-sm text-marca-600">
        Nombre, logotipo y colores que ven los socios en la aplicación y en los correos.
      </p>

      <form action={accion} className="space-y-4">
        <Campo etiqueta="Nombre del club" obligatorio>
          <input name="club.nombre" defaultValue={identidad["club.nombre"]} required maxLength={80} className={INPUT_CLASS} />
        </Campo>
        <Campo etiqueta="Nombre corto" ayuda="Para la cabecera y el título de la pestaña. Vacío: el nombre completo.">
          <input name="club.nombreCorto" defaultValue={identidad["club.nombreCorto"] === identidad["club.nombre"] ? "" : identidad["club.nombreCorto"]} maxLength={30} className={INPUT_CLASS} />
        </Campo>
        <Campo etiqueta="Lema" ayuda="Una línea que describe la aplicación.">
          <input name="club.lema" defaultValue={identidad["club.lema"]} maxLength={120} className={INPUT_CLASS} />
        </Campo>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Localidad" ayuda="Valor por defecto en el alta de socios.">
            <input name="club.localidad" defaultValue={identidad["club.localidad"]} maxLength={80} className={INPUT_CLASS} />
          </Campo>
          <Campo etiqueta="Provincia">
            <input name="club.provincia" defaultValue={identidad["club.provincia"]} maxLength={80} className={INPUT_CLASS} />
          </Campo>
        </div>
        <Campo etiqueta="Correo de contacto" ayuda="Aparece al pie de los correos que envía la aplicación.">
          <input type="email" name="club.emailContacto" defaultValue={identidad["club.emailContacto"]} maxLength={120} className={INPUT_CLASS} />
        </Campo>

        <div className="grid gap-4 sm:grid-cols-2">
          <Color
            nombre="club.colorMarca"
            etiqueta="Color principal"
            ayuda="Botones y cabeceras. Debe ser oscuro: lleva texto blanco encima."
            valor={identidad["club.colorMarca"]}
          />
          <Color
            nombre="club.colorAcento"
            etiqueta="Color de acento"
            ayuda="Insignias y eventos. Puede ser claro."
            valor={identidad["club.colorAcento"]}
          />
        </div>

        <Campo etiqueta="Logotipo" ayuda="PNG, JPG, WebP o SVG de hasta 150 KB. Mejor horizontal y con fondo transparente.">
          <div className="space-y-2">
            {identidad["club.logo"] ? (
              // eslint-disable-next-line @next/next/no-img-element -- data URL guardada en Ajustes
              <img src={identidad["club.logo"]} alt="Logotipo actual" className="h-12 w-auto rounded border border-piedra-200 bg-white p-1" />
            ) : null}
            <input type="file" name="logo" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="block text-sm" />
            {identidad["club.logo"] ? (
              <label className="flex items-center gap-2 text-sm text-marca-700">
                <input type="checkbox" name="quitarLogo" /> Quitar el logotipo y mostrar el nombre
              </label>
            ) : null}
          </div>
        </Campo>

        <div className="border-t border-piedra-200 pt-4">
          <Enviar />
        </div>

        {estado.error ? <Aviso tipo="error">{estado.error}</Aviso> : null}
        {estado.ok ? <Aviso tipo="exito">{estado.ok}</Aviso> : null}
      </form>
    </Tarjeta>
  );
}
