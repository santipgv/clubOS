import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/guards";
import { formatClubDayLong, formatClubDateLong, formatClubTime, CLUB_TZ, clubToday } from "@/lib/time";
import { formatEuros } from "@/lib/booking/pricing";
import { tablonDelClub } from "@/lib/noticias";
import { CATEGORIA_POST, DEPORTE, textoAntiguedad } from "@/lib/vocabulario";
import { Etiqueta, Seccion, Tarjeta, Vacio } from "@/components/ui";
import { formatInTimeZone } from "date-fns-tz";

export default async function InicioPage() {
  const user = await requireUser();
  if (user.status !== "ACTIVE") redirect("/pendiente");

  const [proximas, tablon, socio, cuotasPendientes] = await Promise.all([
    prisma.booking.findMany({
      where: {
        userId: user.id,
        status: { in: ["CONFIRMED", "PENDING_PAYMENT"] },
        endsAt: { gt: new Date() },
      },
      orderBy: { startsAt: "asc" },
      take: 4,
      include: { court: { select: { name: true, sport: true } } },
    }),
    tablonDelClub(6),
    prisma.user.findUnique({ where: { id: user.id }, select: { joinedAt: true } }),
    prisma.membershipFee.count({
      where: { userId: user.id, status: { in: ["PENDING", "OVERDUE"] } },
    }),
  ]);

  return (
    <>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="titulo-club text-3xl text-marca-900 sm:text-4xl">
            Hola, {user.firstName}
          </h1>
          <p className="mt-2 text-sm text-piedra-500">
            {formatClubDayLong(clubToday())} · {textoAntiguedad(socio?.joinedAt ?? null)}
          </p>
        </div>
        <Link
          href="/reservar"
          className="rounded-md bg-marca-700 px-6 py-3 text-sm font-bold uppercase tracking-wide text-white hover:bg-marca-800"
        >
          Reservar pista
        </Link>
      </div>

      {cuotasPendientes > 0 ? (
        <div className="mb-8 rounded-md border border-acento-300 bg-acento-100 px-4 py-3 text-sm text-acento-600">
          Tienes {cuotasPendientes} cuota{cuotasPendientes === 1 ? "" : "s"} sin abonar.{" "}
          <Link href="/perfil#cuotas" className="font-bold underline">
            Ver el detalle en tu perfil
          </Link>
        </div>
      ) : null}

      <div className="grid gap-10 lg:grid-cols-[1fr_22rem]">
        <section>
          <Seccion>Últimas novedades del club</Seccion>
          {tablon.length === 0 ? (
            <Vacio>Todavia no hay novedades publicadas.</Vacio>
          ) : (
            <ul className="space-y-3">
              {tablon.map((e) => (
                <li key={`${e.tipo}-${e.id}`}>
                  <Tarjeta className="p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Etiqueta tono={CATEGORIA_POST[e.categoria].tono}>
                        {CATEGORIA_POST[e.categoria].label}
                      </Etiqueta>
                      {e.fijado ? <Etiqueta tono="neutro">Fijado</Etiqueta> : null}
                      <span className="text-xs text-piedra-400">
                        {e.fechaEvento
                          ? formatClubDayLong(formatInTimeZone(e.fechaEvento, CLUB_TZ, "yyyy-MM-dd")) +
                            // Un bloqueo de pista tiene hora concreta; una noticia con
                            // fecha de evento solo tiene dia.
                            (e.tipo === "bloqueo" ? ` · ${formatClubTime(e.fechaEvento)}` : "")
                          : formatClubDateLong(e.fecha)}
                      </span>
                    </div>
                    <h3 className="mt-2 text-lg font-bold text-marca-900">{e.titulo}</h3>
                    {e.resumen ? (
                      <p className="mt-1 text-sm leading-relaxed text-piedra-500">{e.resumen}</p>
                    ) : null}
                  </Tarjeta>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside>
          <Seccion
            accion={
              <Link href="/mis-reservas" className="text-xs font-bold uppercase text-marca-700 hover:underline">
                Ver todas
              </Link>
            }
          >
            Tus reservas
          </Seccion>
          {proximas.length === 0 ? (
            <Vacio>
              No tienes reservas proximas.
              <br />
              <Link href="/reservar" className="mt-2 inline-block font-bold text-marca-700 underline">
                Reservar una pista
              </Link>
            </Vacio>
          ) : (
            <ul className="space-y-3">
              {proximas.map((r) => (
                <li key={r.id}>
                  <Tarjeta className="p-4">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-piedra-400">
                      {DEPORTE[r.court.sport]}
                    </p>
                    <p className="mt-1 font-bold text-marca-900">{r.court.name}</p>
                    <p className="mt-0.5 text-sm text-piedra-500">
                      {formatClubDayLong(formatInTimeZone(r.startsAt, CLUB_TZ, "yyyy-MM-dd"))}
                    </p>
                    <p className="text-sm text-piedra-500">
                      {formatClubTime(r.startsAt)}–{formatClubTime(r.endsAt)}
                    </p>
                    <div className="mt-3 flex items-center justify-between border-t border-piedra-100 pt-2">
                      <span className="text-xs text-piedra-400">
                        {r.priceCents > 0 ? formatEuros(r.priceCents) : "Incluida"}
                      </span>
                      <Etiqueta
                        tono={r.paymentStatus === "PAID" ? "verde" : r.paymentStatus === "NOT_REQUIRED" ? "gris" : "ambar"}
                      >
                        {r.paymentStatus === "PAID" ? "Pagado" : r.paymentStatus === "NOT_REQUIRED" ? "Incluida" : "Reservado"}
                      </Etiqueta>
                    </div>
                  </Tarjeta>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </>
  );
}
