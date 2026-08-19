import assert from "node:assert/strict";
import test from "node:test";
import {
  applyChessMove,
  ChessGameVariant,
  ChessMoveResult,
  createChessState,
  normalizeChessSettings,
  normalizeChessState,
  viewChessState,
} from "./CHESS";
import { Chess, chess960Fen, Color, Square } from "./chessEngine";

type PlayedMove = [number, string, string, ("q" | "r" | "b" | "n")?];

function play(moves: PlayedMove[], variant: ChessGameVariant = "STANDARD") {
  const state = createChessState(10, 20, { variant });
  let result: ChessMoveResult = { state, winner: 0, nextPlayer: 10 };
  for (const [player, from, to, promotion] of moves) {
    result = applyChessMove(result.state, player, { from, to, promotion });
  }
  return result;
}

test("creates standard chess with white moving first", () => {
  const state = createChessState(10, 20, {});
  assert.equal(state.variant, "STANDARD");
  assert.match(state.fen, /^rnbqkbnr\/pppppppp\/8\/8\/8\/8\/PPPPPPPP\/RNBQKBNR w KQkq/);
  assert.equal(applyChessMove(state, 10, { from: "e2", to: "e4" }).nextPlayer, 20);
  assert.throws(() => applyChessMove(state, 20, { from: "e7", to: "e5" }), /not your turn/);
});

test("rejects illegal movement and moving into check", () => {
  const state = createChessState(10, 20, {});
  assert.throws(() => applyChessMove(state, 10, { from: "e2", to: "e5" }), /not legal/);
  const checked = play([[10, "e2", "e4"], [20, "d7", "d5"], [10, "f1", "b5"]]);
  assert.throws(() => applyChessMove(checked.state, 20, { from: "a7", to: "a6" }), /not legal/);
});

test("detects checkmate authoritatively", () => {
  const result = play([
    [10, "f2", "f3"], [20, "e7", "e5"], [10, "g2", "g4"], [20, "d8", "h4"],
  ]);
  assert.equal(result.winner, 20);
  assert.equal(result.nextPlayer, 0);
  assert.equal(result.state.resultReason, "CHECKMATE");
  assert.equal(result.state.inCheck, true);
});

test("supports castling and en passant", () => {
  const castled = play([
    [10, "e2", "e4"], [20, "e7", "e5"], [10, "g1", "f3"], [20, "b8", "c6"],
    [10, "f1", "c4"], [20, "g8", "f6"], [10, "e1", "g1"],
  ]);
  assert.equal(castled.state.lastMove?.san, "O-O");
  const enPassant = play([
    [10, "e2", "e4"], [20, "a7", "a6"], [10, "e4", "e5"], [20, "d7", "d5"],
    [10, "e5", "d6"],
  ]);
  assert.equal(enPassant.state.lastMove?.captured, "p");
  assert.equal(enPassant.state.lastMove?.san, "exd6");
  assert.equal(enPassant.state.lastMove?.enPassant, true);
});

test("requires and applies a promotion choice", () => {
  const promoted = play([
    [10, "a2", "a4"], [20, "h7", "h5"], [10, "a4", "a5"], [20, "h5", "h4"],
    [10, "a5", "a6"], [20, "h4", "h3"], [10, "a6", "b7"], [20, "h3", "g2"],
    [10, "b7", "a8", "n"],
  ]);
  assert.equal(promoted.state.lastMove?.promotion, "n");
  assert.match(promoted.state.fen, /^N/);
});

