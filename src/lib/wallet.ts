import { prisma, isUniqueViolation } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { PaymentMethod } from "@/lib/types";

/**
 * Monedero del socio.
 *
 * El saldo vive en User.walletBalanceCents y cada cambio deja un asiento en
 * WalletMovement con el saldo resultante. Tres garantias no dependen de este
 * codigo sino de Postgres:
 *
 * - El saldo nunca es negativo (CHECK en la tabla User). El cargo se hace con
 *   una actualizacion condicional, asi que dos cargos simultaneos que juntos
 *   superan el saldo no pueden entrar los dos.
 * - Una reserva se paga con saldo una sola vez y se devuelve una sola vez
 *   (indice unico sobre bookingId + type).
 * - Cargo y asiento van en la misma transaccion: o estan los dos o ninguno.
 *
 * Todo reembolso vuelve al monedero, sea cual fuere el medio con el que se
 * pago la reserva: el club no devuelve dinero por banco ni en mano.
 */

type Tx = Prisma.TransactionClient;

/** Tope de una recarga, para que un cero de mas en recepcion no pase sin mas. */
export const WALLET_TOPUP_MAX_CENTS = 100_000;

/** Importes que se ofrecen en recepcion como atajo. */
export const WALLET_TOPUP_PRESETS_CENTS = [2_000, 5_000, 10_000] as const;

/** Como puede entrar dinero al monedero mientras no haya pasarela de pago. */
export const WALLET_TOPUP_METHODS = ["CASH", "TRANSFER", "MANUAL"] as const;
export type WalletTopUpMethod = (typeof WALLET_TOPUP_METHODS)[number];

// ---------------------------------------------------------------- nucleo

/**
 * Suma (o resta, si el importe es negativo) al saldo y deja el asiento.
 * Devuelve el saldo resultante, o null si un cargo no cabe en el saldo.
 */
async function moveBalance(
  tx: Tx,
  input: {
    userId: string;
    amountCents: number;
    type: "TOPUP" | "BOOKING_PAYMENT" | "REFUND";
    concept: string;
    method?: PaymentMethod | null;
    bookingId?: string | null;
    createdById?: string | null;
  },
): Promise<number | null> {
  // La condicion sobre el saldo va en el propio UPDATE: Postgres la vuelve a
  // evaluar despues de esperar el bloqueo de fila, asi que no hay hueco entre
  // "comprobar" y "cobrar" que otro cargo simultaneo pueda aprovechar.
  const actualizadas = await tx.user.updateMany({
    where: {
      id: input.userId,
      ...(input.amountCents < 0 ? { walletBalanceCents: { gte: -input.amountCents } } : {}),
    },
    data: { walletBalanceCents: { increment: input.amountCents } },
  });
  if (actualizadas.count === 0) return null;

  // La fila sigue bloqueada por esta transaccion: lo que se lee es lo que
  // acabamos de escribir.
  const socio = await tx.user.findUniqueOrThrow({
    where: { id: input.userId },
    select: { walletBalanceCents: true },
  });

  await tx.walletMovement.create({
    data: {
      userId: input.userId,
      type: input.type,
      amountCents: input.amountCents,
      balanceAfterCents: socio.walletBalanceCents,
      concept: input.concept.slice(0, 200),
      method: input.method ?? null,
      bookingId: input.bookingId ?? null,
      createdById: input.createdById ?? null,
    },
  });

  return socio.walletBalanceCents;
}

// ---------------------------------------------------------------- recargas

export type TopUpResult =
  | { ok: true; balanceCents: number }
  | { ok: false; error: "IMPORTE_NO_VALIDO" | "METODO_NO_VALIDO" | "SOCIO_INEXISTENTE" };

/**
 * Recarga registrada por el club (recepcion o secretaria) tras cobrar en
 * efectivo o por transferencia. La recarga por tarjeta del propio socio llega
 * con la pasarela (PAG-1, PAG-4) y entrara por aqui mismo.
 */
