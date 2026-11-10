import { prisma, isSerializationFailure } from "@/lib/db";

/** La plaza ya cuenta en el aforo. Aceptar solo confirma y, si procede, mueve el importe al titular. */
export async function aceptarInvitacionGolf(input: { bookingId: string; userId: string }): Promise<boolean> {
  for (let retry = 0; ; retry++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const invitacion = await tx.golfBooking.findFirst({
          where: {
            id: input.bookingId, userId: input.userId, status: "INVITED",
            user: { status: "ACTIVE" }, teeTime: { startsAt: { gt: new Date() } },
            invitedByBooking: { status: "CONFIRMED" },
          },
          select: {
            id: true, invitationPayment: true, priceCents: true, taxCents: true,
            invitedByBooking: { select: { id: true, paymentStatus: true } },
          },
        });
        if (!invitacion?.invitedByBooking) return false;

        const pagaTitular = invitacion.invitationPayment === "HOST";
        if (pagaTitular && invitacion.priceCents > 0) {
          const titular = invitacion.invitedByBooking;
          if (titular.paymentStatus === "PAID") return false;
          await tx.golfBooking.update({
            where: { id: titular.id },
            data: {
              priceCents: { increment: invitacion.priceCents },
              taxCents: { increment: invitacion.taxCents },
              paymentStatus: "PENDING",
            },
          });
        }
        await tx.golfBooking.update({
          where: { id: invitacion.id },
          data: {
            status: "CONFIRMED",
            ...(pagaTitular ? { priceCents: 0, taxCents: 0, paymentStatus: "NOT_REQUIRED" } : {}),
          },
        });
        return true;
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (!isSerializationFailure(error) || retry >= 5) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25 * (retry + 1)));
    }
  }
}
