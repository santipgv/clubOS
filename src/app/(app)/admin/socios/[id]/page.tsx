import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { isStaff } from "@/lib/auth/guards";
import { CLUB_TZ, formatClubDate, formatClubDateTime, formatClubTime } from "@/lib/time";
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
import {
  BloqueAprobacion,
  BloqueCuotas,
  BloqueDatos,
  BloqueEstado,
  BloqueRecarga,
  BloquePermisos,
  BotonRestablecer,
} from "./controles";
import { Dato, Etiqueta, Seccion, Tarjeta, Vacio } from "@/components/ui";
import { MovimientosMonedero, SaldoMonedero } from "@/components/monedero";
import { getWallet } from "@/lib/wallet";

export const metadata: Metadata = { title: "Ficha de socio" };

export default async function FichaSocioPage({ params }: { params: Promise<{ id: string }> }) {
  const actual = await getSessionUser();
  if (!actual || !isStaff(actual)) notFound();
  const esAdmin = actual.role === "ADMIN";

  const { id } = await params;

  const socio = await prisma.user.findUnique({
    where: { id },
    include: {
      approvedBy: { select: { firstName: true, lastName: true } },
      createdBy: { select: { firstName: true, lastName: true } },
      fees: { orderBy: { dueDate: "desc" }, take: 24 },
    },
  });
  if (!socio) notFound();

  const [reservas, totales, monedero] = await Promise.all([
    prisma.booking.findMany({
      where: { userId: id },
      orderBy: { startsAt: "desc" },
      take: 10,
      include: { court: { select: { name: true, sport: true } } },
    }),
    prisma.booking.groupBy({
      by: ["status"],
      where: { userId: id },
      _count: { status: true },
    }),
    getWallet(id, 10),
  ]);

  const estado = ESTADO_SOCIO[socio.status];
  const relacion = RELACION[socio.relationship];
  const tipo = TIPO_SOCIO[socio.memberType];
  const rol = ROL[socio.role];

  const cuotasPendientes = socio.fees.filter((f) => f.status === "PENDING" || f.status === "OVERDUE");
  const noShows = totales.find((t) => t.status === "NO_SHOW")?._count.status ?? 0;
  const canceladas = totales.find((t) => t.status === "CANCELLED")?._count.status ?? 0;
  const jugadas = totales
    .filter((t) => t.status === "CONFIRMED" || t.status === "COMPLETED")
    .reduce((s, t) => s + t._count.status, 0);

  return (
    <>
      <Link href="/admin/socios" className="mb-4 inline-block text-sm font-bold text-marca-700 hover:underline">
        ← Volver al listado
      </Link>

      <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-piedra-200 pb-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-piedra-400">
            {socio.memberNumber ? `Socio n.º ${socio.memberNumber}` : "Sin número asignado"}
          </p>
          <h1 className="titulo-club mt-1 text-3xl text-marca-900 sm:text-4xl">
            {socio.firstName} {socio.lastName}
          </h1>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-piedra-500">
            <Etiqueta tono={estado.tono}>{estado.label}</Etiqueta>
            <span>{relacion.label}</span>
            {socio.relationship === "SOCIO" ? <span>· {tipo.label}</span> : null}
            {socio.role !== "MEMBER" ? <span>· {rol.label}</span> : null}
            <span>· {textoAntiguedad(socio.joinedAt)}</span>
          </p>
        </div>
        {esAdmin ? <BotonRestablecer userId={socio.id} /> : null}
      </div>

      {socio.status === "PENDING" && esAdmin ? (
        <div className="mb-8">
          <BloqueAprobacion userId={socio.id} />
        </div>
      ) : null}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <Tarjeta className="p-6">
          <Seccion>Resumen</Seccion>
          <dl>
            <Dato termino="Correo">{socio.email}</Dato>
            <Dato termino="Correo verificado">
              {socio.emailVerifiedAt ? formatClubDate(socio.emailVerifiedAt) : "No"}
            </Dato>
            <Dato termino="Contraseña">
              {socio.passwordHash
                ? `Elegida el ${socio.passwordUpdatedAt ? formatClubDate(socio.passwordUpdatedAt) : "—"}`
                : "Sin contraseña: entra por enlace"}
            </Dato>
            <Dato termino="Último acceso">
              {socio.lastLoginAt ? formatClubDateTime(socio.lastLoginAt) : "Nunca"}
            </Dato>
            <Dato termino="Ficha creada">
              {formatClubDate(socio.createdAt)}
              {socio.createdBy ? ` por ${socio.createdBy.firstName} ${socio.createdBy.lastName}` : " por internet"}
            </Dato>
            <Dato termino="Alta aprobada">
              {socio.approvedAt ? formatClubDate(socio.approvedAt) : "Pendiente"}
              {socio.approvedBy ? ` por ${socio.approvedBy.firstName} ${socio.approvedBy.lastName}` : ""}
            </Dato>
            {socio.leftAt ? (
              <Dato termino="Baja" ayuda={socio.leaveReason ?? undefined}>
                {formatClubDate(socio.leftAt)}
              </Dato>
            ) : null}
            <Dato termino="Domiciliación">
              <span className="font-mono">{maskFromLast4(socio.ibanLast4) ?? "Sin domiciliar"}</span>
            </Dato>
            <Dato termino="Titular de la cuenta">{socio.accountHolder ?? "—"}</Dato>
            <Dato termino="Reservas">
              {jugadas} usadas · {canceladas} canceladas · {noShows} sin presentarse
            </Dato>
          </dl>
          <p className="mt-4 border-t border-piedra-200 pt-3 text-xs leading-relaxed text-piedra-400">
            El numero de cuenta está cifrado y no se muestra completo en ninguna pantalla. Para
            generar la remesa se descifra en el momento del cobro.
          </p>
        </Tarjeta>

        <Tarjeta className="p-6">
          <Seccion>Estado del socio</Seccion>
          <BloqueEstado
            userId={socio.id}
            estadoActual={socio.status}
            esAdmin={esAdmin}
            esUnoMismo={socio.id === actual.id}
          />
        </Tarjeta>

        {esAdmin ? (
          <div className="lg:col-span-2">
            <Tarjeta className="p-6">
              <Seccion>Datos del socio</Seccion>
              <BloqueDatos
                socio={{
                  id: socio.id,
                  firstName: socio.firstName,
                  lastName: socio.lastName,
                  email: socio.email,
                  phone: socio.phone,
                  altPhone: socio.altPhone,
                  nationalId: socio.nationalId,
                  birthDate: socio.birthDate ? formatInTimeZone(socio.birthDate, "UTC", "yyyy-MM-dd") : "",
                  joinedAt: socio.joinedAt ? formatInTimeZone(socio.joinedAt, "UTC", "yyyy-MM-dd") : "",
                  addressLine: socio.addressLine,
                  postalCode: socio.postalCode,
                  city: socio.city,
                  province: socio.province,
                  relationship: socio.relationship,
                  memberType: socio.memberType,
                  memberNumber: socio.memberNumber,
                  notes: socio.notes,
                }}
              />
            </Tarjeta>
          </div>
        ) : null}

        {esAdmin ? (
          <Tarjeta className="p-6">
            <Seccion>Permisos</Seccion>
            <BloquePermisos
              userId={socio.id}
              rolActual={socio.role}
              deportesActuales={socio.managedSports}
              esUnoMismo={socio.id === actual.id}
            />
          </Tarjeta>
        ) : null}

        <Tarjeta className="p-6">
          <Seccion>Últimas reservas</Seccion>
          {reservas.length === 0 ? (
            <Vacio>Este socio no ha reservado todavia.</Vacio>
          ) : (
            <ul className="divide-y divide-piedra-100 text-sm">
              {reservas.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div>
                    <span className="font-bold text-marca-900">{r.court.name}</span>
                    <span className="ml-2 text-piedra-500">
                      {formatInTimeZone(r.startsAt, CLUB_TZ, "dd/MM/yyyy")} ·{" "}
                      {formatClubTime(r.startsAt)}
                    </span>
                    <span className="ml-2 text-xs text-piedra-400">{DEPORTE[r.court.sport]}</span>
                  </div>
                  <Etiqueta
                    tono={
                      r.paymentStatus === "REFUNDED" ? "verde"
                      : r.status === "CANCELLED" ? "granate"
                      : r.status === "NO_SHOW" ? "ambar"
                      : r.paymentStatus === "PAID" ? "verde"
                      : "gris"
                    }
                  >
                    {r.paymentStatus === "REFUNDED" ? "Cancelada · devuelta"
                      : r.status === "CANCELLED" ? "Cancelada"
                      : r.status === "NO_SHOW" ? "No presentado"
                      : r.paymentStatus === "PAID" ? "Pagada"
                      : "Reservada"}
                  </Etiqueta>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>

        <div className="lg:col-span-2">
          <Tarjeta className="p-6">
            <Seccion>Monedero</Seccion>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[18rem_1fr]">
              <div className="min-w-0">
                <SaldoMonedero balanceCents={monedero.balanceCents} />
                <div className="mt-4 border-t border-piedra-200 pt-4">
                  <BloqueRecarga userId={socio.id} />
                </div>
              </div>
              <div className="min-w-0">
                <MovimientosMonedero movimientos={monedero.movements} />
              </div>
            </div>
          </Tarjeta>
        </div>

        <div className="lg:col-span-2">
          <Tarjeta className="p-6">
            <Seccion>Cuotas de socio</Seccion>
            {cuotasPendientes.length > 0 ? (
              <div className="mb-4 rounded-md border border-acento-300 bg-acento-100 px-4 py-3 text-sm text-acento-600">
                {cuotasPendientes.length} cuota{cuotasPendientes.length === 1 ? "" : "s"} sin cobrar,
                por <strong>{formatEuros(cuotasPendientes.reduce((s, c) => s + c.amountCents, 0))}</strong>.
              </div>
            ) : null}

            <BloqueCuotas
              userId={socio.id}
              esAdmin={esAdmin}
              cuotas={socio.fees.map((f) => ({
                id: f.id,
                period: f.period,
                concept: f.concept,
                importe: formatEuros(f.amountCents),
                vence: formatClubDate(f.dueDate),
                estado: ESTADO_CUOTA[f.status].label,
                tono: ESTADO_CUOTA[f.status].tono,
                cobrable: f.status === "PENDING" || f.status === "OVERDUE",
              }))}
            />
          </Tarjeta>
        </div>
      </div>
    </>
  );
}
