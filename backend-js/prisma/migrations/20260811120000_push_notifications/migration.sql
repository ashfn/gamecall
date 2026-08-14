CREATE TABLE "PushToken" (
  "token" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "platform" TEXT NOT NULL,
  "deviceName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PushToken_pkey" PRIMARY KEY ("token")
);

CREATE INDEX "PushToken_userId_idx" ON "PushToken"("userId");

ALTER TABLE "PushToken"
  ADD CONSTRAINT "PushToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
