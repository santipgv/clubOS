import { prisma, isUniqueViolation } from "@/lib/db";
import type { PaymentMethod } from "@/lib/types";

export type MarkBookingPaidResult =
  | { ok: true; amountCents: number }
  | { ok: false; error: "NOT_FOUND" | "ALREADY_PAID" | "CANCELLED" };

/**
 * Registra un cobro una sola vez. La actualizacion condicional reclama la
 * reserva bajo bloqueo de fila y la unicidad de Payment.bookingId actua como
 * ultima barrera frente a reintentos o futuros puntos de entrada.
 */
export async function markBookingPaid(input: {
  bookingId: string;
  method: PaymentMethod;
  registeredById: string;
}): Promise<MarkBookingPaidResult> {
  try {
    return await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: input.bookingId },
        select: { id: true, priceCents: true, paymentStatus: true, status: true },
      });
      if (!booking) return { ok: false, error: "NOT_FOUND" };
      if (booking.paymentStatus === "PAID") return { ok: false, error: "ALREADY_PAID" };
      if (booking.status === "CANCELLED") return { ok: false, error: "CANCELLED" };

      const claimed = await tx.booking.updateMany({
        where: {
          id: booking.id,
          status: { not: "CANCELLED" },
          paymentStatus: { not: "PAID" },
        },
        data: { paymentStatus: "PAID" },
      });

      if (claimed.count === 0) {
        const current = await tx.booking.findUnique({
          where: { id: booking.id },
          select: { paymentStatus: true, status: true },
        });
        if (!current) return { ok: false, error: "NOT_FOUND" };
        if (current.status === "CANCELLED") return { ok: false, error: "CANCELLED" };
        return { ok: false, error: "ALREADY_PAID" };
      }

      await tx.payment.create({
        data: {
          bookingId: booking.id,
          method: input.method,
          amountCents: booking.priceCents,
          status: "PAID",
          registeredById: input.registeredById,
        },
      });

      return { ok: true, amountCents: booking.priceCents };
    });
  } catch (error) {
    // Una llamada concurrente o un reintento puede llegar hasta la restriccion
    // unica. La operacion ya esta completada y se responde de forma idempotente.
    if (isUniqueViolation(error)) return { ok: false, error: "ALREADY_PAID" };
    throw error;
  }
}
