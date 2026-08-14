CREATE TABLE "ChatMessage" (
    "id" SERIAL NOT NULL,
    "pairKey" TEXT NOT NULL,
    "senderId" INTEGER NOT NULL,
    "recipientId" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChatMessage_clientRequestId_key" ON "ChatMessage"("clientRequestId");
CREATE INDEX "ChatMessage_pairKey_createdAt_idx" ON "ChatMessage"("pairKey", "createdAt");
