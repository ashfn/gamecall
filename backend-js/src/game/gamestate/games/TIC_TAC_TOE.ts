import { updateGame } from "../../game";
import { GameMoveStatus, GameState, GameStateManipulator, getOtherUser } from "../gamestate";

export interface TTT_GameState extends GameState {
    board: number[][]
    // value of board is either 0 for nothing, 1 for player1 or 2 for player2
}

function checkWinner(board: number[][]) {
    // Check rows
    for (let i = 0; i < 3; i++) {
        if (board[i][0] !== 0 && board[i][0] === board[i][1] && board[i][1] === board[i][2]) {
            return board[i][0];
        }
    }

    // Check columns
    for (let i = 0; i < 3; i++) {
        if (board[0][i] !== 0 && board[0][i] === board[1][i] && board[1][i] === board[2][i]) {
            return board[0][i];
        }
    }

    // Check main diagonal
    if (board[0][0] !== 0 && board[0][0] === board[1][1] && board[1][1] === board[2][2]) {
        return board[0][0];
    }

    // Check anti-diagonal
    if (board[0][2] !== 0 && board[0][2] === board[1][1] && board[1][1] === board[2][0]) {
        return board[0][2];
    }

    // Check for draw
    if (board.flat().every(cell => cell !== 0)) {
        return -1;  // Return -1 for a draw
    }

    // No winner
    return 0;
}

export const TIC_TAC_TOE: GameStateManipulator = {
    async init(user1, user2, options) {

        
        const board = [[0,0,0],[0,0,0],[0,0,0]]

        const state: TTT_GameState = {
            player1: user1,
            player2: user2,
            board: board
        }

        return state
    },
    async processMove(state: TTT_GameState, userId, move, gameId) {

        // example move: move = [0, 2]
        // corresponds to row 1 last box
        // top to bottom left to right

        const action: number[] = move.actions[0]

        const row = action[0]
        const box = action[1]

        // check the space is not occupied
        if(state.board[row][box]!=0){
            return {
                status: GameMoveStatus.INVALID,
                state: state,
                game: null
            }
        }

        const newState: TTT_GameState = {...state}

        // update the board
        newState.board[row][box] = userId

        const winner = checkWinner(newState.board)

        if(winner==0){
            try{
                const result = await updateGame(gameId, newState, getOtherUser(newState, userId), 0)
                return {
                    status: GameMoveStatus.ACCEPTED,
                    state: newState,
                    game: result
                }
            } catch(err) {
                console.error(err)
                return {
                    status: GameMoveStatus.INVALID,
                    state: state,
                    game: null
                }
            }
        }else if(winner==-1){
            try{
                const result = await updateGame(gameId, newState, getOtherUser(newState, userId), -1)
                return {
                    status: GameMoveStatus.ENDED,
                    state: newState,
                    game: result
                }
            } catch(err) {
                console.error(err)
                return {
                    status: GameMoveStatus.INVALID,
                    state: state,
                    game: null
                }
            }
        }else{
            try{
                const result = await updateGame(gameId, newState, getOtherUser(newState, userId), winner)
                return {
                    status: GameMoveStatus.ENDED,
                    state: newState,
                    game: result
                }
            } catch(err) {
                console.error(err)
                return {
                    status: GameMoveStatus.INVALID,
                    state: state,
                    game: null
                }
            }
        }

    },
}