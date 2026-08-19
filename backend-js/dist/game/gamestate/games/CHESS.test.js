"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const CHESS_1 = require("./CHESS");
const chessEngine_1 = require("./chessEngine");
function play(moves, variant = "STANDARD") {
    const state = (0, CHESS_1.createChessState)(10, 20, { variant });
    let result = { state, winner: 0, nextPlayer: 10 };
    for (const [player, from, to, promotion] of moves) {
        result = (0, CHESS_1.applyChessMove)(result.state, player, { from, to, promotion });
    }
    return result;
}
(0, node_test_1.default)("creates standard chess with white moving first", () => {
    const state = (0, CHESS_1.createChessState)(10, 20, {});
    strict_1.default.equal(state.variant, "STANDARD");
    strict_1.default.match(state.fen, /^rnbqkbnr\/pppppppp\/8\/8\/8\/8\/PPPPPPPP\/RNBQKBNR w KQkq/);
    strict_1.default.equal((0, CHESS_1.applyChessMove)(state, 10, { from: "e2", to: "e4" }).nextPlayer, 20);
    strict_1.default.throws(() => (0, CHESS_1.applyChessMove)(state, 20, { from: "e7", to: "e5" }), /not your turn/);
});
(0, node_test_1.default)("rejects illegal movement and moving into check", () => {
    const state = (0, CHESS_1.createChessState)(10, 20, {});
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
    const castled = play([
        [10, "e2", "e4"], [20, "e7", "e5"], [10, "g1", "f3"], [20, "b8", "c6"],
        [10, "f1", "c4"], [20, "g8", "f6"], [10, "e1", "g1"],
    ]);
    strict_1.default.equal(castled.state.lastMove?.san, "O-O");
    const enPassant = play([
        [10, "e2", "e4"], [20, "a7", "a6"], [10, "e4", "e5"], [20, "d7", "d5"],
        [10, "e5", "d6"],
    ]);
    strict_1.default.equal(enPassant.state.lastMove?.captured, "p");
    strict_1.default.equal(enPassant.state.lastMove?.san, "exd6");
    strict_1.default.equal(enPassant.state.lastMove?.enPassant, true);
});
(0, node_test_1.default)("requires and applies a promotion choice", () => {
    const promoted = play([
        [10, "a2", "a4"], [20, "h7", "h5"], [10, "a4", "a5"], [20, "h5", "h4"],
        [10, "a5", "a6"], [20, "h4", "h3"], [10, "a6", "b7"], [20, "h3", "g2"],
        [10, "b7", "a8", "n"],
    ]);
    strict_1.default.equal(promoted.state.lastMove?.promotion, "n");
    strict_1.default.match(promoted.state.fen, /^N/);
});
(0, node_test_1.default)("normalizes settings and states written before variants existed", () => {
    strict_1.default.deepEqual((0, CHESS_1.normalizeChessSettings)(undefined), { variant: "STANDARD" });
    strict_1.default.deepEqual((0, CHESS_1.normalizeChessSettings)({ variant: "FOG_OF_WAR" }), { variant: "FOG_OF_WAR" });
    strict_1.default.deepEqual((0, CHESS_1.normalizeChessSettings)({ variant: "SHOGI" }), { variant: "STANDARD" });
    const legacy = {
        kind: "chess",
        player1: 10,
        player2: 20,
        whitePlayer: 10,
        fen: "unused - the move list is authoritative",
        moves: [{ from: "e2", to: "e4" }],
        lastMove: null,
        inCheck: false,
        resultReason: null,
    };
    const normalized = (0, CHESS_1.normalizeChessState)(legacy);
    strict_1.default.equal(normalized.variant, "STANDARD");
    strict_1.default.equal(normalized.startFen, "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    strict_1.default.equal(normalized.lastMove?.san, "e4");
});
// --- Chess960 ---------------------------------------------------------------
(0, node_test_1.default)("chess960 deals a legal random back rank", () => {
    for (let attempt = 0; attempt < 40; attempt++) {
        const state = (0, CHESS_1.createChessState)(10, 20, { variant: "CHESS960" });
        strict_1.default.equal(state.variant, "CHESS960");
        strict_1.default.ok(state.startIndex !== null && state.startIndex >= 0 && state.startIndex < 960);
        const backRank = state.startFen.split(" ")[0].split("/")[0];
        strict_1.default.equal([...backRank].sort().join(""), "bbknnqrr");
        const bishops = [...backRank].flatMap((piece, f) => (piece === "b" ? [f] : []));
        strict_1.default.notEqual((bishops[0] + bishops[1]) % 2, 0, `bishops share a colour: ${backRank}`);
        const rooks = [...backRank].flatMap((piece, f) => (piece === "r" ? [f] : []));
        const king = backRank.indexOf("k");
        strict_1.default.ok(rooks[0] < king && king < rooks[1], `king is not between the rooks: ${backRank}`);
    }
});
(0, node_test_1.default)("chess960 position 518 is orthodox chess", () => {
    strict_1.default.equal((0, chessEngine_1.chess960Fen)(518), "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w HAha - 0 1");
    strict_1.default.throws(() => (0, chessEngine_1.chess960Fen)(960), /Invalid Chess960 position/);
});
(0, node_test_1.default)("chess960 castles from wherever the king and rook started", () => {
    // King b1, rooks a1 and h1: castling still lands the king on c1/g1.
    const kingside = new chessEngine_1.Chess("4k3/8/8/8/8/8/8/RK5R w HA - 0 1", { variant: "chess960" });
    const castles = kingside.moves({ verbose: true }).filter((move) => move.isCastle());
    strict_1.default.deepEqual(castles.map((move) => `${move.san}:${move.from}->${move.to}:${move.castleKingTo}${move.castleRookTo}`), ["O-O:b1->h1:g1f1", "O-O-O:b1->a1:c1d1"]);
    // Both ways of expressing a castle must land in the same position.
    const takesRook = new chessEngine_1.Chess("4k3/8/8/8/8/8/8/5RKR w HF - 0 1", { variant: "chess960" });
    takesRook.move({ from: "g1", to: "f1" });
    const toSquare = new chessEngine_1.Chess("4k3/8/8/8/8/8/8/5RKR w HF - 0 1", { variant: "chess960" });
    toSquare.move({ from: "g1", to: "c1" });
    strict_1.default.equal(takesRook.fen(), "4k3/8/8/8/8/8/8/2KR3R b - - 1 1");
    strict_1.default.equal(takesRook.fen(), toSquare.fen());
    // A rook path blocked where the king's path is clear (only possible in 960).
    const blocked = new chessEngine_1.Chess("4k3/8/8/8/8/8/8/RK1N3R w HA - 0 1", { variant: "chess960" });
    strict_1.default.deepEqual(blocked.moves().filter((san) => san.startsWith("O")), []);
});
(0, node_test_1.default)("chess960 castling survives a round trip through stored state", () => {
    // Deal positions until one lets white castle on the second move.
    for (let attempt = 0; attempt < 200; attempt++) {
        const state = (0, CHESS_1.createChessState)(10, 20, { variant: "CHESS960" });
        const engine = new chessEngine_1.Chess(state.startFen, { variant: "chess960" });
        const opening = engine.moves({ verbose: true }).find((move) => move.piece === "n");
        if (!opening)
            continue;
        const first = (0, CHESS_1.applyChessMove)(state, 10, { from: opening.from, to: opening.to });
        const reply = new chessEngine_1.Chess(first.state.fen, { variant: "chess960" }).moves({ verbose: true })[0];
        const second = (0, CHESS_1.applyChessMove)(first.state, 20, { from: reply.from, to: reply.to });
        const normalized = (0, CHESS_1.normalizeChessState)(JSON.parse(JSON.stringify(second.state)));
        strict_1.default.equal(normalized.fen, second.state.fen);
        strict_1.default.equal(normalized.startFen, state.startFen);
        return;
    }
    strict_1.default.fail("no Chess960 position offered a knight move");
});
// --- fog of war -------------------------------------------------------------
function fogGame(moves) {
    return play(moves, "FOG_OF_WAR");
}
function piecesOnBoard(fen) {
    const squares = [];
    fen.split(" ")[0].split("/").forEach((row, rankIndex) => {
        let fileIndex = 0;
        for (const character of row) {
            if (/\d/.test(character))
                fileIndex += Number(character);
            else
                squares.push(`${"abcdefgh"[fileIndex++]}${8 - rankIndex}`);
        }
    });
    return squares;
}
function maskSquares(mask) {
    const squares = new Set();
    for (let index = 0; index < mask.length; index++) {
        if (mask[index] === "1")
            squares.add(`${"abcdefgh"[index % 8]}${8 - Math.floor(index / 8)}`);
    }
    return squares;
}
(0, node_test_1.default)("fog view only contains squares the viewer can see", () => {
    const opened = fogGame([[10, "e2", "e4"], [20, "e7", "e5"], [10, "g1", "f3"]]);
    const blackView = (0, CHESS_1.viewChessState)(opened.state, 20);
    strict_1.default.equal(blackView.variant, "FOG_OF_WAR");
    strict_1.default.ok(blackView.visible !== null);
    const visible = maskSquares(blackView.visible);
    for (const square of piecesOnBoard(blackView.fen)) {
        strict_1.default.ok(visible.has(square), `${square} is in the fogged FEN but not visible`);
    }
    // Black's own pieces are all there; white's are not.
    strict_1.default.equal(piecesOnBoard(blackView.fen).length < piecesOnBoard(opened.state.fen).length, true);
    strict_1.default.equal(visible.has("f3"), false, "the knight that just moved to f3 should be hidden");
    strict_1.default.equal(blackView.fen.includes("N"), false, "no white knight should appear anywhere");
    // The two players see different boards.
    const whiteView = (0, CHESS_1.viewChessState)(opened.state, 10);
    strict_1.default.notEqual(whiteView.fen, blackView.fen);
    strict_1.default.notEqual(whiteView.visible, blackView.visible);
});
(0, node_test_1.default)("fog view withholds the halfmove clock and the opponent's castling rights", () => {
    const opened = fogGame([[10, "e2", "e4"], [20, "b8", "c6"]]);
    const whiteView = (0, CHESS_1.viewChessState)(opened.state, 10);
    const [, turn, castling, , halfMoves] = whiteView.fen.split(" ");
    strict_1.default.equal(turn, "w");
    strict_1.default.equal(castling, "KQ", "black's castling rights record moves white never saw");
    strict_1.default.equal(halfMoves, "0");
});
(0, node_test_1.default)("a fogged position tells the client exactly which moves it may play", () => {
    // Informational completeness: the moves generated from the view are neither
    // fewer nor more than the moves the server would accept.
    const random = (() => {
        let seed = 12345;
        return () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    })();
    for (let game = 0; game < 20; game++) {
        let state = (0, CHESS_1.createChessState)(10, 20, { variant: "FOG_OF_WAR" });
        for (let ply = 0; ply < 40; ply++) {
            const truth = new chessEngine_1.Chess(state.startFen, { variant: "fog" });
            for (const move of state.moves)
                truth.move({ from: move.from, to: move.to, promotion: move.promotion });
            if (truth.isGameOver())
                break;
            const mover = truth.turn();
            const moverId = mover === "w" ? state.whitePlayer : 30 - state.whitePlayer;
            const view = (0, CHESS_1.viewChessState)(state, moverId);
            const asClientSeesIt = new chessEngine_1.Chess(view.fen, { variant: "fog" });
            const clientMoves = asClientSeesIt.moves({ verbose: true }).map((move) => `${move.from}${move.to}${move.promotion ?? ""}`);
            const serverMoves = truth.moves({ verbose: true }).map((move) => `${move.from}${move.to}${move.promotion ?? ""}`);
            strict_1.default.deepEqual([...clientMoves].sort(), [...serverMoves].sort(), `fog view disagrees at ${truth.fen()}`);
            const choice = truth.moves({ verbose: true })[Math.floor(random() * serverMoves.length)];
            state = (0, CHESS_1.applyChessMove)(state, moverId, {
                from: choice.from,
                to: choice.to,
                promotion: choice.promotion,
            }).state;
        }
    }
});
(0, node_test_1.default)("fog move history only reveals squares the viewer was watching", () => {
    const played = fogGame([
        [10, "e2", "e4"], [20, "b8", "c6"], [10, "g1", "f3"], [20, "c6", "d4"],
    ]);
    const whiteView = (0, CHESS_1.viewChessState)(played.state, 10);
    strict_1.default.equal(whiteView.moves.length, 4);
    for (const move of whiteView.moves) {
        strict_1.default.equal(move.san, null, "SAN would disclose pieces through its disambiguation");
    }
    // White watched its own two moves in full.
    strict_1.default.deepEqual(whiteView.moves.filter((move) => move.color === "w").map((move) => `${move.from}${move.to}`), ["e2e4", "g1f3"]);
    // Black's knight stepping onto d4 lands in front of white's pawn, so white
    // sees the arrival but not where it came from.
    const arrival = whiteView.moves[3];
    strict_1.default.equal(arrival.to, "d4");
    strict_1.default.equal(arrival.from, null);
    strict_1.default.equal(arrival.piece, "n");
    strict_1.default.equal(arrival.hidden, false);
    // The first black move happened entirely out of sight.
    strict_1.default.deepEqual(whiteView.moves[1], { from: null, to: null, san: null, color: "b", piece: null, hidden: true });
});
(0, node_test_1.default)("fog is won by capturing the king, not by checkmate", () => {
    const scholars = fogGame([
        [10, "e2", "e4"], [20, "a7", "a6"], [10, "f1", "c4"], [20, "a6", "a5"],
        [10, "d1", "h5"], [20, "a5", "a4"], [10, "h5", "f7"],
    ]);
    // Qxf7 is mate in ordinary chess; under fog it is only a capture.
    strict_1.default.equal(scholars.state.resultReason, null);
    strict_1.default.equal(scholars.state.inCheck, false);
    strict_1.default.equal(scholars.winner, 0);
    // Black is free to ignore the attack, and white takes the king.
    const ignored = (0, CHESS_1.applyChessMove)(scholars.state, 20, { from: "a4", to: "a3" });
    const finished = (0, CHESS_1.applyChessMove)(ignored.state, 10, { from: "f7", to: "e8" });
    strict_1.default.equal(finished.state.resultReason, "KING_CAPTURED");
    strict_1.default.equal(finished.winner, 10);
    strict_1.default.equal(finished.nextPlayer, 0);
    strict_1.default.throws(() => (0, CHESS_1.applyChessMove)(finished.state, 20, { from: "b7", to: "b6" }), /already finished/);
});
(0, node_test_1.default)("a pawn taking the king wins outright instead of promoting", () => {
    // White pawn on b7, black king on a8: bxa8 ends the game, so the engine must
    // offer exactly one move there rather than four promotion choices.
    const position = new chessEngine_1.Chess("k7/1P6/8/8/8/8/8/4K3 w - - 0 1", { variant: "fog" });
    const captures = position.moves({ verbose: true }).filter((move) => move.to === "a8");
    strict_1.default.equal(captures.length, 1);
    strict_1.default.equal(captures[0].promotion, undefined);
    strict_1.default.equal(captures[0].captured, "k");
    // A pawn pushing to the back rank still promotes normally.
    strict_1.default.equal(position.moves({ verbose: true }).filter((move) => move.to === "b8").length, 4);
    // The finished position keeps an unpromoted pawn on the eighth rank, and both
    // the server and the client have to be able to load it back.
    position.move({ from: "b7", to: "a8" });
    strict_1.default.equal(position.capturedKing(), "b");
    strict_1.default.match(position.fen(), /^P7\//);
    strict_1.default.equal(new chessEngine_1.Chess(position.fen(), { variant: "fog" }).capturedKing(), "b");
});
(0, node_test_1.default)("a fog game ended by a pawn capture round trips through stored state", () => {
    // White walks a pawn up the f-file and takes the black king where it sits.
    const finished = fogGame([
        [10, "g2", "g4"], [20, "f7", "f5"], [10, "g4", "f5"], [20, "a7", "a6"],
        [10, "f5", "f6"], [20, "a6", "a5"], [10, "f6", "f7"], [20, "a5", "a4"],
        [10, "f7", "e8"],
    ]);
    strict_1.default.equal(finished.state.resultReason, "KING_CAPTURED");
    strict_1.default.equal(finished.winner, 10);
    strict_1.default.equal(finished.state.lastMove?.promotion, undefined);
    strict_1.default.equal(finished.state.lastMove?.captured, "k");
    // The view both players receive must survive being reloaded by the board.
    for (const viewer of [10, 20]) {
        const view = (0, CHESS_1.viewChessState)(finished.state, viewer);
        strict_1.default.doesNotThrow(() => new chessEngine_1.Chess(view.fen, { variant: "fog" }));
    }
    strict_1.default.equal((0, CHESS_1.normalizeChessState)(JSON.parse(JSON.stringify(finished.state))).resultReason, "KING_CAPTURED");
});
(0, node_test_1.default)("a finished fog game is revealed to both players", () => {
    const finished = fogGame([
        [10, "e2", "e4"], [20, "a7", "a6"], [10, "f1", "c4"], [20, "a6", "a5"],
        [10, "d1", "h5"], [20, "a5", "a4"], [10, "h5", "f7"], [20, "a4", "a3"],
        [10, "f7", "e8"],
    ]);
    const view = (0, CHESS_1.viewChessState)(finished.state, 20);
    strict_1.default.equal(view.visible, null);
    strict_1.default.equal(view.fen, finished.state.fen);
    strict_1.default.equal(view.moves.every((move) => move.san !== null), true);
});
(0, node_test_1.default)("fog states are only served to the players", () => {
    const game = fogGame([[10, "e2", "e4"]]);
    strict_1.default.throws(() => (0, CHESS_1.viewChessState)(game.state, 30), /not a player/);
});
(0, node_test_1.default)("standard and chess960 views carry the whole position", () => {
    const standard = play([[10, "e2", "e4"]]);
    const view = (0, CHESS_1.viewChessState)(standard.state, 20);
    strict_1.default.equal(view.visible, null);
    strict_1.default.equal(view.fen, standard.state.fen);
    strict_1.default.equal(view.lastMove?.san, "e4");
});
