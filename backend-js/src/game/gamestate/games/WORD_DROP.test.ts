import assert from "node:assert/strict";
import test from "node:test";
import {
  applyWordDropMove,
  applyWordDropTurnTimeout,
  createWordDropState,
  isWordDropWord,
  normalizeWordDropSettings,
  viewWordDropState,
  WORD_DROP_MINI_BONUSES,
  WORD_DROP_DICTIONARY_SIZE,
  wordDropTileForTest,
  WordDropState,
} from "./WORD_DROP";

test("uses the exact 172,820-word ENABLE1 dictionary", () => {
  assert.equal(WORD_DROP_DICTIONARY_SIZE, 172820);
  assert.equal(isWordDropWord("cat"), true);
  assert.equal(isWordDropWord("zyzzyva"), true);
  assert.equal(isWordDropWord("aarti"), false);
});

test("validates the supported Word Drop move timers", () => {
  assert.deepEqual(normalizeWordDropSettings({ variant: "MINI", moveTimerSeconds: 120 }), {
    variant: "MINI",
    moveTimerSeconds: 120,
  });
  assert.deepEqual(normalizeWordDropSettings({ variant: "REGULAR", moveTimerSeconds: 300 }), {
    variant: "REGULAR",
    moveTimerSeconds: 300,
  });
  assert.deepEqual(normalizeWordDropSettings({ variant: "REGULAR" }), {
    variant: "REGULAR",
    moveTimerSeconds: null,
  });
  assert.throws(() => normalizeWordDropSettings({ variant: "MINI", moveTimerSeconds: 60 }), /move timer/);
});

function stateWithRack(letters: string[]): WordDropState {
  const state = createWordDropState(1, 2);
  state.racks["1"] = letters.map((letter, index) => wordDropTileForTest(`test-${index}`, letter));
  return state;
}

test("creates a 100-tile Regular game with four wildcards and a 15 by 15 board", () => {
  const state = createWordDropState(1, 2);
  const bonuses = viewWordDropState(state, 1).bonuses;
  assert.equal(state.board.length, 225);
  assert.equal(state.racks["1"].length, 7);
  assert.equal(state.racks["2"].length, 7);
  assert.equal(state.bag.length, 86);
  assert.equal([
    ...state.racks["1"],
    ...state.racks["2"],
    ...state.bag,
  ].filter((tile) => tile.wildcard).length, 4);
  assert.deepEqual(
    bonuses.filter((item) => item.type === "2W").map(({ row, col }) => [row, col]),
    [[2, 2], [2, 12], [4, 4], [4, 10], [10, 4], [10, 10], [12, 2], [12, 12]],
  );

  const view = viewWordDropState(state, 1);
  assert.equal(view.rack.length, 7);
  assert.equal(view.rackCounts["2"], 7);
  assert.equal(view.bagCount, 86);
  assert.equal(Object.values(view.unseenLetterCounts).reduce((sum, count) => sum + count, 0), 93);
  assert.equal("racks" in view, false);
  assert.equal("bag" in view, false);
});

test("creates the Mini variant with an 11 by 11 board and exactly 50 tiles", () => {
  const state = createWordDropState(1, 2, { variant: "MINI" });
  const inventory = [...state.racks["1"], ...state.racks["2"], ...state.bag];
  const bonuses = viewWordDropState(state, 1).bonuses;
  assert.equal(state.variant, "MINI");
  assert.equal(state.boardSize, 11);
  assert.equal(state.board.length, 121);
  assert.equal(inventory.length, 50);
  assert.equal(state.bag.length, 36);
  assert.equal(inventory.filter((tile) => tile.wildcard).length, 2);
  assert.equal(viewWordDropState(state, 1).bonuses.filter((item) => item.type === "3W").length, 4);
  assert.equal(viewWordDropState(state, 1).bonuses.filter((item) => item.type === "3L").length, 4);
  assert.deepEqual(
    bonuses.filter((item) => item.type === "2W").map(({ row, col }) => [row, col]),
    [[2, 2], [2, 8], [8, 2], [8, 8]],
  );
  assert.deepEqual(
    Object.fromEntries(["A", "E", "I", "O", "U"].map((letter) => [
      letter,
      inventory.filter((tile) => tile.letter === letter).length,
    ])),
    { A: 4, E: 5, I: 4, O: 3, U: 2 },
  );

  state.racks["1"] = ["C", "A", "T", "E", "R", "S", "N"].map((letter, index) => (
    wordDropTileForTest(`mini-${index}`, letter)
  ));
  const result = applyWordDropMove(state, 1, {
    kind: "play",
    placements: [
      { tileId: "mini-0", row: 5, col: 4 },
      { tileId: "mini-1", row: 5, col: 5 },
      { tileId: "mini-2", row: 5, col: 6 },
    ],
  });
  assert.deepEqual(result.state.lastPlay?.words, ["CAT"]);
  assert.equal(result.state.board[5 * 11 + 5]?.letter, "A");
});