test("normalizes settings and states written before variants existed", () => {
  assert.deepEqual(normalizeChessSettings(undefined), { variant: "STANDARD" });
  assert.deepEqual(normalizeChessSettings({ variant: "FOG_OF_WAR" }), { variant: "FOG_OF_WAR" });
  assert.deepEqual(normalizeChessSettings({ variant: "SHOGI" }), { variant: "STANDARD" });

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
  const normalized = normalizeChessState(legacy);
  assert.equal(normalized.variant, "STANDARD");
  assert.equal(normalized.startFen, "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
  assert.equal(normalized.lastMove?.san, "e4");
});

// --- Chess960 ---------------------------------------------------------------

test("chess960 deals a legal random back rank", () => {
  for (let attempt = 0; attempt < 40; attempt++) {
    const state = createChessState(10, 20, { variant: "CHESS960" });
    assert.equal(state.variant, "CHESS960");
    assert.ok(state.startIndex !== null && state.startIndex >= 0 && state.startIndex < 960);

    const backRank = state.startFen.split(" ")[0].split("/")[0];
    assert.equal([...backRank].sort().join(""), "bbknnqrr");

    const bishops = [...backRank].flatMap((piece, f) => (piece === "b" ? [f] : []));
    assert.notEqual((bishops[0] + bishops[1]) % 2, 0, `bishops share a colour: ${backRank}`);

    const rooks = [...backRank].flatMap((piece, f) => (piece === "r" ? [f] : []));
    const king = backRank.indexOf("k");
    assert.ok(rooks[0] < king && king < rooks[1], `king is not between the rooks: ${backRank}`);
  }
});

test("chess960 position 518 is orthodox chess", () => {
  assert.equal(chess960Fen(518), "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w HAha - 0 1");
  assert.throws(() => chess960Fen(960), /Invalid Chess960 position/);
});

test("chess960 castles from wherever the king and rook started", () => {
  // King b1, rooks a1 and h1: castling still lands the king on c1/g1.
  const kingside = new Chess("4k3/8/8/8/8/8/8/RK5R w HA - 0 1", { variant: "chess960" });
  const castles = kingside.moves({ verbose: true }).filter((move) => move.isCastle());
  assert.deepEqual(
    castles.map((move) => `${move.san}:${move.from}->${move.to}:${move.castleKingTo}${move.castleRookTo}`),
    ["O-O:b1->h1:g1f1", "O-O-O:b1->a1:c1d1"],
  );

  // Both ways of expressing a castle must land in the same position.
  const takesRook = new Chess("4k3/8/8/8/8/8/8/5RKR w HF - 0 1", { variant: "chess960" });
  takesRook.move({ from: "g1", to: "f1" });
  const toSquare = new Chess("4k3/8/8/8/8/8/8/5RKR w HF - 0 1", { variant: "chess960" });
  toSquare.move({ from: "g1", to: "c1" });
  assert.equal(takesRook.fen(), "4k3/8/8/8/8/8/8/2KR3R b - - 1 1");
  assert.equal(takesRook.fen(), toSquare.fen());

  // A rook path blocked where the king's path is clear (only possible in 960).
  const blocked = new Chess("4k3/8/8/8/8/8/8/RK1N3R w HA - 0 1", { variant: "chess960" });
  assert.deepEqual(blocked.moves().filter((san) => san.startsWith("O")), []);
});

test("chess960 castling survives a round trip through stored state", () => {
  // Deal positions until one lets white castle on the second move.
  for (let attempt = 0; attempt < 200; attempt++) {
    const state = createChessState(10, 20, { variant: "CHESS960" });
    const engine = new Chess(state.startFen, { variant: "chess960" });
    const opening = engine.moves({ verbose: true }).find((move) => move.piece === "n");
    if (!opening) continue;

    const first = applyChessMove(state, 10, { from: opening.from, to: opening.to });
    const reply = new Chess(first.state.fen, { variant: "chess960" }).moves({ verbose: true })[0];
    const second = applyChessMove(first.state, 20, { from: reply.from, to: reply.to });

    const normalized = normalizeChessState(JSON.parse(JSON.stringify(second.state)));
    assert.equal(normalized.fen, second.state.fen);
    assert.equal(normalized.startFen, state.startFen);
    return;
  }
  assert.fail("no Chess960 position offered a knight move");
});

// --- fog of war -------------------------------------------------------------

function fogGame(moves: PlayedMove[]) {
  return play(moves, "FOG_OF_WAR");
}

function piecesOnBoard(fen: string): Square[] {
  const squares: Square[] = [];
  fen.split(" ")[0].split("/").forEach((row, rankIndex) => {
    let fileIndex = 0;
    for (const character of row) {
      if (/\d/.test(character)) fileIndex += Number(character);
      else squares.push(`${"abcdefgh"[fileIndex++]}${8 - rankIndex}` as Square);
    }
  });
  return squares;
}

function maskSquares(mask: string): Set<string> {
  const squares = new Set<string>();
  for (let index = 0; index < mask.length; index++) {
    if (mask[index] === "1") squares.add(`${"abcdefgh"[index % 8]}${8 - Math.floor(index / 8)}`);
  }
  return squares;
}

test("fog view only contains squares the viewer can see", () => {
  const opened = fogGame([[10, "e2", "e4"], [20, "e7", "e5"], [10, "g1", "f3"]]);
  const blackView = viewChessState(opened.state, 20);

  assert.equal(blackView.variant, "FOG_OF_WAR");
  assert.ok(blackView.visible !== null);
  const visible = maskSquares(blackView.visible!);

  for (const square of piecesOnBoard(blackView.fen)) {
    assert.ok(visible.has(square), `${square} is in the fogged FEN but not visible`);
  }

  // Black's own pieces are all there; white's are not.
  assert.equal(piecesOnBoard(blackView.fen).length < piecesOnBoard(opened.state.fen).length, true);
  assert.equal(visible.has("f3"), false, "the knight that just moved to f3 should be hidden");
  assert.equal(blackView.fen.includes("N"), false, "no white knight should appear anywhere");

  // The two players see different boards.
  const whiteView = viewChessState(opened.state, 10);
  assert.notEqual(whiteView.fen, blackView.fen);
  assert.notEqual(whiteView.visible, blackView.visible);
});

test("fog view withholds the halfmove clock and the opponent's castling rights", () => {
  const opened = fogGame([[10, "e2", "e4"], [20, "b8", "c6"]]);
  const whiteView = viewChessState(opened.state, 10);
  const [, turn, castling, , halfMoves] = whiteView.fen.split(" ");

  assert.equal(turn, "w");
  assert.equal(castling, "KQ", "black's castling rights record moves white never saw");
  assert.equal(halfMoves, "0");
});

test("a fogged position tells the client exactly which moves it may play", () => {
  // Informational completeness: the moves generated from the view are neither
  // fewer nor more than the moves the server would accept.
  const random = (() => {
    let seed = 12345;
    return () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  })();

  for (let game = 0; game < 20; game++) {
    let state = createChessState(10, 20, { variant: "FOG_OF_WAR" });
    for (let ply = 0; ply < 40; ply++) {
      const truth = new Chess(state.startFen, { variant: "fog" });
      for (const move of state.moves) truth.move({ from: move.from, to: move.to, promotion: move.promotion });
      if (truth.isGameOver()) break;

      const mover: Color = truth.turn();
      const moverId = mover === "w" ? state.whitePlayer : 30 - state.whitePlayer;
      const view = viewChessState(state, moverId);

      const asClientSeesIt = new Chess(view.fen, { variant: "fog" });
      const clientMoves = asClientSeesIt.moves({ verbose: true }).map((move) => `${move.from}${move.to}${move.promotion ?? ""}`);
      const serverMoves = truth.moves({ verbose: true }).map((move) => `${move.from}${move.to}${move.promotion ?? ""}`);
      assert.deepEqual([...clientMoves].sort(), [...serverMoves].sort(), `fog view disagrees at ${truth.fen()}`);

      const choice = truth.moves({ verbose: true })[Math.floor(random() * serverMoves.length)];
      state = applyChessMove(state, moverId, {
        from: choice.from,
        to: choice.to,
        promotion: choice.promotion as "q" | undefined,
      }).state;
    }
  }
});

test("fog move history only reveals squares the viewer was watching", () => {
  const played = fogGame([
    [10, "e2", "e4"], [20, "b8", "c6"], [10, "g1", "f3"], [20, "c6", "d4"],
  ]);
  const whiteView = viewChessState(played.state, 10);

  assert.equal(whiteView.moves.length, 4);
  for (const move of whiteView.moves) {
    assert.equal(move.san, null, "SAN would disclose pieces through its disambiguation");
  }

  // White watched its own two moves in full.
  assert.deepEqual(
    whiteView.moves.filter((move) => move.color === "w").map((move) => `${move.from}${move.to}`),
    ["e2e4", "g1f3"],
  );

  // Black's knight stepping onto d4 lands in front of white's pawn, so white
  // sees the arrival but not where it came from.
  const arrival = whiteView.moves[3];
  assert.equal(arrival.to, "d4");
  assert.equal(arrival.from, null);
  assert.equal(arrival.piece, "n");
  assert.equal(arrival.hidden, false);

  // The first black move happened entirely out of sight.
  assert.deepEqual(whiteView.moves[1], { from: null, to: null, san: null, color: "b", piece: null, hidden: true });
});

test("fog is won by capturing the king, not by checkmate", () => {
  const scholars = fogGame([
    [10, "e2", "e4"], [20, "a7", "a6"], [10, "f1", "c4"], [20, "a6", "a5"],
    [10, "d1", "h5"], [20, "a5", "a4"], [10, "h5", "f7"],
  ]);
  // Qxf7 is mate in ordinary chess; under fog it is only a capture.
  assert.equal(scholars.state.resultReason, null);
  assert.equal(scholars.state.inCheck, false);
  assert.equal(scholars.winner, 0);

  // Black is free to ignore the attack, and white takes the king.
  const ignored = applyChessMove(scholars.state, 20, { from: "a4", to: "a3" });
  const finished = applyChessMove(ignored.state, 10, { from: "f7", to: "e8" });
  assert.equal(finished.state.resultReason, "KING_CAPTURED");
  assert.equal(finished.winner, 10);
  assert.equal(finished.nextPlayer, 0);
  assert.throws(() => applyChessMove(finished.state, 20, { from: "b7", to: "b6" }), /already finished/);
});

test("a pawn taking the king wins outright instead of promoting", () => {
  // White pawn on b7, black king on a8: bxa8 ends the game, so the engine must
  // offer exactly one move there rather than four promotion choices.
  const position = new Chess("k7/1P6/8/8/8/8/8/4K3 w - - 0 1", { variant: "fog" });
  const captures = position.moves({ verbose: true }).filter((move) => move.to === "a8");
  assert.equal(captures.length, 1);
  assert.equal(captures[0].promotion, undefined);
  assert.equal(captures[0].captured, "k");

  // A pawn pushing to the back rank still promotes normally.
  assert.equal(position.moves({ verbose: true }).filter((move) => move.to === "b8").length, 4);

  // The finished position keeps an unpromoted pawn on the eighth rank, and both
  // the server and the client have to be able to load it back.
  position.move({ from: "b7", to: "a8" });
  assert.equal(position.capturedKing(), "b");
  assert.match(position.fen(), /^P7\//);
  assert.equal(new Chess(position.fen(), { variant: "fog" }).capturedKing(), "b");
});

test("a fog game ended by a pawn capture round trips through stored state", () => {
  // White walks a pawn up the f-file and takes the black king where it sits.
  const finished = fogGame([
    [10, "g2", "g4"], [20, "f7", "f5"], [10, "g4", "f5"], [20, "a7", "a6"],
    [10, "f5", "f6"], [20, "a6", "a5"], [10, "f6", "f7"], [20, "a5", "a4"],
    [10, "f7", "e8"],
  ]);
  assert.equal(finished.state.resultReason, "KING_CAPTURED");
  assert.equal(finished.winner, 10);
  assert.equal(finished.state.lastMove?.promotion, undefined);
  assert.equal(finished.state.lastMove?.captured, "k");

  // The view both players receive must survive being reloaded by the board.
  for (const viewer of [10, 20]) {
    const view = viewChessState(finished.state, viewer);
    assert.doesNotThrow(() => new Chess(view.fen, { variant: "fog" }));
  }
  assert.equal(normalizeChessState(JSON.parse(JSON.stringify(finished.state))).resultReason, "KING_CAPTURED");
});

test("a finished fog game is revealed to both players", () => {
  const finished = fogGame([
    [10, "e2", "e4"], [20, "a7", "a6"], [10, "f1", "c4"], [20, "a6", "a5"],
    [10, "d1", "h5"], [20, "a5", "a4"], [10, "h5", "f7"], [20, "a4", "a3"],
    [10, "f7", "e8"],
  ]);
  const view = viewChessState(finished.state, 20);
  assert.equal(view.visible, null);
  assert.equal(view.fen, finished.state.fen);
  assert.equal(view.moves.every((move) => move.san !== null), true);
});

test("fog states are only served to the players", () => {
  const game = fogGame([[10, "e2", "e4"]]);
  assert.throws(() => viewChessState(game.state, 30), /not a player/);
});

test("standard and chess960 views carry the whole position", () => {
  const standard = play([[10, "e2", "e4"]]);
  const view = viewChessState(standard.state, 20);
  assert.equal(view.visible, null);
  assert.equal(view.fen, standard.state.fen);
  assert.equal(view.lastMove?.san, "e4");
});
