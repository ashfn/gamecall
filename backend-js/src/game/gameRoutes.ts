import { Request, Response } from "express";
import { prisma } from "..";
import { getAllActiveGames } from "./game";
import { clientError, success, userError } from "../status";
import { areFriends, getFriends } from "../friends/friends";
import { Friendship, Game, GameStatus, User } from "@prisma/client";
import { GameMoveStatus, getGame, getGameType } from "./gamestate/gamestate";

export async function getActiveGamesRoute(req: Request, res: Response){
    const user = res.locals.user
    
    const games = await getAllActiveGames(user.id)

    return res.send(JSON.stringify(success(games)))

}

// POST /newGame
export async function sendGameRoute(req: Request, res: Response){
    const user = res.locals.user

    const target = parseInt(req.body.user, 10)

    if(Number.isNaN(Number(req.body.user)) || Number.isNaN(target)){
        return res.send(JSON.stringify(clientError("Invalid userId")))
    }

    const gameName = req.body.game

    
    // check theyre friends
    const friends = await getFriends(user.id)
    let friendship:Friendship|null = null
    for(let x=0; x<friends.length; x++){
        const friend = friends[x]
        if(areFriends(friend, [user.id, target])){
            friendship = friend
            break
        }
    }

    if(friendship==null){
        return res.send(JSON.stringify(userError("You are not friends with this user!")))
    }


    // check neither of them have an opened or sent game to eachother
    const currentGame = await prisma.game.findFirst({
        where: {
            AND: [
                {
                    OR: [
                        {
                            player1: user.id,
                            player2: target
                        },
                        {
                            player1: target,
                            player2: user.id
                        }
                    ]
                },
                {
                    OR: [
                        {
                            status: GameStatus.STARTED
                        },
                        {
                            status: GameStatus.STARTED
                        }
                    ]
                }
            ]

        }
    })

    if(currentGame!=null){
        return res.send(JSON.stringify(userError("You already have an active game!")))
    }

    // check the game exists
    const game = getGame(gameName)
    const gameType = getGameType(gameName)

    if(game==null || gameType==null){
        return res.send(JSON.stringify(clientError("Unknown game requested")))
    }

    const gameState = game.init(user.id, target)

    // create the game in the database
    const gameRow: Game = await prisma.game.create({
        data: {
            player1: user.id,
            player2: target,
            winner: 0,
            status: GameStatus.STARTED,
            type: gameType,
            waitingOn: target,
            gameStateJson: JSON.stringify(gameState)
        }
    })
    
    await prisma.friendship.updateMany({
        where: {
            OR: [
                {
                    user1: user.id,
                    user2: target
                },
                {
                    user1: target,
                    user2: user.id
                }
            ]

        },
        data: {
            currentGameId: gameRow.id
        }
    })

    // DISPATCH NOTIFICATION

    return res.send(JSON.stringify(success(gameRow)))
}

// POST /endGame
export async function endGameRoute(req: Request, res: Response){

    const user: User = res.locals.user

    const gameId = parseInt(req.body.gameId, 10)

    const game = await prisma.game.findFirst({
        where: {
            id: gameId
        }
    })

    if(game==null){
        return res.send(JSON.stringify(clientError("Invalid game id")))
    }

    if(!(game.player1==user.id || game.player2==user.id)){
        return res.send(JSON.stringify(clientError("You are not a player in this game")))
    }

    if(game.status!=GameStatus.STARTED){
        return res.send(JSON.stringify(clientError("This game has already ended")))
    }

    await prisma.game.update({
        where: {
            id: gameId
        },
        data: {
            status: GameStatus.CANCELLED
        }
    })

    await prisma.friendship.updateMany({
        where: {
            OR: [
                {
                    user1: game.player1,
                    user2: game.player2
                },
                {
                    user1: game.player2,
                    user2: game.player1
                }
            ]

        },
        data: {
            currentGameId: -1
        }
    })

    // DISPATCH NOTIFICATION

    return res.send(JSON.stringify(success()))
}

// POST /updateGame
export async function updateGameRoute(req: Request, res: Response){
    const user: User = res.locals.user

    const gameId = parseInt(req.body.gameId, 10)

    if(Number.isNaN(Number(req.body.user)) || Number.isNaN(gameId)){
        return res.send(JSON.stringify(clientError("Invalid userId")))
    }

    const game = await prisma.game.findFirst({
        where: {
            id: gameId
        }
    })
    
    if(game==null){
        return res.send(JSON.stringify(clientError("Invalid game id")))
    }

    if(!(game.player1==user.id || game.player2==user.id)){
        return res.send(JSON.stringify(clientError("You are not a player in this game")))
    }

    if(game.status!=GameStatus.STARTED){
        return res.send(JSON.stringify(clientError("This game is not in progress")))
    }


    const gameType = game.type
    const gameMutator = getGame(gameType)

    const moves = req.body.moves

    if(gameMutator == null){
        return res.send(JSON.stringify(clientError("Game exists on database but not on backend")))
    }

    
    const result = await gameMutator.processMove(JSON.parse(game.gameStateJson), user.id, {
        actions: moves
    }, game.id)
    

    if(result.status==GameMoveStatus.INVALID){
        return res.send(JSON.stringify(clientError("Invalid move could not be processed")))
    }

    if(result.status==GameMoveStatus.ENDED){
        // when the game is ended, the actual game logic updates the game so we don't need to do anything
        return res.send(JSON.stringify(success()))
    }

    await prisma.game.update({
        where: {
            id: gameId
        },
        data: {
            gameStateJson: JSON.stringify(result.state),
            waitingOn: (user.id==game.player1?game.player2:game.player1),
            lastActivity: new Date()
        }
    })

    // DISPATCH NOTIFICATION

    return res.send(JSON.stringify(success()))

}