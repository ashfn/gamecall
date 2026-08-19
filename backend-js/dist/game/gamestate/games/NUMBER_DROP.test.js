"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const NUMBER_DROP_1 = require("./NUMBER_DROP");
(0, node_test_1.default)("generates a difficult puzzle with a solver-proven exact route", () => {
    const state = (0, NUMBER_DROP_1.createNumberDropState)(1, 2);
    const solved = (0, NUMBER_DROP_1.solveNumberDrop)(state.numbers, state.target);
    strict_1.default.equal(solved.distance, 0);
    strict_1.default.ok(solved.operations >= 4);
    strict_1.default.equal(state.bestValue, state.target);
});
(0, node_test_1.default)("supports 1, 3, or 5 rounds with optional move timers", () => {
    strict_1.default.deepEqual((0, NUMBER_DROP_1.normalizeNumberDropSettings)({ rounds: 3, moveTimerSeconds: 120 }), { rounds: 3, moveTimerSeconds: 120 });
    strict_1.default.deepEqual((0, NUMBER_DROP_1.normalizeNumberDropSettings)({ rounds: 5, moveTimerSeconds: 300 }), { rounds: 5, moveTimerSeconds: 300 });
    strict_1.default.deepEqual((0, NUMBER_DROP_1.normalizeNumberDropSettings)({ rounds: 2, moveTimerSeconds: 20 }), { rounds: 1, moveTimerSeconds: null });
});
(0, node_test_1.default)("adds scores across rounds and alternates the opening player", () => {
    const state = (0, NUMBER_DROP_1.createNumberDropState)(1, 2, { rounds: 3 });
    const first = (0, NUMBER_DROP_1.applyNumberDropMove)(state, 1, { kind: "submit", steps: [], resultId: "n0" });
    const completedRound = (0, NUMBER_DROP_1.applyNumberDropMove)(first.state, 2, { kind: "submit", steps: [], resultId: "n1" });
    strict_1.default.equal(completedRound.winner, 0);
    strict_1.default.equal(completedRound.nextPlayer, 2);
    strict_1.default.equal(completedRound.state.currentRound, 2);
    strict_1.default.equal(completedRound.state.rounds.length, 1);
    strict_1.default.ok(completedRound.state.scores["1"] >= 0);
    strict_1.default.ok(completedRound.state.scores["2"] >= 0);
});
(0, node_test_1.default)("a timed-out round scores zero and advances normally", () => {
    const state = (0, NUMBER_DROP_1.createNumberDropState)(1, 2, { rounds: 3, moveTimerSeconds: 120 });
    const timedOut = (0, NUMBER_DROP_1.applyNumberDropTurnTimeout)(state, 1);
    strict_1.default.equal(timedOut.state.submissions["1"]?.score, 0);
    strict_1.default.equal(timedOut.state.submissions["1"]?.timedOut, true);
    const completedRound = (0, NUMBER_DROP_1.applyNumberDropMove)(timedOut.state, 2, { kind: "submit", steps: [], resultId: "n0" });
    strict_1.default.equal(completedRound.state.currentRound, 2);
    strict_1.default.equal(completedRound.state.scores["1"], 0);
});
(0, node_test_1.default)("ends only after the configured rounds and chooses the highest total score", () => {
    let state = (0, NUMBER_DROP_1.createNumberDropState)(1, 2, { rounds: 3 });
    let result = (0, NUMBER_DROP_1.applyNumberDropMove)(state, 1, { kind: "submit", steps: [], resultId: "n0" });
    result = (0, NUMBER_DROP_1.applyNumberDropMove)(result.state, 2, { kind: "submit", steps: [], resultId: "n1" });
    result = (0, NUMBER_DROP_1.applyNumberDropMove)(result.state, 2, { kind: "submit", steps: [], resultId: "n0" });
    result = (0, NUMBER_DROP_1.applyNumberDropMove)(result.state, 1, { kind: "submit", steps: [], resultId: "n1" });
    strict_1.default.equal(result.winner, 0);
    result = (0, NUMBER_DROP_1.applyNumberDropMove)(result.state, 1, { kind: "submit", steps: [], resultId: "n0" });
    result = (0, NUMBER_DROP_1.applyNumberDropMove)(result.state, 2, { kind: "submit", steps: [], resultId: "n1" });
    strict_1.default.equal(result.state.rounds.length, 3);
    strict_1.default.notEqual(result.winner, 0);
    const expectedWinner = result.state.scores["1"] === result.state.scores["2"]
        ? -1
        : result.state.scores["1"] > result.state.scores["2"] ? 1 : 2;
    strict_1.default.equal(result.winner, expectedWinner);
});
(0, node_test_1.default)("scores exact and close answers meaningfully", () => {
    strict_1.default.equal((0, NUMBER_DROP_1.numberDropScore)(0), 100);
    strict_1.default.equal((0, NUMBER_DROP_1.numberDropScore)(1), 88);
    strict_1.default.ok((0, NUMBER_DROP_1.numberDropScore)(4) > (0, NUMBER_DROP_1.numberDropScore)(20));
    strict_1.default.equal((0, NUMBER_DROP_1.numberDropScore)(100), 0);
});
(0, node_test_1.default)("only allows positive whole-number calculations", () => {
    strict_1.default.equal((0, NUMBER_DROP_1.calculateNumberDropOperation)(8, 3, "DIVIDE"), null);
    strict_1.default.equal((0, NUMBER_DROP_1.calculateNumberDropOperation)(8, 4, "DIVIDE"), 2);
    strict_1.default.equal((0, NUMBER_DROP_1.calculateNumberDropOperation)(3, 8, "SUBTRACT"), null);
});
(0, node_test_1.default)("rejects reused tiles and evaluates a legal operation chain", () => {
    const steps = [
        { leftId: "n0", rightId: "n1", operation: "ADD" },
        { leftId: "r0", rightId: "n2", operation: "MULTIPLY" },
    ];
    strict_1.default.equal((0, NUMBER_DROP_1.evaluateNumberDropSubmission)([5, 3, 2, 7, 8, 9], steps, "r1").value, 16);
    strict_1.default.throws(() => (0, NUMBER_DROP_1.evaluateNumberDropSubmission)([5, 3, 2, 7, 8, 9], [
        ...steps,
        { leftId: "n0", rightId: "n3", operation: "ADD" },
    ], "r2"), /reused|unavailable/);
});
(0, node_test_1.default)("hides the first submission until both players have answered", () => {
    const state = (0, NUMBER_DROP_1.createNumberDropState)(1, 2);
    const first = (0, NUMBER_DROP_1.applyNumberDropMove)(state, 1, { kind: "submit", steps: [], resultId: "n0" });
    strict_1.default.equal((0, NUMBER_DROP_1.viewNumberDropState)(first.state, 2).submissions["1"], null);
    const second = (0, NUMBER_DROP_1.applyNumberDropMove)(first.state, 2, { kind: "submit", steps: [], resultId: "n1" });
    strict_1.default.ok((0, NUMBER_DROP_1.viewNumberDropState)(second.state, 2).submissions["1"]);
    strict_1.default.notEqual(second.winner, 0);
});
