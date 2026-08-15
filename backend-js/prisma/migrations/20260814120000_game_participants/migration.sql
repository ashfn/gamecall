ALTER TYPE "GameStatus" ADD VALUE IF NOT EXISTS 'LOBBY' BEFORE 'STARTED';

CREATE TYPE "GameUserKind" AS ENUM ('ACCOUNT', 'ANONYMOUS');

CREATE TABLE "GameUser" (
  "id" SERIAL NOT NULL,
  "kind" "GameUserKind" NOT NULL,
  "accountId" INTEGER,
  "anonymousDisplayName" TEXT,
  "avatarSeed" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GameUser_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GameUser_accountId_key" ON "GameUser"("accountId");
CREATE INDEX "GameUser_accountId_idx" ON "GameUser"("accountId");

ALTER TABLE "GameUser"
  ADD CONSTRAINT "GameUser_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Keeping account-backed GameUser ids identical to legacy User ids means all
-- stored boards, racks, scores and move receipts remain valid without a JSON rewrite.
INSERT INTO "GameUser" ("id", "kind", "accountId", "createdAt", "lastSeenAt")
SELECT "id", 'ACCOUNT'::"GameUserKind", "id", "accountCreated", "lastOnline"
FROM "User"
ON CONFLICT ("id") DO NOTHING;

-- Be defensive about prototype games whose original account was deleted. They
-- still need a stable participant row for the foreign key and historical state.
INSERT INTO "GameUser" ("id", "kind", "anonymousDisplayName")
SELECT legacy."id", 'ANONYMOUS'::"GameUserKind", 'Former player'
FROM (
  SELECT "player1" AS "id" FROM "Game"
  UNION
  SELECT "player2" AS "id" FROM "Game"
) legacy
WHERE legacy."id" > 0
  AND NOT EXISTS (SELECT 1 FROM "GameUser" existing WHERE existing."id" = legacy."id")
ON CONFLICT ("id") DO NOTHING;

-- Anonymous ids live in a distant range so future account ids can continue to
-- mirror their User id during the compatibility window.
SELECT setval(pg_get_serial_sequence('"GameUser"', 'id'), GREATEST(1000000000, COALESCE((SELECT MAX("id") FROM "GameUser"), 0) + 1), false);

CREATE TABLE "AnonymousGameSession" (
  "id" TEXT NOT NULL,
  "gameUserId" INTEGER NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AnonymousGameSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AnonymousGameSession_gameUserId_idx" ON "AnonymousGameSession"("gameUserId");
CREATE INDEX "AnonymousGameSession_expiresAt_idx" ON "AnonymousGameSession"("expiresAt");
ALTER TABLE "AnonymousGameSession"
  ADD CONSTRAINT "AnonymousGameSession_gameUserId_fkey"
  FOREIGN KEY ("gameUserId") REFERENCES "GameUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Game"
  ADD COLUMN "createdByAccountId" INTEGER,
  ADD COLUMN "minPlayers" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN "maxPlayers" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN "startedAt" TIMESTAMP(3);

UPDATE "Game"
SET "createdByAccountId" = "startedBy",
    "startedAt" = "createdAt";

CREATE TABLE "GameParticipant" (
  "gameId" INTEGER NOT NULL,
  "gameUserId" INTEGER NOT NULL,
  "seat" INTEGER NOT NULL,
  "actionRequired" BOOLEAN NOT NULL DEFAULT false,
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastViewedVersion" INTEGER NOT NULL DEFAULT -1,
  "resultRank" INTEGER,
  "finalScore" INTEGER,
  CONSTRAINT "GameParticipant_pkey" PRIMARY KEY ("gameId", "gameUserId")
);

CREATE UNIQUE INDEX "GameParticipant_gameId_seat_key" ON "GameParticipant"("gameId", "seat");
CREATE INDEX "GameParticipant_gameUserId_actionRequired_idx" ON "GameParticipant"("gameUserId", "actionRequired");
CREATE INDEX "GameParticipant_gameUserId_joinedAt_idx" ON "GameParticipant"("gameUserId", "joinedAt");
ALTER TABLE "GameParticipant"
  ADD CONSTRAINT "GameParticipant_gameId_fkey"
  FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GameParticipant"
  ADD CONSTRAINT "GameParticipant_gameUserId_fkey"
  FOREIGN KEY ("gameUserId") REFERENCES "GameUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "GameParticipant" ("gameId", "gameUserId", "seat", "actionRequired", "joinedAt", "lastViewedVersion")
SELECT "id", "player1", 0, "waitingOn" = "player1", "createdAt", -1 FROM "Game"
ON CONFLICT ("gameId", "gameUserId") DO NOTHING;
INSERT INTO "GameParticipant" ("gameId", "gameUserId", "seat", "actionRequired", "joinedAt", "lastViewedVersion")
SELECT "id", "player2", 1, "waitingOn" = "player2", "createdAt", -1 FROM "Game"
WHERE "player2" <> "player1"
ON CONFLICT ("gameId", "gameUserId") DO NOTHING;

CREATE TABLE "GameInviteLink" (
  "id" TEXT NOT NULL,
  "gameId" INTEGER NOT NULL,
  "secretHash" TEXT NOT NULL,
  "createdByAccountId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "GameInviteLink_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GameInviteLink_gameId_idx" ON "GameInviteLink"("gameId");
CREATE INDEX "GameInviteLink_expiresAt_idx" ON "GameInviteLink"("expiresAt");
ALTER TABLE "GameInviteLink"
  ADD CONSTRAINT "GameInviteLink_gameId_fkey"
  FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
