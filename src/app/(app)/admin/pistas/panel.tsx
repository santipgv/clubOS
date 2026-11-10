import type { Sport } from "@/lib/types";
import { filtroPistas, type Ambito } from "@/lib/auth/ambito";
import { prisma } from "@/lib/db";
import { TAX_LABELS } from "@/lib/booking/pricing";
import { minutesToHHMM } from "@/lib/time";
import { TIPO_SOCIO } from "@/lib/vocabulario";
import { DEPORTE_NOMBRE } from "@/lib/booking/deportes";
import { FichaPista, NuevaPista, TarifasPista } from "./controles";
import { Seccion, Vacio } from "@/components/ui";

export async function PanelPistas({ deporte, ambito, esAdmin }: { deporte?: Sport; ambito: Ambito; esAdmin: boolean }) {
  const [pistas, tarifas] = await Promise.all([
    prisma.court.findMany({
      where: { AND: [filtroPistas(ambito), { sport: deporte }] },
      orderBy: [{ sport: "asc" }, { sortOrder: "asc" }],
      include: { schedules: { orderBy: { weekday: "asc" } } },
    }),
    esAdmin ? prisma.priceRule.findMany({
      where: deporte ? {
        OR: [
          { courtId: null, sport: deporte },
          { courtId: null, sport: null },
          { court: { sport: deporte } },
        ],
      } : undefined,
      orderBy: [{ priority: "desc" }],
    }) : Promise.resolve([]),
  ]);

  return (
    <>
      <section className="mb-10 space-y-4">
        <Seccion>{deporte ? `Pistas de ${DEPORTE_NOMBRE[deporte]}` : "Pistas"}</Seccion>
        {pistas.length === 0 ? <Vacio>No hay pistas configuradas.</Vacio> : null}
        {pistas.map((p) => (
          <FichaPista
            key={p.id}
            pista={{
              id: p.id,
              name: p.name,
              code: p.code,
              sport: DEPORTE_NOMBRE[p.sport],
              surface: p.surface,
              isIndoor: p.isIndoor,
              isActive: p.isActive,
              slotMinutes: p.slotMinutes,
              allowedDurations: p.allowedDurations,
              schedules: p.schedules.map((s) => ({
                weekday: s.weekday,
                opensAt: s.opensAt,
                closesAt: s.closesAt,
                isActive: s.isActive,
              })),
            }}
          />
        ))}
      </section>

      {esAdmin ? (
        <>
          <section className="mb-10">
            <Seccion>Tarifas de pista</Seccion>
            <TarifasPista
              key={deporte ?? "todos"}
              deporteInicial={deporte}
              pistas={pistas.filter((p) => p.isActive).map((p) => ({ id: p.id, name: p.name, sport: p.sport }))}
              tarifas={tarifas.map((t) => {
                const pista = t.courtId ? pistas.find((p) => p.id === t.courtId) : null;
                return {
                  id: t.id,
                  courtId: t.courtId,
                  sport: t.sport,
                  memberType: t.memberType,
                  label: t.label,
                  euros: (t.priceCents / 100).toFixed(2),
                  taxTreatment: t.taxTreatment,
                  fromMinute: t.fromMinute,
                  toMinute: t.toMinute,
                  priority: t.priority,
                  ambito: [
                    pista ? pista.name : t.sport ? DEPORTE_NOMBRE[t.sport] : "Todo el club",
                    t.memberType ? TIPO_SOCIO[t.memberType].label : "todos los socios",
                  ].join(" · "),
                  fiscalLabel: TAX_LABELS[t.taxTreatment],
                  franja:
                    t.fromMinute === 0 && t.toMinute >= 1440
                      ? "todo el dia"
                      : `${minutesToHHMM(t.fromMinute)}–${minutesToHHMM(t.toMinute === 1440 ? 1439 : t.toMinute)}`,
                };
              })}
            />
          </section>

          <NuevaPista key={deporte ?? "todos"} deporteInicial={deporte} />
        </>
      ) : null}
    </>
  );
}
