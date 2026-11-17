import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth/guards";
import { formatClubDate } from "@/lib/time";
import { ESTADO_SOCIO, RELACION, ROL, TIPO_SOCIO } from "@/lib/vocabulario";
import { AltaManual } from "./controles";
import { Etiqueta, Seccion, Tarjeta, TituloPagina, Vacio } from "@/components/ui";
import type { UserStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Socios" };

const FILTROS: Record<string, { label: string; where: UserStatus[] }> = {
  "": { label: "Activos y suspendidos", where: ["ACTIVE", "SUSPENDED"] },
  activos: { label: "Solo activos", where: ["ACTIVE"] },
  suspendidos: { label: "Suspendidos", where: ["SUSPENDED"] },
  bajas: { label: "Bajas", where: ["BAJA"] },
  rechazados: { label: "Rechazados", where: ["REJECTED"] },
  todos: { label: "Todos", where: ["ACTIVE", "SUSPENDED", "BAJA", "REJECTED", "PENDING"] },
};

export default async function SociosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filtro?: string }>;
}) {
  // El layout de admin deja pasar al colaborador de deporte: esta pagina tiene
  // que exigir personal del club por su cuenta.
  const actual = await requireStaff();
  const esAdmin = actual.role === "ADMIN";
  const { q, filtro } = await searchParams;

  const seleccionado = FILTROS[filtro ?? ""] ?? FILTROS[""];

  const [pendientes, socios] = await Promise.all([
    prisma.user.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" } }),
    prisma.user.findMany({
      where: {
        status: { in: seleccionado.where },
        ...(q
          ? {
              OR: [
                { firstName: { contains: q, mode: "insensitive" as const } },
                { lastName: { contains: q, mode: "insensitive" as const } },
                { email: { contains: q, mode: "insensitive" as const } },
                { memberNumber: { contains: q } },
              ],
            }
          : {}),
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 300,
    }),
  ]);

  return (
    <>
      <TituloPagina
        titulo="Socios"
        descripcion={`${pendientes.length} solicitud${pendientes.length === 1 ? "" : "es"} por revisar · ${socios.length} en el listado`}
      />

      {pendientes.length > 0 ? (
        <section className="mb-10">
          <Seccion>Solicitudes pendientes</Seccion>
          <ul className="space-y-3">
            {pendientes.map((s) => (
              <li key={s.id}>
                <Link href={`/admin/socios/${s.id}`} className="group block">
                  <Tarjeta className="flex flex-wrap items-center justify-between gap-4 p-5 transition-colors group-hover:border-marca-400 group-hover:bg-marca-50">
                    <div>
                      <p className="text-lg font-bold text-marca-900">
                        {s.firstName} {s.lastName}
                      </p>
                      <p className="text-sm text-piedra-500">{s.email}</p>
                      <p className="mt-1 text-xs text-piedra-400">
                        Solicitud del {formatClubDate(s.createdAt)}
                        {s.phone ? ` · ${s.phone}` : ""}
                        {s.ibanLast4 ? " · con domiciliación" : " · sin domiciliación"}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-marca-700 group-hover:underline">
                      Revisar solicitud →
                    </span>
                  </Tarjeta>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mb-10">
        <Seccion>Listado</Seccion>

        <form className="mb-4 flex flex-wrap gap-2" method="get">
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Buscar por nombre, correo o número de socio"
            className="min-w-[16rem] flex-1 rounded-md border border-piedra-300 bg-white px-3.5 py-2 text-sm"
          />
          <select
            name="filtro"
            defaultValue={filtro ?? ""}
            className="rounded-md border border-piedra-300 bg-white px-3 py-2 text-sm"
          >
            {Object.entries(FILTROS).map(([valor, f]) => (
              <option key={valor} value={valor}>{f.label}</option>
            ))}
          </select>
          <button className="rounded-md bg-marca-700 px-4 py-2 text-sm font-bold text-white">Buscar</button>
        </form>

        {socios.length === 0 ? (
          <Vacio>Ningún socio coincide con la busqueda.</Vacio>
        ) : (
          <Tarjeta className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-piedra-200 text-xs uppercase tracking-wide text-piedra-400">
                <tr>
                  <th className="px-4 py-2.5 font-bold">N.º</th>
                  <th className="px-4 py-2.5 font-bold">Socio</th>
                  <th className="px-4 py-2.5 font-bold">Relacion</th>
                  <th className="px-4 py-2.5 font-bold">Tipo</th>
                  <th className="px-4 py-2.5 font-bold">Permisos</th>
                  <th className="px-4 py-2.5 font-bold">Estado</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-piedra-100">
                {socios.map((s) => (
                  <tr key={s.id} className="hover:bg-marca-50/50">
                    <td className="px-4 py-2.5 font-mono text-xs text-piedra-400">
                      {s.memberNumber ?? "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="block font-bold text-marca-900">
                        {s.lastName}, {s.firstName}
                      </span>
                      <span className="block text-xs text-piedra-400">{s.email}</span>
                    </td>
                    <td className="px-4 py-2.5 text-piedra-500">{RELACION[s.relationship].label}</td>
                    <td className="px-4 py-2.5 text-piedra-500">
                      {s.relationship === "SOCIO" ? TIPO_SOCIO[s.memberType].label : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-piedra-500">
                      {s.role === "MEMBER" ? "—" : ROL[s.role].label}
                    </td>
                    <td className="px-4 py-2.5">
                      <Etiqueta tono={ESTADO_SOCIO[s.status].tono}>{ESTADO_SOCIO[s.status].label}</Etiqueta>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Link
                        href={`/admin/socios/${s.id}`}
                        className="text-sm font-bold text-marca-700 hover:underline"
                      >
                        Abrir ficha
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Tarjeta>
        )}
      </section>

      {esAdmin ? <AltaManual /> : null}
    </>
  );
}
