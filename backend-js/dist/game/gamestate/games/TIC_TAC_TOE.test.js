"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const TIC_TAC_TOE_1 = require("./TIC_TAC_TOE");
function play(cells) {
    let state = (0, TIC_TAC_TOE_1.createTicTacToeState)(10, 20);
    let result = { state, winner: 0, nextPlayer: 10 };
    cells.forEach((cell, index) => {
        result = (0, TIC_TAC_TOE_1.applyTicTacToeMove)(result.state, index % 2 === 0 ? 10 : 20, cell);
    });
    return result;
}
(0, node_test_1.default)("creates an empty board with player1 playing X first", () => {
    const state = (0, TIC_TAC_TOE_1.createTicTacToeState)(10, 20);
    strict_1.default.deepEqual(state.board, Array(9).fill(null));
    const result = (0, TIC_TAC_TOE_1.applyTicTacToeMove)(state, 10, 4);
    strict_1.default.equal(result.state.board[4], "X");
    strict_1.default.equal(result.nextPlayer, 20);
});
(0, node_test_1.default)("detects wins and records the winning line", () => {
    const result = play([0, 3, 1, 4, 2]);
    strict_1.default.equal(result.winner, 10);
    strict_1.default.deepEqual(result.state.winningLine, [0, 1, 2]);
    strict_1.default.equal(result.nextPlayer, 0);
});
(0, node_test_1.default)("detects a draw", () => {
    const result = play([0, 1, 2, 4, 3, 5, 7, 6, 8]);
    strict_1.default.equal(result.winner, -1);
    strict_1.default.equal(result.state.moveCount, 9);
});
(0, node_test_1.default)("rejects occupied, out-of-range, and out-of-turn moves", () => {
    const state = (0, TIC_TAC_TOE_1.createTicTacToeState)(10, 20);
    const first = (0, TIC_TAC_TOE_1.applyTicTacToeMove)(state, 10, 0);
    strict_1.default.throws(() => (0, TIC_TAC_TOE_1.applyTicTacToeMove)(first.state, 20, 0), /already taken/);
    strict_1.default.throws(() => (0, TIC_TAC_TOE_1.applyTicTacToeMove)(state, 10, 9), /valid square/);
    strict_1.default.throws(() => (0, TIC_TAC_TOE_1.applyTicTacToeMove)(state, 20, 0), /not your turn/);
});
(0, node_test_1.default)("normalizes prototype boards without losing their original turn order", () => {
    const legacy = (0, TIC_TAC_TOE_1.normalizeTicTacToeState)({ player1: 10, player2: 20, board: [[20, 0, 0], [0, 0, 0], [0, 0, 0]] });
    strict_1.default.equal(legacy.xPlayer, 20);
    strict_1.default.equal(legacy.board[0], "X");
    strict_1.default.doesNotThrow(() => (0, TIC_TAC_TOE_1.applyTicTacToeMove)(legacy, 10, 1));
});
