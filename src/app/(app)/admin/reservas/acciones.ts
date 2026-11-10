"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { deportesGestionados, requireGestorDeDeportes } from "@/lib/auth/guards";
import { filtroReservas, pistaEnAmbito, reservaEnAmbito } from "@/lib/auth/ambito";
import { recordAudit } from "@/lib/audit";
import { cancelBooking, createBooking, BOOKING_FAILURE_MESSAGES } from "@/lib/booking/create";
import { markBookingPaid } from "@/lib/booking/payments";
import { reservaSchema, erroresDeCampo } from "@/lib/validation";
import { formatEuros } from "@/lib/booking/pricing";
import { payBookingWithWallet, refundCancelledBooking, WALLET_PAYMENT_MESSAGES } from "@/lib/wallet";

export type EstadoGestion = { error?: string; ok?: string };

/**
 * Estas acciones las usan el personal del club y los colaboradores de deporte.
 * Un colaborador solo actua sobre reservas de pistas de sus deportes, y eso se
 * comprueba aqui, en el servidor, sobre la reserva o la pista que llega en el
 * formulario. Lo que queda fuera de su ambito se responde como "no
 * encontrada": confirmar que existe ya seria filtrar informacion.
 */

export async function marcarPagada(_previo: EstadoGestion, formData: FormData): Promise<EstadoGestion> {
  const staff = await requireGestorDeDeportes();
  const bookingId = String(formData.get("bookingId") ?? "");
  const metodo = String(formData.get("metodo") ?? "CASH");

  if (!["CASH", "TRANSFER", "MANUAL", "CREDIT", "WALLET"].includes(metodo)) {
    return { error: "Método de cobro no valido." };
  }
  if (!(await reservaEnAmbito(deportesGestionados(staff), bookingId))) {
    return { error: "Reserva no encontrada." };
  }

  // Cobro en recepcion contra el saldo del socio.
  if (metodo === "WALLET") {
    const cobro = await payBookingWithWallet({ bookingId, actorId: staff.id });
    if (!cobro.ok) return { error: WALLET_PAYMENT_MESSAGES[cobro.error] };
    await recordAudit({
      actorId: staff.id,
      action: "wallet.booking_paid",
      entityType: "Booking",
      entityId: bookingId,
      metadata: { importeCents: cobro.amountCents, saldoCents: cobro.balanceCents, porStaff: true },
    });
    revalidatePath("/admin/reservas");
    return { ok: `Cobrado del monedero. Le quedan ${formatEuros(cobro.balanceCents)}.` };
  }

  const result = await markBookingPaid({
    bookingId,
    method: metodo as "CASH" | "TRANSFER" | "MANUAL" | "CREDIT",
    registeredById: staff.id,
  });
  if (!result.ok) {
    if (result.error === "NOT_FOUND") return { error: "Reserva no encontrada." };
    if (result.error === "CANCELLED") return { error: "No se cobra una reserva cancelada." };
    return { error: "Esa reserva ya figura como pagada." };
  }

  await recordAudit({
    actorId: staff.id,
    action: "booking.marked_paid",
    entityType: "Booking",
    entityId: bookingId,
    metadata: { metodo, importeCents: result.amountCents },
  });

  revalidatePath("/admin/reservas");
  return { ok: "Cobro registrado." };
}

export async function marcarNoPresentado(_previo: EstadoGestion, formData: FormData): Promise<EstadoGestion> {
  const staff = await requireGestorDeDeportes();
  const bookingId = String(formData.get("bookingId") ?? "");

  const actualizadas = await prisma.booking.updateMany({
    where: {
      id: bookingId,
      status: { in: ["CONFIRMED", "COMPLETED"] },
      ...filtroReservas(deportesGestionados(staff)),
    },
    data: { status: "NO_SHOW" },
  });
  if (actualizadas.count === 0) return { error: "No se puede marcar esa reserva." };

  await recordAudit({ actorId: staff.id, action: "booking.marked_no_show", entityType: "Booking", entityId: bookingId });
  revalidatePath("/admin/reservas");
  return { ok: "Marcada como no presentado." };
}

