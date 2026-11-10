import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/guards";
import { formatClubDateTime } from "@/lib/time";
import { Tarjeta, TituloPagina, Vacio } from "@/components/ui";

export const metadata: Metadata = { title: "Auditoría" };

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<{ accion?: string }>;
}) {
  await requireAdmin();
  const { accion } = await searchParams;

  const registros = await prisma.auditLog.findMany({
    where: accion ? { action: accion } : {},
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { actor: { select: { firstName: true, lastName: true, email: true } } },
  });

  const acciones = await prisma.auditLog.groupBy({ by: ["action"], _count: { action: true } });

  return (
    <>
      <TituloPagina
        titulo="Auditoría"
        descripcion="Registro inmutable de las acciones sensibles. Últimos 200 movimientos."
      />

      <form method="get" className="mb-4 flex flex-wrap gap-2">
        <select name="accion" defaultValue={accion ?? ""} className="rounded-lg border border-piedra-300 bg-white px-3 py-2 text-sm">
          <option value="">Todas las acciones</option>
          {acciones
            .sort((a, b) => a.action.localeCompare(b.action))
            .map((a) => (
              <option key={a.action} value={a.action}>
                {a.action} ({a._count.action})
              </option>
            ))}
        </select>
        <button className="rounded-lg bg-marca-700 px-4 py-2 text-sm font-semibold text-piedra-50">Filtrar</button>
      </form>

      {registros.length === 0 ? (
        <Vacio>No hay registros para ese filtro.</Vacio>
      ) : (
        <Tarjeta className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-piedra-200 text-xs uppercase tracking-wide text-marca-500">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Cuando</th>
                <th className="px-4 py-2.5 font-semibold">Quien</th>
                <th className="px-4 py-2.5 font-semibold">Acción</th>
                <th className="px-4 py-2.5 font-semibold">Entidad</th>
                <th className="px-4 py-2.5 font-semibold">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-piedra-200">
              {registros.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap px-4 py-2.5 text-marca-600">{formatClubDateTime(r.createdAt)}</td>
                  <td className="px-4 py-2.5 text-marca-800">
                    {r.actor ? `${r.actor.firstName} ${r.actor.lastName}` : "—"}
                    {r.ip ? <span className="block text-xs text-marca-500">{r.ip}</span> : null}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-marca-800">{r.action}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs text-marca-600">{r.entityType}</td>
                  <td className="px-4 py-2.5 text-xs text-marca-500">
                    {r.metadata ? JSON.stringify(r.metadata).slice(0, 120) : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Tarjeta>
      )}
    </>
  );
}
