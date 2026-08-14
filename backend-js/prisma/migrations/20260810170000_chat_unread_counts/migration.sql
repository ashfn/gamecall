ALTER TABLE "ChatMessage" ADD COLUMN "readAt" TIMESTAMP(3);

-- Existing messages predate read receipts and may already have been viewed, so
-- do not surface them as a new unread backlog after this migration.
UPDATE "ChatMessage" SET "readAt" = "createdAt";

CREATE INDEX "ChatMessage_recipientId_senderId_readAt_idx"
  ON "ChatMessage"("recipientId", "senderId", "readAt");
