"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TIC_TAC_TOE = exports.applyTicTacToeMove = exports.findWinningLine = exports.normalizeTicTacToeState = exports.createTicTacToeState = void 0;
const gamestate_1 = require("../gamestate");
const WINNING_LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
];
function createTicTacToeState(player1, player2) {
    return {
        kind: "tic-tac-toe",
        player1,
        player2,
        xPlayer: player1,
        board: Array(9).fill(null),
        moveCount: 0,
        winningLine: null,
    };
}
exports.createTicTacToeState = createTicTacToeState;
function normalizeTicTacToeState(raw) {
    var _a;
    if (!raw || typeof raw !== "object")
        throw new Error("Stored game state is invalid");
    const value = raw;
    const rawBoard = raw.board;
    if (!Number.isInteger(value.player1) || !Number.isInteger(value.player2)) {
        throw new Error("Stored players are invalid");
    }
    let board;
    const isLegacyBoard = Array.isArray(rawBoard) && rawBoard.length === 3 && Array.isArray(rawBoard[0]);
    // The prototype let the invited player move first; new games let the challenger move first.
    const xPlayer = isLegacyBoard ? value.player2 : (_a = value.xPlayer) !== null && _a !== void 0 ? _a : value.player1;
    if (xPlayer !== value.player1 && xPlayer !== value.player2)
        throw new Error("Stored marks are invalid");
    if (isLegacyBoard) {
        board = rawBoard.flat().map((cell) => {
            if (cell === 0)
                return null;
            if (cell === xPlayer)
                return "X";
            if (cell === (xPlayer === value.player1 ? value.player2 : value.player1))
                return "O";
            throw new Error("Stored board contains an invalid player");
        });
    }
    else if (Array.isArray(rawBoard) && rawBoard.length === 9) {
        board = rawBoard.map((cell) => {
            if (cell === null || cell === "X" || cell === "O")
                return cell;
            throw new Error("Stored board contains an invalid mark");
        });
    }
    else {
        throw new Error("Stored board is invalid");
    }
    const xCount = board.filter((cell) => cell === "X").length;
    const oCount = board.filter((cell) => cell === "O").length;
    if (oCount > xCount || xCount - oCount > 1)
        throw new Error("Stored turn order is invalid");
    return {
        kind: "tic-tac-toe",
        player1: value.player1,
        player2: value.player2,
        xPlayer,
        board,
        moveCount: xCount + oCount,
        winningLine: findWinningLine(board),
    };
}
exports.normalizeTicTacToeState = normalizeTicTacToeState;
function findWinningLine(board) {
    for (const line of WINNING_LINES) {
        const [a, b, c] = line;
        if (board[a] !== null && board[a] === board[b] && board[a] === board[c])
            return [...line];
    }
    return null;
}
exports.findWinningLine = findWinningLine;
function applyTicTacToeMove(rawState, userId, cell) {
    const state = normalizeTicTacToeState(rawState);
    if (!Number.isInteger(cell) || cell < 0 || cell > 8)
        throw new Error("Choose a valid square");
    if (userId !== state.player1 && userId !== state.player2)
        throw new Error("You are not a player in this game");
    if (state.winningLine || state.moveCount === 9)
        throw new Error("This game has already finished");
    if (state.board[cell] !== null)
        throw new Error("That square is already taken");
    const oPlayer = state.xPlayer === state.player1 ? state.player2 : state.player1;
    const expectedPlayer = state.moveCount % 2 === 0 ? state.xPlayer : oPlayer;
    if (userId !== expectedPlayer)
        throw new Error("It is not your turn");
    const mark = userId === state.xPlayer ? "X" : "O";
    const board = [...state.board];
    board[cell] = mark;
    const winningLine = findWinningLine(board);
    const moveCount = state.moveCount + 1;
    return {
        state: Object.assign(Object.assign({}, state), { board, moveCount, winningLine }),
        winner: winningLine ? userId : moveCount === 9 ? -1 : 0,
        nextPlayer: winningLine || moveCount === 9
            ? 0
            : userId === state.player1 ? state.player2 : state.player1,
    };
}
exports.applyTicTacToeMove = applyTicTacToeMove;
// Kept as a pure adapter for the prototype's older game registry.
exports.TIC_TAC_TOE = {
    init(user1, user2) {
        return __awaiter(this, void 0, void 0, function* () {
            return createTicTacToeState(user1, user2);
        });
    },
    processMove(state, userId, move) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const result = applyTicTacToeMove(state, userId, move.actions[0]);
                return {
                    status: result.winner === 0 ? gamestate_1.GameMoveStatus.ACCEPTED : gamestate_1.GameMoveStatus.ENDED,
                    state: result.state,
                    game: null,
                };
            }
            catch (_a) {
                return { status: gamestate_1.GameMoveStatus.INVALID, state, game: null };
            }
        });
    },
};
