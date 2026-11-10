"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  actualizarPista,
  crearPista,
  eliminarTarifaPista,
  guardarTarifaPista,
  type EstadoPista,
} from "./acciones";
import { Aviso, Boton, Campo, Etiqueta, INPUT_CLASS, Tarjeta } from "@/components/ui";
import type { Sport } from "@/lib/types";
import { minutesToHHMM } from "@/lib/time";

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const HORAS = Array.from({ length: 33 }, (_, i) => 7 * 60 + i * 30);

function Enviar({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return (
    <Boton type="submit" tamano="sm" disabled={pending}>
      {pending ? "Guardando…" : children}
    </Boton>
  );
}

type Pista = {
  id: string;
  name: string;
  code: string;
  sport: string;
  surface: string | null;
  isIndoor: boolean;
  isActive: boolean;
  slotMinutes: number;
  allowedDurations: number[];
  schedules: Array<{ weekday: number; opensAt: number; closesAt: number; isActive: boolean }>;
};

export function FichaPista({ pista }: { pista: Pista }) {
  const [abierta, setAbierta] = useState(false);
  const [estado, accion] = useActionState<EstadoPista, FormData>(actualizarPista, {});

  const porDia = new Map(pista.schedules.map((s) => [s.weekday, s]));

  return (
    <Tarjeta className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-lg font-bold text-marca-900">{pista.name}</p>
            <Etiqueta tono={pista.isActive ? "verde" : "gris"}>{pista.isActive ? "Activa" : "Inactiva"}</Etiqueta>
          </div>
          <p className="mt-1 text-sm text-marca-600">
            {pista.sport} · {pista.code}
            {pista.surface ? ` · ${pista.surface}` : ""}
            {pista.isIndoor ? " · cubierta" : ""}
          </p>
          <p className="mt-0.5 text-xs text-marca-500">
            Rejilla de {pista.slotMinutes} min · duraciones {pista.allowedDurations.join(", ")} min
          </p>
        </div>
        <Boton variante="secundario" tamano="sm" onClick={() => setAbierta((v) => !v)}>
          {abierta ? "Cerrar" : "Configurar"}
        </Boton>
      </div>

      {abierta ? (
        <form action={accion} className="mt-5 space-y-4 border-t border-piedra-200 pt-4">
          <input type="hidden" name="courtId" value={pista.id} />

          <div className="grid gap-3 sm:grid-cols-3">
            <Campo etiqueta="Nombre">
              <input name="name" defaultValue={pista.name} className={INPUT_CLASS} />
            </Campo>
            <Campo etiqueta="Duraciónes reservables" ayuda={`Multiplos de ${pista.slotMinutes} min, separados por comas.`}>
              <input name="allowedDurations" defaultValue={pista.allowedDurations.join(", ")} className={INPUT_CLASS} />
            </Campo>
            <label className="flex items-end gap-2 pb-2 text-sm text-marca-700">
              <input type="checkbox" name="isActive" defaultChecked={pista.isActive} className="size-4 accent-[var(--color-marca-700)]" />
              Pista disponible para reservar
            </label>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-marca-800">Horario semanal</p>
            <div className="space-y-1.5">
              {DIAS.map((nombre, weekday) => {
                const s = porDia.get(weekday);
                return (
                  <div key={weekday} className="flex flex-wrap items-center gap-3 rounded-lg bg-piedra-50 px-3 py-2 text-sm">
                    <label className="flex w-32 items-center gap-2 font-medium text-marca-800">
                      <input
                        type="checkbox"
                        name={`abierto_${weekday}`}
                        defaultChecked={s?.isActive ?? true}
                        className="size-4 accent-[var(--color-marca-700)]"
                      />
                      {nombre}
                    </label>
                    <select name={`opensAt_${weekday}`} defaultValue={String(s?.opensAt ?? 8 * 60)} className="rounded-md border border-piedra-300 bg-white px-2 py-1">
                      {HORAS.map((m) => <option key={m} value={m}>{minutesToHHMM(m)}</option>)}
                    </select>
                    <span className="text-marca-500">a</span>
                    <select name={`closesAt_${weekday}`} defaultValue={String(s?.closesAt ?? 23 * 60)} className="rounded-md border border-piedra-300 bg-white px-2 py-1">
                      {HORAS.map((m) => <option key={m} value={m}>{minutesToHHMM(m)}</option>)}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Enviar>Guardar cambios</Enviar>
            {estado.error ? <p className="text-sm text-granate-600">{estado.error}</p> : null}
            {estado.ok ? <p className="text-sm text-marca-700">{estado.ok}</p> : null}
          </div>
        </form>
      ) : null}
    </Tarjeta>
  );
}

export function NuevaPista({ deporteInicial }: { deporteInicial?: Sport }) {
  const [estado, accion] = useActionState<EstadoPista, FormData>(crearPista, {});

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-marca-600">Nueva pista</h2>
      <Tarjeta className="p-5">
        <form action={accion} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Campo etiqueta="Deporte">
            <select name="sport" defaultValue={deporteInicial ?? "PADEL"} className={INPUT_CLASS}>
              <option value="PADEL">Pádel</option>
              <option value="TENIS">Tenis</option>
              <option value="CROQUET">Croquet</option>
            </select>
          </Campo>
          <Campo etiqueta="Código" ayuda="Identificador corto, p. ej. PAD-4.">
            <input name="code" required className={INPUT_CLASS} />
          </Campo>
          <Campo etiqueta="Nombre">
            <input name="name" required className={INPUT_CLASS} />
          </Campo>
          <Campo etiqueta="Superficie">
            <input name="surface" className={INPUT_CLASS} />
          </Campo>
          <Campo etiqueta="Rejilla">
            <select name="slotMinutes" defaultValue="30" className={INPUT_CLASS}>
              <option value="30">30 minutos</option>
              <option value="60">60 minutos</option>
            </select>
          </Campo>
          <Campo etiqueta="Duraciónes" ayuda="Separadas por comas.">
            <input name="allowedDurations" defaultValue="60, 90" className={INPUT_CLASS} />
          </Campo>
          <Campo etiqueta="Jugadores máximos">
            <input name="maxPlayers" type="number" min={1} max={12} defaultValue={4} className={INPUT_CLASS} />
          </Campo>
          <div className="grid grid-cols-2 gap-2">
            <Campo etiqueta="Abre">
              <select name="opensAt" defaultValue={String(8 * 60)} className={INPUT_CLASS}>
                {HORAS.map((m) => <option key={m} value={m}>{minutesToHHMM(m)}</option>)}
              </select>
            </Campo>
            <Campo etiqueta="Cierra">
              <select name="closesAt" defaultValue={String(23 * 60)} className={INPUT_CLASS}>
                {HORAS.map((m) => <option key={m} value={m}>{minutesToHHMM(m)}</option>)}
              </select>
            </Campo>
          </div>
          <label className="flex items-end gap-2 pb-2 text-sm text-marca-700">
            <input type="checkbox" name="isIndoor" className="size-4 accent-[var(--color-marca-700)]" />
            Pista cubierta
          </label>
          <div className="sm:col-span-2 lg:col-span-4">
            <Enviar>Crear pista</Enviar>
          </div>
        </form>
        {estado.error ? <div className="mt-3"><Aviso tipo="error">{estado.error}</Aviso></div> : null}
        {estado.ok ? <div className="mt-3"><Aviso tipo="exito">{estado.ok}</Aviso></div> : null}
      </Tarjeta>
    </section>
  );
}

// ------------------------------------------------------------------ tarifas

const FISCAL = [
  { valor: "EXEMPT_SPORT", label: "Exenta (art. 20.Uno.13 LIVA)" },
  { valor: "STANDARD_21", label: "IVA 21 %" },
  { valor: "REDUCED_10", label: "IVA 10 %" },
  { valor: "NOT_SUBJECT", label: "No sujeta" },
];

const TIPOS_SOCIO = [
  { valor: "", label: "Todos los tipos de socio" },
  { valor: "NUMERARIO", label: "Solo numerarios" },
  { valor: "FAMILIAR", label: "Solo familiares" },
  { valor: "JUVENIL", label: "Solo juveniles" },
  { valor: "INFANTIL", label: "Solo infantiles" },
  { valor: "ABONADO", label: "Solo abonados" },
  { valor: "HONORARIO", label: "Solo honorarios" },
  { valor: "INVITADO", label: "Solo invitados" },
];

export type TarifaPista = {
  id: string;
  courtId: string | null;
  sport: string | null;
  memberType: string | null;
  label: string | null;
  euros: string;
  taxTreatment: string;
  fromMinute: number;
  toMinute: number;
  priority: number;
  ambito: string;
  fiscalLabel: string;
  franja: string;
};

export function TarifasPista({
  tarifas,
  pistas,
  deporteInicial,
}: {
  tarifas: TarifaPista[];
  deporteInicial?: Sport;
  pistas: Array<{ id: string; name: string; sport: string }>;
}) {
  const [estado, accion] = useActionState<EstadoPista, FormData>(guardarTarifaPista, {});
  const [borrado, accionBorrar] = useActionState<EstadoPista, FormData>(eliminarTarifaPista, {});
  const [editando, setEditando] = useState<TarifaPista | null>(null);
  const [alcance, setAlcance] = useState<"deporte" | "pista">("deporte");

  function editar(t: TarifaPista) {
    setEditando(t);
    setAlcance(t.courtId ? "pista" : "deporte");
  }

  return (
    <>
      <Tarjeta className="mb-4 divide-y divide-piedra-100">
        {tarifas.length === 0 ? (
          <p className="px-5 py-6 text-sm text-piedra-500">
            No hay ninguna tarifa. Sin tarifa, las pistas se reservan sin coste.
          </p>
        ) : (
          tarifas.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
              <div className="min-w-0">
                <p className="font-bold text-marca-900">{t.label ?? "Tarifa sin nombre"}</p>
                <p className="text-xs text-piedra-400">
                  {t.ambito} · {t.franja} · prioridad {t.priority}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Etiqueta tono="gris">{t.fiscalLabel}</Etiqueta>
                <span className="font-bold text-marca-900">
                  {Number(t.euros) === 0 ? "Incluida" : `${t.euros} €/h`}
                </span>
                <Boton variante="fantasma" tamano="sm" onClick={() => editar(t)}>
                  Editar
                </Boton>
                <form
                  action={accionBorrar}
                  onSubmit={(e) => {
                    if (!confirm("¿Eliminar esta tarifa?")) e.preventDefault();
                  }}
                >
                  <input type="hidden" name="id" value={t.id} />
                  <Boton type="submit" variante="peligro" tamano="sm">Eliminar</Boton>
                </form>
              </div>
            </div>
          ))
        )}
      </Tarjeta>

      {borrado.error ? <Aviso tipo="error">{borrado.error}</Aviso> : null}
      {borrado.ok ? <Aviso tipo="exito">{borrado.ok}</Aviso> : null}

      <Tarjeta className="p-5">
        <h3 className="titulo-club mb-4 text-base text-marca-800">
          {editando ? `Editar: ${editando.label ?? "tarifa"}` : "Nueva tarifa"}
        </h3>

        <form action={accion} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" key={editando?.id ?? "nueva"}>
          <input type="hidden" name="id" value={editando?.id ?? ""} />

          <Campo etiqueta="Nombre" ayuda="Lo que se lee en el listado.">
            <input name="label" defaultValue={editando?.label ?? ""} placeholder="Pádel · socio" className={INPUT_CLASS} />
          </Campo>

          <Campo etiqueta="Se aplica a">
            <select
              value={alcance}
              onChange={(e) => setAlcance(e.target.value as "deporte" | "pista")}
              className={INPUT_CLASS}
            >
              <option value="deporte">Todo un deporte</option>
              <option value="pista">Una pista concreta</option>
            </select>
          </Campo>

          {alcance === "pista" ? (
            <Campo etiqueta="Pista">
              <select name="courtId" defaultValue={editando?.courtId ?? ""} className={INPUT_CLASS}>
                {pistas.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </Campo>
          ) : (
            <Campo etiqueta="Deporte">
              <select name="sport" defaultValue={editando?.sport ?? deporteInicial ?? "PADEL"} className={INPUT_CLASS}>
                <option value="PADEL">Pádel</option>
                <option value="TENIS">Tenis</option>
                <option value="CROQUET">Croquet</option>
              </select>
            </Campo>
          )}

          <Campo etiqueta="A quien">
            <select name="memberType" defaultValue={editando?.memberType ?? ""} className={INPUT_CLASS}>
              {TIPOS_SOCIO.map((t) => (
                <option key={t.valor} value={t.valor}>{t.label}</option>
              ))}
            </select>
          </Campo>

          <Campo etiqueta="Precio por hora (€)" ayuda="Con impuestos incluidos. 0 = incluida en la cuota.">
            <input
              name="precioEuros"
              type="number"
              step="0.01"
              min="0"
              defaultValue={editando?.euros ?? "0"}
              className={INPUT_CLASS}
            />
          </Campo>

          <Campo etiqueta="Tratamiento fiscal">
            <select name="taxTreatment" defaultValue={editando?.taxTreatment ?? "EXEMPT_SPORT"} className={INPUT_CLASS}>
              {FISCAL.map((f) => (
                <option key={f.valor} value={f.valor}>{f.label}</option>
              ))}
            </select>
          </Campo>

          <div className="grid grid-cols-2 gap-2">
            <Campo etiqueta="Desde">
              <select name="fromMinute" defaultValue={String(editando?.fromMinute ?? 0)} className={INPUT_CLASS}>
                {HORAS_TARIFA.map((m) => <option key={m} value={m}>{minutesToHHMM(m)}</option>)}
              </select>
            </Campo>
            <Campo etiqueta="Hasta">
              <select name="toMinute" defaultValue={String(editando?.toMinute ?? 1440)} className={INPUT_CLASS}>
                {HORAS_TARIFA.map((m) => <option key={m} value={m}>{minutesToHHMM(m === 1440 ? 1439 : m)}</option>)}
              </select>
            </Campo>
          </div>

          <Campo etiqueta="Prioridad" ayuda="Gana la más alta cuando dos tarifas encajan.">
            <input name="priority" type="number" min={0} max={100} defaultValue={editando?.priority ?? 0} className={INPUT_CLASS} />
          </Campo>

          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
            <Enviar>{editando ? "Guardar cambios" : "Crear tarifa"}</Enviar>
            {editando ? (
              <Boton type="button" variante="secundario" tamano="sm" onClick={() => setEditando(null)}>
                Cancelar edicion
              </Boton>
            ) : null}
          </div>
        </form>

        {estado.error ? <div className="mt-3"><Aviso tipo="error">{estado.error}</Aviso></div> : null}
        {estado.ok ? <div className="mt-3"><Aviso tipo="exito">{estado.ok}</Aviso></div> : null}

        <p className="mt-4 border-t border-piedra-200 pt-3 text-xs leading-relaxed text-piedra-400">
          Cambiar una tarifa no altera las reservas ya hechas: cada una guarda su precio y su
          tratamiento fiscal del momento en que se creó.
        </p>
      </Tarjeta>
    </>
  );
}

const HORAS_TARIFA = [0, ...Array.from({ length: 24 }, (_, i) => (i + 1) * 60)];
