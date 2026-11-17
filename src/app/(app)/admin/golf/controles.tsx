"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  cobrarSalida,
  crearBloqueoGolf,
  eliminarBloqueoGolf,
  guardarRecorrido,
  guardarTarifasGolf,
  type EstadoGolf,
} from "./acciones";
import { Aviso, Boton, Campo, Etiqueta, INPUT_CLASS, Tarjeta } from "@/components/ui";
import { minutesToHHMM } from "@/lib/time";

const HORAS = Array.from({ length: 33 }, (_, i) => 6 * 60 + i * 30);

const FISCAL = [
  { valor: "EXEMPT_SPORT", label: "Exenta (art. 20.Uno.13 LIVA)" },
  { valor: "STANDARD_21", label: "IVA 21 %" },
  { valor: "REDUCED_10", label: "IVA 10 %" },
  { valor: "NOT_SUBJECT", label: "No sujeta" },
];

const TIPOS = [
  { valor: "RECORRIDO", label: "Recorrido (campo grande)" },
  { valor: "PRACTICAS", label: "Campo de prácticas" },
  { valor: "PITCH_AND_PUTT", label: "Pitch & putt" },
  { valor: "PUTTING_GREEN", label: "Putting green" },
];

function Enviar({ children, variante = "primario" }: { children: string; variante?: "primario" | "secundario" | "peligro" }) {
  const { pending } = useFormStatus();
  return (
    <Boton type="submit" tamano="sm" variante={variante} disabled={pending}>
      {pending ? "…" : children}
    </Boton>
  );
}

export type RecorridoForm = {
  id?: string;
  code: string;
  name: string;
  kind: string;
  kindLabel?: string;
  holes: number;
  teeIntervalMinutes: number;
  maxPlayers: number;
  memberEuros: string;
  guestEuros: string;
  buggyEuros: string;
  memberTaxTreatment: string;
  guestTaxTreatment: string;
  memberTaxLabel?: string;
  buggiesAvailable: boolean;
  isActive: boolean;
  opensAt: number;
  closesAt: number;
  precioResumen?: string;
};

type PreciosGolf = Pick<RecorridoForm,
  "memberEuros" | "guestEuros" | "buggyEuros" | "memberTaxTreatment" | "guestTaxTreatment"
>;

function CamposTarifasGolf({ inicial, buggies }: { inicial?: PreciosGolf; buggies: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Campo etiqueta="Precio por jugador socio (€)" ayuda="Se cobra por jugador, no por salida.">
        <input name="memberEuros" type="number" step="0.01" min="0" max="1000" required defaultValue={inicial?.memberEuros ?? "0"} className={INPUT_CLASS} />
      </Campo>
      <Campo etiqueta="Fiscalidad del socio">
        <select name="memberTaxTreatment" defaultValue={inicial?.memberTaxTreatment ?? "EXEMPT_SPORT"} className={INPUT_CLASS}>
          {FISCAL.map((f) => <option key={f.valor} value={f.valor}>{f.label}</option>)}
        </select>
      </Campo>
      <Campo etiqueta="Precio por invitado (€)">
        <input name="guestEuros" type="number" step="0.01" min="0" max="1000" required defaultValue={inicial?.guestEuros ?? "0"} className={INPUT_CLASS} />
      </Campo>
      <Campo etiqueta="Fiscalidad del invitado" ayuda="El invitado no goza de la exención del socio.">
        <select name="guestTaxTreatment" defaultValue={inicial?.guestTaxTreatment ?? "STANDARD_21"} className={INPUT_CLASS}>
          {FISCAL.map((f) => <option key={f.valor} value={f.valor}>{f.label}</option>)}
        </select>
      </Campo>
      {buggies ? (
        <Campo etiqueta="Precio del buggy (€)">
          <input name="buggyEuros" type="number" step="0.01" min="0" max="1000" required defaultValue={inicial?.buggyEuros ?? "0"} className={`${INPUT_CLASS} w-32`} />
        </Campo>
      ) : (
        <input type="hidden" name="buggyEuros" value={inicial?.buggyEuros ?? "0"} />
      )}
    </div>
  );
}

