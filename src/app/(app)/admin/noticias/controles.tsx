"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { crearNoticia, alternarPublicacion, eliminarNoticia, type EstadoNoticia } from "./acciones";
import { Aviso, Boton, Campo, INPUT_CLASS, Seccion, Tarjeta } from "@/components/ui";

function Enviar({ children, variante = "primario" }: { children: string; variante?: "primario" | "secundario" | "peligro" }) {
  const { pending } = useFormStatus();
  return (
    <Boton type="submit" tamano="sm" variante={variante} disabled={pending}>
      {pending ? "…" : children}
    </Boton>
  );
}

export function NuevaNoticia() {
  const [estado, accion] = useActionState<EstadoNoticia, FormData>(crearNoticia, {});

  return (
    <Tarjeta className="p-5">
      <Seccion>Nueva publicación</Seccion>

      <form action={accion} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <Campo etiqueta="Título" obligatorio>
              <input name="title" required maxLength={140} className={INPUT_CLASS} placeholder="Torneo Social de Pádel 2026" />
            </Campo>
          </div>
          <Campo etiqueta="Tipo">
            <select name="category" defaultValue="NOTICIA" className={INPUT_CLASS}>
              <option value="NOTICIA">Noticia</option>
              <option value="EVENTO">Evento</option>
              <option value="AVISO">Aviso</option>
            </select>
          </Campo>
        </div>

        <Campo etiqueta="Resumen" ayuda="Una línea. Es lo que se lee en el tablon sin abrir la noticia.">
          <input name="excerpt" maxLength={280} className={INPUT_CLASS} />
        </Campo>

        <Campo etiqueta="Contenido" obligatorio>
          <textarea name="body" required rows={5} maxLength={8000} className={INPUT_CLASS} />
        </Campo>

        <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
          <Campo etiqueta="Fecha del evento" ayuda="Solo si es un evento.">
            <input type="date" name="eventDate" className={INPUT_CLASS} />
          </Campo>
          <label className="flex items-center gap-2 pb-3 text-sm text-marca-800">
            <input type="checkbox" name="isPinned" className="size-4 accent-[var(--color-marca-700)]" />
            Fijar arriba del tablon
          </label>
          <label className="flex items-center gap-2 pb-3 text-sm text-marca-800">
            <input type="checkbox" name="publicar" defaultChecked className="size-4 accent-[var(--color-marca-700)]" />
            Publicar ahora
          </label>
        </div>

        <div className="border-t border-piedra-200 pt-4">
          <Enviar>Guardar publicación</Enviar>
        </div>

        {estado.error ? <Aviso tipo="error">{estado.error}</Aviso> : null}
        {estado.ok ? <Aviso tipo="exito">{estado.ok}</Aviso> : null}
      </form>
    </Tarjeta>
  );
}

export function ControlesNoticia({ id, publicada }: { id: string; publicada: boolean }) {
  const [estadoPub, accionPub] = useActionState<EstadoNoticia, FormData>(alternarPublicacion, {});
  const [estadoDel, accionDel] = useActionState<EstadoNoticia, FormData>(eliminarNoticia, {});
  const mensaje = estadoPub.error ?? estadoDel.error;

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        <form action={accionPub}>
          <input type="hidden" name="id" value={id} />
          <Enviar variante="secundario">{publicada ? "Retirar" : "Publicar"}</Enviar>
        </form>
        <form
          action={accionDel}
          onSubmit={(e) => {
            if (!confirm("¿Eliminar esta publicación?")) e.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={id} />
          <Enviar variante="peligro">Eliminar</Enviar>
        </form>
      </div>
      {mensaje ? <p className="text-xs font-bold text-granate-500">{mensaje}</p> : null}
    </div>
  );
}


/**
 * Quien recibe la cadena de correos del club.
 *
 * No hay botón de "suscribir a todos": el consentimiento lo da cada socio, no
 * se le puede apuntar desde aquí. Lo que si hace falta es poder copiar las
 * direcciones para enviar desde el gestor de correo del club.
 */
export function Suscriptores({
  suscriptores,
  total,
}: {
  suscriptores: Array<{ id: string; nombre: string; email: string }>;
  total: number;
}) {
  const [copiado, setCopiado] = useState(false);
  const [visible, setVisible] = useState(false);

  async function copiar() {
    await navigator.clipboard.writeText(suscriptores.map((s) => s.email).join(", "));
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  }

  return (
    <Tarjeta className="p-5">
      <Seccion
        accion={
          <span className="text-xs text-piedra-400">
            {suscriptores.length} de {total} socios activos
          </span>
        }
      >
        Cadena de correos
      </Seccion>

      <p className="text-sm text-piedra-500">
        Solo aparecen quienes lo han activado en su perfil. Cada correo que envies debe llevar el
        enlace de baja: <code className="rounded bg-piedra-100 px-1 text-xs">/baja-boletin?token=…</code>
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Boton variante="secundario" tamano="sm" onClick={() => setVisible((v) => !v)}>
          {visible ? "Ocultar lista" : "Ver lista"}
        </Boton>
        {suscriptores.length > 0 ? (
          <Boton variante="secundario" tamano="sm" onClick={copiar}>
            {copiado ? "Copiadas ✓" : "Copiar direcciones"}
          </Boton>
        ) : null}
      </div>

      {visible ? (
        suscriptores.length === 0 ? (
          <p className="mt-4 text-sm text-piedra-500">Nadie se ha suscrito todavia.</p>
        ) : (
          <ul className="mt-4 max-h-64 divide-y divide-piedra-100 overflow-auto text-sm">
            {suscriptores.map((s) => (
              <li key={s.id} className="flex justify-between gap-3 py-2">
                <span className="font-bold text-marca-900">{s.nombre}</span>
                <span className="text-piedra-500">{s.email}</span>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </Tarjeta>
  );
}
