import { Game, GameType, User } from "@prisma/client"
import { TIC_TAC_TOE } from "./games/TIC_TAC_TOE"

export interface GameState {
    player1: number,
    player2: number
}

export interface GameMove {
    actions: any[]
}

export enum GameMoveStatus {
    INVALID,
    ACCEPTED,
    ENDED
}

export interface GameMoveResult {
    status: GameMoveStatus
    state: GameState
    game: any
}

export interface GameStateManipulator {
    init(user1: number, user2: number): GameState
    processMove(state: GameState, userId: number, move: GameMove, gameId: number): Promise<GameMoveResult>
}

export function getGame(gameType: GameType){
    switch(gameType){
        case GameType.TIC_TAC_TOE: {
            return TIC_TAC_TOE
        }
        default: {
            return null
        }
    }
}

export function getGameType(gameName: string){
    switch(gameName){
        case "TIC_TAC_TOE": {
            return GameType.TIC_TAC_TOE
        }
        default: {
            return null
        }
    }
}

export function getOtherUser(gameState: GameState, currentUser: number){
    if(gameState.player1==currentUser){
        return gameState.player2
    }else{
        return gameState.player1
    }
}