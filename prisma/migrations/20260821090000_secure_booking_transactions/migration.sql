-- Una reserva representa un unico cobro. Los reembolsos cambian el estado del
-- mismo asiento; no crean un segundo cobro para la misma reserva.
CREATE UNIQUE INDEX "Payment_bookingId_key" ON "Payment"("bookingId");