export async function topUpWallet(input: {
  userId: string;
  amountCents: number;
  method: PaymentMethod;
  actorId: string;
  concept?: string;
}): Promise<TopUpResult> {
  if (
    !Number.isInteger(input.amountCents) ||
    input.amountCents <= 0 ||
    input.amountCents > WALLET_TOPUP_MAX_CENTS
  ) {
    return { ok: false, error: "IMPORTE_NO_VALIDO" };
  }
  if (!(WALLET_TOPUP_METHODS as readonly string[]).includes(input.method)) {
    return { ok: false, error: "METODO_NO_VALIDO" };
  }

  const saldo = await prisma.$transaction((tx) =>
    moveBalance(tx, {
      userId: input.userId,
      amountCents: input.amountCents,
      type: "TOPUP",
      method: input.method,
      concept: input.concept?.trim() || "Recarga del monedero",
      createdById: input.actorId,
    }),
  );
  if (saldo === null) return { ok: false, error: "SOCIO_INEXISTENTE" };
  return { ok: true, balanceCents: saldo };
}

// ---------------------------------------------------------------- pagos

export type WalletPaymentFailure =
  | "NO_ENCONTRADA"
  | "CANCELADA"
  | "YA_PAGADA"
  | "SIN_IMPORTE"
  | "SALDO_INSUFICIENTE";

export const WALLET_PAYMENT_MESSAGES: Record<WalletPaymentFailure, string> = {
  NO_ENCONTRADA: "No hemos encontrado esa reserva.",
  CANCELADA: "No se puede pagar una reserva cancelada.",
  YA_PAGADA: "Esa reserva ya está pagada.",
  SIN_IMPORTE: "Esa reserva no tiene nada que pagar.",
  SALDO_INSUFICIENTE: "No hay saldo suficiente en el monedero para pagar la reserva entera.",
};

export type WalletPaymentResult =
  | { ok: true; amountCents: number; balanceCents: number }
  | { ok: false; error: WalletPaymentFailure };

class SaldoInsuficiente extends Error {}

/**
 * Paga una reserva con saldo. Solo si el saldo cubre el importe integro: la
 * version inicial no admite pago mixto saldo + otro medio.
 *
 * `ownerId` limita la operacion a las reservas de ese socio; el staff cobrando
 * en recepcion lo omite.
 */
export async function payBookingWithWallet(input: {
  bookingId: string;
  actorId: string;
  ownerId?: string;
}): Promise<WalletPaymentResult> {
  try {
    return await prisma.$transaction(async (tx): Promise<WalletPaymentResult> => {
      const booking = await tx.booking.findUnique({
        where: { id: input.bookingId },
        select: { id: true, userId: true, reference: true, priceCents: true, status: true, paymentStatus: true },
      });
      // A un socio no se le confirma que existe una reserva ajena.
      if (!booking || (input.ownerId && booking.userId !== input.ownerId)) {
        return { ok: false, error: "NO_ENCONTRADA" };
      }
      if (booking.status === "CANCELLED") return { ok: false, error: "CANCELADA" };
      if (booking.priceCents <= 0 || booking.paymentStatus === "NOT_REQUIRED") {
        return { ok: false, error: "SIN_IMPORTE" };
      }
      if (booking.paymentStatus !== "PENDING") return { ok: false, error: "YA_PAGADA" };

      // Se reclama la reserva antes de tocar el saldo: si otra peticion se ha
      // adelantado, esta no cobra nada.
      const reclamada = await tx.booking.updateMany({
        where: { id: booking.id, status: { not: "CANCELLED" }, paymentStatus: "PENDING" },
        data: { paymentStatus: "PAID" },
      });
      if (reclamada.count === 0) {
        const actual = await tx.booking.findUnique({ where: { id: booking.id }, select: { status: true } });
        return { ok: false, error: actual?.status === "CANCELLED" ? "CANCELADA" : "YA_PAGADA" };
      }

      const saldo = await moveBalance(tx, {
        userId: booking.userId,
        amountCents: -booking.priceCents,
        type: "BOOKING_PAYMENT",
        bookingId: booking.id,
        concept: `Pago de la reserva ${booking.reference}`,
        createdById: input.actorId,
      });
      // Se aborta la transaccion entera para deshacer tambien el PAID.
      if (saldo === null) throw new SaldoInsuficiente();

      await tx.payment.create({
        data: {
          bookingId: booking.id,
          method: "WALLET",
          amountCents: booking.priceCents,
          status: "PAID",
          registeredById: input.actorId,
        },
      });

      return { ok: true, amountCents: booking.priceCents, balanceCents: saldo };
    });
  } catch (error) {
    if (error instanceof SaldoInsuficiente) return { ok: false, error: "SALDO_INSUFICIENTE" };
    if (isUniqueViolation(error)) return { ok: false, error: "YA_PAGADA" };
    throw error;
  }
}

