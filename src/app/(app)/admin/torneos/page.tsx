import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { deportesGestionados, puedeConfigurarDeportes, requireGestorDeDeportes } from "@/lib/auth/guards";
import { TournamentSport } from "@/generated/prisma/enums";
import { filtroTorneos } from "@/lib/auth/ambito";
import { formatClubDate } from "@/lib/time";
import { formatEuros } from "@/lib/booking/pricing";
import { DEPORTE_TORNEO } from "@/lib/vocabulario";
import { FormularioTorneo, ListaInscritos } from "./controles";
import { Etiqueta, Seccion, Tarjeta, TituloPagina, Vacio } from "@/components/ui";
import { formatInTimeZone } from "date-fns-tz";

export const metadata: Metadata = { title: "Torneos" };

const ESTADO = {
  DRAFT: { label: "Borrador", tono: "gris" },
  OPEN: { label: "Inscripciones abiertas", tono: "verde" },
  CLOSED: { label: "Cerrado", tono: "ambar" },
  FINISHED: { label: "Disputado", tono: "gris" },
  CANCELLED: { label: "Cancelado", tono: "granate" },
} as const;

export default async function AdminTorneosPage() {
  const actual = await requireGestorDeDeportes();
  // El colaborador ve, crea y edita los torneos de sus deportes. Recepcion los
  // ve todos y cobra inscripciones, pero no los edita.
  const ambito = deportesGestionados(actual);
  const puedeEditar = puedeConfigurarDeportes(actual);
  const deportes = ambito ?? Object.values(TournamentSport);

  const torneos = await prisma.tournament.findMany({
    where: filtroTorneos(ambito),
    orderBy: { startsAt: "desc" },
    take: 50,
    include: {
      registrations: {
        orderBy: { createdAt: "asc" },
        include: { user: { select: { firstName: true, lastName: true, memberNumber: true } } },
      },
    },
  });

  return (
    <>
      <TituloPagina
        titulo="Torneos"
        descripcion="Convocatorias, inscripciones y cobros. Los socios solo ven los que están en 'Inscripciones abiertas' o posteriores."
      />

      {puedeEditar && deportes.length > 0 ? (
        <div className="mb-10">
          <Seccion>Nuevo torneo</Seccion>
          <FormularioTorneo deportes={deportes} />
        </div>
      ) : null}

      <Seccion>Convocatorias</Seccion>
      {torneos.length === 0 ? (
        <Vacio>Todavia no hay ningun torneo.</Vacio>
      ) : (
        <div className="space-y-5">
          {torneos.map((t) => {
            const inscritos = t.registrations.filter((r) => r.status === "REGISTERED");
            const espera = t.registrations.filter((r) => r.status === "WAITLIST");
            const pendienteCobro = t.registrations
              .filter((r) => r.status !== "CANCELLED" && r.paymentStatus === "PENDING")
              .reduce((s, r) => s + r.amountCents, 0);
            const cobrado = t.registrations
              .filter((r) => r.paymentStatus === "PAID")
              .reduce((s, r) => s + r.amountCents, 0);

            return (
              <Tarjeta key={t.id} className="p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Etiqueta tono={ESTADO[t.status].tono}>{ESTADO[t.status].label}</Etiqueta>
                      <Etiqueta tono="oro">{DEPORTE_TORNEO[t.sport]}</Etiqueta>
                      {t.allowGuests ? <Etiqueta tono="neutro">Admite invitados</Etiqueta> : null}
                    </div>
                    <h3 className="mt-2 text-xl font-bold text-marca-900">{t.name}</h3>
                    <p className="mt-1 text-sm text-piedra-500">
                      {formatClubDate(t.startsAt)} – {formatClubDate(t.endsAt)} · inscripción hasta el{" "}
                      {formatClubDate(t.closesAt)}
                    </p>
                    <p className="mt-1 text-xs text-piedra-400">
                      Socio {t.memberPriceCents === 0 ? "gratis" : formatEuros(t.memberPriceCents)}
                      {t.allowGuests
                        ? ` · invitado ${t.guestPriceCents === 0 ? "gratis" : formatEuros(t.guestPriceCents)}`
                        : ""}
                    </p>
                  </div>

                  <div className="text-right text-sm">
                    <p className="font-bold text-marca-900">
                      {inscritos.length}
                      {t.maxParticipants > 0 ? ` / ${t.maxParticipants}` : ""} inscritos
                    </p>
                    {espera.length > 0 ? (
                      <p className="text-xs text-piedra-500">{espera.length} en lista de espera</p>
                    ) : null}
                    <p className="mt-2 text-xs text-piedra-500">
                      Cobrado <strong className="text-marca-800">{formatEuros(cobrado)}</strong>
                    </p>
                    {pendienteCobro > 0 ? (
                      <p className="text-xs text-granate-500">
                        Pendiente <strong>{formatEuros(pendienteCobro)}</strong>
                      </p>
                    ) : null}
                  </div>
                </div>

                <ListaInscritos
                  puedeEditar={puedeEditar}
                  deportes={deportes}
                  torneo={{
                    id: t.id,
                    name: t.name,
                    description: t.description,
                    sport: t.sport,
                    startDay: formatInTimeZone(t.startsAt, "Europe/Madrid", "yyyy-MM-dd"),
                    endDay: formatInTimeZone(new Date(t.endsAt.getTime() - 1000), "Europe/Madrid", "yyyy-MM-dd"),
                    opensDay: formatInTimeZone(t.opensAt, "Europe/Madrid", "yyyy-MM-dd"),
                    closesDay: formatInTimeZone(new Date(t.closesAt.getTime() - 1000), "Europe/Madrid", "yyyy-MM-dd"),
                    maxParticipants: t.maxParticipants,
                    allowGuests: t.allowGuests,
                    memberEuros: (t.memberPriceCents / 100).toFixed(2),
                    guestEuros: (t.guestPriceCents / 100).toFixed(2),
                    memberTaxTreatment: t.memberTaxTreatment,
                    guestTaxTreatment: t.guestTaxTreatment,
                    status: t.status,
                  }}
                  inscripciones={t.registrations.map((r) => ({
                    id: r.id,
                    nombre: r.participantName,
                    socio: `${r.user.firstName} ${r.user.lastName}`,
                    numeroSocio: r.user.memberNumber,
                    esInvitado: r.isGuest,
                    estado: r.status,
                    importe: r.amountCents === 0 ? "—" : formatEuros(r.amountCents),
                    pagada: r.paymentStatus === "PAID",
                    sinCoste: r.amountCents === 0,
                  }))}
                />
              </Tarjeta>
            );
          })}
        </div>
      )}
    </>
  );
}
