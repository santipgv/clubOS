import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/guards";
import { formatClubDate, formatClubDateTime } from "@/lib/time";
import { formatEuros } from "@/lib/booking/pricing";
import { maskFromLast4 } from "@/lib/iban";
import {
  DEPORTE,
  ESTADO_CUOTA,
  ESTADO_SOCIO,
  RELACION,
  ROL,
  TIPO_SOCIO,
  textoAntiguedad,
} from "@/lib/vocabulario";
import { cerrarOtrasSesiones } from "./acciones";
import { CambioPassword } from "./password";
import { DatosBancarios } from "./datos-bancarios";
import { Boletin } from "./boletin";
import { Boton, Dato, Etiqueta, Seccion, Tarjeta, TituloPagina, Vacio } from "@/components/ui";
import { MovimientosMonedero, SaldoMonedero } from "@/components/monedero";
import { getWallet } from "@/lib/wallet";
import { getSettings } from "@/lib/settings";
import Link from "next/link";

export const metadata: Metadata = { title: "Mi perfil" };

export default async function PerfilPage() {
  const sesion = await requireUser();

  const [user, sesiones, cuotas, reservas, monedero, settings] = await Promise.all([
    prisma.user.findUnique({
      where: { id: sesion.id },
      include: {
        approvedBy: { select: { firstName: true, lastName: true } },
        createdBy: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.session.findMany({
      where: { userId: sesion.id, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: "desc" },
      select: { id: true, createdAt: true, lastSeenAt: true, ip: true, userAgent: true },
    }),
    prisma.membershipFee.findMany({
      where: { userId: sesion.id },
      orderBy: { dueDate: "desc" },
      take: 12,
    }),
    prisma.booking.count({ where: { userId: sesion.id, status: { not: "CANCELLED" } } }),
    getWallet(sesion.id, 30),
    getSettings(),
  ]);

  if (!user) notFound();

  const estado = ESTADO_SOCIO[user.status];
  const tipo = TIPO_SOCIO[user.memberType];
  const relacion = RELACION[user.relationship];
  const rol = ROL[user.role];
  const pendientes = cuotas.filter((c) => c.status === "PENDING" || c.status === "OVERDUE");

  return (
    <>
      <TituloPagina
        titulo="Mi perfil"
        descripcion={`${textoAntiguedad(user.joinedAt)} · ${reservas} reserva${reservas === 1 ? "" : "s"} en tu histórico`}
      />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <div className="scroll-mt-6 lg:col-span-2" id="monedero">
          <Tarjeta className="p-6">
            <Seccion>Monedero</Seccion>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[18rem_1fr]">
              <div className="min-w-0 space-y-4 text-sm leading-relaxed text-marca-700">
                <SaldoMonedero balanceCents={monedero.balanceCents} />
                <p>
                  Úsalo para pagar tus reservas al confirmarlas o desde{" "}
                  <Link href="/mis-reservas" className="font-bold underline underline-offset-2">
                    Mis reservas
                  </Link>
                  . Solo se puede pagar con saldo si cubre el importe entero.
                </p>
                <div className="border-t border-piedra-200 pt-4">
                  <p className="font-bold text-marca-900">Cómo meter dinero</p>
                  <p className="mt-1">
                    Recarga en la caseta del club, en efectivo o por transferencia. Recepción lo anota
                    y el saldo aparece aquí al momento.
                  </p>
                </div>
                <div className="border-t border-piedra-200 pt-4">
                  <p className="font-bold text-marca-900">Devoluciones</p>
                  <ul className="mt-1 list-disc space-y-1 pl-4">
                    <li>
                      Si cancelas una reserva pagada con al menos{" "}
                      {settings["booking.cancelDeadlineHours"]} horas de antelación, lo pagado vuelve
                      aquí.
                    </li>
                    <li>Si el club cancela tu reserva, siempre se te devuelve.</li>
                    <li>Fuera de plazo no hay devolución automática: habla con el club.</li>
                  </ul>
                </div>
              </div>
              <div className="min-w-0">
                <MovimientosMonedero movimientos={monedero.movements} />
              </div>
            </div>
          </Tarjeta>
        </div>

        <Tarjeta className="p-6">
          <Seccion>Tu ficha de socio</Seccion>
          <dl>
            <Dato termino="Nombre">{user.firstName} {user.lastName}</Dato>
            <Dato termino="Número de socio">{user.memberNumber ?? "Sin asignar"}</Dato>
            <Dato termino="Relación con el club" ayuda={relacion.descripcion}>
              {relacion.label}
            </Dato>
            {user.relationship === "SOCIO" ? (
              <Dato termino="Tipo de socio" ayuda={tipo.descripcion}>
                {tipo.label}
              </Dato>
            ) : null}
            <Dato termino="Estado" ayuda={estado.descripcion}>
              <Etiqueta tono={estado.tono}>{estado.label}</Etiqueta>
            </Dato>
            <Dato termino="Permisos en la aplicación" ayuda={rol.descripcion}>
              {rol.label}
            </Dato>
            {user.role === "COLLABORATOR" && user.managedSports.length > 0 ? (
              <Dato termino="Deportes que gestionas">
                {user.managedSports.map((d) => DEPORTE[d]).join(", ")}
              </Dato>
            ) : null}
          </dl>
        </Tarjeta>

        <Tarjeta className="p-6">
          <Seccion>Antigüedad y alta</Seccion>
          <dl>
            <Dato termino="En el club desde">
              {user.joinedAt ? formatClubDate(user.joinedAt) : "Sin fecha registrada"}
            </Dato>
            <Dato termino="Antigüedad">{textoAntiguedad(user.joinedAt)}</Dato>
            <Dato termino="Ficha creada el">{formatClubDateTime(user.createdAt)}</Dato>
            <Dato termino="Ficha creada por">
              {user.createdBy
                ? `${user.createdBy.firstName} ${user.createdBy.lastName}`
                : "Alta por internet"}
            </Dato>
            <Dato termino="Alta aprobada el">
              {user.approvedAt ? formatClubDateTime(user.approvedAt) : "Pendiente"}
            </Dato>
            <Dato termino="Aprobada por">
              {user.approvedBy ? `${user.approvedBy.firstName} ${user.approvedBy.lastName}` : "—"}
            </Dato>
            {user.leftAt ? (
              <Dato termino="Baja" ayuda={user.leaveReason ?? undefined}>
                {formatClubDate(user.leftAt)}
              </Dato>
            ) : null}
          </dl>
        </Tarjeta>

        <Tarjeta className="p-6">
          <Seccion>Datos de contacto</Seccion>
          <dl>
            <Dato termino="Correo">{user.email}</Dato>
            <Dato termino="Teléfono">{user.phone ?? "—"}</Dato>
            <Dato termino="Otro teléfono">{user.altPhone ?? "—"}</Dato>
            <Dato termino="Documento">{user.nationalId ?? "—"}</Dato>
            <Dato termino="Fecha de nacimiento">
              {user.birthDate ? formatClubDate(user.birthDate) : "—"}
            </Dato>
            <Dato termino="Domicilio">
              {user.addressLine
                ? `${user.addressLine}, ${user.postalCode ?? ""} ${user.city ?? ""} (${user.province ?? ""})`
                : "—"}
            </Dato>
          </dl>
          <p className="mt-4 border-t border-piedra-200 pt-3 text-xs leading-relaxed text-piedra-400">
            Para corregir tus datos personales o darte de baja, escribe a la secretaría del club.
            Tus datos se tratan unicamente para gestionar tu condicion de socio.
          </p>
        </Tarjeta>

        <DatosBancarios
          ibanEnmascarado={maskFromLast4(user.ibanLast4)}
          titular={user.accountHolder}
        />

        <div className="lg:col-span-2" id="cuotas">
          <Tarjeta className="p-6">
            <Seccion>
              Cuotas de socio
            </Seccion>
            {cuotas.length === 0 ? (
              <Vacio>Todavia no hay cuotas registradas a tu nombre.</Vacio>
            ) : (
              <>
                {pendientes.length > 0 ? (
                  <div className="mb-4 rounded-md border border-acento-300 bg-acento-100 px-4 py-3 text-sm text-acento-600">
                    Tienes {pendientes.length} cuota{pendientes.length === 1 ? "" : "s"} sin abonar,
                    por un total de{" "}
                    <strong>{formatEuros(pendientes.reduce((s, c) => s + c.amountCents, 0))}</strong>.
                  </div>
                ) : null}
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[540px] text-left text-sm">
                    <thead className="border-b border-piedra-200 text-xs uppercase tracking-wide text-piedra-400">
                      <tr>
                        <th className="py-2 font-bold">Periodo</th>
                        <th className="py-2 font-bold">Concepto</th>
                        <th className="py-2 font-bold">Vence</th>
                        <th className="py-2 text-right font-bold">Importe</th>
                        <th className="py-2 text-right font-bold">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-piedra-100">
                      {cuotas.map((c) => (
                        <tr key={c.id}>
                          <td className="py-2.5 font-bold text-marca-900">{c.period}</td>
                          <td className="py-2.5 text-piedra-500">{c.concept}</td>
                          <td className="py-2.5 text-piedra-500">{formatClubDate(c.dueDate)}</td>
                          <td className="py-2.5 text-right font-bold text-marca-900">
                            {formatEuros(c.amountCents)}
                          </td>
                          <td className="py-2.5 text-right">
                            <Etiqueta tono={ESTADO_CUOTA[c.status].tono}>
                              {ESTADO_CUOTA[c.status].label}
                            </Etiqueta>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Tarjeta>
        </div>

        <Boletin
          suscrito={user.newsletterOptIn}
          desde={user.newsletterUpdatedAt ? formatClubDateTime(user.newsletterUpdatedAt) : null}
        />

        <CambioPassword tienePassword={Boolean(user.passwordHash)} />

        <Tarjeta className="p-6">
          <Seccion>Sesiones abiertas ({sesiones.length})</Seccion>
          <ul className="space-y-3 text-sm">
            {sesiones.map((s) => (
              <li key={s.id} className="rounded-md border border-piedra-200 bg-piedra-50 px-3 py-2.5">
                <p className="font-bold text-marca-800">
                  {s.userAgent?.slice(0, 60) ?? "Dispositivo desconocido"}
                </p>
                <p className="mt-0.5 text-xs text-piedra-400">
                  Ultima actividad {formatClubDateTime(s.lastSeenAt)}
                  {s.ip ? ` · ${s.ip}` : ""}
                </p>
              </li>
            ))}
          </ul>
          {sesiones.length > 1 ? (
            <form action={cerrarOtrasSesiones} className="mt-4 border-t border-piedra-200 pt-4">
              <Boton variante="secundario" tamano="sm">Cerrar el resto de sesiones</Boton>
            </form>
          ) : null}
        </Tarjeta>
      </div>
    </>
  );
}
