"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  buscarSocios,
  cancelarComoStaff,
  devolverAlMonedero,
  marcarNoPresentado,
  marcarPagada,
  reservarPorSocio,
  type EstadoGestion,
  type SocioEncontrado,
} from "./acciones";
import { Aviso, Boton, Campo, INPUT_CLASS, Tarjeta } from "@/components/ui";
import { minutesToHHMM } from "@/lib/time";

function Enviar({ children, variante = "secundario" }: { children: string; variante?: "primario" | "secundario" | "peligro" }) {
  const { pending } = useFormStatus();
  return (
    <Boton type="submit" tamano="sm" variante={variante} disabled={pending}>
      {pending ? "…" : children}
    </Boton>
  );
}

export function ControlesReserva({
  bookingId,
  cancelada,
  pagada,
  gratuita,
  importe,
}: {
  bookingId: string;
  cancelada: boolean;
  /** Pagada y aun no devuelta. */
  pagada: boolean;
  gratuita: boolean;
  importe: string;
}) {
  const [estadoPago, accionPago] = useActionState<EstadoGestion, FormData>(marcarPagada, {});
  const [estadoNoShow, accionNoShow] = useActionState<EstadoGestion, FormData>(marcarNoPresentado, {});
  const [estadoCancel, accionCancel] = useActionState<EstadoGestion, FormData>(cancelarComoStaff, {});
  const [estadoDevol, accionDevol] = useActionState<EstadoGestion, FormData>(devolverAlMonedero, {});

  const mensaje = estadoPago.error ?? estadoNoShow.error ?? estadoCancel.error ?? estadoDevol.error;
  const exito = estadoPago.ok ?? estadoNoShow.ok ?? estadoCancel.ok ?? estadoDevol.ok;

  if (cancelada) {
    return (
      <div className="flex flex-col items-end gap-2">
        {pagada ? (
          <form
            action={accionDevol}
            onSubmit={(e) => {
              if (!confirm(`¿Devolver ${importe} al monedero del socio?`)) e.preventDefault();
            }}
          >
            <input type="hidden" name="bookingId" value={bookingId} />
            <Enviar>Devolver al monedero</Enviar>
          </form>
        ) : null}
        {mensaje ? <p className="text-xs font-medium text-granate-600">{mensaje}</p> : null}
        {exito ? <p className="text-xs font-medium text-marca-700">{exito}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {!pagada && !gratuita ? (
          <form action={accionPago} className="flex items-center gap-1.5">
            <input type="hidden" name="bookingId" value={bookingId} />
            <select name="metodo" defaultValue="CASH" className="rounded-md border border-piedra-300 bg-white px-2 py-1.5 text-xs">
              <option value="CASH">Efectivo</option>
              <option value="TRANSFER">Transferencia</option>
              <option value="CREDIT">Cargo en cuota</option>
              <option value="WALLET">Monedero del socio</option>
              <option value="MANUAL">Otro</option>
            </select>
            <Enviar variante="primario">Cobrar</Enviar>
          </form>
        ) : null}

        <form action={accionNoShow}>
          <input type="hidden" name="bookingId" value={bookingId} />
          <Enviar>No presentado</Enviar>
        </form>

        <form
          action={accionCancel}
          className="flex items-center gap-2"
          onSubmit={(e) => {
            const devolver = (e.currentTarget.elements.namedItem("devolver") as HTMLInputElement | null)?.checked;
            const texto = !pagada
              ? "¿Cancelar esta reserva?"
              : devolver
                ? `¿Cancelar esta reserva y devolver ${importe} al monedero del socio?`
                : `¿Cancelar esta reserva SIN devolver los ${importe} pagados?`;
            if (!confirm(texto)) e.preventDefault();
          }}
        >
          <input type="hidden" name="bookingId" value={bookingId} />
          <input type="hidden" name="motivo" value="Cancelada por el club" />
          {pagada ? (
            <label className="flex items-center gap-1.5 text-xs text-marca-700">
              <input type="checkbox" name="devolver" value="si" defaultChecked />
              Devolver al monedero
            </label>
          ) : null}
          <Enviar variante="peligro">Cancelar</Enviar>
        </form>
      </div>
      {mensaje ? <p className="text-xs font-medium text-granate-600">{mensaje}</p> : null}
      {exito ? <p className="text-xs font-medium text-marca-700">{exito}</p> : null}
    </div>
  );
}

type Pista = { id: string; name: string; sport: string; slotMinutes: number; allowedDurations: number[] };

export function ReservaPorSocio({ day, pistas }: { day: string; pistas: Pista[] }) {
  const [estado, accion] = useActionState<EstadoGestion, FormData>(reservarPorSocio, {});
  const [pistaId, setPistaId] = useState(pistas[0]?.id ?? "");
  const pista = pistas.find((p) => p.id === pistaId) ?? pistas[0];

  const horas = pista
    ? Array.from({ length: Math.floor((23 * 60 - 8 * 60) / pista.slotMinutes) }, (_, i) => 8 * 60 + i * pista.slotMinutes)
    : [];

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-marca-600">
        Reservar en nombre de un socio
      </h2>
      <Tarjeta className="p-5">
        <form action={accion} className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6 lg:items-end">
          <div className="sm:col-span-2">
            <BuscadorSocios />
          </div>

          <Campo etiqueta="Pista">
            <select
              name="courtId"
              value={pistaId}
              onChange={(e) => setPistaId(e.target.value)}
              className={INPUT_CLASS}
            >
              {pistas.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </Campo>

          <Campo etiqueta="Día">
            <input type="date" name="day" defaultValue={day} required className={INPUT_CLASS} />
          </Campo>

          <Campo etiqueta="Hora">
            <select name="startMinute" className={INPUT_CLASS}>
              {horas.map((m) => (
                <option key={m} value={m}>{minutesToHHMM(m)}</option>
              ))}
            </select>
          </Campo>

          <Campo etiqueta="Duración">
            <select name="durationMinutes" className={INPUT_CLASS}>
              {(pista?.allowedDurations ?? [60]).map((d) => (
                <option key={d} value={d}>{d} min</option>
              ))}
            </select>
          </Campo>

          <div className="sm:col-span-3 lg:col-span-6">
            <Enviar variante="primario">Crear reserva</Enviar>
          </div>
        </form>

        {estado.error ? <div className="mt-3"><Aviso tipo="error">{estado.error}</Aviso></div> : null}
        {estado.ok ? <div className="mt-3"><Aviso tipo="exito">{estado.ok}</Aviso></div> : null}

        <p className="mt-3 text-xs text-marca-500">
          Las reservas creadas por el club no aplican los limites de reservas por socio, pero si
          respetan el horario de la pista y los bloqueos.
        </p>
      </Tarjeta>
    </section>
  );
}


/**
 * Buscador de socios con sugerencias. Escribe el identificador elegido en un
 * campo oculto, que es lo que recibe la acción de servidor.
 */
function BuscadorSocios() {
  const [consulta, setConsulta] = useState("");
  const [resultados, setResultados] = useState<SocioEncontrado[]>([]);
  const [elegido, setElegido] = useState<SocioEncontrado | null>(null);
  const [buscando, setBuscando] = useState(false);
  const peticion = useRef(0);

  const consultaUtil = !elegido && consulta.trim().length >= 2;
  // Los resultados que se pintan se derivan del estado actual: limpiarlos
  // desde el efecto obligaria a un render de mas cada vez que se teclea.
  const visibles = consultaUtil ? resultados : [];

  useEffect(() => {
    if (!consultaUtil) return;

    // Se espera a que deje de teclear para no lanzar una consulta por letra.
    const temporizador = setTimeout(async () => {
      const mia = ++peticion.current;
      setBuscando(true);
      try {
        const encontrados = await buscarSocios(consulta);
        // Si mientras tanto ha seguido escribiendo, esta respuesta ya no vale.
        if (mia === peticion.current) setResultados(encontrados);
      } finally {
        if (mia === peticion.current) setBuscando(false);
      }
    }, 250);

    return () => clearTimeout(temporizador);
  }, [consulta, consultaUtil]);

  if (elegido) {
    return (
      <>
        <input type="hidden" name="socioId" value={elegido.id} />
        <Campo etiqueta="Socio">
          <div className="flex items-center justify-between gap-3 rounded-md border border-marca-300 bg-marca-50 px-3.5 py-2.5">
            <span className="min-w-0">
              <span className="block truncate font-bold text-marca-900">
                {elegido.memberNumber ? `${elegido.memberNumber} · ` : ""}{elegido.nombre}
              </span>
              <span className="block truncate text-xs text-piedra-500">{elegido.email}</span>
            </span>
            <button
              type="button"
              onClick={() => { setElegido(null); setConsulta(""); }}
              className="shrink-0 text-sm font-bold text-marca-700 underline"
            >
              Cambiar
            </button>
          </div>
        </Campo>
      </>
    );
  }

  return (
    <div className="relative">
      <Campo etiqueta="Socio" obligatorio ayuda="Escribe nombre, apellidos, correo o número de socio.">
        <input
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
          placeholder="Buscar socio…"
          autoComplete="off"
          className={INPUT_CLASS}
        />
      </Campo>

      {consulta.trim().length >= 2 ? (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-piedra-300 bg-white py-1 shadow-lg">
          {buscando && visibles.length === 0 ? (
            <li className="px-3 py-2 text-sm text-piedra-400">Buscando…</li>
          ) : visibles.length === 0 ? (
            <li className="px-3 py-2 text-sm text-piedra-400">Ningun socio activo coincide.</li>
          ) : (
            visibles.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setElegido(s)}
                  className="block w-full px-3 py-2 text-left hover:bg-marca-50"
                >
                  <span className="block text-sm font-bold text-marca-900">
                    {s.memberNumber ? `${s.memberNumber} · ` : ""}{s.nombre}
                  </span>
                  <span className="block text-xs text-piedra-400">{s.email}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
