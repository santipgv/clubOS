ALTER TYPE "GolfBookingStatus" ADD VALUE 'INVITED';
CREATE TYPE "GolfInvitationPayment" AS ENUM ('SEPARATE', 'HOST');

ALTER TABLE "GolfBooking"
    ADD COLUMN "invitedByBookingId" TEXT,
    ADD COLUMN "invitationPayment" "GolfInvitationPayment",
    ADD CONSTRAINT "GolfBooking_invitedByBookingId_fkey"
      FOREIGN KEY ("invitedByBookingId") REFERENCES "GolfBooking"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "GolfBooking_invitation_pair" CHECK (("invitedByBookingId" IS NULL) = ("invitationPayment" IS NULL));
CREATE UNIQUE INDEX "GolfBooking_invitedByBookingId_key" ON "GolfBooking"("invitedByBookingId");
