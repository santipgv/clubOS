import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/guards";
import { formatClubDayLong, formatClubTime, CLUB_TZ } from "@/lib/time";
import { formatEuros, TAX_LABELS } from "@/lib/booking/pricing";
import { DEPORTE_NOMBRE } from "@/lib/booking/deportes";
import { getSettings } from "@/lib/settings";
import { RUTA_MONEDERO } from "@/lib/rutas";
import Link from "next/link";
import { ResponderInvitacion } from "./responder-invitacion";
import { BotonCancelar } from "./boton-cancelar";
import { BotonPagarMonedero } from "./boton-pagar";
import { BotonAnularSalida } from "./boton-anular-salida";
import { Aviso, Etiqueta, Seccion, Tarjeta, TituloPagina, Vacio } from "@/components/ui";
import { formatInTimeZone } from "date-fns-tz";

export const metadata: Metadata = { title: "Mis reservas" };

export default async function MisReservasPage({
  searchParams,
}: {
  searchParams: Promise<{ nueva?: string; pago?: string }>;
}) {
  const user = await requireUser();
  if (user.status !== "ACTIVE") redirect("/pendiente");
  const { nueva, pago } = await searchParams;

  const ahora = new Date();
  const [proximas, pasadas, salidasGolf, invitaciones, monedero, settings] = await Promise.all([
    prisma.booking.findMany({
      where: { userId: user.id, endsAt: { gt: ahora }, status: { not: "CANCELLED" } },
      orderBy: { startsAt: "asc" },
      include: { court: true },
    }),
    prisma.booking.findMany({
      where: { userId: user.id, OR: [{ endsAt: { lte: ahora } }, { status: "CANCELLED" }] },
      orderBy: { startsAt: "desc" },
      take: 25,
      include: { court: true },
    }),
    // Golf va por salidas y tiene modelo propio, asi que se consulta aparte.
    prisma.golfBooking.findMany({
      where: { userId: user.id, status: { notIn: ["CANCELLED", "INVITED"] }, teeTime: { startsAt: { gt: ahora } } },
      orderBy: { teeTime: { startsAt: "asc" } },
      include: {
        teeTime: { include: { course: { select: { name: true } } } },
        invitedBookings: { select: { id: true, status: true, invitationPayment: true, priceCents: true,
          user: { select: { firstName: true, lastName: true } } } },
      },
    }),
    prisma.golfBooking.findMany({
      where: { userId: user.id, status: "INVITED", teeTime: { startsAt: { gt: ahora } } },
      orderBy: { teeTime: { startsAt: "asc" } },
      include: {
        teeTime: { include: { course: { select: { name: true } } } },
        invitedByBooking: { select: { user: { select: { firstName: true, lastName: true } } } },
      },
    }),
    prisma.user.findUnique({ where: { id: user.id }, select: { walletBalanceCents: true } }),
    getSettings(),
  ]);
  const saldo = monedero?.walletBalanceCents ?? 0;
  const margenMs = settings["booking.cancelDeadlineHours"] * 3_600_000;

  return (
    <>
      <TituloPagina titulo="Mis reservas" descripcion="Próximas reservas e histórico del último periodo." />

      {nueva ? (
        <div className="mb-6">
          <Aviso tipo="exito">
            Reserva confirmada. Tu referencia es <strong>{nueva}</strong>.
            {pago === "monedero" ? " Pagada con tu monedero." : null}
          </Aviso>
          {pago === "pendiente" ? (
            <div className="mt-3">
              <Aviso tipo="info">
                No se ha podido pagar con el monedero (el saldo no cubría el importe). La reserva
                está hecha; puedes pagarla abajo o en la caseta del club.
              </Aviso>
            </div>
          ) : null}
        </div>
      ) : null}

      <p className="mb-6 text-sm text-marca-700">
        Saldo en tu monedero: <strong className="text-marca-900">{formatEuros(saldo)}</strong> ·{" "}
        <Link href={RUTA_MONEDERO} className="font-bold underline underline-offset-2">
          Ver movimientos
        </Link>
      </p>

      {invitaciones.length > 0 ? (
        <section className="mb-10">
          <Seccion>Invitaciones de golf</Seccion>
          <ul className="divide-y divide-piedra-200 rounded-lg border border-piedra-200 bg-white">
            {invitaciones.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-bold text-marca-900">{i.invitedByBooking?.user.firstName} {i.invitedByBooking?.user.lastName} te invita a jugar</p>
                  <p className="text-sm text-marca-700">
                    {i.teeTime.course.name} · {formatClubDayLong(formatInTimeZone(i.teeTime.startsAt, CLUB_TZ, "yyyy-MM-dd"))} a las {formatClubTime(i.teeTime.startsAt)}
                  </p>
                  <p className="text-sm text-piedra-500">
                    {i.invitationPayment === "HOST" ? "Paga el titular" : `Tu plaza: ${formatEuros(i.priceCents)}`}
                  </p>
                </div>
                <ResponderInvitacion bookingId={i.id} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-marca-600">Proximas</h2>
        {proximas.length === 0 ? (
          <Vacio>No tienes reservas proximas.</Vacio>
        ) : (
          <ul className="space-y-3">
            {proximas.map((r) => (
              <li key={r.id}>
                <Tarjeta className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-marca-500">
                        {DEPORTE_NOMBRE[r.court.sport]}
                      </p>
                      <p className="mt-0.5 text-lg font-bold text-marca-900">{r.court.name}</p>
                      <p className="mt-1 text-sm text-marca-700">
                        {formatClubDayLong(formatInTimeZone(r.startsAt, CLUB_TZ, "yyyy-MM-dd"))} ·{" "}
                        {formatClubTime(r.startsAt)}–{formatClubTime(r.endsAt)}
                      </p>
                      <p className="mt-2 text-xs text-marca-500">
                        Referencia {r.reference}
                        {r.priceCents > 0
                          ? ` · ${formatEuros(r.priceCents)} · ${TAX_LABELS[r.taxTreatment]}`
                          : " · incluida en la cuota de socio"}
                      </p>
                      {r.playerNames.length > 0 ? (
                        <p className="mt-1 text-xs text-marca-500">Jugadores: {r.playerNames.join(", ")}</p>
                      ) : null}
                    </div>
                    <div className="flex flex-col items-end gap-3">
                      <Etiqueta tono={r.paymentStatus === "PAID" ? "verde" : r.paymentStatus === "NOT_REQUIRED" ? "gris" : "ambar"}>
                        {r.paymentStatus === "PAID" ? "Pagado" : r.paymentStatus === "NOT_REQUIRED" ? "Incluida" : "Reservado"}
                      </Etiqueta>
                      {r.paymentStatus === "PENDING" && r.priceCents > 0 ? (
                        saldo >= r.priceCents ? (
                          <BotonPagarMonedero bookingId={r.id} />
                        ) : (
                          <p className="max-w-48 text-right text-xs text-piedra-500">
                            Págala en la caseta o recarga tu monedero.
                          </p>
                        )
                      ) : null}
                      <BotonCancelar
                        bookingId={r.id}
                        importe={r.paymentStatus === "PAID" ? formatEuros(r.priceCents) : null}
                        fueraDePlazo={r.startsAt.getTime() - ahora.getTime() < margenMs}
                      />
                    </div>
                  </div>
                </Tarjeta>
              </li>
            ))}
          </ul>
        )}
      </section>

      {salidasGolf.length > 0 ? (
        <section className="mb-10">
          <Seccion>Tus salidas de golf</Seccion>
          <ul className="space-y-3">
            {salidasGolf.map((g) => (
              <li key={g.id}>
                <Tarjeta className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-piedra-400">Golf</p>
                      <p className="mt-0.5 text-lg font-bold text-marca-900">{g.teeTime.course.name}</p>
                      <p className="mt-1 text-sm text-marca-800">
                        {formatClubDayLong(formatInTimeZone(g.teeTime.startsAt, CLUB_TZ, "yyyy-MM-dd"))} · salida a las{" "}
                        {formatClubTime(g.teeTime.startsAt)}
                      </p>
                      <p className="mt-2 text-xs text-piedra-400">
                        Referencia {g.reference} · {g.players} {g.players === 1 ? "jugador" : "jugadores"}
                        {g.guestCount > 0 ? ` (${g.guestCount} invitado/s)` : ""}
                        {g.buggies > 0 ? ` · ${g.buggies} buggy/s` : ""}
                        {g.invitationPayment === "HOST" ? " · paga el titular" : g.priceCents > 0 ? ` · ${formatEuros(g.priceCents)}` : " · incluida en la cuota"}
                      </p>
                      {g.invitedBookings.length > 0 ? (
                        <ul className="mt-1 text-sm text-marca-700">
                          {g.invitedBookings.map((invitacion) => (
                            <li key={invitacion.id}>
                              {invitacion.user.firstName} {invitacion.user.lastName} · {invitacion.status === "INVITED"
                                ? "Invitación pendiente" : invitacion.status === "CANCELLED" ? "Invitación cancelada" : "Invitación aceptada"}
                              {invitacion.status === "INVITED" && invitacion.invitationPayment === "HOST"
                                ? ` · +${formatEuros(invitacion.priceCents)} si acepta` : ""}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {g.playerNames.length > 0 ? (
                        <p className="mt-1 text-xs text-piedra-400">Jugadores: {g.playerNames.join(", ")}</p>
                      ) : null}
                    </div>
                    <div className="flex flex-col items-end gap-3">
                      <Etiqueta
                        tono={g.paymentStatus === "PAID" ? "verde" : g.paymentStatus === "NOT_REQUIRED" ? "gris" : "ambar"}
                      >
                        {g.invitationPayment === "HOST" ? "Paga el titular" : g.paymentStatus === "PAID" ? "Pagado" : g.paymentStatus === "NOT_REQUIRED" ? "Incluida" : "Reservado"}
                      </Etiqueta>
                      {g.invitationPayment !== "HOST" ? <BotonAnularSalida bookingId={g.id} /> : null}
                    </div>
                  </div>
                </Tarjeta>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-marca-600">Historico</h2>
        {pasadas.length === 0 ? (
          <Vacio>Todavia no hay reservas en tu historico.</Vacio>
        ) : (
          <Tarjeta className="divide-y divide-piedra-200">
            {pasadas.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                <div>
                  <span className="font-semibold text-marca-800">{r.court.name}</span>
                  <span className="ml-2 text-marca-600">
                    {formatInTimeZone(r.startsAt, CLUB_TZ, "dd/MM/yyyy")} · {formatClubTime(r.startsAt)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {r.paymentStatus === "REFUNDED" ? (
                    <Etiqueta tono="verde">Devuelta al monedero · {formatEuros(r.priceCents)}</Etiqueta>
                  ) : null}
                  <Etiqueta tono={r.status === "CANCELLED" ? "tierra" : r.status === "NO_SHOW" ? "ambar" : "gris"}>
                    {r.status === "CANCELLED" ? "Cancelada" : r.status === "NO_SHOW" ? "No presentado" : "Jugada"}
                  </Etiqueta>
                </div>
              </div>
            ))}
          </Tarjeta>
        )}
      </section>
    </>
  );
}
