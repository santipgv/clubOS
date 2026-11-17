import Link from "next/link";
import { filtroPistas, type Ambito } from "@/lib/auth/ambito";
import { prisma } from "@/lib/db";
import { getDayAvailability, type SlotState } from "@/lib/booking/availability";
import { DEPORTE_A_SLUG, DEPORTE_NOMBRE } from "@/lib/booking/deportes";
import { hojaDeSalidas } from "@/lib/golf/salidas";
import { addDaysToDay, clubToday, formatClubDayLong, minutesToHHMM } from "@/lib/time";
import { Boton, BotonEnlace, Campo, INPUT_CLASS, Vacio } from "@/components/ui";

type EstadoSemana = SlotState | "PARCIAL" | "COMPLETA";
type Celda = { estado: EstadoSemana; texto?: string; reservaId?: string | null };

const ESTADOS: Record<EstadoSemana, { texto: string; clase: string }> = {
  LIBRE: { texto: "Libre", clase: "bg-marca-50 text-marca-800" },
  RESERVADA: { texto: "Reservada", clase: "bg-amber-100 text-amber-900" },
  PAGADA: { texto: "Pagada", clase: "bg-marca-200 text-marca-900" },
  BLOQUEADA: { texto: "Bloqueada", clase: "bg-granate-400/15 text-granate-700" },
  CERRADA: { texto: "Cerrada", clase: "bg-piedra-100 text-piedra-600" },
  PASADA: { texto: "Pasada", clase: "bg-piedra-100 text-piedra-600" },
  PARCIAL: { texto: "Con plazas libres", clase: "bg-amber-100 text-amber-900" },
  COMPLETA: { texto: "Completa", clase: "bg-granate-400/15 text-granate-700" },
};

