import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/guards";
import { formatEuros } from "@/lib/booking/pricing";
import { marcarCuotasVencidas, resumenPorPeriodo, periodoDe, vencimientoDe } from "@/lib/cuotas";
import { formatClubDate } from "@/lib/time";
import { TIPO_SOCIO } from "@/lib/vocabulario";
import { TarifasCuota, GenerarCuotas, CobrarPeriodo } from "./controles";
import { Etiqueta, Seccion, Tarjeta, TituloPagina, Vacio } from "@/components/ui";
import type { MemberType } from "@/lib/types";

export const metadata: Metadata = { title: "Cuotas" };

const TIPOS = Object.keys(TIPO_SOCIO) as MemberType[];

export default async function CuotasPage() {
  await requireAdmin();

  // Al abrir la pantalla se ponen al dia los vencimientos, para que lo que se
  // ve sea el estado real y no dependa de que alguien lance nada.
  await marcarCuotasVencidas();

  const [tarifas, resumen, sociosActivos] = await Promise.all([
    prisma.feeRate.findMany(),
    resumenPorPeriodo(),
    prisma.user.count({ where: { status: "ACTIVE", relationship: "SOCIO" } }),
  ]);

  const porTipo = new Map(tarifas.map((t) => [t.memberType, t]));
  const anoActual = new Date().getFullYear();

  const previsionSemestral = TIPOS.reduce((total, tipo) => {
    const t = porTipo.get(tipo);
    return total + (t && t.isBilled ? t.amountCents : 0);
  }, 0);

  return (
    <>
      <TituloPagina
        titulo="Cuotas de socio"
        descripcion={`${sociosActivos} socios activos · se giran dos cuotas al año, con vencimiento el 5 de enero y el 5 de julio`}
      />

      <section className="mb-10">
        <Seccion>Tarifas por categoria</Seccion>
        <TarifasCuota
          tarifas={TIPOS.map((tipo) => {
            const t = porTipo.get(tipo);
            return {
              tipo,
              label: TIPO_SOCIO[tipo].label,
              descripcion: TIPO_SOCIO[tipo].descripcion,
              euros: t ? (t.amountCents / 100).toFixed(2) : "0.00",
              girar: t ? t.isBilled : tipo !== "HONORARIO" && tipo !== "INVITADO",
              fiscal: t?.taxTreatment ?? "NOT_SUBJECT",
            };
          })}
        />
        {previsionSemestral > 0 ? (
          <p className="mt-3 text-xs text-piedra-400">
            Importe de un semestre sumando una cuota de cada categoria: {formatEuros(previsionSemestral)}.
            La cuota anual de cada socio es el doble de lo que pongas aquí.
          </p>
        ) : null}
      </section>

      <section className="mb-10">
        <Seccion>Generar cuotas</Seccion>
        <Tarjeta className="p-5">
          <p className="mb-4 text-sm text-piedra-500">
            Crea los recibos de todos los socios activos a partir de las tarifas de arriba. Se puede
            lanzar las veces que haga falta: las cuotas que ya existen no se duplican ni cambian de
            importe.
          </p>
          <GenerarCuotas anoActual={anoActual} />
          <p className="mt-4 border-t border-piedra-200 pt-3 text-xs text-piedra-400">
            Próximos vencimientos: {periodoDe(anoActual, 1)} el {formatClubDate(vencimientoDe(anoActual, 1))} ·{" "}
            {periodoDe(anoActual, 2)} el {formatClubDate(vencimientoDe(anoActual, 2))}.
          </p>
        </Tarjeta>
      </section>

      <section>
        <Seccion>Estado por periodo</Seccion>
        {resumen.length === 0 ? (
          <Vacio>Todavia no se ha generado ninguna cuota.</Vacio>
        ) : (
          <Tarjeta className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="border-b border-piedra-200 text-xs uppercase tracking-wide text-piedra-400">
                <tr>
                  <th className="px-4 py-2.5 font-bold">Periodo</th>
                  <th className="px-4 py-2.5 font-bold">Recibos</th>
                  <th className="px-4 py-2.5 text-right font-bold">Total</th>
                  <th className="px-4 py-2.5 text-right font-bold">Cobrado</th>
                  <th className="px-4 py-2.5 text-right font-bold">Pendiente</th>
                  <th className="px-4 py-2.5 text-right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-piedra-100">
                {resumen.map((r) => (
                  <tr key={r.periodo}>
                    <td className="px-4 py-2.5 font-bold text-marca-900">{r.periodo}</td>
                    <td className="px-4 py-2.5 text-piedra-500">
                      {r.total}
                      {r.vencidas > 0 ? (
                        <Etiqueta tono="granate" className="ml-2">{r.vencidas} vencidas</Etiqueta>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 text-right text-piedra-500">{formatEuros(r.importeTotal)}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-marca-800">{formatEuros(r.cobrado)}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-granate-500">
                      {formatEuros(r.pendiente)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {r.pendiente > 0 ? <CobrarPeriodo periodo={r.periodo} /> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Tarjeta>
        )}
        <p className="mt-3 text-xs text-piedra-400">
          El detalle por socio y el cobro individual están en la ficha de cada uno, desde{" "}
          <Link href="/admin/socios" className="font-bold text-marca-700 underline">Socios</Link>.
        </p>
      </section>
    </>
  );
}
