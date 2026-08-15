import assert from "node:assert/strict";
import test from "node:test";
import { applyChessMove, createChessState, normalizeChessState } from "./CHESS";

function play(moves: Array<[number, string, string, ("q" | "r" | "b" | "n")?]>) {
  let state = createChessState(10, 20);
  let result = { state, winner: 0, nextPlayer: 10 };
  for (const [player, from, to, promotion] of moves) {
    result = applyChessMove(result.state, player, { from, to, promotion });
  }
  return result;
}

test("creates standard chess with white moving first", () => {
  const state = createChessState(10, 20);
  assert.match(state.fen, /^rnbqkbnr\/pppppppp\/8\/8\/8\/8\/PPPPPPPP\/RNBQKBNR w/);
  assert.equal(applyChessMove(state, 10, { from: "e2", to: "e4" }).nextPlayer, 20);
  assert.throws(() => applyChessMove(state, 20, { from: "e7", to: "e5" }), /not your turn/);
});

test("rejects illegal movement and moving into check", () => {
  const state = createChessState(10, 20);
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

test("preserves repetition history through normalization", () => {
  const repeated = play([
    [10, "g1", "f3"], [20, "g8", "f6"], [10, "f3", "g1"], [20, "f6", "g8"],
    [10, "g1", "f3"], [20, "g8", "f6"], [10, "f3", "g1"], [20, "f6", "g8"],
  ]);
  assert.equal(repeated.winner, -1);
  assert.equal(repeated.state.resultReason, "THREEFOLD_REPETITION");
  assert.equal(normalizeChessState(repeated.state).resultReason, "THREEFOLD_REPETITION");
});
