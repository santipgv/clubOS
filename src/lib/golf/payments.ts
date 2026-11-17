import { prisma, isSerializationFailure, isUniqueViolation } from "@/lib/db";
import type { PaymentMethod } from "@/lib/types";

export type MarkGolfBookingPaidResult =
  | { ok: true; amountCents: number }
  | { ok: false; error: "NOT_FOUND" | "ALREADY_PAID" | "CANCELLED" | "INVITATION_PENDING" | "NO_PAYMENT" };

export async function markGolfBookingPaid(input: {
  bookingId: string;
  method: PaymentMethod;
  registeredById: string;
}): Promise<MarkGolfBookingPaidResult> {
  for (let retry = 0; ; retry++) {
    try {
      return await prisma.$transaction(async (tx): Promise<MarkGolfBookingPaidResult> => {
        const booking = await tx.golfBooking.findUnique({
          where: { id: input.bookingId },
          select: {
            id: true, priceCents: true, paymentStatus: true, status: true,
            teeTime: { select: { startsAt: true } },
            invitedBookings: {
              where: { status: "INVITED", invitationPayment: "HOST" },
              select: { id: true },
              take: 1,
            },
          },
        });
        if (!booking) return { ok: false, error: "NOT_FOUND" };
        if (booking.status === "CANCELLED") return { ok: false, error: "CANCELLED" };
        if (booking.paymentStatus === "PAID") return { ok: false, error: "ALREADY_PAID" };
        if (booking.status === "INVITED" || (booking.teeTime.startsAt.getTime() > Date.now() &&
          booking.invitedBookings.length > 0)) {
          return { ok: false, error: "INVITATION_PENDING" };
        }
        if (booking.paymentStatus !== "PENDING" || booking.priceCents <= 0) return { ok: false, error: "NO_PAYMENT" };

        await tx.golfBooking.update({ where: { id: booking.id }, data: { paymentStatus: "PAID" } });
        await tx.golfPayment.create({
          data: {
            bookingId: booking.id, method: input.method,
            amountCents: booking.priceCents, registeredById: input.registeredById,
          },
        });
        return { ok: true, amountCents: booking.priceCents };
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (isUniqueViolation(error)) return { ok: false, error: "ALREADY_PAID" };
      if (!isSerializationFailure(error) || retry >= 5) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25 * (retry + 1)));
    }
  }
}
