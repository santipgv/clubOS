import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser, isStaff } from "@/lib/auth/guards";
import { durationsAvailableAt, getDayAvailability } from "@/lib/booking/availability";
import { DEPORTE_NOMBRE, SLUG_A_DEPORTE, DEPORTE_A_SLUG } from "@/lib/booking/deportes";
import { prisma } from "@/lib/db";
import { addDaysToDay, clubToday, formatClubDayLong, isValidDay, daysBetween } from "@/lib/time";
import { getSettings } from "@/lib/settings";
import { SelectorHoras } from "./selector-horas";
import { Rejilla } from "./rejilla";
import { TituloPagina, Vacio } from "@/components/ui";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ deporte: string }>;
}): Promise<Metadata> {
  const { deporte } = await params;
  const sport = SLUG_A_DEPORTE[deporte];
  return { title: sport ? `Reservar ${DEPORTE_NOMBRE[sport]}` : "Reservar" };
}

export default async function ReservarPage({
  params,
  searchParams,
}: {
  params: Promise<{ deporte: string }>;
  searchParams: Promise<{ dia?: string }>;
}) {
  const user = await requireUser();
  if (user.status !== "ACTIVE") redirect("/pendiente");

  const { deporte } = await params;
  const sport = SLUG_A_DEPORTE[deporte];
  if (!sport) notFound();

  const { dia } = await searchParams;
  const hoy = clubToday();
  const day = dia && isValidDay(dia) ? dia : hoy;

  const settings = await getSettings();
  const staff = isStaff(user);
  const maxDias = staff ? 60 : settings["booking.windowDays"];

  // Un socio no puede saltarse la ventana escribiendo la fecha en la URL.
  const desplazamiento = daysBetween(hoy, day);
  if (desplazamiento < 0 || desplazamiento > maxDias) {
    redirect(`/reservar/${deporte}?dia=${hoy}`);
  }

  const disponibilidad = await getDayAvailability({
    sport,
    day,
    viewerId: user.id,
    viewerIsStaff: staff,
  });

  const horas = disponibilidad.courts.flatMap((columna) =>
    columna.slots.flatMap((slot) => {
      if (slot.state !== "LIBRE" || slot.startsAt.getTime() < disponibilidad.firstBookableAt) return [];
      const duraciones = durationsAvailableAt(columna, slot.startMinute);
      if (duraciones.length === 0) return [];
      return [{ pistaId: columna.court.id, pista: columna.court.name, minuto: slot.startMinute, duraciones }];
    }),
  ).sort((a, b) => a.minuto - b.minuto);

  const dias = Array.from({ length: Math.min(maxDias + 1, 15) }, (_, i) => addDaysToDay(hoy, i));

  // Deportes con pistas activas, para poder cambiar sin volver atrás.
  const deportesActivos = await prisma.court.findMany({
    where: { isActive: true },
    distinct: ["sport"],
    orderBy: { sortOrder: "asc" },
    select: { sport: true },
  });

  return (
    <>
      <TituloPagina
        titulo={DEPORTE_NOMBRE[sport]}
        descripcion={`Disponibilidad del ${formatClubDayLong(day)}`}
      />

      <nav aria-label="Elegir deporte" className="mb-5">
        <ul className="flex flex-wrap gap-2">
          {deportesActivos.map(({ sport: otro }) => {
            const activo = otro === sport;
            return (
              <li key={otro}>
                <Link
                  href={`/reservar/${DEPORTE_A_SLUG[otro]}?dia=${day}`}
                  aria-current={activo ? "page" : undefined}
                  className={`block rounded-md px-4 py-2 text-sm font-bold uppercase tracking-wide transition-colors ${
                    activo
                      ? "bg-marca-700 text-white"
                      : "border border-piedra-300 bg-white text-marca-700 hover:border-marca-400"
                  }`}
                >
                  {DEPORTE_NOMBRE[otro]}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <nav aria-label="Elegir día" className="mb-6 -mx-4 overflow-x-auto px-4">
        <ul className="flex gap-2">
          {dias.map((d) => {
            const activo = d === day;
            return (
              <li key={d}>
                <Link
                  href={`/reservar/${deporte}?dia=${d}`}
                  aria-current={activo ? "date" : undefined}
                  className={`block min-w-[4.5rem] rounded-lg border px-3 py-2 text-center text-sm transition-colors ${
                    activo
                      ? "border-marca-700 bg-marca-700 text-piedra-50"
                      : "border-piedra-300 bg-white text-marca-700 hover:border-marca-400"
                  }`}
                >
                  <span className="block text-[11px] uppercase tracking-wide opacity-80">
                    {d === hoy ? "Hoy" : formatClubDayLong(d).split(" ")[0].slice(0, 3)}
                  </span>
                  <span className="block font-semibold">{d.slice(8)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {disponibilidad.courts.length === 0 ? (
        <Vacio>No hay pistas de {DEPORTE_NOMBRE[sport].toLowerCase()} abiertas este dia.</Vacio>
      ) : (
        <>
          <SelectorHoras
            key={`${deporte}:${day}`}
            horas={horas}
            pistas={disponibilidad.courts.map(({ court }) => ({ id: court.id, name: court.name }))}
            deporte={deporte}
            day={day}
          />
          <details className="mt-6">
            <summary className="mb-4 cursor-pointer text-sm font-semibold text-marca-700">Ver ocupación de las pistas</summary>
            <Rejilla disponibilidad={disponibilidad} slugDeporte={deporte} esStaff={staff} />
          </details>
        </>
      )}
    </>
  );
}
