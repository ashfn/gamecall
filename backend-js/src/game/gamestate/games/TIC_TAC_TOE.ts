import { GameMoveStatus, GameState, GameStateManipulator } from "../gamestate";

export interface TTT_GameState extends GameState {
    board: number[][]
    // value of board is either 0 for nothing, 1 for player1 or 2 for player2
}

export const TIC_TAC_TOE: GameStateManipulator = {
    init(user1, user2) {

        const board = [[0,0,0],[0,0,0],[0,0,0]]

        const state: TTT_GameState = {
            player1: user1,
            player2: user2,
            board: board
        }

        return state
    },
    async processMove(state, userId, move) {

        // logic

        return {
            status: GameMoveStatus.ACCEPTED,
            state: state
        }
    },
}