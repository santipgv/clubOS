import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireActiveMember, isStaff } from "@/lib/auth/guards";
import { getDayAvailability, durationsAvailableAt, quoteSlot } from "@/lib/booking/availability";
import { DEPORTE_NOMBRE, SLUG_A_DEPORTE } from "@/lib/booking/deportes";
import { formatClubDayLong, isValidDay, minutesToHHMM } from "@/lib/time";
import { formatEuros, TAX_LABELS } from "@/lib/booking/pricing";
import { FormularioConfirmacion } from "./formulario";
import { Tarjeta, TituloPagina, Aviso } from "@/components/ui";
import { prisma } from "@/lib/db";

export const metadata: Metadata = { title: "Confirmar reserva" };

export default async function ConfirmarPage({
  params,
  searchParams,
}: {
  params: Promise<{ deporte: string }>;
  searchParams: Promise<{ pista?: string; dia?: string; inicio?: string; duracion?: string }>;
}) {
  const user = await requireActiveMember();
  const { deporte } = await params;
  const sport = SLUG_A_DEPORTE[deporte];
  if (!sport) notFound();

  const sp = await searchParams;
  const day = sp.dia;
  const startMinute = Number(sp.inicio);

  if (!day || !isValidDay(day) || !Number.isInteger(startMinute) || !sp.pista) {
    redirect(`/reservar/${deporte}`);
  }

  const disponibilidad = await getDayAvailability({
    sport,
    day,
    viewerId: user.id,
    viewerIsStaff: isStaff(user),
  });

  const columna = disponibilidad.courts.find((c) => c.court.id === sp.pista);
  if (!columna) notFound();

  const duraciones = durationsAvailableAt(columna, startMinute);

  if (duraciones.length === 0) {
    return (
      <>
        <TituloPagina titulo="Confirmar reserva" />
        <Aviso tipo="error">
          Ese hueco ya no esta disponible.{" "}
          <Link href={`/reservar/${deporte}?dia=${day}`} className="font-semibold underline">
            Volver a la disponibilidad
          </Link>
        </Aviso>
      </>
    );
  }

  const duracionPedida = Number(sp.duracion);
  const duracion = duraciones.includes(duracionPedida) ? duracionPedida : duraciones[0];

  const presupuesto = await quoteSlot({
    courtId: columna.court.id,
    sport,
    memberType: user.memberType,
    day,
    startMinute,
    durationMinutes: duracion,
  });

  const monedero = await prisma.user.findUnique({
    where: { id: user.id },
    select: { walletBalanceCents: true },
  });
  const saldo = monedero?.walletBalanceCents ?? 0;
  const cubre = presupuesto.priceCents > 0 && saldo >= presupuesto.priceCents;

  return (
    <>
      <TituloPagina
        titulo="Confirmar reserva"
        descripcion={`${DEPORTE_NOMBRE[sport]} · ${formatClubDayLong(day)}`}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <FormularioConfirmacion
          slugDeporte={deporte}
          courtId={columna.court.id}
          courtName={columna.court.name}
          maxPlayers={columna.court.maxPlayers}
          day={day}
          startMinute={startMinute}
          duraciones={duraciones}
          duracionActual={duracion}
          importe={presupuesto.priceCents > 0 ? formatEuros(presupuesto.priceCents) : null}
          saldo={cubre ? formatEuros(saldo) : null}
        />

        <Tarjeta className="h-fit p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-marca-600">Resumen</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <Fila termino="Pista" valor={columna.court.name} />
            <Fila termino="Día" valor={formatClubDayLong(day)} />
            <Fila
              termino="Horario"
              valor={`${minutesToHHMM(startMinute)} – ${minutesToHHMM(startMinute + duracion)}`}
            />
            <Fila termino="Duración" valor={`${duracion} minutos`} />
            <div className="border-t border-piedra-200 pt-3">
              <Fila
                termino="Importe"
                valor={presupuesto.priceCents === 0 ? "Incluido en la cuota" : formatEuros(presupuesto.priceCents)}
                fuerte
              />
              <p className="mt-1 text-xs text-marca-500">
                {TAX_LABELS[presupuesto.taxTreatment]}
                {presupuesto.taxCents > 0 ? ` · incluye ${formatEuros(presupuesto.taxCents)} de IVA` : ""}
              </p>
            </div>
          </dl>
          <p className="mt-4 border-t border-piedra-200 pt-3 text-xs leading-relaxed text-marca-500">
            Puedes pagar con tu monedero o en la caseta del club. Si cancelas hasta{" "}
            {disponibilidad.settings["booking.cancelDeadlineHours"]} horas antes, lo pagado vuelve a
            tu monedero.
          </p>
        </Tarjeta>
      </div>
    </>
  );
}

function Fila({ termino, valor, fuerte }: { termino: string; valor: string; fuerte?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-marca-600">{termino}</dt>
      <dd className={fuerte ? "text-lg font-bold text-marca-900" : "font-medium text-marca-900"}>{valor}</dd>
    </div>
  );
}
