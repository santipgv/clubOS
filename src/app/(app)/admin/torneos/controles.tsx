"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { cobrarInscripcion, guardarTorneo, type EstadoTorneo } from "./acciones";
import { DEPORTE_TORNEO } from "@/lib/vocabulario";
import type { TournamentSport } from "@/lib/types";
import { Aviso, Boton, Campo, Etiqueta, INPUT_CLASS, Tarjeta } from "@/components/ui";

const FISCAL = [
  { valor: "EXEMPT_SPORT", label: "Exenta (art. 20.Uno.13 LIVA)" },
  { valor: "STANDARD_21", label: "IVA 21 %" },
  { valor: "REDUCED_10", label: "IVA 10 %" },
  { valor: "NOT_SUBJECT", label: "No sujeta" },
];

export type TorneoForm = {
  id?: string;
  name: string;
  description: string | null;
  sport: TournamentSport;
  startDay: string;
  endDay: string;
  opensDay: string;
  closesDay: string;
  maxParticipants: number;
  allowGuests: boolean;
  memberEuros: string;
  guestEuros: string;
  memberTaxTreatment: string;
  guestTaxTreatment: string;
  status: string;
};

function Enviar({ children, variante = "primario" }: { children: string; variante?: "primario" | "secundario" }) {
  const { pending } = useFormStatus();
  return (
    <Boton type="submit" tamano="sm" variante={variante} disabled={pending}>
      {pending ? "…" : children}
    </Boton>
  );
}

