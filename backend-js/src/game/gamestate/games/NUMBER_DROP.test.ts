import assert from "node:assert/strict";
import test from "node:test";
import {
  applyNumberDropMove,
  applyNumberDropTurnTimeout,
  calculateNumberDropOperation,
  createNumberDropState,
  evaluateNumberDropSubmission,
  numberDropScore,
  normalizeNumberDropSettings,
  solveNumberDrop,
  viewNumberDropState,
} from "./NUMBER_DROP";

test("generates a difficult puzzle with a solver-proven exact route", () => {
  const state = createNumberDropState(1, 2);
  const solved = solveNumberDrop(state.numbers, state.target);
  assert.equal(solved.distance, 0);
  assert.ok(solved.operations >= 4);
  assert.equal(state.bestValue, state.target);
});

test("supports 1, 3, or 5 rounds with optional move timers", () => {
  assert.deepEqual(normalizeNumberDropSettings({ rounds: 3, moveTimerSeconds: 120 }), { rounds: 3, moveTimerSeconds: 120 });
  assert.deepEqual(normalizeNumberDropSettings({ rounds: 5, moveTimerSeconds: 300 }), { rounds: 5, moveTimerSeconds: 300 });
  assert.deepEqual(normalizeNumberDropSettings({ rounds: 2, moveTimerSeconds: 20 }), { rounds: 1, moveTimerSeconds: null });
});

test("adds scores across rounds and alternates the opening player", () => {
  const state = createNumberDropState(1, 2, { rounds: 3 });
  const first = applyNumberDropMove(state, 1, { kind: "submit", steps: [], resultId: "n0" });
  const completedRound = applyNumberDropMove(first.state, 2, { kind: "submit", steps: [], resultId: "n1" });
  assert.equal(completedRound.winner, 0);
  assert.equal(completedRound.nextPlayer, 2);
  assert.equal(completedRound.state.currentRound, 2);
  assert.equal(completedRound.state.rounds.length, 1);
  assert.ok(completedRound.state.scores["1"] >= 0);
  assert.ok(completedRound.state.scores["2"] >= 0);
});

test("a timed-out round scores zero and advances normally", () => {
  const state = createNumberDropState(1, 2, { rounds: 3, moveTimerSeconds: 120 });
  const timedOut = applyNumberDropTurnTimeout(state, 1);
  assert.equal(timedOut.state.submissions["1"]?.score, 0);
  assert.equal(timedOut.state.submissions["1"]?.timedOut, true);
  const completedRound = applyNumberDropMove(timedOut.state, 2, { kind: "submit", steps: [], resultId: "n0" });
  assert.equal(completedRound.state.currentRound, 2);
  assert.equal(completedRound.state.scores["1"], 0);
});

test("ends only after the configured rounds and chooses the highest total score", () => {
  let state = createNumberDropState(1, 2, { rounds: 3 });
  let result = applyNumberDropMove(state, 1, { kind: "submit", steps: [], resultId: "n0" });
  result = applyNumberDropMove(result.state, 2, { kind: "submit", steps: [], resultId: "n1" });
  result = applyNumberDropMove(result.state, 2, { kind: "submit", steps: [], resultId: "n0" });
  result = applyNumberDropMove(result.state, 1, { kind: "submit", steps: [], resultId: "n1" });
  assert.equal(result.winner, 0);
  result = applyNumberDropMove(result.state, 1, { kind: "submit", steps: [], resultId: "n0" });
  result = applyNumberDropMove(result.state, 2, { kind: "submit", steps: [], resultId: "n1" });
  assert.equal(result.state.rounds.length, 3);
  assert.notEqual(result.winner, 0);
  const expectedWinner = result.state.scores["1"] === result.state.scores["2"]
    ? -1
    : result.state.scores["1"] > result.state.scores["2"] ? 1 : 2;
  assert.equal(result.winner, expectedWinner);
});

test("scores exact and close answers meaningfully", () => {
  assert.equal(numberDropScore(0), 100);
  assert.equal(numberDropScore(1), 88);
  assert.ok(numberDropScore(4) > numberDropScore(20));
  assert.equal(numberDropScore(100), 0);
});

test("only allows positive whole-number calculations", () => {
  assert.equal(calculateNumberDropOperation(8, 3, "DIVIDE"), null);
  assert.equal(calculateNumberDropOperation(8, 4, "DIVIDE"), 2);
  assert.equal(calculateNumberDropOperation(3, 8, "SUBTRACT"), null);
});

test("rejects reused tiles and evaluates a legal operation chain", () => {
  const steps = [
    { leftId: "n0", rightId: "n1", operation: "ADD" as const },
    { leftId: "r0", rightId: "n2", operation: "MULTIPLY" as const },
  ];
  assert.equal(evaluateNumberDropSubmission([5, 3, 2, 7, 8, 9], steps, "r1").value, 16);
  assert.throws(() => evaluateNumberDropSubmission([5, 3, 2, 7, 8, 9], [
    ...steps,
    { leftId: "n0", rightId: "n3", operation: "ADD" },
  ], "r2"), /reused|unavailable/);
});

test("hides the first submission until both players have answered", () => {
  const state = createNumberDropState(1, 2);
  const first = applyNumberDropMove(state, 1, { kind: "submit", steps: [], resultId: "n0" });
  assert.equal(viewNumberDropState(first.state, 2).submissions["1"], null);
  const second = applyNumberDropMove(first.state, 2, { kind: "submit", steps: [], resultId: "n1" });
  assert.ok(viewNumberDropState(second.state, 2).submissions["1"]);
  assert.notEqual(second.winner, 0);
});
