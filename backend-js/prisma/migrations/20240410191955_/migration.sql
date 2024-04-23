-- AlterTable
ALTER TABLE "Friendship" ALTER COLUMN "friendshipCreated" SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "lastActivity" SET DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "FriendRequest" (
    "requestOriginId" INTEGER NOT NULL,
    "requestDestinationId" INTEGER NOT NULL,
    "status" "FriendRequestStatus" NOT NULL DEFAULT 'PENDING',
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FriendRequest_pkey" PRIMARY KEY ("requestOriginId","requestDestinationId")
);

-- AddForeignKey
ALTER TABLE "FriendRequest" ADD CONSTRAINT "FriendRequest_requestOriginId_fkey" FOREIGN KEY ("requestOriginId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FriendRequest" ADD CONSTRAINT "FriendRequest_requestDestinationId_fkey" FOREIGN KEY ("requestDestinationId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
