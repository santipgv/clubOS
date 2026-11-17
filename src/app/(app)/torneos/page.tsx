import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/guards";
import { formatClubDate, formatClubDateTime } from "@/lib/time";
import { formatEuros, TAX_LABELS } from "@/lib/booking/pricing";
import { DEPORTE_TORNEO } from "@/lib/vocabulario";
import { plazasLibres } from "@/lib/torneos";
import { FichaTorneo } from "./controles";
import { BotonEnlace, Etiqueta, Seccion, TituloPagina, Vacio } from "@/components/ui";

export const metadata: Metadata = { title: "Torneos" };

export default async function TorneosPage({
  searchParams,
}: {
  searchParams: Promise<{ deporte?: string }>;
}) {
  const user = await requireUser();
  if (user.status !== "ACTIVE") redirect("/pendiente");

  const { deporte } = await searchParams;
  const soloGolf = deporte === "golf";
  const ahora = new Date();

  const torneos = await prisma.tournament.findMany({
    where: {
      sport: soloGolf ? "GOLF" : undefined,
      status: { in: ["OPEN", "CLOSED", "FINISHED"] },
      endsAt: { gt: new Date(ahora.getTime() - 30 * 86400000) },
    },
    orderBy: { startsAt: "asc" },
    include: {
      registrations: {
        where: { status: { not: "CANCELLED" } },
        select: { id: true, userId: true, participantName: true, isGuest: true, status: true, amountCents: true, paymentStatus: true },
      },
    },
  });

  const misInscripciones = await prisma.tournamentRegistration.findMany({
    where: { userId: user.id, status: { not: "CANCELLED" } },
    select: { tournamentId: true, id: true, participantName: true, status: true, isGuest: true },
  });

  const mias = new Map<string, typeof misInscripciones>();
  for (const i of misInscripciones) {
    mias.set(i.tournamentId, [...(mias.get(i.tournamentId) ?? []), i]);
  }

  return (
    <>
      <TituloPagina
        titulo={soloGolf ? "Torneos de golf" : "Torneos"}
        accion={soloGolf ? <BotonEnlace href="/torneos" variante="secundario">Ver todos los torneos</BotonEnlace> : undefined}
        descripcion="Competiciones del club. La inscripción la haces tu y, si el torneo lo permite, puedes traer a un invitado."
      />

      {torneos.length === 0 ? (
        <Vacio>{soloGolf ? "No hay torneos de golf convocados ahora mismo." : "No hay torneos convocados ahora mismo."}</Vacio>
      ) : (
        <div className="space-y-5">
          {torneos.map((t) => {
            const inscritos = t.registrations.filter((r) => r.status === "REGISTERED").length;
            const libres = plazasLibres(t.maxParticipants, inscritos);
            const enPlazo = t.status === "OPEN" && ahora >= t.opensAt && ahora <= t.closesAt;

            return (
              <FichaTorneo
                key={t.id}
                torneo={{
                  id: t.id,
                  nombre: t.name,
                  descripcion: t.description,
                  deporte: DEPORTE_TORNEO[t.sport],
                  fechas:
                    formatClubDate(t.startsAt) === formatClubDate(t.endsAt)
                      ? formatClubDate(t.startsAt)
                      : `${formatClubDate(t.startsAt)} – ${formatClubDate(t.endsAt)}`,
                  plazo: `${formatClubDateTime(t.opensAt)} – ${formatClubDateTime(t.closesAt)}`,
                  admiteInvitados: t.allowGuests,
                  precioSocio: t.memberPriceCents === 0 ? "Gratuita" : formatEuros(t.memberPriceCents),
                  precioInvitado: t.guestPriceCents === 0 ? "Gratuita" : formatEuros(t.guestPriceCents),
                  fiscalSocio: TAX_LABELS[t.memberTaxTreatment],
                  fiscalInvitado: TAX_LABELS[t.guestTaxTreatment],
                  inscritos,
                  plazas: t.maxParticipants,
                  libres,
                  enPlazo,
                  estado: t.status,
                }}
                misInscripciones={(mias.get(t.id) ?? []).map((i) => ({
                  id: i.id,
                  nombre: i.participantName,
                  esInvitado: i.isGuest,
                  enEspera: i.status === "WAITLIST",
                }))}
              />
            );
          })}
        </div>
      )}

      <section className="mt-10">
        <Seccion>Cómo funciona</Seccion>
        <ul className="grid gap-3 text-sm text-piedra-500 sm:grid-cols-3">
          <li className="rounded-lg border border-piedra-200 bg-white p-4">
            <strong className="block text-marca-800">Te inscribes tu</strong>
            Cada plaza tiene detras a un socio, también cuando es la de un invitado.
          </li>
          <li className="rounded-lg border border-piedra-200 bg-white p-4">
            <strong className="block text-marca-800">Si no hay plaza, lista de espera</strong>
            Si alguien se cae, entra automáticamente el primero de la lista.
          </li>
          <li className="rounded-lg border border-piedra-200 bg-white p-4">
            <strong className="block text-marca-800">Se paga en la caseta</strong>
            <Etiqueta tono="ambar">Pendiente</Etiqueta> hasta que recepción registra el cobro.
          </li>
        </ul>
      </section>
    </>
  );
}