export async function cancelarComoStaff(_previo: EstadoGestion, formData: FormData): Promise<EstadoGestion> {
  const staff = await requireGestorDeDeportes();
  const bookingId = String(formData.get("bookingId") ?? "");
  const motivo = String(formData.get("motivo") ?? "");
  // El club decide si devuelve. Por defecto si: la cancelacion es suya.
  const devolver = formData.get("devolver") === "si";

  if (!(await reservaEnAmbito(deportesGestionados(staff), bookingId))) {
    return { error: "Reserva no encontrada." };
  }

  const resultado = await cancelBooking({
    bookingId,
    actorId: staff.id,
    actorIsStaff: true,
    reason: motivo,
    refund: devolver,
  });
  if (!resultado.ok) {
    return { error: resultado.error === "NO_ENCONTRADA" ? "Reserva no encontrada." : "Esa reserva ya estaba cancelada." };
  }

  await recordAudit({
    actorId: staff.id,
    action: "booking.cancelled",
    entityType: "Booking",
    entityId: bookingId,
    metadata: { porStaff: true, motivo, devolver, devueltoCents: resultado.refundedCents },
  });
  if (resultado.refundedCents > 0) {
    await recordAudit({
      actorId: staff.id,
      action: "wallet.refunded",
      entityType: "Booking",
      entityId: bookingId,
      metadata: { importeCents: resultado.refundedCents, motivo: "cancelada por el club" },
    });
  }

  revalidatePath("/admin/reservas");
  return {
    ok:
      resultado.refundedCents > 0
        ? `Reserva cancelada. Se han devuelto ${formatEuros(resultado.refundedCents)} al monedero del socio.`
        : "Reserva cancelada.",
  };
}

/**
 * Devolucion posterior: p. ej. una cancelacion fuera de plazo que el club
 * decide reembolsar. Igual que cancelar y cobrar, el colaborador solo puede
 * hacerlo con reservas de sus deportes.
 */
export async function devolverAlMonedero(_previo: EstadoGestion, formData: FormData): Promise<EstadoGestion> {
  const staff = await requireGestorDeDeportes();
  const bookingId = String(formData.get("bookingId") ?? "");
  if (!(await reservaEnAmbito(deportesGestionados(staff), bookingId))) {
    return { error: "Reserva no encontrada." };
  }

  const resultado = await refundCancelledBooking({ bookingId, actorId: staff.id });
  if (!resultado.ok) {
    if (resultado.error === "NO_ENCONTRADA") return { error: "Reserva no encontrada." };
    if (resultado.error === "NO_CANCELADA") return { error: "Solo se devuelven reservas canceladas." };
    return { error: "Esa reserva no tiene nada pendiente de devolver." };
  }

  await recordAudit({
    actorId: staff.id,
    action: "wallet.refunded",
    entityType: "Booking",
    entityId: bookingId,
    metadata: { importeCents: resultado.refundedCents, motivo: "devolución posterior del club" },
  });

  revalidatePath("/admin/reservas");
  return { ok: `Devueltos ${formatEuros(resultado.refundedCents)} al monedero del socio.` };
}

export async function reservarPorSocio(_previo: EstadoGestion, formData: FormData): Promise<EstadoGestion> {
  const staff = await requireGestorDeDeportes();

  const socioId = String(formData.get("socioId") ?? "");
  if (!socioId) return { error: "Elige un socio." };

  const parsed = reservaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const errores = erroresDeCampo(parsed.error);
    return { error: Object.values(errores)[0] ?? "Datos no validos." };
  }
  if (!(await pistaEnAmbito(deportesGestionados(staff), parsed.data.courtId))) {
    return { error: BOOKING_FAILURE_MESSAGES.PISTA_INEXISTENTE };
  }

  const resultado = await createBooking({
    ...parsed.data,
    userId: socioId,
    actorId: staff.id,
    actorIsStaff: true,
    playerNames: (parsed.data.playerNames ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  });

  if (!resultado.ok) return { error: BOOKING_FAILURE_MESSAGES[resultado.error] };

  await recordAudit({
    actorId: staff.id,
    action: "booking.created_for_member",
    entityType: "Booking",
    entityId: resultado.bookingId,
    metadata: { socioId, referencia: resultado.reference },
  });

  revalidatePath("/admin/reservas");
  return { ok: `Reserva creada con referencia ${resultado.reference}.` };
}

export type SocioEncontrado = {
  id: string;
  nombre: string;
  memberNumber: string | null;
  email: string;
};

/**
 * Busca socios por nombre, apellidos, numero o correo.
 *
 * Sustituye al desplegable: con varios cientos de socios, un <select> obliga a
 * recorrer toda la lista y en un movil es directamente inservible.
 */
export async function buscarSocios(consulta: string): Promise<SocioEncontrado[]> {
  // El colaborador tambien reserva en nombre de un socio, asi que necesita
  // encontrarlo. Solo se devuelven los datos minimos para identificarlo.
  await requireGestorDeDeportes();

  const q = consulta.trim();
  if (q.length < 2) return [];

  const socios = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      OR: [
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { memberNumber: { contains: q } },
      ],
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 10,
    select: { id: true, firstName: true, lastName: true, memberNumber: true, email: true },
  });

  return socios.map((s) => ({
    id: s.id,
    nombre: `${s.lastName}, ${s.firstName}`,
    memberNumber: s.memberNumber,
    email: s.email,
  }));
}
