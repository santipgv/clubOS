import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSettings } from "@/lib/settings";
import { prisma } from "@/lib/db";
import { requireUser, isStaff } from "@/lib/auth/guards";
import { hojaDeSalidas } from "@/lib/golf/salidas";
import { addDaysToDay, clubToday, daysBetween, formatClubDayLong, isValidDay } from "@/lib/time";
import { formatEuros } from "@/lib/booking/pricing";
import { RECORRIDO_GOLF } from "@/lib/vocabulario";
import { HojaSalidas } from "./hoja";
import { BotonEnlace, Seccion, Tarjeta, TituloPagina, Vacio } from "@/components/ui";

const enlaceTorneos = <BotonEnlace href="/torneos?deporte=golf" variante="secundario">Torneos de golf</BotonEnlace>;

export const metadata: Metadata = { title: "Golf" };

export default async function GolfPage({
  searchParams,
}: {
  searchParams: Promise<{ campo?: string; dia?: string }>;
}) {
  const user = await requireUser();
  if (user.status !== "ACTIVE") redirect("/pendiente");

  const { campo, dia } = await searchParams;
  const hoy = clubToday();
  const day = dia && isValidDay(dia) ? dia : hoy;

  const recorridos = await prisma.golfCourse.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  if (recorridos.length === 0) {
    return (
      <>
        <TituloPagina titulo="Golf" accion={enlaceTorneos} />
        <Vacio>Todavía no hay ningún recorrido configurado. Habla con secretaría.</Vacio>
      </>
    );
  }

  const elegido = recorridos.find((r) => r.id === campo) ?? recorridos[0];
  const staff = isStaff(user);
  const settings = await getSettings();
  const maxDias = settings["booking.windowDays"];

  // Un socio no se salta la ventana escribiendo la fecha en la URL.
  const desplazamiento = daysBetween(hoy, day);
  if (desplazamiento < 0 || desplazamiento > maxDias) {
    redirect(`/reservar/golf?campo=${elegido.id}&dia=${hoy}`);
  }

  const hoja = await hojaDeSalidas({
    courseId: elegido.id,
    day,
    viewerId: user.id,
    viewerIsStaff: staff,
  });
  if (!hoja) redirect("/reservar/golf");

  const dias = Array.from({ length: maxDias + 1 }, (_, i) =>
    addDaysToDay(hoy, i),
  );

  return (
    <>
      <TituloPagina
        titulo="Golf"
        accion={enlaceTorneos}
        descripcion={`Salidas del ${formatClubDayLong(day)} · ${elegido.name}`}
      />

      <nav aria-label="Elegir recorrido" className="mb-5">
        <ul className="flex flex-wrap gap-2">
          {recorridos.map((r) => {
            const activo = r.id === elegido.id;
            return (
              <li key={r.id}>
                <Link
                  href={`/reservar/golf?campo=${r.id}&dia=${day}`}
                  aria-current={activo ? "page" : undefined}
                  className={`block rounded-md px-4 py-2 text-sm font-bold uppercase tracking-wide transition-colors ${
                    activo
                      ? "bg-marca-700 text-white"
                      : "border border-piedra-300 bg-white text-marca-700 hover:border-marca-400"
                  }`}
                >
                  {r.name}
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
                  href={`/reservar/golf?campo=${elegido.id}&dia=${d}`}
                  aria-current={activo ? "date" : undefined}
                  className={`block min-w-[4.5rem] rounded-lg border px-3 py-2 text-center text-sm transition-colors ${
                    activo
                      ? "border-marca-700 bg-marca-700 text-white"
                      : "border-piedra-300 bg-white text-marca-700 hover:border-marca-400"
                  }`}
                >
                  <span className="block text-[11px] uppercase tracking-wide opacity-80">
                    {d === hoy ? "Hoy" : formatClubDayLong(d).split(" ")[0].slice(0, 3)}
                  </span>
                  <span className="block font-bold">{d.slice(8)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mb-6">
        <Tarjeta className="p-5">
          <p className="text-sm text-piedra-500">
            <strong className="text-marca-900">{RECORRIDO_GOLF[elegido.kind].label}</strong>
            {elegido.holes > 0 ? ` · ${elegido.holes} hoyos` : ""} · salidas cada{" "}
            {elegido.teeIntervalMinutes} min · hasta {elegido.maxPlayers} jugadores por salida
          </p>
          <p className="mt-1 text-sm text-piedra-500">
            {elegido.memberPriceCents === 0
              ? "Incluido en la cuota"
              : `${formatEuros(elegido.memberPriceCents)} por jugador socio`}
            {elegido.guestPriceCents > 0
              ? ` · ${formatEuros(elegido.guestPriceCents)} por invitado`
              : ""}
            {elegido.buggiesAvailable && elegido.buggyPriceCents > 0
              ? ` · buggy ${formatEuros(elegido.buggyPriceCents)}`
              : ""}
          </p>
          <p className="mt-3 border-t border-piedra-200 pt-3 text-xs leading-relaxed text-piedra-400">
            En golf se reserva una <strong>salida</strong>, no el campo entero: si quedan plazas
            libres puedes unirte a un grupo que ya haya reservado esa hora.
          </p>
        </Tarjeta>
      </div>

      <Seccion>Hoja de salidas</Seccion>
      <HojaSalidas
        key={`${elegido.id}:${day}`}
        courseId={elegido.id}
        day={day}
        maxPlayers={elegido.maxPlayers}
        salidas={hoja.salidas.map(({ startMinute, hora, estado, libres, acompanantes }) => ({ startMinute, hora, estado, libres, acompanantes }))}
      />
    </>
  );
}