/** `deportes` son los que puede elegir quien edita: todos para la administracion. */
export function FormularioTorneo({ inicial, deportes }: { inicial?: TorneoForm; deportes: TournamentSport[] }) {
  const [estado, accion] = useActionState<EstadoTorneo, FormData>(guardarTorneo, {});
  const [admiteInvitados, setAdmiteInvitados] = useState(inicial?.allowGuests ?? false);
  const hoy = new Date().toISOString().slice(0, 10);

  return (
    <Tarjeta className="p-5">
      <form action={accion} className="space-y-4">
        <input type="hidden" name="id" value={inicial?.id ?? ""} />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <Campo etiqueta="Nombre del torneo" obligatorio>
              <input name="name" required defaultValue={inicial?.name ?? ""} className={INPUT_CLASS} placeholder="Torneo social del club" />
            </Campo>
          </div>
          <Campo etiqueta="Deporte">
            <select name="sport" defaultValue={inicial?.sport ?? deportes[0]} className={INPUT_CLASS}>
              {deportes.map((d) => (
                <option key={d} value={d}>{DEPORTE_TORNEO[d]}</option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Estado">
            <select name="status" defaultValue={inicial?.status ?? "DRAFT"} className={INPUT_CLASS}>
              <option value="DRAFT">Borrador — no lo ven los socios</option>
              <option value="OPEN">Inscripciones abiertas</option>
              <option value="CLOSED">Inscripciones cerradas</option>
              <option value="FINISHED">Disputado</option>
              <option value="CANCELLED">Cancelado</option>
            </select>
          </Campo>
        </div>

        <Campo etiqueta="Descripción" ayuda="Categorías, formato, horarios… lo que el socio debe saber.">
          <textarea name="description" rows={3} defaultValue={inicial?.description ?? ""} className={INPUT_CLASS} />
        </Campo>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Campo etiqueta="Empieza" obligatorio>
            <input type="date" name="startDay" required defaultValue={inicial?.startDay ?? hoy} className={INPUT_CLASS} />
          </Campo>
          <Campo etiqueta="Termina" obligatorio>
            <input type="date" name="endDay" required defaultValue={inicial?.endDay ?? hoy} className={INPUT_CLASS} />
          </Campo>
          <Campo etiqueta="Inscripción desde" obligatorio>
            <input type="date" name="opensDay" required defaultValue={inicial?.opensDay ?? hoy} className={INPUT_CLASS} />
          </Campo>
          <Campo etiqueta="Inscripción hasta" obligatorio>
            <input type="date" name="closesDay" required defaultValue={inicial?.closesDay ?? hoy} className={INPUT_CLASS} />
          </Campo>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Campo etiqueta="Plazas" ayuda="0 = sin límite. Al llenarse, lista de espera.">
            <input name="maxParticipants" type="number" min={0} max={500} defaultValue={inicial?.maxParticipants ?? 0} className={INPUT_CLASS} />
          </Campo>
          <Campo etiqueta="Inscripción socio (€)">
            <input name="memberEuros" type="number" step="0.01" min="0" defaultValue={inicial?.memberEuros ?? "0"} className={INPUT_CLASS} />
          </Campo>
          <Campo etiqueta="Fiscalidad del socio">
            <select name="memberTaxTreatment" defaultValue={inicial?.memberTaxTreatment ?? "EXEMPT_SPORT"} className={INPUT_CLASS}>
              {FISCAL.map((f) => <option key={f.valor} value={f.valor}>{f.label}</option>)}
            </select>
          </Campo>
          <label className="flex items-end gap-2 pb-3 text-sm text-marca-800">
            <input
              type="checkbox"
              name="allowGuests"
              checked={admiteInvitados}
              onChange={(e) => setAdmiteInvitados(e.target.checked)}
              className="size-4 accent-[var(--color-marca-700)]"
            />
            Admite invitados no socios
          </label>
        </div>

        {admiteInvitados ? (
          <div className="grid gap-3 rounded-md border border-piedra-200 bg-piedra-50 p-4 sm:grid-cols-2">
            <Campo etiqueta="Inscripción invitado (€)">
              <input name="guestEuros" type="number" step="0.01" min="0" defaultValue={inicial?.guestEuros ?? "0"} className={INPUT_CLASS} />
            </Campo>
            <Campo etiqueta="Fiscalidad del invitado" ayuda="El invitado no goza de la exención del art. 20.Uno.13.">
              <select name="guestTaxTreatment" defaultValue={inicial?.guestTaxTreatment ?? "STANDARD_21"} className={INPUT_CLASS}>
                {FISCAL.map((f) => <option key={f.valor} value={f.valor}>{f.label}</option>)}
              </select>
            </Campo>
          </div>
        ) : (
          <>
            <input type="hidden" name="guestEuros" value={inicial?.guestEuros ?? "0"} />
            <input type="hidden" name="guestTaxTreatment" value={inicial?.guestTaxTreatment ?? "STANDARD_21"} />
          </>
        )}

        <div className="border-t border-piedra-200 pt-4">
          <Enviar>{inicial?.id ? "Guardar cambios" : "Crear torneo"}</Enviar>
        </div>

        {estado.error ? <Aviso tipo="error">{estado.error}</Aviso> : null}
        {estado.ok ? <Aviso tipo="exito">{estado.ok}</Aviso> : null}
      </form>
    </Tarjeta>
  );
}

type Inscripcion = {
  id: string;
  nombre: string;
  socio: string;
  numeroSocio: string | null;
  esInvitado: boolean;
  estado: string;
  importe: string;
  pagada: boolean;
  sinCoste: boolean;
};

export function ListaInscritos({
  torneo,
  inscripciones,
  puedeEditar,
  deportes,
}: {
  torneo: TorneoForm;
  inscripciones: Inscripcion[];
  puedeEditar: boolean;
  deportes: TournamentSport[];
}) {
  const [abierto, setAbierto] = useState(false);
  const [editando, setEditando] = useState(false);
  const [estado, accion] = useActionState<EstadoTorneo, FormData>(cobrarInscripcion, {});

  return (
    <div className="mt-5 border-t border-piedra-200 pt-4">
      <div className="flex flex-wrap gap-2">
        <Boton variante="secundario" tamano="sm" onClick={() => setAbierto((v) => !v)}>
          {abierto ? "Ocultar inscritos" : `Ver inscritos (${inscripciones.filter((i) => i.estado !== "CANCELLED").length})`}
        </Boton>
        {puedeEditar ? (
          <Boton variante="fantasma" tamano="sm" onClick={() => setEditando((v) => !v)}>
            {editando ? "Cancelar edicion" : "Editar torneo"}
          </Boton>
        ) : null}
      </div>

      {editando ? (
        <div className="mt-4">
          <FormularioTorneo inicial={torneo} deportes={deportes} />
        </div>
      ) : null}

      {abierto ? (
        inscripciones.length === 0 ? (
          <p className="mt-4 text-sm text-piedra-500">Todavia no hay inscripciones.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="border-b border-piedra-200 text-xs uppercase tracking-wide text-piedra-400">
                <tr>
                  <th className="py-2 font-bold">Participante</th>
                  <th className="py-2 font-bold">Inscribe</th>
                  <th className="py-2 font-bold">Estado</th>
                  <th className="py-2 text-right font-bold">Importe</th>
                  <th className="py-2 text-right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-piedra-100">
                {inscripciones.map((i) => (
                  <tr key={i.id} className={i.estado === "CANCELLED" ? "opacity-50" : ""}>
                    <td className="py-2.5">
                      <span className="font-bold text-marca-900">{i.nombre}</span>
                      {i.esInvitado ? (
                        <Etiqueta tono="ambar" className="ml-2">Invitado</Etiqueta>
                      ) : null}
                    </td>
                    <td className="py-2.5 text-piedra-500">
                      <span className="font-mono text-xs">{i.numeroSocio ?? "—"}</span> {i.socio}
                    </td>
                    <td className="py-2.5">
                      <Etiqueta
                        tono={
                          i.estado === "CANCELLED" ? "gris"
                          : i.estado === "WAITLIST" ? "ambar"
                          : "verde"
                        }
                      >
                        {i.estado === "CANCELLED" ? "Anulada" : i.estado === "WAITLIST" ? "En espera" : "Inscrito"}
                      </Etiqueta>
                    </td>
                    <td className="py-2.5 text-right font-bold text-marca-900">{i.importe}</td>
                    <td className="py-2.5 text-right">
                      {i.estado !== "CANCELLED" && !i.pagada && !i.sinCoste ? (
                        <form action={accion}>
                          <input type="hidden" name="registrationId" value={i.id} />
                          <Enviar variante="secundario">Cobrar</Enviar>
                        </form>
                      ) : i.pagada ? (
                        <Etiqueta tono="verde">Pagada</Etiqueta>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {estado.error ? <p className="mt-2 text-xs font-bold text-granate-500">{estado.error}</p> : null}
            {estado.ok ? <p className="mt-2 text-xs font-bold text-marca-700">{estado.ok}</p> : null}
          </div>
        )
      ) : null}
    </div>
  );
}