export async function SemanaReservas({ day, deporte, instalacion, ambito }: {
  day: string;
  deporte?: string;
  instalacion?: string;
  ambito: Ambito;
}) {
  const [pistas, campos] = await Promise.all([
    prisma.court.findMany({
      where: { isActive: true, ...filtroPistas(ambito) },
      orderBy: [{ sport: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, sport: true },
    }),
    ambito === null ? prisma.golfCourse.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }) : Promise.resolve([]),
  ]);

  const deportes = [...new Set(pistas.map((p) => p.sport))]
    .map((sport) => ({ slug: DEPORTE_A_SLUG[sport], nombre: DEPORTE_NOMBRE[sport] }));
  if (campos.length) deportes.push({ slug: "golf", nombre: "Golf" });
  const seleccionado = deportes.find((d) => d.slug === deporte) ?? deportes[0];
  if (!seleccionado) return <Vacio>No hay pistas ni recorridos activos.</Vacio>;

  const golf = seleccionado.slug === "golf";
  const instalaciones = golf ? campos : pistas.filter((p) => DEPORTE_A_SLUG[p.sport] === seleccionado.slug);
  const actual = instalaciones.find((i) => i.id === instalacion) ?? instalaciones[0];
  const pista = pistas.find((p) => p.id === actual.id);
  const dias = Array.from({ length: 7 }, (_, i) => addDaysToDay(day, i));

  const columnas = await Promise.all(dias.map(async (fecha) => {
    const celdas = new Map<number, Celda>();
    if (golf) {
      const hoja = await hojaDeSalidas({ courseId: actual.id, day: fecha, viewerId: null, viewerIsStaff: true });
      for (const salida of hoja?.salidas ?? []) {
        const estado = salida.estado === "PASADA" && salida.ocupados > 0 ? "RESERVADA" : salida.estado;
        celdas.set(salida.startMinute, {
          estado,
          texto: estado === "PARCIAL" ? `${salida.libres} ${salida.libres === 1 ? "plaza libre" : "plazas libres"}` : undefined,
        });
      }
    } else if (pista) {
      const hoja = await getDayAvailability({ sport: pista.sport, courtId: pista.id, day: fecha, viewerId: null, viewerIsStaff: true });
      for (const slot of hoja.courts[0]?.slots ?? []) {
        celdas.set(slot.startMinute, { estado: slot.state, reservaId: slot.bookingId });
      }
    }
    return celdas;
  }));

  const minutos = [...new Set(columnas.flatMap((celdas) => [...celdas.keys()]))].sort((a, b) => a - b);
  const urlSemana = (fecha: string) =>
    `/admin/reservas?vista=semana&dia=${fecha}&deporte=${seleccionado.slug}&instalacion=${actual.id}`;

  return (
    <div className="space-y-5">
      <nav aria-label="Deportes de la semana" className="flex flex-wrap gap-2">
        {deportes.map(({ slug, nombre }) => (
          <BotonEnlace key={slug} href={`/admin/reservas?vista=semana&dia=${day}&deporte=${slug}`}
            aria-current={slug === seleccionado.slug ? "page" : undefined}
            variante={slug === seleccionado.slug ? "primario" : "secundario"} tamano="sm">
            {nombre}
          </BotonEnlace>
        ))}
      </nav>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <form method="get" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="vista" value="semana" />
          <input type="hidden" name="deporte" value={seleccionado.slug} />
          <Campo etiqueta={golf ? "Recorrido" : "Pista"}>
            <select name="instalacion" key={actual.id} defaultValue={actual.id} className={INPUT_CLASS}>
              {instalaciones.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Desde">
            <input type="date" name="dia" key={day} defaultValue={day} required className={INPUT_CLASS} />
          </Campo>
          <Boton type="submit" variante="secundario">Ver semana</Boton>
        </form>

        <nav aria-label="Cambiar semana" className="flex flex-wrap gap-2">
          <BotonEnlace href={urlSemana(addDaysToDay(day, -7))} variante="secundario" tamano="sm">← Semana anterior</BotonEnlace>
          <BotonEnlace href={urlSemana(clubToday())} variante="secundario" tamano="sm">Hoy</BotonEnlace>
          <BotonEnlace href={urlSemana(addDaysToDay(day, 7))} variante="secundario" tamano="sm">Semana siguiente →</BotonEnlace>
        </nav>
      </div>

      <h2 className="titulo-club text-lg text-marca-900">{actual.name} · {formatClubDayLong(day)} – {formatClubDayLong(dias[6])}</h2>
      {minutos.length === 0 ? <Vacio>Esta instalación no tiene horario en los días seleccionados.</Vacio> : (
        <div className="max-h-[68vh] overflow-auto rounded-lg border border-piedra-200 bg-white" tabIndex={0} role="region" aria-label="Rejilla semanal de disponibilidad">
          <table className="w-full min-w-[740px] border-separate border-spacing-0 text-center text-xs">
            <caption className="sr-only">Disponibilidad por hora durante siete días</caption>
            <thead className="sticky top-0 z-20 bg-piedra-50 text-marca-900">
              <tr>
                <th scope="col" className="sticky left-0 bg-piedra-50 p-2 text-left">Hora</th>
                {dias.map((fecha) => (
                  <th key={fecha} scope="col" className="border-b border-l border-piedra-200 p-2 capitalize">
                    {golf ? formatClubDayLong(fecha) : (
                      <Link href={`/admin/reservas?dia=${fecha}`} className="underline decoration-piedra-300 underline-offset-2 hover:decoration-marca-700">
                        {formatClubDayLong(fecha)}
                      </Link>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {minutos.map((minuto) => (
                <tr key={minuto}>
                  <th scope="row" className="sticky left-0 z-10 border-b border-piedra-200 bg-white p-2 text-left font-mono text-marca-900">{minutesToHHMM(minuto)}</th>
                  {columnas.map((celdas, i) => {
                    const celda = celdas.get(minuto);
                    const estado = ESTADOS[celda?.estado ?? "CERRADA"];
                    return (
                      <td key={dias[i]} className={`border-b border-l border-white p-2 font-medium ${estado.clase}`}>
                        {celda?.reservaId ? (
                          <Link href={`/admin/reservas?dia=${dias[i]}#${celda.reservaId}`} className="underline underline-offset-2">
                            {estado.texto}
                          </Link>
                        ) : celda?.texto ?? estado.texto}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
