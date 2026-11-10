import { prisma, isSerializationFailure } from "@/lib/db";
import type { BlockType } from "@/lib/types";

export async function crearBloqueoSalida(input: {
  courseId: string | null;
  startsAt: Date;
  endsAt: Date;
  type: BlockType;
  title: string;
  description: string | null;
  isPublic: boolean;
  createdById: string;
  confirmed: boolean;
}): Promise<
  | { ok: true; blockId: string; cancelledBookings: number }
  | { ok: false; requiresConfirmation: number }
> {
  for (let retry = 0; ; retry++) {
    try {
      return await prisma.$transaction(async (tx) => {
        // Mismo aislamiento que reservarSalida. Una reserva concurrente obliga
        // a reintentar y vuelve a comprobar la confirmación del personal.
        const affected = await tx.golfBooking.findMany({
          where: {
            status: { in: ["CONFIRMED", "INVITED"] },
            teeTime: {
              startsAt: { gte: input.startsAt, lt: input.endsAt },
              ...(input.courseId ? { courseId: input.courseId } : {}),
            },
          },
          orderBy: { id: "asc" },
          select: { id: true, players: true, teeTimeId: true },
        });
        if (affected.length && !input.confirmed) {
          return { ok: false as const, requiresConfirmation: affected.length };
        }
        const block = await tx.golfBlock.create({
          data: {
            courseId: input.courseId, startsAt: input.startsAt, endsAt: input.endsAt,
            type: input.type, title: input.title, description: input.description,
            isPublic: input.isPublic, createdById: input.createdById,
          },
          select: { id: true },
        });
        for (const booking of affected) {
          const cancelled = await tx.golfBooking.updateMany({
            where: { id: booking.id, status: { in: ["CONFIRMED", "INVITED"] } },
            data: {
              status: "CANCELLED", cancelledAt: new Date(),
              cancelledById: input.createdById,
              cancelReason: `Anulada por el club: ${input.title}`,
            },
          });
          if (cancelled.count) {
            await tx.golfTeeTime.update({
              where: { id: booking.teeTimeId },
              data: { playersBooked: { decrement: booking.players } },
            });
          }
        }
        return { ok: true as const, blockId: block.id, cancelledBookings: affected.length };
      }, { isolationLevel: "Serializable", timeout: 10_000 });
    } catch (error) {
      if (!isSerializationFailure(error) || retry >= 5) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25 * (retry + 1)));
    }
  }
}
