"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  actualizarSocio,
  aprobarSocio,
  cambiarEstadoSocio,
  cambiarPermisos,
  crearCuota,
  enviarRestablecerPassword,
  marcarCuotaPagada,
  rechazarSocio,
  recargarMonedero,
  type EstadoSocio,
} from "../acciones";
import { Aviso, Boton, Campo, Etiqueta, INPUT_CLASS, Tarjeta, type Tono } from "@/components/ui";

function Enviar({
  children,
  variante = "primario",
}: {
  children: string;
  variante?: "primario" | "secundario" | "peligro";
}) {
  const { pending } = useFormStatus();
  return (
    <Boton type="submit" tamano="sm" variante={variante} disabled={pending}>
      {pending ? "…" : children}
    </Boton>
  );
}

function Mensajes({ estado }: { estado: EstadoSocio }) {
  if (estado.error) return <div className="mt-3"><Aviso tipo="error">{estado.error}</Aviso></div>;
  if (estado.ok) return <div className="mt-3"><Aviso tipo="exito">{estado.ok}</Aviso></div>;
  return null;
}

// ------------------------------------------------------------------ aprobación

export function BloqueAprobacion({ userId }: { userId: string }) {
  const [aprobar, accionAprobar] = useActionState<EstadoSocio, FormData>(aprobarSocio, {});
  const [rechazar, accionRechazar] = useActionState<EstadoSocio, FormData>(rechazarSocio, {});

  return (
    <Tarjeta className="border-acento-300 bg-acento-100/50 p-5">
      <h2 className="titulo-club mb-1 text-lg text-marca-800">Solicitud pendiente de aprobar</h2>
      <p className="mb-4 text-sm text-piedra-500">
        Al aprobar se le asigna numero de socio, empieza a contar su antigüedad y recibe un correo.
      </p>

      <div className="flex flex-wrap items-end gap-4">
        <form action={accionAprobar} className="flex items-end gap-2">
          <input type="hidden" name="userId" value={userId} />
          <Campo etiqueta="Número de socio" ayuda="Vacio: se asigna el siguiente libre.">
            <input name="memberNumber" placeholder="automático" className={`${INPUT_CLASS} w-40`} />
          </Campo>
          <Enviar>Aprobar alta</Enviar>
        </form>

        <form action={accionRechazar} className="flex items-end gap-2">
          <input type="hidden" name="userId" value={userId} />
          <Campo etiqueta="Motivo del rechazo">
            <input name="motivo" className={`${INPUT_CLASS} w-56`} />
          </Campo>
          <Enviar variante="peligro">Rechazar</Enviar>
        </form>
      </div>

      <Mensajes estado={aprobar} />
      <Mensajes estado={rechazar} />
    </Tarjeta>
  );
}

// ------------------------------------------------------------------ estado

export function BloqueEstado({
  userId,
  estadoActual,
  esAdmin,
  esUnoMismo,
}: {
  userId: string;
  estadoActual: string;
  esAdmin: boolean;
  esUnoMismo: boolean;
}) {
  const [estado, accion] = useActionState<EstadoSocio, FormData>(cambiarEstadoSocio, {});
  const [destino, setDestino] = useState(estadoActual === "ACTIVE" ? "SUSPENDED" : "ACTIVE");

  if (!esAdmin) {
    return <p className="text-sm text-piedra-500">Solo un administrador puede cambiar el estado.</p>;
  }
  if (esUnoMismo) {
    return <p className="text-sm text-piedra-500">No puedes cambiar tu propio estado.</p>;
  }

  return (
    <>
      <form action={accion} className="space-y-4">
        <input type="hidden" name="userId" value={userId} />

        <Campo etiqueta="Nuevo estado">
          <select
            name="estado"
            value={destino}
            onChange={(e) => setDestino(e.target.value)}
            className={INPUT_CLASS}
          >
            <option value="ACTIVE">Activo — puede reservar</option>
            <option value="SUSPENDED">Suspendido — impago o sancion, reversible</option>
            <option value="BAJA">Baja — deja el club, se conserva su historico</option>
          </select>
        </Campo>

        {destino !== "ACTIVE" ? (
          <>
            <Campo etiqueta="Motivo" ayuda="Queda en la ficha y en el registro de auditoría.">
              <input name="motivo" maxLength={300} className={INPUT_CLASS} />
            </Campo>
            <Aviso tipo="error">
              Se cancelarán sus reservas futuras y se cerrarán sus sesiones abiertas. No se borra
              ningún dato: el historico de reservas y cuotas se conserva.
            </Aviso>
          </>
        ) : null}

        <Enviar variante={destino === "ACTIVE" ? "primario" : "peligro"}>
          {destino === "ACTIVE" ? "Reactivar socio" : destino === "BAJA" ? "Dar de baja" : "Suspender"}
        </Enviar>
      </form>
      <Mensajes estado={estado} />
    </>
  );
}

