"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireActiveMember } from "@/lib/auth/guards";
import { recordAudit } from "@/lib/audit";
import { createBooking, BOOKING_FAILURE_MESSAGES } from "@/lib/booking/create";
import { reservaSchema, erroresDeCampo } from "@/lib/validation";
import { payBookingWithWallet } from "@/lib/wallet";
import { rutaMisReservas } from "@/lib/rutas";

export type EstadoReserva = { error?: string; errores?: Record<string, string> };

export async function confirmarReserva(
  _previo: EstadoReserva,
  formData: FormData,
): Promise<EstadoReserva> {
  const user = await requireActiveMember();

  const parsed = reservaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errores: erroresDeCampo(parsed.error) };

  const datos = parsed.data;
  const jugadores = (datos.playerNames ?? "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean)
    .slice(0, 8);

  const resultado = await createBooking({
    courtId: datos.courtId,
    day: datos.day,
    startMinute: datos.startMinute,
    durationMinutes: datos.durationMinutes,
    userId: user.id,
    actorId: user.id,
    // Un socio reservando para si mismo nunca se salta sus propios limites.
    actorIsStaff: false,
    playerNames: jugadores,
    guestCount: datos.guestCount,
  });

  if (!resultado.ok) return { error: BOOKING_FAILURE_MESSAGES[resultado.error] };

  await recordAudit({
    actorId: user.id,
    action: "booking.created",
    entityType: "Booking",
    entityId: resultado.bookingId,
    metadata: {
      referencia: resultado.reference,
      dia: datos.day,
      inicio: datos.startMinute,
      duracion: datos.durationMinutes,
    },
  });

  // Pagar con saldo es un segundo paso: si no llega, la reserva sigue hecha y
  // el socio puede pagarla despues. No se pierde el hueco por un saldo corto.
  let pago: "monedero" | "pendiente" | undefined;
  if (formData.get("pagarConMonedero") === "si" && resultado.priceCents > 0) {
    const cobro = await payBookingWithWallet({
      bookingId: resultado.bookingId,
      actorId: user.id,
      ownerId: user.id,
    });
    pago = cobro.ok ? "monedero" : "pendiente";
    if (cobro.ok) {
      await recordAudit({
        actorId: user.id,
        action: "wallet.booking_paid",
        entityType: "Booking",
        entityId: resultado.bookingId,
        metadata: { importeCents: cobro.amountCents, saldoCents: cobro.balanceCents },
      });
    }
  }

  revalidatePath("/mis-reservas");
  revalidatePath("/perfil");
  redirect(rutaMisReservas(resultado.reference, pago));
}
