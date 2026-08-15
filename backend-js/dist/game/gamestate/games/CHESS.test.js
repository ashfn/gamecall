"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const CHESS_1 = require("./CHESS");
function play(moves) {
    let state = (0, CHESS_1.createChessState)(10, 20);
    let result = { state, winner: 0, nextPlayer: 10 };
    for (const [player, from, to, promotion] of moves) {
        result = (0, CHESS_1.applyChessMove)(result.state, player, { from, to, promotion });
    }
    return result;
}
(0, node_test_1.default)("creates standard chess with white moving first", () => {
    const state = (0, CHESS_1.createChessState)(10, 20);
    strict_1.default.match(state.fen, /^rnbqkbnr\/pppppppp\/8\/8\/8\/8\/PPPPPPPP\/RNBQKBNR w/);
    strict_1.default.equal((0, CHESS_1.applyChessMove)(state, 10, { from: "e2", to: "e4" }).nextPlayer, 20);
    strict_1.default.throws(() => (0, CHESS_1.applyChessMove)(state, 20, { from: "e7", to: "e5" }), /not your turn/);
});
(0, node_test_1.default)("rejects illegal movement and moving into check", () => {
    const state = (0, CHESS_1.createChessState)(10, 20);
    strict_1.default.throws(() => (0, CHESS_1.applyChessMove)(state, 10, { from: "e2", to: "e5" }), /not legal/);
    const checked = play([[10, "e2", "e4"], [20, "d7", "d5"], [10, "f1", "b5"]]);
    strict_1.default.throws(() => (0, CHESS_1.applyChessMove)(checked.state, 20, { from: "a7", to: "a6" }), /not legal/);
});
(0, node_test_1.default)("detects checkmate authoritatively", () => {
    const result = play([
        [10, "f2", "f3"], [20, "e7", "e5"], [10, "g2", "g4"], [20, "d8", "h4"],
    ]);
    strict_1.default.equal(result.winner, 20);
    strict_1.default.equal(result.nextPlayer, 0);
    strict_1.default.equal(result.state.resultReason, "CHECKMATE");
    strict_1.default.equal(result.state.inCheck, true);
});
(0, node_test_1.default)("supports castling and en passant", () => {
    var _a, _b, _c;
    const castled = play([
        [10, "e2", "e4"], [20, "e7", "e5"], [10, "g1", "f3"], [20, "b8", "c6"],
        [10, "f1", "c4"], [20, "g8", "f6"], [10, "e1", "g1"],
    ]);
    strict_1.default.equal((_a = castled.state.lastMove) === null || _a === void 0 ? void 0 : _a.san, "O-O");
    const enPassant = play([
        [10, "e2", "e4"], [20, "a7", "a6"], [10, "e4", "e5"], [20, "d7", "d5"],
        [10, "e5", "d6"],
    ]);
    strict_1.default.equal((_b = enPassant.state.lastMove) === null || _b === void 0 ? void 0 : _b.captured, "p");
    strict_1.default.equal((_c = enPassant.state.lastMove) === null || _c === void 0 ? void 0 : _c.san, "exd6");
});
(0, node_test_1.default)("requires and applies a promotion choice", () => {
    var _a;
    const promoted = play([
        [10, "a2", "a4"], [20, "h7", "h5"], [10, "a4", "a5"], [20, "h5", "h4"],
        [10, "a5", "a6"], [20, "h4", "h3"], [10, "a6", "b7"], [20, "h3", "g2"],
        [10, "b7", "a8", "n"],
    ]);
    strict_1.default.equal((_a = promoted.state.lastMove) === null || _a === void 0 ? void 0 : _a.promotion, "n");
    strict_1.default.match(promoted.state.fen, /^N/);
});
(0, node_test_1.default)("preserves repetition history through normalization", () => {
    const repeated = play([
        [10, "g1", "f3"], [20, "g8", "f6"], [10, "f3", "g1"], [20, "f6", "g8"],
        [10, "g1", "f3"], [20, "g8", "f6"], [10, "f3", "g1"], [20, "f6", "g8"],
    ]);
    strict_1.default.equal(repeated.winner, -1);
    strict_1.default.equal(repeated.state.resultReason, "THREEFOLD_REPETITION");
    strict_1.default.equal((0, CHESS_1.normalizeChessState)(repeated.state).resultReason, "THREEFOLD_REPETITION");
});