// ------------------------------------------------------------------ permisos

const DEPORTES = [
  { valor: "PADEL", label: "Pádel" },
  { valor: "TENIS", label: "Tenis" },
  { valor: "CROQUET", label: "Croquet" },
];

export function BloquePermisos({
  userId,
  rolActual,
  deportesActuales,
  esUnoMismo,
}: {
  userId: string;
  rolActual: string;
  deportesActuales: string[];
  esUnoMismo: boolean;
}) {
  const [estado, accion] = useActionState<EstadoSocio, FormData>(cambiarPermisos, {});
  const [rol, setRol] = useState(rolActual);

  if (esUnoMismo) {
    return <p className="text-sm text-piedra-500">No puedes cambiar tus propios permisos.</p>;
  }

  return (
    <>
      <form action={accion} className="space-y-4">
        <input type="hidden" name="userId" value={userId} />

        <Campo etiqueta="Que puede hacer en la aplicación">
          <select name="rol" value={rol} onChange={(e) => setRol(e.target.value)} className={INPUT_CLASS}>
            <option value="MEMBER">Socio — reserva y gestiona lo suyo</option>
            <option value="COLLABORATOR">Colaborador — ademas gestiona uno o varios deportes</option>
            <option value="STAFF">Personal del club — cobros, reservas de cualquiera y bloqueos</option>
            <option value="ADMIN">Administrador — todo, incluidos socios y ajustes</option>
          </select>
        </Campo>

        {rol === "COLLABORATOR" ? (
          <fieldset>
            <legend className="mb-2 text-sm font-bold text-marca-800">Deportes que gestiona</legend>
            <div className="flex flex-wrap gap-4">
              {DEPORTES.map((d) => (
                <label key={d.valor} className="flex items-center gap-2 text-sm text-marca-800">
                  <input
                    type="checkbox"
                    name={`deporte_${d.valor}`}
                    defaultChecked={deportesActuales.includes(d.valor)}
                    className="size-4 accent-[var(--color-marca-700)]"
                  />
                  {d.label}
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-piedra-400">
              Podrá ver las reservas y crear bloqueos de esos deportes, pero no tocar socios ni cuotas.
            </p>
          </fieldset>
        ) : null}

        <p className="text-xs text-piedra-400">
          Cambiar los permisos cierra sus sesiones abiertas: se reevaluan al volver a entrar.
        </p>

        <Enviar>Guardar permisos</Enviar>
      </form>
      <Mensajes estado={estado} />
    </>
  );
}

// ------------------------------------------------------------------ contraseña

export function BotonRestablecer({ userId }: { userId: string }) {
  const [estado, accion] = useActionState<EstadoSocio, FormData>(enviarRestablecerPassword, {});

  return (
    <div className="text-right">
      <form action={accion}>
        <input type="hidden" name="userId" value={userId} />
        <Enviar variante="secundario">Enviar correo para restablecer contraseña</Enviar>
      </form>
      {estado.error ? <p className="mt-1 text-xs font-bold text-granate-500">{estado.error}</p> : null}
      {estado.ok ? <p className="mt-1 max-w-xs text-xs font-bold text-marca-700">{estado.ok}</p> : null}
    </div>
  );
}

// ------------------------------------------------------------------ datos

type Socio = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  altPhone: string | null;
  nationalId: string | null;
  birthDate: string;
  joinedAt: string;
  addressLine: string | null;
  postalCode: string | null;
  city: string | null;
  province: string | null;
  relationship: string;
  memberType: string;
  memberNumber: string | null;
  notes: string | null;
};

export function BloqueDatos({ socio }: { socio: Socio }) {
  const [estado, accion] = useActionState<EstadoSocio, FormData>(actualizarSocio, {});

  const err = (campo: string) =>
    estado.errores?.[campo] ? (
      <p className="mt-1 text-sm font-bold text-granate-500">{estado.errores[campo]}</p>
    ) : null;

  return (
    <>
      <form action={accion} className="space-y-5">
        <input type="hidden" name="userId" value={socio.id} />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Campo etiqueta="Nombre" obligatorio>
              <input name="firstName" defaultValue={socio.firstName} className={INPUT_CLASS} />
            </Campo>
            {err("firstName")}
          </div>
          <div>
            <Campo etiqueta="Apellidos" obligatorio>
              <input name="lastName" defaultValue={socio.lastName} className={INPUT_CLASS} />
            </Campo>
            {err("lastName")}
          </div>
          <div>
            <Campo etiqueta="Correo" obligatorio ayuda="Cambiarlo obliga a verificarlo de nuevo.">
              <input name="email" type="email" defaultValue={socio.email} className={INPUT_CLASS} />
            </Campo>
            {err("email")}
          </div>
          <div>
            <Campo etiqueta="DNI o NIE">
              <input name="nationalId" defaultValue={socio.nationalId ?? ""} className={INPUT_CLASS} />
            </Campo>
            {err("nationalId")}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Campo etiqueta="Teléfono">
            <input name="phone" defaultValue={socio.phone ?? ""} className={INPUT_CLASS} />
          </Campo>
          <Campo etiqueta="Otro teléfono">
            <input name="altPhone" defaultValue={socio.altPhone ?? ""} className={INPUT_CLASS} />
          </Campo>
          <Campo etiqueta="Fecha de nacimiento">
            <input type="date" name="birthDate" defaultValue={socio.birthDate} className={INPUT_CLASS} />
          </Campo>
          <Campo etiqueta="Socio desde" ayuda="De aquí sale la antigüedad.">
            <input type="date" name="joinedAt" defaultValue={socio.joinedAt} className={INPUT_CLASS} />
          </Campo>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <Campo etiqueta="Dirección">
              <input name="addressLine" defaultValue={socio.addressLine ?? ""} className={INPUT_CLASS} />
            </Campo>
          </div>
          <Campo etiqueta="Código postal">
            <input name="postalCode" defaultValue={socio.postalCode ?? ""} className={INPUT_CLASS} />
          </Campo>
          <Campo etiqueta="Localidad">
            <input name="city" defaultValue={socio.city ?? ""} className={INPUT_CLASS} />
          </Campo>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Campo etiqueta="Provincia">
            <input name="province" defaultValue={socio.province ?? ""} className={INPUT_CLASS} />
          </Campo>
          <Campo etiqueta="Relación con el club">
            <select name="relationship" defaultValue={socio.relationship} className={INPUT_CLASS}>
              <option value="SOCIO">Socio</option>
              <option value="EMPLEADO">Empleado</option>
              <option value="COLABORADOR">Colaborador</option>
              <option value="INVITADO">Invitado</option>
            </select>
          </Campo>
          <Campo etiqueta="Tipo de socio" ayuda="Determina cuota y tarifa de pista.">
            <select name="memberType" defaultValue={socio.memberType} className={INPUT_CLASS}>
              <option value="NUMERARIO">Numerario — pleno derecho, con voto</option>
              <option value="FAMILIAR">Familiar — incluido en la cuota de otro socio</option>
              <option value="JUVENIL">Juvenil — 18 a 25 anos</option>
              <option value="INFANTIL">Infantil — menor de 18</option>
              <option value="ABONADO">Abonado — temporada, sin voto</option>
              <option value="HONORARIO">Honorario — exento de cuota</option>
              <option value="INVITADO">Invitado — tarifa con IVA</option>
            </select>
          </Campo>
          <div>
            <Campo etiqueta="Número de socio">
              <input name="memberNumber" defaultValue={socio.memberNumber ?? ""} className={INPUT_CLASS} />
            </Campo>
            {err("memberNumber")}
          </div>
        </div>

        <Campo etiqueta="Notas internas" ayuda="Solo las ve el club. El socio nunca las ve.">
          <textarea name="notes" rows={3} defaultValue={socio.notes ?? ""} className={INPUT_CLASS} />
        </Campo>

        <div className="border-t border-piedra-200 pt-4">
          <Enviar>Guardar datos</Enviar>
        </div>
      </form>
      <Mensajes estado={estado} />
    </>
  );
}

// ------------------------------------------------------------------ cuotas

type Cuota = {
  id: string;
  period: string;
  concept: string;
  importe: string;
  vence: string;
  estado: string;
  tono: Tono;
  cobrable: boolean;
};

export function BloqueCuotas({
  userId,
  cuotas,
  esAdmin,
}: {
  userId: string;
  cuotas: Cuota[];
  esAdmin: boolean;
}) {
  const [nueva, accionNueva] = useActionState<EstadoSocio, FormData>(crearCuota, {});
  const [cobro, accionCobro] = useActionState<EstadoSocio, FormData>(marcarCuotaPagada, {});
  const anoActual = new Date().getFullYear();

  return (
    <>
      {cuotas.length === 0 ? (
        <p className="mb-4 text-sm text-piedra-500">Este socio no tiene cuotas registradas.</p>
      ) : (
        <div className="mb-6 overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="border-b border-piedra-200 text-xs uppercase tracking-wide text-piedra-400">
              <tr>
                <th className="py-2 font-bold">Periodo</th>
                <th className="py-2 font-bold">Concepto</th>
                <th className="py-2 font-bold">Vence</th>
                <th className="py-2 text-right font-bold">Importe</th>
                <th className="py-2 text-right font-bold">Estado</th>
                <th className="py-2 text-right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-piedra-100">
              {cuotas.map((c) => (
                <tr key={c.id}>
                  <td className="py-2.5 font-bold text-marca-900">{c.period}</td>
                  <td className="py-2.5 text-piedra-500">{c.concept}</td>
                  <td className="py-2.5 text-piedra-500">{c.vence}</td>
                  <td className="py-2.5 text-right font-bold text-marca-900">{c.importe}</td>
                  <td className="py-2.5 text-right">
                    <Etiqueta tono={c.tono}>{c.estado}</Etiqueta>
                  </td>
                  <td className="py-2.5 text-right">
                    {c.cobrable ? (
                      <form action={accionCobro} className="flex items-center justify-end gap-1.5">
                        <input type="hidden" name="feeId" value={c.id} />
                        <select
                          name="metodo"
                          defaultValue="TRANSFER"
                          className="rounded border border-piedra-300 bg-white px-2 py-1 text-xs"
                        >
                          <option value="TRANSFER">Domiciliada</option>
                          <option value="CASH">Efectivo</option>
                          <option value="MANUAL">Otro</option>
                        </select>
                        <Enviar variante="secundario">Cobrar</Enviar>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Mensajes estado={cobro} />

      {esAdmin ? (
        <form action={accionNueva} className="grid gap-3 border-t border-piedra-200 pt-5 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
          <input type="hidden" name="userId" value={userId} />
          <Campo etiqueta="Periodo" obligatorio>
            <input name="period" defaultValue={String(anoActual)} className={INPUT_CLASS} />
          </Campo>
          <Campo etiqueta="Concepto" obligatorio>
            <input name="concept" defaultValue="Cuota anual de socio" className={INPUT_CLASS} />
          </Campo>
          <Campo etiqueta="Importe (€)" obligatorio>
            <input name="amountEuros" type="number" step="0.01" min="0" className={INPUT_CLASS} />
          </Campo>
          <Campo etiqueta="Vence el" obligatorio>
            <input type="date" name="dueDate" className={INPUT_CLASS} />
          </Campo>
          <Enviar>Crear cuota</Enviar>
        </form>
      ) : null}

      <Mensajes estado={nueva} />
    </>
  );
}

// ------------------------------------------------------------------ monedero

/** Importes de atajo, en euros. Se puede escribir cualquier otro. */
const ATAJOS_RECARGA = [20, 50, 100];

export function BloqueRecarga({ userId }: { userId: string }) {
  const [estado, accion] = useActionState<EstadoSocio, FormData>(recargarMonedero, {});
  const [importe, setImporte] = useState("");

  return (
    <form
      action={accion}
      className="space-y-3"
      onSubmit={(e) => {
        if (!confirm(`¿Anotar una recarga de ${importe} € en el monedero de este socio?`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="userId" value={userId} />
      <div className="flex flex-wrap gap-2">
        {ATAJOS_RECARGA.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setImporte(String(n))}
            className={`rounded-md border px-3 py-1.5 text-sm font-bold ${
              importe === String(n)
                ? "border-marca-700 bg-marca-700 text-white"
                : "border-piedra-300 bg-white text-marca-800 hover:border-marca-400"
            }`}
          >
            {n} €
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Importe (€)" obligatorio>
          <input
            name="importe"
            inputMode="decimal"
            value={importe}
            onChange={(e) => setImporte(e.target.value)}
            placeholder="20,00"
            required
            className={INPUT_CLASS}
          />
        </Campo>
        <Campo etiqueta="Cobrado en">
          <select name="metodo" defaultValue="CASH" className={INPUT_CLASS}>
            <option value="CASH">Efectivo</option>
            <option value="TRANSFER">Transferencia</option>
            <option value="MANUAL">Otro</option>
          </select>
        </Campo>
      </div>
      <Enviar>Anotar recarga</Enviar>
      <Mensajes estado={estado} />
    </form>
  );
}
