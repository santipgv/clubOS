import { prisma } from "@/lib/db";
import { clubToday, formatClubDate, formatClubDateTime, formatClubTime } from "@/lib/time";
import { formatEuros, TAX_LABELS } from "@/lib/booking/pricing";
import { RECORRIDO_GOLF } from "@/lib/vocabulario";
import { CobroSalida, FichaRecorrido, NuevoRecorrido, FormularioBloqueoGolf, BotonEliminarBloqueo, TarifasGolf } from "./controles";
import { BotonEnlace, Etiqueta, Seccion, Tarjeta, Vacio } from "@/components/ui";

const TIPO_BLOQUEO = {
  MAINTENANCE: "Mantenimiento",
  TOURNAMENT: "Competición",
  CLASS: "Clase",
  CLOSURE: "Cierre",
  EVENT: "Evento",
} as const;

export async function PanelGolf({ esAdmin }: { esAdmin: boolean }) {
  const ahora = new Date();
  const [recorridos, bloqueos, proximasSalidas, pendientes] = await Promise.all([
    prisma.golfCourse.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { schedules: { orderBy: { weekday: "asc" } } },
    }),
    prisma.golfBlock.findMany({
      where: { endsAt: { gt: new Date() } },
      orderBy: { startsAt: "asc" },
      take: 50,
      include: { course: { select: { name: true } }, createdBy: { select: { firstName: true, lastName: true } } },
    }),
    prisma.golfTeeTime.findMany({
      where: { startsAt: { gt: new Date() }, playersBooked: { gt: 0 } },
      orderBy: { startsAt: "asc" },
      take: 25,
      include: {
        course: { select: { name: true, maxPlayers: true } },
        bookings: {
          where: { status: { not: "CANCELLED" } },
          include: { user: { select: { firstName: true, lastName: true, memberNumber: true } } },
        },
      },
    }),
    prisma.golfBooking.findMany({
      where: {
        paymentStatus: "PENDING", status: { notIn: ["CANCELLED", "INVITED"] }, priceCents: { gt: 0 },
        NOT: { teeTime: { startsAt: { gt: ahora } }, invitedBookings: { some: { status: "INVITED", invitationPayment: "HOST" } } },
      },
      orderBy: { teeTime: { startsAt: "asc" } },
      include: {
        user: { select: { firstName: true, lastName: true } },
        teeTime: { include: { course: { select: { name: true } } } },
      },
    }),
  ]);

  const fichas = recorridos.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    kind: r.kind,
    kindLabel: RECORRIDO_GOLF[r.kind].label,
    holes: r.holes,
    teeIntervalMinutes: r.teeIntervalMinutes,
    maxPlayers: r.maxPlayers,
    memberEuros: (r.memberPriceCents / 100).toFixed(2),
    guestEuros: (r.guestPriceCents / 100).toFixed(2),
    buggyEuros: (r.buggyPriceCents / 100).toFixed(2),
    memberTaxTreatment: r.memberTaxTreatment,
    guestTaxTreatment: r.guestTaxTreatment,
    memberTaxLabel: TAX_LABELS[r.memberTaxTreatment],
    buggiesAvailable: r.buggiesAvailable,
    isActive: r.isActive,
    opensAt: r.schedules[0]?.opensAt ?? 8 * 60,
    closesAt: r.schedules[0]?.closesAt ?? 20 * 60,
    precioResumen:
      r.memberPriceCents === 0
        ? "Incluido en la cuota"
        : `${formatEuros(r.memberPriceCents)} socio · ${formatEuros(r.guestPriceCents)} invitado`,
  }));

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="titulo-club text-2xl text-marca-900">Golf</h2>
        <BotonEnlace href="/admin/torneos" variante="secundario">Gestionar torneos</BotonEnlace>
      </div>

      <section className="mb-10 space-y-4">
        <Seccion>Recorridos</Seccion>
        {recorridos.length === 0 ? (
          <Vacio>Todavía no hay ningún recorrido.</Vacio>
        ) : (
          fichas.map((recorrido) => <FichaRecorrido key={recorrido.id} recorrido={recorrido} esAdmin={esAdmin} />)
        )}
      </section>

      {esAdmin && fichas.length > 0 ? (
        <section id="tarifas-golf" className="mb-10 scroll-mt-24">
          <Seccion>Tarifas de golf</Seccion>
          <p className="mb-4 text-sm text-piedra-500">Los precios se fijan por recorrido y se aplican a las nuevas reservas.</p>
          <div className="space-y-4">
            {fichas.map((recorrido) => <TarifasGolf key={recorrido.id} recorrido={recorrido} />)}
          </div>
        </section>
      ) : null}

      <section className="mb-10">
        <Seccion>Próximas salidas con jugadores</Seccion>
        {proximasSalidas.length === 0 ? (
          <Vacio>No hay salidas reservadas.</Vacio>
        ) : (
          <Tarjeta className="divide-y divide-piedra-100">
            {proximasSalidas.map((s) => (
              <div key={s.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
                <div>
                  <p className="font-bold text-marca-900">
                    {formatClubDate(s.startsAt)} · {formatClubTime(s.startsAt)} — {s.course.name}
                  </p>
                  <p className="mt-1 text-xs text-piedra-400">
                    {s.bookings
                      .map(
                        (b) =>
                          `${b.user.memberNumber ?? "—"} ${b.user.firstName} ${b.user.lastName}` +
                          (b.status === "INVITED" ? " (pendiente de aceptar)" : "") +
                          (b.players > 1 ? ` (+${b.players - 1})` : "") +
                          (b.buggies > 0 ? ` · ${b.buggies} buggy` : ""),
                      )
                      .join(" · ")}
                  </p>
                </div>
                <Etiqueta tono={s.playersBooked >= s.course.maxPlayers ? "gris" : "ambar"}>
                  {s.playersBooked} de {s.course.maxPlayers}
                </Etiqueta>
              </div>
            ))}
          </Tarjeta>
        )}
      </section>

      <section className="mb-10">
        <Seccion>Cobros de golf pendientes</Seccion>
        {pendientes.length === 0 ? <Vacio>No hay cobros pendientes.</Vacio> : (
          <Tarjeta className="divide-y divide-piedra-100">
            {pendientes.map((b) => (
              <div key={b.id} className="px-5 py-3">
                <p className="font-bold text-marca-900">{b.user.firstName} {b.user.lastName} · {formatEuros(b.priceCents)}</p>
                <p className="text-sm text-piedra-500">{b.teeTime.course.name} · {formatClubDateTime(b.teeTime.startsAt)} · {b.reference}</p>
                <CobroSalida bookingId={b.id} />
              </div>
            ))}
          </Tarjeta>
        )}
      </section>

      <section className="mb-10">
        <Seccion>Bloquear salidas</Seccion>
        <FormularioBloqueoGolf
          recorridos={recorridos.map((r) => ({ id: r.id, name: r.name }))}
          hoy={clubToday()}
        />
      </section>

      <section className="mb-10">
        <Seccion>Bloqueos activos y futuros</Seccion>
        {bloqueos.length === 0 ? (
          <Vacio>No hay bloqueos programados.</Vacio>
        ) : (
          <ul className="space-y-3">
            {bloqueos.map((b) => (
              <li key={b.id}>
                <Tarjeta className="flex flex-wrap items-start justify-between gap-4 p-5">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Etiqueta tono="granate">{TIPO_BLOQUEO[b.type]}</Etiqueta>
                      {!b.isPublic ? <Etiqueta tono="gris">Motivo oculto al socio</Etiqueta> : null}
                    </div>
                    <p className="mt-2 text-lg font-bold text-marca-900">{b.title}</p>
                    <p className="mt-0.5 text-sm text-marca-800">
                      {formatClubDateTime(b.startsAt)}–{formatClubTime(b.endsAt)} ·{" "}
                      {b.course?.name ?? "Todos los recorridos"}
                    </p>
                    {b.description ? <p className="mt-1 text-sm text-piedra-500">{b.description}</p> : null}
                    <p className="mt-1 text-xs text-piedra-400">
                      Creado por {b.createdBy.firstName} {b.createdBy.lastName}
                    </p>
                  </div>
                  <BotonEliminarBloqueo id={b.id} />
                </Tarjeta>
              </li>
            ))}
          </ul>
        )}
      </section>

      {esAdmin ? <NuevoRecorrido /> : null}
    </>
  );
}
