import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { deportesGestionados, requireGestorDeDeportes } from "@/lib/auth/guards";
import { deportesElegibles, filtroBloqueos, filtroPistas } from "@/lib/auth/ambito";
import { clubToday, formatClubDateTime, formatClubTime } from "@/lib/time";
import { DEPORTE_NOMBRE } from "@/lib/booking/deportes";
import { FormularioBloqueo, BotonEliminar } from "./controles";
import { Etiqueta, Tarjeta, TituloPagina, Vacio } from "@/components/ui";

export const metadata: Metadata = { title: "Bloqueos y eventos" };

const TIPO = {
  MAINTENANCE: "Mantenimiento",
  TOURNAMENT: "Torneo",
  CLASS: "Clase",
  CLOSURE: "Cierre",
  EVENT: "Evento",
} as const;

export default async function BloqueosPage() {
  const gestor = await requireGestorDeDeportes();
  // Un colaborador solo ve y gestiona los bloqueos de sus deportes.
  const ambito = deportesGestionados(gestor);

  const [bloqueos, pistas] = await Promise.all([
    prisma.courtBlock.findMany({
      where: { endsAt: { gt: new Date() }, ...filtroBloqueos(ambito) },
      orderBy: { startsAt: "asc" },
      include: { court: { select: { name: true } }, createdBy: { select: { firstName: true, lastName: true } } },
      take: 100,
    }),
    prisma.court.findMany({
      where: { isActive: true, ...filtroPistas(ambito) },
      orderBy: [{ sport: "asc" }, { sortOrder: "asc" }],
      select: { id: true, name: true, sport: true },
    }),
  ]);

  return (
    <>
      <TituloPagina
        titulo="Bloqueos y eventos"
        descripcion="Reserva franjas para torneos, clases, mantenimiento o cierres del club."
      />

      <div className="mb-10">
        <FormularioBloqueo
          pistas={pistas}
          deportes={deportesElegibles(ambito)}
          permiteClub={ambito === null}
          hoy={clubToday()}
        />
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-marca-600">
          Bloqueos activos y futuros
        </h2>
        {bloqueos.length === 0 ? (
          <Vacio>No hay bloqueos programados.</Vacio>
        ) : (
          <ul className="space-y-3">
            {bloqueos.map((b) => (
              <li key={b.id}>
                <Tarjeta className="flex flex-wrap items-start justify-between gap-4 p-5">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Etiqueta tono="tierra">{TIPO[b.type]}</Etiqueta>
                      {!b.isPublic ? <Etiqueta tono="gris">Motivo oculto al socio</Etiqueta> : null}
                    </div>
                    <p className="mt-2 text-lg font-bold text-marca-900">{b.title}</p>
                    <p className="mt-0.5 text-sm text-marca-700">
                      {formatClubDateTime(b.startsAt)}–{formatClubTime(b.endsAt)} ·{" "}
                      {b.court?.name ?? (b.sport ? `Todas las pistas de ${DEPORTE_NOMBRE[b.sport]}` : "Todo el club")}
                    </p>
                    {b.description ? <p className="mt-1 text-sm text-marca-600">{b.description}</p> : null}
                    <p className="mt-1 text-xs text-marca-500">
                      Creado por {b.createdBy.firstName} {b.createdBy.lastName}
                    </p>
                  </div>
                  <BotonEliminar id={b.id} />
                </Tarjeta>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
