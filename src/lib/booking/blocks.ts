import { prisma, isSerializationFailure } from "@/lib/db";
import type { BlockType, Sport } from "@/lib/types";
import { refundBookingInTx } from "@/lib/wallet";

const MAX_RETRIES = 3;

export type CreateCourtBlockInput = {
  courtId: string | null;
  sport: Sport | null;
  startsAt: Date;
  endsAt: Date;
  type: BlockType;
  title: string;
  description: string | null;
  isPublic: boolean;
  createdById: string;
  confirmed: boolean;
};

export type CreateCourtBlockResult =
  | { ok: true; blockId: string; cancelledBookings: number; refundedBookings: number; refundedCents: number }
  | { ok: false; requiresConfirmation: number };

/**
 * Crea un bloqueo y resuelve todas las reservas que alcanza en una unica
 * transaccion serializable. createBooking usa el mismo aislamiento: si ambas
 * operaciones se cruzan, Postgres aborta una y el reintento observa la otra.
 *
 * La cancelacion es culpa del club, asi que lo pagado por esas reservas vuelve
 * siempre al monedero de cada socio, en la misma transaccion.
 */
export async function createCourtBlock(
  input: CreateCourtBlockInput,
): Promise<CreateCourtBlockResult> {
  return attempt();

  async function attempt(retry = 0): Promise<CreateCourtBlockResult> {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const scope = input.courtId
            ? { courtId: input.courtId }
            : input.sport
              ? { court: { sport: input.sport } }
              : {};

          const affected = await tx.booking.count({
            where: {
              status: { in: ["PENDING_PAYMENT", "CONFIRMED"] },
              startsAt: { lt: input.endsAt },
              endsAt: { gt: input.startsAt },
              ...scope,
            },
          });

          if (affected > 0 && !input.confirmed) {
            return { ok: false, requiresConfirmation: affected };
          }

          const block = await tx.courtBlock.create({
            data: {
              courtId: input.courtId,
              sport: input.sport,
              startsAt: input.startsAt,
              endsAt: input.endsAt,
              type: input.type,
              title: input.title,
              description: input.description,
              isPublic: input.isPublic,
              createdById: input.createdById,
            },
            select: { id: true },
          });

          const where = {
            status: { in: ["PENDING_PAYMENT", "CONFIRMED"] as Array<"PENDING_PAYMENT" | "CONFIRMED"> },
            startsAt: { lt: input.endsAt },
            endsAt: { gt: input.startsAt },
            ...scope,
          };
          const pagadas = await tx.booking.findMany({
            where: { ...where, paymentStatus: "PAID" },
            select: { id: true, reference: true },
          });

          const cancelled = await tx.booking.updateMany({
            where,
            data: {
              status: "CANCELLED",
              cancelledAt: new Date(),
              cancelledById: input.createdById,
              cancelReason: `Cancelada por el club: ${input.title}`,
            },
          });

          let refundedBookings = 0;
          let refundedCents = 0;
          for (const reserva of pagadas) {
            const devuelto = await refundBookingInTx(tx, {
              bookingId: reserva.id,
              actorId: input.createdById,
              concept: `Devolución: el club canceló la reserva ${reserva.reference} (${input.title})`,
            });
            if (devuelto > 0) {
              refundedBookings++;
              refundedCents += devuelto;
            }
          }

          return {
            ok: true,
            blockId: block.id,
            cancelledBookings: cancelled.count,
            refundedBookings,
            refundedCents,
          };
        },
        { isolationLevel: "Serializable", timeout: 10_000 },
      );
    } catch (error) {
      if (!isSerializationFailure(error) || retry >= MAX_RETRIES) throw error;
      await wait(25 * (retry + 1) + Math.random() * 25);
      return attempt(retry + 1);
    }
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
