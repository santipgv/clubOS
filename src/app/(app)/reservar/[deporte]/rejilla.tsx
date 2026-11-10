import Link from "next/link";
import type { DayAvailability, Slot, SlotState } from "@/lib/booking/availability";
import { minutesToHHMM } from "@/lib/time";

/**
 * Rejilla de disponibilidad: filas por hora, columnas por pista.
 *
 * Es intencionadamente un componente de servidor con enlaces normales. Elegir
 * hueco no necesita estado en el cliente, y asi la pagina funciona igual en un
 * movil antiguo o con la conexion del club a medio gas.
 */

const ESTILO_CELDA: Record<SlotState, string> = {
  LIBRE: "border-marca-300 bg-white text-marca-800 hover:border-marca-600 hover:bg-marca-100",
  PASADA: "border-piedra-200 bg-piedra-100 text-marca-400",
  RESERVADA: "border-amber-300 bg-amber-100 text-amber-900",
  PAGADA: "border-marca-500 bg-marca-200 text-marca-800",
  BLOQUEADA: "border-granate-400/40 bg-granate-400/15 text-granate-600",
  CERRADA: "border-piedra-200 bg-piedra-100 text-marca-400",
};

const TEXTO_CELDA: Record<SlotState, string> = {
  LIBRE: "Libre",
  PASADA: "—",
  RESERVADA: "Reservado",
  PAGADA: "Pagado",
  BLOQUEADA: "Bloqueada",
  CERRADA: "Cerrada",
};

function contenidoCelda(slot: Slot): string {
  if (slot.isOwn) return "Tu reserva";
  if (slot.state === "BLOQUEADA" && slot.blockTitle) return slot.blockTitle;
  if (slot.holderName) return slot.holderName;
  return TEXTO_CELDA[slot.state];
}

export function Rejilla({
  disponibilidad,
  slugDeporte,
  esStaff,
}: {
  disponibilidad: DayAvailability;
  slugDeporte: string;
  esStaff: boolean;
}) {
  const { timeline, courts, day } = disponibilidad;

  return (
    <div className="space-y-4">
      <Leyenda />

      <div className="overflow-x-auto rounded-xl border border-piedra-300/70 bg-white">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <caption className="sr-only">
            Disponibilidad por pista y hora. Los huecos libres son enlaces para reservar.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 w-16 bg-white p-2 text-left text-xs font-semibold uppercase tracking-wide text-marca-500">
                Hora
              </th>
              {courts.map(({ court }) => (
                <th key={court.id} scope="col" className="border-l border-piedra-200 p-2 text-center">
                  <span className="block font-semibold text-marca-900">{court.name}</span>
                  <span className="block text-[11px] font-normal text-marca-500">
                    {court.surface}
                    {court.isIndoor ? " · cubierta" : ""}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {timeline.map(({ minute, label }) => (
              <tr key={minute} className="border-t border-piedra-200">
                <th scope="row" className="sticky left-0 z-10 bg-white p-2 text-left align-middle text-xs font-semibold text-marca-600">
                  {label}
                </th>
                {courts.map((columna) => {
                  const slot = columna.slots.find((s) => s.startMinute === minute);
                  if (!slot) {
                    return (
                      <td key={columna.court.id} className="border-l border-piedra-200 p-1">
                        <div className="h-9 rounded-md border border-piedra-200 bg-piedra-100" aria-label="Cerrada" />
                      </td>
                    );
                  }

                  const clase = `flex h-9 items-center justify-center rounded-md border px-1 text-center text-[11px] font-semibold leading-tight ${ESTILO_CELDA[slot.state]}`;
                  const texto = contenidoCelda(slot);

                  if (slot.state === "LIBRE") {
                    return (
                      <td key={columna.court.id} className="border-l border-piedra-200 p-1">
                        <Link
                          href={`/reservar/${slugDeporte}/confirmar?pista=${columna.court.id}&dia=${day}&inicio=${minute}`}
                          className={`${clase} transition-colors`}
                          aria-label={`Reservar ${columna.court.name} a las ${minutesToHHMM(minute)}`}
                        >
                          {texto}
                        </Link>
                      </td>
                    );
                  }

                  const destino =
                    esStaff && slot.bookingId ? `/admin/reservas?reserva=${slot.bookingId}` : null;

                  return (
                    <td key={columna.court.id} className="border-l border-piedra-200 p-1">
                      {destino ? (
                        <Link href={destino} className={clase} title={slot.bookingReference ?? undefined}>
                          <span className="truncate">{texto}</span>
                        </Link>
                      ) : (
                        <div className={clase} title={slot.bookingReference ?? undefined}>
                          <span className="truncate">{texto}</span>
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Leyenda() {
  const items: Array<[SlotState, string]> = [
    ["LIBRE", "Libre"],
    ["RESERVADA", "Reservado"],
    ["PAGADA", "Pagado"],
    ["BLOQUEADA", "Evento del club"],
    ["PASADA", "Pasada"],
  ];
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-marca-600">
      {items.map(([estado, texto]) => (
        <li key={estado} className="flex items-center gap-1.5">
          <span className={`inline-block size-3 rounded border ${ESTILO_CELDA[estado]}`} aria-hidden />
          {texto}
        </li>
      ))}
    </ul>
  );
}
