CREATE TABLE "GolfPayment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "bookingId" TEXT NOT NULL,
  "method" "PaymentMethod" NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'EUR',
  "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "registeredById" TEXT,
  CONSTRAINT "GolfPayment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "GolfBooking"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GolfPayment_registeredById_fkey" FOREIGN KEY ("registeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "GolfPayment_bookingId_key" ON "GolfPayment"("bookingId");
