import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { deportesGestionados, requireGestorDeDeportes } from "@/lib/auth/guards";
import { filtroPistas, filtroReservas } from "@/lib/auth/ambito";
import { clubDayMinutesToUtc, clubToday, formatClubDayLong, formatClubTime, isValidDay, addDaysToDay } from "@/lib/time";
import { formatEuros, TAX_LABELS } from "@/lib/booking/pricing";
import { DEPORTE_NOMBRE } from "@/lib/booking/deportes";
import { ControlesReserva, ReservaPorSocio } from "./controles";
import { SemanaReservas } from "./semana";
import { BotonEnlace, Etiqueta, Tarjeta, TituloPagina, Vacio } from "@/components/ui";

export const metadata: Metadata = { title: "Reservas" };

export default async function AdminReservasPage({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string; vista?: string; deporte?: string; instalacion?: string }>;
}) {
  const gestor = await requireGestorDeDeportes();
  const ambito = deportesGestionados(gestor);
  const { dia, vista, deporte, instalacion } = await searchParams;
  const day = dia && isValidDay(dia) ? dia : clubToday();

  const semanal = vista === "semana";
  const vistas = (
    <nav aria-label="Vistas de reservas" className="mb-6 flex flex-wrap gap-2">
      <BotonEnlace href={`/admin/reservas?dia=${day}`} tamano="sm"
        variante={semanal ? "secundario" : "primario"} aria-current={semanal ? undefined : "page"}>
        Reservas del día
      </BotonEnlace>
      <BotonEnlace href={`/admin/reservas?vista=semana&dia=${day}`} tamano="sm"
        variante={semanal ? "primario" : "secundario"} aria-current={semanal ? "page" : undefined}>
        Disponibilidad semanal
      </BotonEnlace>
    </nav>
  );

  if (semanal) {
    return (
      <>
        <TituloPagina titulo="Reservas del club" descripcion="Disponibilidad de los próximos siete días a partir de la fecha elegida." />
        {vistas}
        <SemanaReservas day={day} deporte={deporte} instalacion={instalacion} ambito={ambito} />
      </>
    );
  }

  const [reservas, pistas] = await Promise.all([
    prisma.booking.findMany({
      where: {
        startsAt: { gte: clubDayMinutesToUtc(day, 0), lt: clubDayMinutesToUtc(day, 24 * 60) },
        ...filtroReservas(ambito),
      },
      orderBy: [{ startsAt: "asc" }, { courtId: "asc" }],
      include: {
        court: { select: { name: true, sport: true } },
        user: { select: { firstName: true, lastName: true, memberNumber: true, email: true } },
        payment: { select: { method: true, amountCents: true } },
      },
    }),
    prisma.court.findMany({
      where: { isActive: true, ...filtroPistas(ambito) },
      orderBy: [{ sport: "asc" }, { sortOrder: "asc" }],
      select: { id: true, name: true, sport: true, slotMinutes: true, allowedDurations: true },
    }),
  ]);

  const totalCobrado = reservas
    .filter((r) => r.paymentStatus === "PAID")
    .reduce((s, r) => s + r.priceCents, 0);
  const totalPendiente = reservas
    .filter((r) => r.paymentStatus === "PENDING" && r.status !== "CANCELLED")
    .reduce((s, r) => s + r.priceCents, 0);

  return (
    <>
      <TituloPagina
        titulo="Reservas del día"
        descripcion={
          ambito === null
            ? formatClubDayLong(day)
            : `${formatClubDayLong(day)} · ${ambito.length > 0 ? ambito.map((s) => DEPORTE_NOMBRE[s]).join(", ") : "Sin deportes asignados"}`
        }
      />
      {vistas}

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link href={`/admin/reservas?dia=${addDaysToDay(day, -1)}`} className="rounded-lg border border-piedra-300 bg-white px-3 py-2 text-sm font-semibold text-marca-700">
          ← Día anterior
        </Link>
        <form method="get" className="flex items-center gap-2">
          <input type="date" name="dia" defaultValue={day} className="rounded-lg border border-piedra-300 bg-white px-3 py-2 text-sm" />
          <button className="rounded-lg bg-marca-700 px-3 py-2 text-sm font-semibold text-piedra-50">Ver</button>
        </form>
        <Link href={`/admin/reservas?dia=${addDaysToDay(day, 1)}`} className="rounded-lg border border-piedra-300 bg-white px-3 py-2 text-sm font-semibold text-marca-700">
          Día siguiente →
        </Link>
        <div className="ml-auto flex gap-4 text-sm">
          <span className="text-marca-600">
            Cobrado <strong className="text-marca-900">{formatEuros(totalCobrado)}</strong>
          </span>
          <span className="text-marca-600">
            Pendiente <strong className="text-granate-600">{formatEuros(totalPendiente)}</strong>
          </span>
        </div>
      </div>

      {reservas.length === 0 ? (
        <Vacio>No hay reservas para este dia.</Vacio>
      ) : (
        <ul className="mb-10 space-y-3">
          {reservas.map((r) => (
            <li key={r.id} id={r.id}>
              <Tarjeta className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-marca-500">
                      {DEPORTE_NOMBRE[r.court.sport]} · {r.reference}
                    </p>
                    <p className="mt-0.5 text-lg font-bold text-marca-900">
                      {formatClubTime(r.startsAt)}–{formatClubTime(r.endsAt)} · {r.court.name}
                    </p>
                    <p className="mt-1 text-sm text-marca-700">
                      <span className="font-mono text-xs text-marca-500">{r.user.memberNumber ?? "—"}</span>{" "}
                      {r.user.firstName} {r.user.lastName}
                      <span className="text-marca-500"> · {r.user.email}</span>
                    </p>
                    <p className="mt-1 text-xs text-marca-500">
                      {r.priceCents > 0
                        ? `${formatEuros(r.priceCents)} · ${TAX_LABELS[r.taxTreatment]}`
                        : "Incluida en la cuota"}
                      {r.guestCount > 0 ? ` · ${r.guestCount} invitado(s)` : ""}
                      {r.playerNames.length > 0 ? ` · ${r.playerNames.join(", ")}` : ""}
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-3">
                    <div className="flex gap-2">
                      {r.status === "CANCELLED" ? <Etiqueta tono="tierra">Cancelada</Etiqueta> : null}
                      {r.status === "NO_SHOW" ? <Etiqueta tono="ambar">No presentado</Etiqueta> : null}
                      <Etiqueta tono={r.paymentStatus === "PAID" || r.paymentStatus === "REFUNDED" ? "verde" : r.paymentStatus === "NOT_REQUIRED" ? "gris" : "ambar"}>
                        {r.paymentStatus === "PAID"
                          ? r.payment?.method === "WALLET" ? "Pagado con monedero" : "Pagado"
                          : r.paymentStatus === "REFUNDED" ? "Devuelto al monedero"
                          : r.paymentStatus === "NOT_REQUIRED" ? "Incluida" : "Reservado"}
                      </Etiqueta>
                    </div>
                    <ControlesReserva
                      bookingId={r.id}
                      cancelada={r.status === "CANCELLED"}
                      pagada={r.paymentStatus === "PAID"}
                      gratuita={r.priceCents === 0}
                      importe={formatEuros(r.payment?.amountCents ?? r.priceCents)}
                    />
                  </div>
                </div>
              </Tarjeta>
            </li>
          ))}
        </ul>
      )}

      {pistas.length > 0 ? <ReservaPorSocio day={day} pistas={pistas} /> : null}
    </>
  );
}
