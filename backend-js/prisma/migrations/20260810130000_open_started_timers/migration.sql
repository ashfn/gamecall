UPDATE "Game"
SET "turnDeadline" = NULL
WHERE "status" = 'STARTED' AND "turnDeadline" IS NOT NULL;