// ---------------------------------------------------------------- devoluciones

/**
 * Devuelve al monedero lo pagado por una reserva ya cancelada, dentro de la
 * transaccion de quien la cancela. Devuelve los centimos abonados (0 si no
 * habia nada que devolver: reserva sin pagar, gratuita o ya devuelta).
 */
export async function refundBookingInTx(
  tx: Tx,
  input: { bookingId: string; actorId: string; concept?: string },
): Promise<number> {
  const booking = await tx.booking.findUnique({
    where: { id: input.bookingId },
    select: { id: true, userId: true, reference: true, priceCents: true, payment: { select: { amountCents: true } } },
  });
  if (!booking) return 0;

  const importe = booking.payment?.amountCents ?? booking.priceCents;
  if (importe <= 0) return 0;

  // Reclamar la devolucion: solo una de varias cancelaciones simultaneas pasa.
  const reclamada = await tx.booking.updateMany({
    where: { id: booking.id, status: "CANCELLED", paymentStatus: "PAID" },
    data: { paymentStatus: "REFUNDED" },
  });
  if (reclamada.count === 0) return 0;

  await tx.payment.updateMany({ where: { bookingId: booking.id }, data: { status: "REFUNDED" } });

  await moveBalance(tx, {
    userId: booking.userId,
    amountCents: importe,
    type: "REFUND",
    bookingId: booking.id,
    concept: input.concept ?? `Devolución de la reserva ${booking.reference}`,
    createdById: input.actorId,
  });

  return importe;
}

export type RefundResult =
  | { ok: true; refundedCents: number }
  | { ok: false; error: "NO_ENCONTRADA" | "NO_CANCELADA" | "NADA_QUE_DEVOLVER" };

/**
 * Devolucion decidida a posteriori por el club, p. ej. una cancelacion fuera
 * de plazo que la junta decide reembolsar igualmente.
 */
export async function refundCancelledBooking(input: {
  bookingId: string;
  actorId: string;
}): Promise<RefundResult> {
  try {
    return await prisma.$transaction(async (tx): Promise<RefundResult> => {
      const booking = await tx.booking.findUnique({
        where: { id: input.bookingId },
        select: { status: true },
      });
      if (!booking) return { ok: false, error: "NO_ENCONTRADA" };
      if (booking.status !== "CANCELLED") return { ok: false, error: "NO_CANCELADA" };

      const devuelto = await refundBookingInTx(tx, input);
      if (devuelto === 0) return { ok: false, error: "NADA_QUE_DEVOLVER" };
      return { ok: true, refundedCents: devuelto };
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "NADA_QUE_DEVOLVER" };
    throw error;
  }
}

// ---------------------------------------------------------------- consulta

export const WALLET_MOVEMENT_LABELS = {
  TOPUP: "Recarga",
  BOOKING_PAYMENT: "Pago de reserva",
  REFUND: "Devolución",
} as const;

export async function getWallet(userId: string, take = 30) {
  const [socio, movimientos] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { walletBalanceCents: true } }),
    prisma.walletMovement.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take,
      include: { booking: { select: { reference: true } } },
    }),
  ]);
  return { balanceCents: socio?.walletBalanceCents ?? 0, movements: movimientos };
}
