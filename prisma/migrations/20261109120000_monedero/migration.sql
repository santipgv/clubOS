-- CreateEnum
CREATE TYPE "WalletMovementType" AS ENUM ('TOPUP', 'BOOKING_PAYMENT', 'REFUND');

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'WALLET';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "walletBalanceCents" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "WalletMovement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "WalletMovementType" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "balanceAfterCents" INTEGER NOT NULL,
    "method" "PaymentMethod",
    "bookingId" TEXT,
    "concept" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WalletMovement_userId_createdAt_idx" ON "WalletMovement"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WalletMovement_bookingId_type_key" ON "WalletMovement"("bookingId", "type");

-- AddForeignKey
ALTER TABLE "WalletMovement" ADD CONSTRAINT "WalletMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletMovement" ADD CONSTRAINT "WalletMovement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletMovement" ADD CONSTRAINT "WalletMovement_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- El saldo nunca puede quedar en negativo. Lo garantiza Postgres y no solo la
-- aplicacion: dos cargos simultaneos no pueden dejar a un socio en descubierto.
ALTER TABLE "User" ADD CONSTRAINT "User_walletBalanceCents_nonnegative" CHECK ("walletBalanceCents" >= 0);

-- Cada asiento mueve dinero y deja constancia de un saldo valido.
ALTER TABLE "WalletMovement" ADD CONSTRAINT "WalletMovement_amount_nonzero" CHECK ("amountCents" <> 0);
ALTER TABLE "WalletMovement" ADD CONSTRAINT "WalletMovement_balance_nonnegative" CHECK ("balanceAfterCents" >= 0);
