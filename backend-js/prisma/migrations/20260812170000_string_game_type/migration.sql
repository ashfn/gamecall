-- Game identifiers are validated by the application registry. Keeping this
-- column as text means installing a new game no longer requires a DB migration.
ALTER TABLE "Game"
ALTER COLUMN "type" TYPE TEXT USING "type"::TEXT;

DROP TYPE IF EXISTS "GameType";
