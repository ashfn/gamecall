import { GameStatus } from "@prisma/client";
import { prisma } from "..";
import { GameState } from "./gamestate/gamestate";


export async function getAllActiveGames(userId: number){
    const games = await prisma.game.findMany({
        where: {
            AND: [
                {
                    OR: [
                        {
                            player1: userId
                        },
                        {
                            player2: userId
                        }
                    ]
                },
                {
                    OR: [
                        {status: GameStatus.STARTED},
                        {status: GameStatus.ENDED_UNOPENED}
                    ]
                }
            ]

        }
    })

    console.log(`found games ${JSON.stringify(games)}`)

    return games
}

export async function getAllGames(userId: number){
    const games = await prisma.game.findMany({
        where: {
            OR: [
                {
                    player1: userId
                },
                {
                    player2: userId
                }
            ]
        }
    })

    return games
}

export async function updateGame(gameId: number, newState: GameState, waitingOn: number, winner: number){
    return await prisma.game.update({
        where: {
            id: gameId
        },
        data: {
            gameStateJson: JSON.stringify(newState),
            waitingOn: waitingOn,
            lastActivity: new Date(),
            status: winner==0?GameStatus.STARTED:GameStatus.ENDED_UNOPENED,
            winner: winner==null?0:winner
        }
    })
}

