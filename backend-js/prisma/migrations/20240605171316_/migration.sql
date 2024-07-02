/*
  Warnings:

  - Added the required column `status` to the `Game` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('SENT', 'STARTED', 'ENDED');

-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "status" "GameStatus" NOT NULL;
