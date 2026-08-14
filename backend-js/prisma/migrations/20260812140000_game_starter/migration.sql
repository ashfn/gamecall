-- Preserve the sender for existing games, where player1 was historically the sender.
ALTER TABLE "Game" ADD COLUMN "startedBy" INTEGER;
UPDATE "Game" SET "startedBy" = "player1";
ALTER TABLE "Game" ALTER COLUMN "startedBy" SET NOT NULL;
