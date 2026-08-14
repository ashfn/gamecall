-- The MVP now supports Tic Tac Toe only. Remove legacy Spotify games before
-- narrowing the enum so the existing database can migrate safely.
DELETE FROM "GameMoveReceipt"
WHERE "gameId" IN (
  SELECT "id" FROM "Game" WHERE "type" = 'SPOTIFY'
);

DELETE FROM "Game" WHERE "type" = 'SPOTIFY';

DROP TABLE IF EXISTS "SpotifyToken";

BEGIN;
CREATE TYPE "GameType_new" AS ENUM ('TIC_TAC_TOE');
ALTER TABLE "Game"
  ALTER COLUMN "type" TYPE "GameType_new"
  USING ("type"::text::"GameType_new");
ALTER TYPE "GameType" RENAME TO "GameType_old";
ALTER TYPE "GameType_new" RENAME TO "GameType";
DROP TYPE "GameType_old";
COMMIT;
