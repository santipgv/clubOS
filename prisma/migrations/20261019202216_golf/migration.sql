-- CreateEnum
CREATE TYPE "GolfCourseKind" AS ENUM ('RECORRIDO', 'PRACTICAS', 'PITCH_AND_PUTT', 'PUTTING_GREEN');

-- CreateEnum
CREATE TYPE "GolfBookingStatus" AS ENUM ('CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW');

-- DropIndex
DROP INDEX "Payment_bookingId_idx";

-- CreateTable
CREATE TABLE "GolfCourse" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "GolfCourseKind" NOT NULL DEFAULT 'RECORRIDO',
    "holes" INTEGER NOT NULL DEFAULT 18,
    "teeIntervalMinutes" INTEGER NOT NULL DEFAULT 10,
    "maxPlayers" INTEGER NOT NULL DEFAULT 4,
    "memberPriceCents" INTEGER NOT NULL DEFAULT 0,
    "guestPriceCents" INTEGER NOT NULL DEFAULT 0,
    "memberTaxTreatment" "TaxTreatment" NOT NULL DEFAULT 'EXEMPT_SPORT',
    "guestTaxTreatment" "TaxTreatment" NOT NULL DEFAULT 'STANDARD_21',
    "buggyPriceCents" INTEGER NOT NULL DEFAULT 0,
    "buggiesAvailable" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GolfCourse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GolfSchedule" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "opensAt" INTEGER NOT NULL,
    "closesAt" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "GolfSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GolfTeeTime" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "playersBooked" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GolfTeeTime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GolfBooking" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "teeTimeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "players" INTEGER NOT NULL DEFAULT 1,
    "guestCount" INTEGER NOT NULL DEFAULT 0,
    "buggies" INTEGER NOT NULL DEFAULT 0,
    "playerNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "GolfBookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "taxCents" INTEGER NOT NULL DEFAULT 0,
    "taxTreatment" "TaxTreatment" NOT NULL DEFAULT 'EXEMPT_SPORT',
    "notes" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GolfBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GolfBlock" (
    "id" TEXT NOT NULL,
    "courseId" TEXT,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "type" "BlockType" NOT NULL DEFAULT 'EVENT',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GolfBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GolfCourse_code_key" ON "GolfCourse"("code");

-- CreateIndex
CREATE INDEX "GolfCourse_isActive_sortOrder_idx" ON "GolfCourse"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "GolfSchedule_courseId_weekday_idx" ON "GolfSchedule"("courseId", "weekday");

-- CreateIndex
CREATE INDEX "GolfTeeTime_startsAt_idx" ON "GolfTeeTime"("startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "GolfTeeTime_courseId_startsAt_key" ON "GolfTeeTime"("courseId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "GolfBooking_reference_key" ON "GolfBooking"("reference");

-- CreateIndex
CREATE INDEX "GolfBooking_teeTimeId_idx" ON "GolfBooking"("teeTimeId");

-- CreateIndex
CREATE INDEX "GolfBooking_userId_createdAt_idx" ON "GolfBooking"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "GolfBlock_startsAt_endsAt_idx" ON "GolfBlock"("startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "GolfBlock_courseId_startsAt_idx" ON "GolfBlock"("courseId", "startsAt");

-- AddForeignKey
ALTER TABLE "GolfSchedule" ADD CONSTRAINT "GolfSchedule_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "GolfCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GolfTeeTime" ADD CONSTRAINT "GolfTeeTime_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "GolfCourse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GolfBooking" ADD CONSTRAINT "GolfBooking_teeTimeId_fkey" FOREIGN KEY ("teeTimeId") REFERENCES "GolfTeeTime"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GolfBooking" ADD CONSTRAINT "GolfBooking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GolfBooking" ADD CONSTRAINT "GolfBooking_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GolfBooking" ADD CONSTRAINT "GolfBooking_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GolfBlock" ADD CONSTRAINT "GolfBlock_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "GolfCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GolfBlock" ADD CONSTRAINT "GolfBlock_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Aforo de la salida.
--
-- En las pistas, el constraint de exclusion impide que dos reservas se solapen.
-- En golf el problema es otro: varias reservas comparten salida y lo que no
-- puede pasar es que entre todas superen el flight. El contador playersBooked
-- se actualiza en la misma sentencia que inserta la reserva (ver
-- src/lib/golf/salidas.ts), y este CHECK es la red de seguridad por si alguna
-- vez se toca la tabla por otra via.
-- ---------------------------------------------------------------------------

ALTER TABLE "GolfTeeTime"
  ADD CONSTRAINT "golf_aforo_no_negativo" CHECK ("playersBooked" >= 0);

ALTER TABLE "GolfBooking"
  ADD CONSTRAINT "golf_jugadores_positivos" CHECK ("players" >= 1);

ALTER TABLE "GolfBooking"
  ADD CONSTRAINT "golf_invitados_caben" CHECK ("guestCount" >= 0 AND "guestCount" <= "players");

ALTER TABLE "GolfBooking"
  ADD CONSTRAINT "golf_buggies_no_negativos" CHECK ("buggies" >= 0);

ALTER TABLE "GolfSchedule"
  ADD CONSTRAINT "golf_horario_ordenado" CHECK ("opensAt" < "closesAt");

ALTER TABLE "GolfSchedule"
  ADD CONSTRAINT "golf_dia_semana" CHECK ("weekday" BETWEEN 0 AND 6);

ALTER TABLE "GolfBlock"
  ADD CONSTRAINT "golf_bloqueo_ordenado" CHECK ("startsAt" < "endsAt");

ALTER TABLE "GolfCourse"
  ADD CONSTRAINT "golf_intervalo_positivo" CHECK ("teeIntervalMinutes" > 0);

ALTER TABLE "GolfCourse"
  ADD CONSTRAINT "golf_aforo_positivo" CHECK ("maxPlayers" >= 1);