export function TarifasGolf({ recorrido }: {
  recorrido: PreciosGolf & Pick<RecorridoForm, "name" | "buggiesAvailable" | "isActive"> & { id: string };
}) {
  const [estado, accion] = useActionState<EstadoGolf, FormData>(guardarTarifasGolf, {});

  return (
    <Tarjeta className="p-5">
      <form action={accion} className="space-y-4">
        <input type="hidden" name="id" value={recorrido.id} />
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-bold text-marca-900">{recorrido.name}</h3>
          {!recorrido.isActive ? <Etiqueta tono="gris">Inactivo</Etiqueta> : null}
        </div>
        <CamposTarifasGolf inicial={recorrido} buggies={recorrido.buggiesAvailable} />
        <div className="flex flex-wrap items-center gap-3">
          <Enviar>Guardar tarifas</Enviar>
          {estado.error ? <p role="alert" className="text-sm text-granate-600">{estado.error}</p> : null}
          {estado.ok ? <p role="status" className="text-sm text-marca-700">{estado.ok}</p> : null}
        </div>
      </form>
    </Tarjeta>
  );
}

function CamposRecorrido({ inicial }: { inicial?: RecorridoForm }) {
  const [buggies, setBuggies] = useState(inicial?.buggiesAvailable ?? false);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Campo etiqueta="Código" obligatorio ayuda="Identificador corto, p. ej. GOLF-18.">
          <input name="code" required defaultValue={inicial?.code ?? ""} className={INPUT_CLASS} />
        </Campo>
        <Campo etiqueta="Nombre" obligatorio>
          <input name="name" required defaultValue={inicial?.name ?? ""} className={INPUT_CLASS} />
        </Campo>
        <Campo etiqueta="Tipo">
          <select name="kind" defaultValue={inicial?.kind ?? "RECORRIDO"} className={INPUT_CLASS}>
            {TIPOS.map((t) => (
              <option key={t.valor} value={t.valor}>{t.label}</option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Hoyos" ayuda="0 en prácticas y putting green.">
          <input name="holes" type="number" min={0} max={36} defaultValue={inicial?.holes ?? 18} className={INPUT_CLASS} />
        </Campo>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Campo etiqueta="Minutos entre salidas" ayuda="El club suele usar 10.">
          <input
            name="teeIntervalMinutes"
            type="number"
            min={5}
            max={60}
            defaultValue={inicial?.teeIntervalMinutes ?? 10}
            className={INPUT_CLASS}
          />
        </Campo>
        <Campo etiqueta="Jugadores por salida" ayuda="El flight. Normalmente 4.">
          <input name="maxPlayers" type="number" min={1} max={8} defaultValue={inicial?.maxPlayers ?? 4} className={INPUT_CLASS} />
        </Campo>
        <Campo etiqueta="Abre">
          <select name="opensAt" defaultValue={String(inicial?.opensAt ?? 8 * 60)} className={INPUT_CLASS}>
            {HORAS.map((m) => <option key={m} value={m}>{minutesToHHMM(m)}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Cierra">
          <select name="closesAt" defaultValue={String(inicial?.closesAt ?? 20 * 60)} className={INPUT_CLASS}>
            {HORAS.map((m) => <option key={m} value={m}>{minutesToHHMM(m)}</option>)}
          </select>
        </Campo>
      </div>

      <div className="flex flex-wrap items-center gap-6">
        <label className="flex items-center gap-2 text-sm text-marca-800">
          <input
            type="checkbox"
            name="buggiesAvailable"
            checked={buggies}
            onChange={(e) => setBuggies(e.target.checked)}
            className="size-4 accent-[var(--color-marca-700)]"
          />
          Ofrece buggies
        </label>

        <label className="flex items-center gap-2 text-sm text-marca-800">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={inicial?.isActive ?? true}
            className="size-4 accent-[var(--color-marca-700)]"
          />
          Disponible para reservar
        </label>
      </div>

      <CamposTarifasGolf inicial={inicial} buggies={buggies} />
    </>
  );
}

export function FichaRecorrido({ recorrido, esAdmin }: { recorrido: RecorridoForm; esAdmin: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion] = useActionState<EstadoGolf, FormData>(guardarRecorrido, {});

  return (
    <Tarjeta className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-lg font-bold text-marca-900">{recorrido.name}</p>
            <Etiqueta tono={recorrido.isActive ? "verde" : "gris"}>
              {recorrido.isActive ? "Activo" : "Inactivo"}
            </Etiqueta>
          </div>
          <p className="mt-1 text-sm text-piedra-500">
            {recorrido.kindLabel} · {recorrido.code}
            {recorrido.holes > 0 ? ` · ${recorrido.holes} hoyos` : ""} · salidas cada{" "}
            {recorrido.teeIntervalMinutes} min · hasta {recorrido.maxPlayers} jugadores
          </p>
          <p className="mt-0.5 text-xs text-piedra-400">
            {recorrido.precioResumen}
            {recorrido.buggiesAvailable ? ` · buggies disponibles` : ""} · {recorrido.memberTaxLabel}
          </p>
        </div>
        {esAdmin ? (
          <Boton variante="secundario" tamano="sm" onClick={() => setAbierto((v) => !v)}>
            {abierto ? "Cerrar" : "Configurar"}
          </Boton>
        ) : null}
      </div>

      {abierto ? (
        <form action={accion} className="mt-5 space-y-4 border-t border-piedra-200 pt-4">
          <input type="hidden" name="id" value={recorrido.id ?? ""} />
          <CamposRecorrido inicial={recorrido} />
          <div className="flex items-center gap-3 border-t border-piedra-200 pt-4">
            <Enviar>Guardar cambios</Enviar>
            {estado.error ? <p className="text-sm text-granate-500">{estado.error}</p> : null}
            {estado.ok ? <p className="text-sm text-marca-700">{estado.ok}</p> : null}
          </div>
        </form>
      ) : null}
    </Tarjeta>
  );
}

export function NuevoRecorrido() {
  const [estado, accion] = useActionState<EstadoGolf, FormData>(guardarRecorrido, {});

  return (
    <section>
      <h2 className="titulo-club mb-4 border-b border-piedra-200 pb-2 text-lg text-marca-800">
        Nuevo recorrido
      </h2>
      <Tarjeta className="p-5">
        <form action={accion} className="space-y-4">
          <input type="hidden" name="id" value="" />
          <CamposRecorrido />
          <div className="border-t border-piedra-200 pt-4">
            <Enviar>Crear recorrido</Enviar>
          </div>
          {estado.error ? <Aviso tipo="error">{estado.error}</Aviso> : null}
          {estado.ok ? <Aviso tipo="exito">{estado.ok}</Aviso> : null}
        </form>
      </Tarjeta>
    </section>
  );
}

export function FormularioBloqueoGolf({
  recorridos,
  hoy,
}: {
  recorridos: Array<{ id: string; name: string }>;
  hoy: string;
}) {
  const [estado, accion] = useActionState<EstadoGolf, FormData>(crearBloqueoGolf, {});

  return (
    <Tarjeta className="p-5">
      <form action={accion} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Campo etiqueta="Recorrido">
          <select name="courseId" defaultValue="" className={INPUT_CLASS}>
            <option value="">Todos los recorridos</option>
            {recorridos.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </Campo>

        <Campo etiqueta="Día">
          <input type="date" name="day" defaultValue={hoy} required className={INPUT_CLASS} />
        </Campo>

        <Campo etiqueta="Desde">
          <select name="startMinute" defaultValue={String(8 * 60)} className={INPUT_CLASS}>
            {HORAS.map((m) => <option key={m} value={m}>{minutesToHHMM(m)}</option>)}
          </select>
        </Campo>

        <Campo etiqueta="Hasta">
          <select name="endMinute" defaultValue={String(14 * 60)} className={INPUT_CLASS}>
            {HORAS.slice(1).concat([24 * 60]).map((m) => (
              <option key={m} value={m}>{minutesToHHMM(m === 1440 ? 1439 : m)}</option>
            ))}
          </select>
        </Campo>

        <Campo etiqueta="Tipo">
          <select name="type" defaultValue="TOURNAMENT" className={INPUT_CLASS}>
            <option value="TOURNAMENT">Competición</option>
            <option value="MAINTENANCE">Mantenimiento</option>
            <option value="CLOSURE">Cierre</option>
            <option value="EVENT">Evento privado</option>
          </select>
        </Campo>

        <div className="sm:col-span-2">
          <Campo etiqueta="Título" obligatorio ayuda="Es lo que ven los socios en la hoja de salidas.">
            <input name="title" required maxLength={120} placeholder="Campeonato social" className={INPUT_CLASS} />
          </Campo>
        </div>

        <Campo etiqueta="Descripción interna">
          <input name="description" maxLength={500} className={INPUT_CLASS} />
        </Campo>

        <div className="sm:col-span-2 lg:col-span-4 flex flex-wrap items-center gap-4 border-t border-piedra-200 pt-4">
          <label className="flex items-center gap-2 text-sm text-marca-800">
            <input type="checkbox" name="isPublic" defaultChecked className="size-4 accent-[var(--color-marca-700)]" />
            Mostrar el título a los socios
          </label>
          <label className="flex items-center gap-2 text-sm text-granate-500">
            <input type="checkbox" name="confirmar" value="si" className="size-4 accent-[var(--color-granate-500)]" />
            Confirmo anular las reservas afectadas
          </label>
          <Enviar>Crear bloqueo</Enviar>
        </div>
      </form>

      {estado.error ? <div className="mt-3"><Aviso tipo="error">{estado.error}</Aviso></div> : null}
      {estado.ok ? <div className="mt-3"><Aviso tipo="exito">{estado.ok}</Aviso></div> : null}
    </Tarjeta>
  );
}

export function BotonEliminarBloqueo({ id }: { id: string }) {
  const [estado, accion] = useActionState<EstadoGolf, FormData>(eliminarBloqueoGolf, {});
  return (
    <form
      action={accion}
      onSubmit={(e) => {
        if (!confirm("¿Eliminar este bloqueo? Las reservas ya anuladas no se recuperan.")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Enviar variante="peligro">Eliminar</Enviar>
      {estado.error ? <p className="mt-1 text-xs text-granate-500">{estado.error}</p> : null}
    </form>
  );
}

export function CobroSalida({ bookingId }: { bookingId: string }) {
  const [estado, accion] = useActionState<EstadoGolf, FormData>(cobrarSalida, {});
  return (
    <form action={accion} className="mt-2 flex flex-wrap items-center gap-2">
      <input type="hidden" name="bookingId" value={bookingId} />
      <select name="metodo" aria-label="Método de cobro" defaultValue="CASH" className={INPUT_CLASS}>
        <option value="CASH">Efectivo</option>
        <option value="TRANSFER">Transferencia</option>
        <option value="CREDIT">Cargo en cuota</option>
        <option value="MANUAL">Otro</option>
      </select>
      <Enviar>Cobrar</Enviar>
      {estado.error ? <Aviso tipo="error">{estado.error}</Aviso> : null}
      {estado.ok ? <Aviso tipo="exito">{estado.ok}</Aviso> : null}
    </form>
  );
}
