import { GameStatus } from "@prisma/client";
import { prisma } from "..";


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
                    status: GameStatus.STARTED
                }
            ]

        }
    })

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