test("creates the temporary Test variant with exactly six tiles left after dealing", () => {
  const state = createWordDropState(1, 2, { variant: "TEST" });
  const inventory = [...state.racks["1"], ...state.racks["2"], ...state.bag];
  assert.equal(state.variant, "TEST");
  assert.equal(state.boardSize, 11);
  assert.equal(state.board.length, 121);
  assert.equal(state.racks["1"].length, 7);
  assert.equal(state.racks["2"].length, 7);
  assert.equal(state.bag.length, 6);
  assert.equal(inventory.length, 20);
  assert.equal(inventory.filter((tile) => tile.wildcard).length, 1);
  assert.deepEqual(viewWordDropState(state, 1).bonuses, WORD_DROP_MINI_BONUSES);
});

test("accepts and scores a dictionary word crossing the centre", () => {
  const state = stateWithRack(["C", "A", "T", "E", "R", "S", "N"]);
  const result = applyWordDropMove(state, 1, {
    kind: "play",
    placements: [
      { tileId: "test-0", row: 7, col: 6 },
      { tileId: "test-1", row: 7, col: 7 },
      { tileId: "test-2", row: 7, col: 8 },
    ],
  });

  assert.equal(result.winner, 0);
  assert.equal(result.nextPlayer, 2);
  assert.deepEqual(result.state.lastPlay?.words, ["CAT"]);
  assert.equal(result.state.lastPlay?.score, 5);
  assert.equal(result.state.board[7 * 15 + 7]?.letter, "A");
  assert.equal(result.state.racks["1"].length, 7);
});

test("rejects disconnected, gapped, and unknown words", () => {
  const state = stateWithRack(["Z", "X", "Q", "E", "R", "S", "N"]);
  assert.throws(() => applyWordDropMove(state, 1, {
    kind: "play",
    placements: [
      { tileId: "test-0", row: 7, col: 6 },
      { tileId: "test-1", row: 7, col: 7 },
      { tileId: "test-2", row: 7, col: 8 },
    ],
  }), /dictionary/);

  const valid = stateWithRack(["C", "A", "T", "E", "R", "S", "N"]);
  assert.throws(() => applyWordDropMove(valid, 1, {
    kind: "play",
    placements: [
      { tileId: "test-0", row: 7, col: 5 },
      { tileId: "test-1", row: 7, col: 7 },
    ],
  }), /gaps/);
});

test("requires, applies, and zero-scores wildcard letter assignments", () => {
  const state = stateWithRack(["?", "A", "T", "E", "R", "S", "N"]);
  assert.throws(() => applyWordDropMove(state, 1, {
    kind: "play",
    placements: [
      { tileId: "test-0", row: 7, col: 6 },
      { tileId: "test-1", row: 7, col: 7 },
      { tileId: "test-2", row: 7, col: 8 },
    ],
  }), /letter for every wildcard/);

  const result = applyWordDropMove(state, 1, {
    kind: "play",
    placements: [
      { tileId: "test-0", row: 7, col: 6, letter: "C" },
      { tileId: "test-1", row: 7, col: 7 },
      { tileId: "test-2", row: 7, col: 8 },
    ],
  });
  const wildcard = result.state.board[7 * 15 + 6];
  assert.equal(wildcard?.letter, "C");
  assert.equal(wildcard?.points, 0);
  assert.equal(wildcard?.wildcard, true);
  assert.deepEqual(result.state.lastPlay?.words, ["CAT"]);
  assert.equal(result.state.lastPlay?.score, 2);
});

test("does not allow regular tiles to impersonate another letter", () => {
  const state = stateWithRack(["C", "A", "T", "E", "R", "S", "N"]);
  assert.throws(() => applyWordDropMove(state, 1, {
    kind: "play",
    placements: [
      { tileId: "test-0", row: 7, col: 6, letter: "B" },
      { tileId: "test-1", row: 7, col: 7 },
      { tileId: "test-2", row: 7, col: 8 },
    ],
  }), /Only wildcards/);
});

test("ends after two consecutive passes using the current scores", () => {
  const state = createWordDropState(1, 2);
  state.scores = { "1": 18, "2": 12 };
  const first = applyWordDropMove(state, 1, { kind: "pass" });
  assert.equal(first.winner, 0);
  const second = applyWordDropMove(first.state, 2, { kind: "pass" });
  assert.equal(second.winner, 1);
  assert.equal(second.nextPlayer, 0);
});

test("passes an expired timed turn instead of making that player lose", () => {
  const state = createWordDropState(1, 2, { variant: "MINI", moveTimerSeconds: 120 });
  const expired = applyWordDropTurnTimeout(state, 1);
  assert.equal(expired.winner, 0);
  assert.equal(expired.nextPlayer, 2);
  assert.equal(expired.state.turnNumber, 2);
  assert.equal(expired.state.consecutivePasses, 1);
  assert.deepEqual(expired.state.lastPlay, {
    playerId: 1,
    words: [],
    score: 0,
    placements: [],
    passed: true,
  });
});
