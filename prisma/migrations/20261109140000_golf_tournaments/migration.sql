CREATE TYPE "TournamentSport" AS ENUM ('PADEL', 'TENIS', 'CROQUET', 'GOLF');

ALTER TABLE "Tournament"
    ALTER COLUMN "sport" TYPE "TournamentSport" USING ("sport"::text::"TournamentSport");
