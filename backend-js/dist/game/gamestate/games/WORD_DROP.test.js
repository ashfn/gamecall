"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const WORD_DROP_1 = require("./WORD_DROP");
(0, node_test_1.default)("uses the exact 172,820-word ENABLE1 dictionary", () => {
    strict_1.default.equal(WORD_DROP_1.WORD_DROP_DICTIONARY_SIZE, 172820);
    strict_1.default.equal((0, WORD_DROP_1.isWordDropWord)("cat"), true);
    strict_1.default.equal((0, WORD_DROP_1.isWordDropWord)("zyzzyva"), true);
    strict_1.default.equal((0, WORD_DROP_1.isWordDropWord)("aarti"), false);
});
(0, node_test_1.default)("validates the supported Word Drop move timers", () => {
    strict_1.default.deepEqual((0, WORD_DROP_1.normalizeWordDropSettings)({ variant: "MINI", moveTimerSeconds: 120 }), {
        variant: "MINI",
        moveTimerSeconds: 120,
    });
    strict_1.default.deepEqual((0, WORD_DROP_1.normalizeWordDropSettings)({ variant: "REGULAR", moveTimerSeconds: 300 }), {
        variant: "REGULAR",
        moveTimerSeconds: 300,
    });
    strict_1.default.deepEqual((0, WORD_DROP_1.normalizeWordDropSettings)({ variant: "REGULAR" }), {
        variant: "REGULAR",
        moveTimerSeconds: null,
    });
    strict_1.default.throws(() => (0, WORD_DROP_1.normalizeWordDropSettings)({ variant: "MINI", moveTimerSeconds: 60 }), /move timer/);
});
function stateWithRack(letters) {
    const state = (0, WORD_DROP_1.createWordDropState)(1, 2);
    state.racks["1"] = letters.map((letter, index) => (0, WORD_DROP_1.wordDropTileForTest)(`test-${index}`, letter));
    return state;
}
(0, node_test_1.default)("creates a 100-tile Regular game with four wildcards and a 15 by 15 board", () => {
    const state = (0, WORD_DROP_1.createWordDropState)(1, 2);
    const bonuses = (0, WORD_DROP_1.viewWordDropState)(state, 1).bonuses;
    strict_1.default.equal(state.board.length, 225);
    strict_1.default.equal(state.racks["1"].length, 7);
    strict_1.default.equal(state.racks["2"].length, 7);
    strict_1.default.equal(state.bag.length, 86);
    strict_1.default.equal([
        ...state.racks["1"],
        ...state.racks["2"],
        ...state.bag,
    ].filter((tile) => tile.wildcard).length, 4);
    strict_1.default.deepEqual(bonuses.filter((item) => item.type === "2W").map(({ row, col }) => [row, col]), [[2, 2], [2, 12], [4, 4], [4, 10], [10, 4], [10, 10], [12, 2], [12, 12]]);
    const view = (0, WORD_DROP_1.viewWordDropState)(state, 1);
    strict_1.default.equal(view.rack.length, 7);
    strict_1.default.equal(view.rackCounts["2"], 7);
    strict_1.default.equal(view.bagCount, 86);
    strict_1.default.equal(Object.values(view.unseenLetterCounts).reduce((sum, count) => sum + count, 0), 93);
    strict_1.default.equal("racks" in view, false);
    strict_1.default.equal("bag" in view, false);
});
(0, node_test_1.default)("creates the Mini variant with an 11 by 11 board and exactly 50 tiles", () => {
    const state = (0, WORD_DROP_1.createWordDropState)(1, 2, { variant: "MINI" });
    const inventory = [...state.racks["1"], ...state.racks["2"], ...state.bag];
    const bonuses = (0, WORD_DROP_1.viewWordDropState)(state, 1).bonuses;
    strict_1.default.equal(state.variant, "MINI");
    strict_1.default.equal(state.boardSize, 11);
    strict_1.default.equal(state.board.length, 121);
    strict_1.default.equal(inventory.length, 50);
    strict_1.default.equal(state.bag.length, 36);
    strict_1.default.equal(inventory.filter((tile) => tile.wildcard).length, 2);
    strict_1.default.equal((0, WORD_DROP_1.viewWordDropState)(state, 1).bonuses.filter((item) => item.type === "3W").length, 4);
    strict_1.default.equal((0, WORD_DROP_1.viewWordDropState)(state, 1).bonuses.filter((item) => item.type === "3L").length, 4);
    strict_1.default.deepEqual(bonuses.filter((item) => item.type === "2W").map(({ row, col }) => [row, col]), [[2, 2], [2, 8], [8, 2], [8, 8]]);
    strict_1.default.deepEqual(Object.fromEntries(["A", "E", "I", "O", "U"].map((letter) => [
        letter,
        inventory.filter((tile) => tile.letter === letter).length,
    ])), { A: 4, E: 5, I: 4, O: 3, U: 2 });
    state.racks["1"] = ["C", "A", "T", "E", "R", "S", "N"].map((letter, index) => ((0, WORD_DROP_1.wordDropTileForTest)(`mini-${index}`, letter)));
    const result = (0, WORD_DROP_1.applyWordDropMove)(state, 1, {
        kind: "play",
        placements: [
            { tileId: "mini-0", row: 5, col: 4 },
            { tileId: "mini-1", row: 5, col: 5 },
            { tileId: "mini-2", row: 5, col: 6 },
        ],
    });
    strict_1.default.deepEqual(result.state.lastPlay?.words, ["CAT"]);
    strict_1.default.equal(result.state.board[5 * 11 + 5]?.letter, "A");
});
(0, node_test_1.default)("creates the temporary Test variant with exactly six tiles left after dealing", () => {
    const state = (0, WORD_DROP_1.createWordDropState)(1, 2, { variant: "TEST" });
    const inventory = [...state.racks["1"], ...state.racks["2"], ...state.bag];
    strict_1.default.equal(state.variant, "TEST");
    strict_1.default.equal(state.boardSize, 11);
    strict_1.default.equal(state.board.length, 121);
    strict_1.default.equal(state.racks["1"].length, 7);
    strict_1.default.equal(state.racks["2"].length, 7);
    strict_1.default.equal(state.bag.length, 6);
    strict_1.default.equal(inventory.length, 20);
    strict_1.default.equal(inventory.filter((tile) => tile.wildcard).length, 1);
    strict_1.default.deepEqual((0, WORD_DROP_1.viewWordDropState)(state, 1).bonuses, WORD_DROP_1.WORD_DROP_MINI_BONUSES);
});
(0, node_test_1.default)("accepts and scores a dictionary word crossing the centre", () => {
    const state = stateWithRack(["C", "A", "T", "E", "R", "S", "N"]);
    const result = (0, WORD_DROP_1.applyWordDropMove)(state, 1, {
        kind: "play",
        placements: [
            { tileId: "test-0", row: 7, col: 6 },
            { tileId: "test-1", row: 7, col: 7 },
            { tileId: "test-2", row: 7, col: 8 },
        ],
    });
    strict_1.default.equal(result.winner, 0);
    strict_1.default.equal(result.nextPlayer, 2);
    strict_1.default.deepEqual(result.state.lastPlay?.words, ["CAT"]);
    strict_1.default.equal(result.state.lastPlay?.score, 5);
    strict_1.default.equal(result.state.board[7 * 15 + 7]?.letter, "A");
    strict_1.default.equal(result.state.racks["1"].length, 7);
});
(0, node_test_1.default)("rejects disconnected, gapped, and unknown words", () => {
    const state = stateWithRack(["Z", "X", "Q", "E", "R", "S", "N"]);
    strict_1.default.throws(() => (0, WORD_DROP_1.applyWordDropMove)(state, 1, {
        kind: "play",
        placements: [
            { tileId: "test-0", row: 7, col: 6 },
            { tileId: "test-1", row: 7, col: 7 },
            { tileId: "test-2", row: 7, col: 8 },
        ],
    }), /dictionary/);
    const valid = stateWithRack(["C", "A", "T", "E", "R", "S", "N"]);
    strict_1.default.throws(() => (0, WORD_DROP_1.applyWordDropMove)(valid, 1, {
        kind: "play",
        placements: [
            { tileId: "test-0", row: 7, col: 5 },
            { tileId: "test-1", row: 7, col: 7 },
        ],
    }), /gaps/);
});
(0, node_test_1.default)("requires, applies, and zero-scores wildcard letter assignments", () => {
    const state = stateWithRack(["?", "A", "T", "E", "R", "S", "N"]);
    strict_1.default.throws(() => (0, WORD_DROP_1.applyWordDropMove)(state, 1, {
        kind: "play",
        placements: [
            { tileId: "test-0", row: 7, col: 6 },
            { tileId: "test-1", row: 7, col: 7 },
            { tileId: "test-2", row: 7, col: 8 },
        ],
    }), /letter for every wildcard/);
    const result = (0, WORD_DROP_1.applyWordDropMove)(state, 1, {
        kind: "play",
        placements: [
            { tileId: "test-0", row: 7, col: 6, letter: "C" },
            { tileId: "test-1", row: 7, col: 7 },
            { tileId: "test-2", row: 7, col: 8 },
        ],
    });
    const wildcard = result.state.board[7 * 15 + 6];
    strict_1.default.equal(wildcard?.letter, "C");
    strict_1.default.equal(wildcard?.points, 0);
    strict_1.default.equal(wildcard?.wildcard, true);
    strict_1.default.deepEqual(result.state.lastPlay?.words, ["CAT"]);
    strict_1.default.equal(result.state.lastPlay?.score, 2);
});
(0, node_test_1.default)("does not allow regular tiles to impersonate another letter", () => {
    const state = stateWithRack(["C", "A", "T", "E", "R", "S", "N"]);
    strict_1.default.throws(() => (0, WORD_DROP_1.applyWordDropMove)(state, 1, {
        kind: "play",
        placements: [
            { tileId: "test-0", row: 7, col: 6, letter: "B" },
            { tileId: "test-1", row: 7, col: 7 },
            { tileId: "test-2", row: 7, col: 8 },
        ],
    }), /Only wildcards/);
});
(0, node_test_1.default)("ends after two consecutive passes using the current scores", () => {
    const state = (0, WORD_DROP_1.createWordDropState)(1, 2);
    state.scores = { "1": 18, "2": 12 };
    const first = (0, WORD_DROP_1.applyWordDropMove)(state, 1, { kind: "pass" });
    strict_1.default.equal(first.winner, 0);
    const second = (0, WORD_DROP_1.applyWordDropMove)(first.state, 2, { kind: "pass" });
    strict_1.default.equal(second.winner, 1);
    strict_1.default.equal(second.nextPlayer, 0);
});
(0, node_test_1.default)("passes an expired timed turn instead of making that player lose", () => {
    const state = (0, WORD_DROP_1.createWordDropState)(1, 2, { variant: "MINI", moveTimerSeconds: 120 });
    const expired = (0, WORD_DROP_1.applyWordDropTurnTimeout)(state, 1);
    strict_1.default.equal(expired.winner, 0);
    strict_1.default.equal(expired.nextPlayer, 2);
    strict_1.default.equal(expired.state.turnNumber, 2);
    strict_1.default.equal(expired.state.consecutivePasses, 1);
    strict_1.default.deepEqual(expired.state.lastPlay, {
        playerId: 1,
        words: [],
        score: 0,
        placements: [],
        passed: true,
    });
});
