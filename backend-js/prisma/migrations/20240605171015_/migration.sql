-- CreateEnum
CREATE TYPE "GameType" AS ENUM ('TIC_TAC_TOE');

-- AlterTable
ALTER TABLE "Friendship" ADD COLUMN     "currentGameId" INTEGER NOT NULL DEFAULT -1;

-- CreateTable
CREATE TABLE "Game" (
    "id" SERIAL NOT NULL,
    "type" "GameType" NOT NULL,
    "player1" INTEGER NOT NULL,
    "player2" INTEGER NOT NULL,
    "winner" INTEGER NOT NULL,
    "waitingOn" INTEGER NOT NULL,
    "gameStateJson" TEXT NOT NULL,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Game_player1_player2_key" ON "Game"("player1", "player2");
