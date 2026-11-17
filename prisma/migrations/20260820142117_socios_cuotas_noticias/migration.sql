-- CreateEnum
CREATE TYPE "Relationship" AS ENUM ('SOCIO', 'EMPLEADO', 'COLABORADOR', 'INVITADO');

-- CreateEnum
CREATE TYPE "FeeStatus" AS ENUM ('PENDING', 'PAID', 'OVERDUE', 'WAIVED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PostCategory" AS ENUM ('NOTICIA', 'EVENTO', 'AVISO');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MemberType" ADD VALUE 'INFANTIL';
ALTER TYPE "MemberType" ADD VALUE 'HONORARIO';

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'COLLABORATOR';

-- AlterEnum
ALTER TYPE "UserStatus" ADD VALUE 'BAJA';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "accountHolder" TEXT,
ADD COLUMN     "addressLine" TEXT,
ADD COLUMN     "altPhone" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "ibanEncrypted" TEXT,
ADD COLUMN     "ibanLast4" TEXT,
ADD COLUMN     "joinedAt" TIMESTAMP(3),
ADD COLUMN     "leaveReason" TEXT,
ADD COLUMN     "leftAt" TIMESTAMP(3),
ADD COLUMN     "managedSports" "Sport"[] DEFAULT ARRAY[]::"Sport"[],
ADD COLUMN     "nationalId" TEXT,
ADD COLUMN     "postalCode" TEXT,
ADD COLUMN     "province" TEXT,
ADD COLUMN     "relationship" "Relationship" NOT NULL DEFAULT 'SOCIO';

-- CreateTable
CREATE TABLE "MembershipFee" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "concept" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "taxTreatment" "TaxTreatment" NOT NULL DEFAULT 'NOT_SUBJECT',
    "status" "FeeStatus" NOT NULL DEFAULT 'PENDING',
    "dueDate" DATE NOT NULL,
    "paidAt" TIMESTAMP(3),
    "method" "PaymentMethod",
    "reference" TEXT,
    "registeredById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MembershipFee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT,
    "body" TEXT NOT NULL,
    "category" "PostCategory" NOT NULL DEFAULT 'NOTICIA',
    "eventDate" TIMESTAMP(3),
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MembershipFee_userId_dueDate_idx" ON "MembershipFee"("userId", "dueDate");

-- CreateIndex
CREATE INDEX "MembershipFee_status_dueDate_idx" ON "MembershipFee"("status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipFee_userId_period_concept_key" ON "MembershipFee"("userId", "period", "concept");

-- CreateIndex
CREATE UNIQUE INDEX "Post_slug_key" ON "Post"("slug");

-- CreateIndex
CREATE INDEX "Post_publishedAt_idx" ON "Post"("publishedAt");

-- CreateIndex
CREATE INDEX "Post_category_eventDate_idx" ON "Post"("category", "eventDate");

-- CreateIndex
CREATE INDEX "User_lastName_firstName_idx" ON "User"("lastName", "firstName");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipFee" ADD CONSTRAINT "MembershipFee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipFee" ADD CONSTRAINT "MembershipFee_registeredById_fkey" FOREIGN KEY ("registeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
