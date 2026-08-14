-- Allow finished games to remain in the inbox while rematches create a new row.
DROP INDEX IF EXISTS "Game_player1_player2_key";

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

ALTER TABLE "Game"
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "rematchOf" INTEGER,
ADD COLUMN "pairKey" TEXT,
ADD COLUMN "activeKey" TEXT;

UPDATE "Game"
SET "pairKey" = LEAST("player1", "player2")::text || ':' || GREATEST("player1", "player2")::text,
    "activeKey" = CASE
        WHEN "status" = 'STARTED' THEN LEAST("player1", "player2")::text || ':' || GREATEST("player1", "player2")::text
        ELSE NULL
    END;

ALTER TABLE "Game" ALTER COLUMN "pairKey" SET NOT NULL;

CREATE UNIQUE INDEX "Game_rematchOf_key" ON "Game"("rematchOf");
CREATE UNIQUE INDEX "Game_activeKey_key" ON "Game"("activeKey");
CREATE INDEX "Game_player1_status_lastActivity_idx" ON "Game"("player1", "status", "lastActivity");
CREATE INDEX "Game_player2_status_lastActivity_idx" ON "Game"("player2", "status", "lastActivity");
CREATE INDEX "Game_pairKey_lastActivity_idx" ON "Game"("pairKey", "lastActivity");

CREATE TABLE "GameMoveReceipt" (
    "requestId" TEXT NOT NULL,
    "gameId" INTEGER NOT NULL,
    "playerId" INTEGER NOT NULL,
    "cell" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GameMoveReceipt_pkey" PRIMARY KEY ("requestId")
);

CREATE INDEX "GameMoveReceipt_gameId_idx" ON "GameMoveReceipt"("gameId");
