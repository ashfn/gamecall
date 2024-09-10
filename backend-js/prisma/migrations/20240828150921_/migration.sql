/*
  Warnings:

  - Changed the type of `expires` on the `SpotifyToken` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "SpotifyToken" DROP COLUMN "expires",
ADD COLUMN     "expires" INTEGER NOT NULL;
