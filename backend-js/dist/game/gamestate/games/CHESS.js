"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyChessMove = exports.normalizeChessState = exports.createChessState = void 0;
const chess_js_1 = require("chess.js");
const SQUARE_PATTERN = /^[a-h][1-8]$/;
const PROMOTIONS = new Set(["q", "r", "b", "n"]);
function playerForColor(state, color) {
    if (color === "w")
        return state.whitePlayer;
    return state.whitePlayer === state.player1 ? state.player2 : state.player1;
}
function resultReason(chess) {
    if (chess.isCheckmate())
        return "CHECKMATE";
    if (chess.isStalemate())
        return "STALEMATE";
    if (chess.isThreefoldRepetition())
        return "THREEFOLD_REPETITION";
    if (chess.isDrawByFiftyMoves())
        return "FIFTY_MOVE_RULE";
    if (chess.isInsufficientMaterial())
        return "INSUFFICIENT_MATERIAL";
    if (chess.isDraw())
        return "DRAW";
    return null;
}
function replayMoves(rawMoves) {
    if (!Array.isArray(rawMoves) || rawMoves.length > 1000)
        throw new Error("Stored chess history is invalid");
    const chess = new chess_js_1.Chess();
    const moves = [];
    for (const rawMove of rawMoves) {
        if (!rawMove || typeof rawMove !== "object")
            throw new Error("Stored chess move is invalid");
        const value = rawMove;
        if (typeof value.from !== "string" || !SQUARE_PATTERN.test(value.from)
            || typeof value.to !== "string" || !SQUARE_PATTERN.test(value.to)) {
            throw new Error("Stored chess square is invalid");
        }
        const promotion = typeof value.promotion === "string" && PROMOTIONS.has(value.promotion)
            ? value.promotion
            : undefined;
        try {
            const played = chess.move({ from: value.from, to: value.to, promotion });
            moves.push({
                from: played.from,
                to: played.to,
                san: played.san,
                color: played.color,
                piece: played.piece,
                captured: played.captured,
                promotion: played.promotion,
            });
        }
        catch (_a) {
            throw new Error("Stored chess history contains an illegal move");
        }
    }
    return { chess, moves };
}
function createChessState(player1, player2) {
    const chess = new chess_js_1.Chess();
    return {
        kind: "chess",
        player1,
        player2,
        whitePlayer: player1,
        fen: chess.fen(),
        moves: [],
        lastMove: null,
        inCheck: false,
        resultReason: null,
    };
}
exports.createChessState = createChessState;
function normalizeChessState(raw) {
    var _a;
    if (!raw || typeof raw !== "object")
        throw new Error("Stored chess state is invalid");
    const value = raw;
    if (!Number.isInteger(value.player1) || !Number.isInteger(value.player2)
        || value.player1 === value.player2)
        throw new Error("Stored chess players are invalid");
    if (value.whitePlayer !== value.player1 && value.whitePlayer !== value.player2) {
        throw new Error("Stored chess colors are invalid");
    }
    const player1 = value.player1;
    const player2 = value.player2;
    const whitePlayer = value.whitePlayer;
    const replayed = replayMoves(value.moves);
    const moves = replayed.moves;
    return {
        kind: "chess",
        player1,
        player2,
        whitePlayer,
        fen: replayed.chess.fen(),
        moves,
        lastMove: (_a = moves[moves.length - 1]) !== null && _a !== void 0 ? _a : null,
        inCheck: replayed.chess.inCheck(),
        resultReason: resultReason(replayed.chess),
    };
}
exports.normalizeChessState = normalizeChessState;
function applyChessMove(rawState, userId, rawMove) {
    const state = normalizeChessState(rawState);
    if (!rawMove || typeof rawMove !== "object")
        throw new Error("Choose a valid chess move");
    const move = rawMove;
    if (typeof move.from !== "string" || !SQUARE_PATTERN.test(move.from)
        || typeof move.to !== "string" || !SQUARE_PATTERN.test(move.to)) {
        throw new Error("Choose a valid chess move");
    }
    if (userId !== state.player1 && userId !== state.player2)
        throw new Error("You are not a player in this game");
    if (state.resultReason)
        throw new Error("This game has already finished");
    const replayed = replayMoves(state.moves);
    if (playerForColor(state, replayed.chess.turn()) !== userId)
        throw new Error("It is not your turn");
    const promotion = typeof move.promotion === "string" && PROMOTIONS.has(move.promotion)
        ? move.promotion
        : undefined;
    let played;
    try {
        played = replayed.chess.move({ from: move.from, to: move.to, promotion });
    }
    catch (_a) {
        throw new Error("That move is not legal");
    }
    const record = {
        from: played.from,
        to: played.to,
        san: played.san,
        color: played.color,
        piece: played.piece,
        captured: played.captured,
        promotion: played.promotion,
    };
    const reason = resultReason(replayed.chess);
    const nextState = Object.assign(Object.assign({}, state), { fen: replayed.chess.fen(), moves: [...replayed.moves, record], lastMove: record, inCheck: replayed.chess.inCheck(), resultReason: reason });
    return {
        state: nextState,
        winner: reason === "CHECKMATE" ? userId : reason ? -1 : 0,
        nextPlayer: reason ? 0 : playerForColor(nextState, replayed.chess.turn()),
    };
}
exports.applyChessMove = applyChessMove;
