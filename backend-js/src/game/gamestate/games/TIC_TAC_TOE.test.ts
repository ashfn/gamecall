import assert from "node:assert/strict";
import test from "node:test";
import { applyTicTacToeMove, createTicTacToeState, normalizeTicTacToeState } from "./TIC_TAC_TOE";

function play(cells: number[]) {
  let state = createTicTacToeState(10, 20);
  let result = { state, winner: 0, nextPlayer: 10 };
  cells.forEach((cell, index) => {
    result = applyTicTacToeMove(result.state, index % 2 === 0 ? 10 : 20, cell);
  });
  return result;
}

test("creates an empty board with player1 playing X first", () => {
  const state = createTicTacToeState(10, 20);
  assert.deepEqual(state.board, Array(9).fill(null));
  const result = applyTicTacToeMove(state, 10, 4);
  assert.equal(result.state.board[4], "X");
  assert.equal(result.nextPlayer, 20);
});

test("detects wins and records the winning line", () => {
  const result = play([0, 3, 1, 4, 2]);
  assert.equal(result.winner, 10);
  assert.deepEqual(result.state.winningLine, [0, 1, 2]);
  assert.equal(result.nextPlayer, 0);
});

test("detects a draw", () => {
  const result = play([0, 1, 2, 4, 3, 5, 7, 6, 8]);
  assert.equal(result.winner, -1);
  assert.equal(result.state.moveCount, 9);
});

test("rejects occupied, out-of-range, and out-of-turn moves", () => {
  const state = createTicTacToeState(10, 20);
  const first = applyTicTacToeMove(state, 10, 0);
  assert.throws(() => applyTicTacToeMove(first.state, 20, 0), /already taken/);
  assert.throws(() => applyTicTacToeMove(state, 10, 9), /valid square/);
  assert.throws(() => applyTicTacToeMove(state, 20, 0), /not your turn/);
});

test("normalizes prototype boards without losing their original turn order", () => {
  const legacy = normalizeTicTacToeState({ player1: 10, player2: 20, board: [[20, 0, 0], [0, 0, 0], [0, 0, 0]] });
  assert.equal(legacy.xPlayer, 20);
  assert.equal(legacy.board[0], "X");
  assert.doesNotThrow(() => applyTicTacToeMove(legacy, 10, 1));
});
