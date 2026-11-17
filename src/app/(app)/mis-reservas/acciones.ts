"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guards";
import { recordAudit } from "@/lib/audit";
import { cancelBooking } from "@/lib/booking/create";
import { isStaff } from "@/lib/auth/guards";
import { payBookingWithWallet, WALLET_PAYMENT_MESSAGES } from "@/lib/wallet";

const MENSAJES = {
  NO_ENCONTRADA: "No hemos encontrado esa reserva.",
  YA_CANCELADA: "Esa reserva ya estaba cancelada.",
  YA_EMPEZADA: "No se puede cancelar una reserva que ya ha empezado.",
} as const;

export type EstadoCancelacion = { error?: string; ok?: boolean };

export async function cancelarMiReserva(
  _previo: EstadoCancelacion,
  formData: FormData,
): Promise<EstadoCancelacion> {
  const user = await requireUser();
  const bookingId = String(formData.get("bookingId") ?? "");
  if (!bookingId) return { error: MENSAJES.NO_ENCONTRADA };

  const resultado = await cancelBooking({
    bookingId,
    actorId: user.id,
    actorIsStaff: isStaff(user),
  });

  if (!resultado.ok) return { error: MENSAJES[resultado.error] };

  await recordAudit({
    actorId: user.id,
    action: "booking.cancelled",
    entityType: "Booking",
    entityId: bookingId,
    metadata: { fueraDePlazo: resultado.lateCancel, devueltoCents: resultado.refundedCents },
  });
  if (resultado.refundedCents > 0) {
    await recordAudit({
      actorId: user.id,
      action: "wallet.refunded",
      entityType: "Booking",
      entityId: bookingId,
      metadata: { importeCents: resultado.refundedCents, motivo: "cancelada por el socio" },
    });
  }

  revalidatePath("/mis-reservas");
  revalidatePath("/perfil");
  revalidatePath("/");
  return { ok: true };
}

export type EstadoPago = { error?: string; ok?: boolean };

export async function pagarConMonedero(_previo: EstadoPago, formData: FormData): Promise<EstadoPago> {
  const user = await requireUser();
  const bookingId = String(formData.get("bookingId") ?? "");
  if (!bookingId) return { error: WALLET_PAYMENT_MESSAGES.NO_ENCONTRADA };

  const resultado = await payBookingWithWallet({ bookingId, actorId: user.id, ownerId: user.id });
  if (!resultado.ok) return { error: WALLET_PAYMENT_MESSAGES[resultado.error] };

  await recordAudit({
    actorId: user.id,
    action: "wallet.booking_paid",
    entityType: "Booking",
    entityId: bookingId,
    metadata: { importeCents: resultado.amountCents, saldoCents: resultado.balanceCents },
  });

  revalidatePath("/mis-reservas");
  revalidatePath("/perfil");
  return { ok: true };
}
