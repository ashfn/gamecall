/*
  Warnings:

  - You are about to drop the column `avatar` on the `Profile` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Profile" DROP COLUMN "avatar";

-- CreateTable
CREATE TABLE "ProfileImage" (
    "userId" INTEGER NOT NULL,
    "avatar" BYTEA NOT NULL,

    CONSTRAINT "ProfileImage_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "ProfileImage" ADD CONSTRAINT "ProfileImage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
