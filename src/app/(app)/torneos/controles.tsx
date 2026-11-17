"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { anularMiInscripcion, inscribirme, type EstadoInscripcion } from "./acciones";
import { Aviso, Boton, Campo, Etiqueta, INPUT_CLASS, Tarjeta } from "@/components/ui";

type Torneo = {
  id: string;
  nombre: string;
  descripcion: string | null;
  deporte: string;
  fechas: string;
  plazo: string;
  admiteInvitados: boolean;
  precioSocio: string;
  precioInvitado: string;
  fiscalSocio: string;
  fiscalInvitado: string;
  inscritos: number;
  plazas: number;
  libres: number | null;
  enPlazo: boolean;
  estado: string;
};

type MiInscripcion = { id: string; nombre: string; esInvitado: boolean; enEspera: boolean };

function Enviar({ children, variante = "primario" }: { children: string; variante?: "primario" | "secundario" }) {
  const { pending } = useFormStatus();
  return (
    <Boton type="submit" variante={variante} disabled={pending}>
      {pending ? "…" : children}
    </Boton>
  );
}

export function FichaTorneo({
  torneo,
  misInscripciones,
}: {
  torneo: Torneo;
  misInscripciones: MiInscripcion[];
}) {
  const [inscripcion, accionInscribir] = useActionState<EstadoInscripcion, FormData>(inscribirme, {});
  const [anulacion, accionAnular] = useActionState<EstadoInscripcion, FormData>(anularMiInscripcion, {});
  const [traeInvitado, setTraeInvitado] = useState(false);

  const yaVoy = misInscripciones.some((i) => !i.esInvitado);
  const completo = torneo.libres === 0;

  return (
    <Tarjeta className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Etiqueta tono="oro">{torneo.deporte}</Etiqueta>
            {torneo.estado === "FINISHED" ? <Etiqueta tono="gris">Disputado</Etiqueta> : null}
            {torneo.estado === "CLOSED" ? <Etiqueta tono="gris">Inscripciones cerradas</Etiqueta> : null}
            {torneo.admiteInvitados ? (
              <Etiqueta tono="neutro">Socios e invitados</Etiqueta>
            ) : (
              <Etiqueta tono="neutro">Solo socios</Etiqueta>
            )}
          </div>

          <h2 className="mt-2 text-xl font-bold text-marca-900">{torneo.nombre}</h2>
          <p className="mt-1 text-sm text-piedra-500">{torneo.fechas}</p>
          {torneo.descripcion ? (
            <p className="mt-2 max-w-prose text-sm leading-relaxed text-piedra-500">{torneo.descripcion}</p>
          ) : null}

          <dl className="mt-4 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <div className="flex justify-between gap-4 border-b border-piedra-100 py-1.5">
              <dt className="text-piedra-500">Inscripcion socio</dt>
              <dd className="font-bold text-marca-900">{torneo.precioSocio}</dd>
            </div>
            {torneo.admiteInvitados ? (
              <div className="flex justify-between gap-4 border-b border-piedra-100 py-1.5">
                <dt className="text-piedra-500">Inscripcion invitado</dt>
                <dd className="font-bold text-marca-900">{torneo.precioInvitado}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-4 border-b border-piedra-100 py-1.5">
              <dt className="text-piedra-500">Plazas</dt>
              <dd className="font-bold text-marca-900">
                {torneo.plazas === 0
                  ? `${torneo.inscritos} inscritos, sin límite`
                  : `${torneo.inscritos} de ${torneo.plazas}`}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-piedra-100 py-1.5">
              <dt className="text-piedra-500">Plazo</dt>
              <dd className="text-right text-xs font-bold text-marca-900">{torneo.plazo}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-piedra-400">
            {torneo.fiscalSocio}
            {torneo.admiteInvitados ? ` · invitados: ${torneo.fiscalInvitado}` : ""}
          </p>
        </div>
      </div>

      {misInscripciones.length > 0 ? (
        <div className="mt-5 rounded-md border border-marca-200 bg-marca-50 p-4">
          <p className="text-sm font-bold text-marca-800">Tus inscripciones en este torneo</p>
          <ul className="mt-2 space-y-2">
            {misInscripciones.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-marca-900">
                  {i.nombre}
                  {i.esInvitado ? <span className="ml-1 text-xs text-piedra-500">(invitado)</span> : null}
                  {i.enEspera ? <Etiqueta tono="ambar" className="ml-2">Lista de espera</Etiqueta> : null}
                </span>
                <form
                  action={accionAnular}
                  onSubmit={(e) => {
                    if (!confirm("¿Anular esta inscripción?")) e.preventDefault();
                  }}
                >
                  <input type="hidden" name="registrationId" value={i.id} />
                  <Boton type="submit" variante="secundario" tamano="sm">Anular</Boton>
                </form>
              </li>
            ))}
          </ul>
          {anulacion.error ? <p className="mt-2 text-xs font-bold text-granate-500">{anulacion.error}</p> : null}
          {anulacion.ok ? <p className="mt-2 text-xs font-bold text-marca-700">{anulacion.ok}</p> : null}
        </div>
      ) : null}

      {torneo.enPlazo ? (
        <form action={accionInscribir} className="mt-5 space-y-4 border-t border-piedra-200 pt-5">
          <input type="hidden" name="tournamentId" value={torneo.id} />

          {completo ? (
            <Aviso tipo="info">
              Las plazas están completas. Puedes apuntarte igualmente: entrarás en lista de espera.
            </Aviso>
          ) : null}

          {torneo.admiteInvitados ? (
            <label className="flex items-start gap-3 text-sm text-marca-800">
              <input
                type="checkbox"
                name="esInvitado"
                checked={traeInvitado}
                onChange={(e) => setTraeInvitado(e.target.checked)}
                className="mt-1 size-4 accent-[var(--color-marca-700)]"
              />
              <span>
                Esta inscripción es para un invitado que traigo yo
                <span className="block text-xs text-piedra-400">
                  Se aplica la tarifa de invitado ({torneo.precioInvitado}) y {torneo.fiscalInvitado.toLowerCase()}.
                </span>
              </span>
            </label>
          ) : null}

          {traeInvitado ? (
            <Campo etiqueta="Nombre y apellidos del invitado" obligatorio>
              <input name="nombreInvitado" className={INPUT_CLASS} />
            </Campo>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Enviar variante={yaVoy && !traeInvitado ? "secundario" : "primario"}>
              {traeInvitado
                ? "Inscribir a mi invitado"
                : yaVoy
                  ? "Ya estás inscrito"
                  : completo
                    ? "Apuntarme a la lista de espera"
                    : "Inscribirme"}
            </Enviar>
            {yaVoy && !traeInvitado ? (
              <span className="text-xs text-piedra-400">
                Ya tienes tu plaza. Marca la casilla si quieres inscribir a un invitado.
              </span>
            ) : null}
          </div>

          {inscripcion.error ? <Aviso tipo="error">{inscripcion.error}</Aviso> : null}
          {inscripcion.ok ? <Aviso tipo="exito">{inscripcion.ok}</Aviso> : null}
        </form>
      ) : (
        <p className="mt-5 border-t border-piedra-200 pt-4 text-sm text-piedra-500">
          {torneo.estado === "FINISHED"
            ? "Este torneo ya se ha disputado."
            : "Las inscripciones no están abiertas en este momento."}
        </p>
      )}
    </Tarjeta>
  );
}
