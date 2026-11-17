import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/guards";
import { clubToday, formatClubDayLong } from "@/lib/time";
import { DEPORTE_A_SLUG } from "@/lib/booking/deportes";
import { DEPORTE, RECORRIDO_GOLF } from "@/lib/vocabulario";
import { Seccion, Tarjeta, TituloPagina, Vacio } from "@/components/ui";
import type { Sport } from "@/lib/types";

export const metadata: Metadata = { title: "Reservar" };

const ORDEN: Sport[] = ["PADEL", "TENIS", "CROQUET"];

export default async function ReservarIndicePage() {
  const user = await requireUser();
  if (user.status !== "ACTIVE") redirect("/pendiente");

  const hoy = clubToday();

  const recorridos = await prisma.golfCourse.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }],
    select: { id: true, name: true, kind: true, holes: true, maxPlayers: true, teeIntervalMinutes: true },
  });

  const pistas = await prisma.court.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }],
    select: { id: true, sport: true, name: true, surface: true, isIndoor: true, allowedDurations: true },
  });

  const porDeporte = ORDEN.map((sport) => ({
    sport,
    pistas: pistas.filter((p) => p.sport === sport),
  })).filter((d) => d.pistas.length > 0);

  return (
    <>
      <TituloPagina titulo="Reservar" descripcion={`Disponibilidad para ${formatClubDayLong(hoy)}`} />

      {porDeporte.length === 0 && recorridos.length === 0 ? (
        <Vacio>No hay pistas ni recorridos activos ahora mismo. Habla con secretaría.</Vacio>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {porDeporte.map(({ sport, pistas: suyas }) => (
            <Link
              key={sport}
              href={`/reservar/${DEPORTE_A_SLUG[sport]}?dia=${hoy}`}
              className="group block"
            >
              <Tarjeta className="h-full p-6 transition-colors group-hover:border-marca-400 group-hover:bg-marca-50">
                <h2 className="titulo-club text-2xl text-marca-900">{DEPORTE[sport]}</h2>
                <p className="mt-2 text-sm text-piedra-500">
                  {suyas.length} {suyas.length === 1 ? "pista" : "pistas"} ·{" "}
                  {[...new Set(suyas.flatMap((p) => p.allowedDurations))].sort((a, b) => a - b).join(" / ")} min
                </p>
                <ul className="mt-4 space-y-1 border-t border-piedra-200 pt-3 text-sm text-marca-800">
                  {suyas.map((p) => (
                    <li key={p.id} className="flex items-baseline justify-between gap-2">
                      <span>{p.name}</span>
                      <span className="text-xs text-piedra-400">
                        {p.surface}
                        {p.isIndoor ? " · cubierta" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-5 text-sm font-bold text-marca-700 group-hover:underline">
                  Ver disponibilidad →
                </p>
              </Tarjeta>
            </Link>
          ))}

          {recorridos.length > 0 ? (
            <Link href={`/reservar/golf?dia=${hoy}`} className="group block">
              <Tarjeta className="h-full p-6 transition-colors group-hover:border-marca-400 group-hover:bg-marca-50">
                <h2 className="titulo-club text-2xl text-marca-900">Golf</h2>
                <p className="mt-2 text-sm text-piedra-500">
                  {recorridos.length} {recorridos.length === 1 ? "recorrido" : "recorridos"} ·
                  salidas cada {recorridos[0].teeIntervalMinutes} min
                </p>
                <ul className="mt-4 space-y-1 border-t border-piedra-200 pt-3 text-sm text-marca-800">
                  {recorridos.map((r) => (
                    <li key={r.id} className="flex items-baseline justify-between gap-2">
                      <span>{r.name}</span>
                      <span className="text-xs text-piedra-400">
                        {r.holes > 0 ? `${r.holes} hoyos` : RECORRIDO_GOLF[r.kind].label}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-5 text-sm font-bold text-marca-700 group-hover:underline">
                  Ver hoja de salidas →
                </p>
              </Tarjeta>
            </Link>
          ) : null}
        </div>
      )}

      <div className="mt-10">
        <Seccion>Cómo funciona</Seccion>
        <ul className="grid gap-3 text-sm text-piedra-500 sm:grid-cols-3">
          <li className="rounded-lg border border-piedra-200 bg-white p-4">
            <strong className="block text-marca-800">1. Elige deporte y día</strong>
            Consulta las pistas o los recorridos disponibles para el día que elijas.
          </li>
          <li className="rounded-lg border border-piedra-200 bg-white p-4">
            <strong className="block text-marca-800">2. Pulsa un hueco libre</strong>
            Elige una hora y revisa el precio antes de confirmar.
          </li>
          <li className="rounded-lg border border-piedra-200 bg-white p-4">
            <strong className="block text-marca-800">3. Paga en la caseta</strong>
            La reserva queda como Reservado hasta que recepción registra el cobro.
          </li>
        </ul>
      </div>
    </>
  );
}
