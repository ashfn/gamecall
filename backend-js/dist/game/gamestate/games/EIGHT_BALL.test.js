"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const EIGHT_BALL_1 = require("./EIGHT_BALL");
const eightBallPhysics_1 = require("./eightBallPhysics");
const eightBallPhysicsV7_1 = require("./eightBallPhysicsV7");
const eightBallPhysicsV8_1 = require("./eightBallPhysicsV8");
const eightBallPhysicsV9_1 = require("./eightBallPhysicsV9");
function assertBallsDoNotOverlap(balls) {
    const diameterSquared = Math.pow((eightBallPhysics_1.EIGHT_BALL_BALL_RADIUS * 2), 2);
    for (let left = 0; left < balls.length; left += 1) {
        if (balls[left].pocketed)
            continue;
        for (let right = left + 1; right < balls.length; right += 1) {
            if (balls[right].pocketed)
                continue;
            const dx = balls[left].x - balls[right].x;
            const dy = balls[left].y - balls[right].y;
            strict_1.default.ok(dx * dx + dy * dy >= diameterSquared, `balls ${balls[left].number} and ${balls[right].number} overlap`);
        }
    }
}
(0, node_test_1.default)("creates a complete, non-overlapping deterministic rack", () => {
    var _a;
    const state = (0, EIGHT_BALL_1.createEightBallState)(1, 2);
    const rack = (0, eightBallPhysics_1.createEightBallRack)();
    strict_1.default.deepEqual(rack.map((ball) => ball.number), Array.from({ length: 16 }, (_, number) => number));
    strict_1.default.equal((_a = rack.find((ball) => ball.number === 8)) === null || _a === void 0 ? void 0 : _a.y, 2378);
    assertBallsDoNotOverlap(rack);
    strict_1.default.deepEqual(state.pocketedBy, { "1": [], "2": [] });
    strict_1.default.equal(state.physicsVersion, eightBallPhysicsV9_1.EIGHT_BALL_V9_PHYSICS_VERSION);
});
(0, node_test_1.default)("rejects a shot from a different physics protocol", () => {
    const state = (0, EIGHT_BALL_1.createEightBallState)(1, 2);
    strict_1.default.throws(() => (0, EIGHT_BALL_1.applyEightBallMove)(state, 1, {
        kind: "shot",
        physicsVersion: eightBallPhysicsV9_1.EIGHT_BALL_V9_PHYSICS_VERSION - 1,
        aimX: 0,
        aimY: -10000,
        power: 500,
    }), /physics update required/);
});
(0, node_test_1.default)("keeps an existing v6 game on v6 and labels its replay shot", () => {
    var _a;
    const legacy = (0, EIGHT_BALL_1.createEightBallState)(1, 2);
    legacy.physicsVersion = eightBallPhysics_1.EIGHT_BALL_PHYSICS_VERSION;
    const normalized = (0, EIGHT_BALL_1.normalizeEightBallState)(legacy);
    strict_1.default.equal(normalized.physicsVersion, eightBallPhysics_1.EIGHT_BALL_PHYSICS_VERSION);
    const result = (0, EIGHT_BALL_1.applyEightBallMove)(normalized, 1, {
        kind: "shot",
        physicsVersion: eightBallPhysics_1.EIGHT_BALL_PHYSICS_VERSION,
        aimX: 0,
        aimY: -10000,
        power: 100,
    });
    strict_1.default.equal(result.state.physicsVersion, eightBallPhysics_1.EIGHT_BALL_PHYSICS_VERSION);
    strict_1.default.equal((_a = result.state.lastShot) === null || _a === void 0 ? void 0 : _a.physicsVersion, eightBallPhysics_1.EIGHT_BALL_PHYSICS_VERSION);
});
(0, node_test_1.default)("keeps an existing v7 game on v7", () => {
    const existing = (0, EIGHT_BALL_1.createEightBallState)(1, 2);
    existing.physicsVersion = eightBallPhysicsV7_1.EIGHT_BALL_V7_PHYSICS_VERSION;
    const normalized = (0, EIGHT_BALL_1.normalizeEightBallState)(existing);
    strict_1.default.equal(normalized.physicsVersion, eightBallPhysicsV7_1.EIGHT_BALL_V7_PHYSICS_VERSION);
});
(0, node_test_1.default)("keeps an existing v8 game on v8", () => {
    const existing = (0, EIGHT_BALL_1.createEightBallState)(1, 2);
    existing.physicsVersion = eightBallPhysicsV8_1.EIGHT_BALL_V8_PHYSICS_VERSION;
    const normalized = (0, EIGHT_BALL_1.normalizeEightBallState)(existing);
    strict_1.default.equal(normalized.physicsVersion, eightBallPhysicsV8_1.EIGHT_BALL_V8_PHYSICS_VERSION);
});
(0, node_test_1.default)("normalizes legacy pocket history from the last shot", () => {
    const state = (0, EIGHT_BALL_1.createEightBallState)(1, 2);
    state.lastShot = { playerId: 2, power: 600, firstHit: 3, pocketed: [0, 3, 12, 12], foul: null };
    const legacy = Object.assign({}, state);
    delete legacy.pocketedBy;
    strict_1.default.deepEqual((0, EIGHT_BALL_1.normalizeEightBallState)(legacy).pocketedBy, { "1": [], "2": [3, 12] });
});
(0, node_test_1.default)("normalizes a legacy last shot into numbered replay history", () => {
    const state = (0, EIGHT_BALL_1.createEightBallState)(1, 2);
    state.shotNumber = 4;
    state.lastShot = { playerId: 2, power: 300, firstHit: 6, pocketed: [6], foul: null };
    const legacy = Object.assign({}, state);
    delete legacy.recentShots;
    const normalized = (0, EIGHT_BALL_1.normalizeEightBallState)(legacy);
    strict_1.default.equal(normalized.recentShots.length, 1);
    strict_1.default.equal(normalized.recentShots[0].shotNumber, 4);
    strict_1.default.equal(normalized.recentShots[0].playerId, 2);
});
(0, node_test_1.default)("keeps a consecutive shooter's shots together and resets for the next shooter", () => {
    const state = (0, EIGHT_BALL_1.createEightBallState)(1, 2);
    state.physicsVersion = eightBallPhysics_1.EIGHT_BALL_PHYSICS_VERSION;
    const quietShot = {
        kind: "shot",
        physicsVersion: eightBallPhysics_1.EIGHT_BALL_PHYSICS_VERSION,
        aimX: 0,
        aimY: 10000,
        power: 1,
    };
    const first = (0, EIGHT_BALL_1.applyEightBallMove)(state, 1, quietShot).state;
    const second = (0, EIGHT_BALL_1.applyEightBallMove)(first, 1, quietShot).state;
    strict_1.default.deepEqual(second.recentShots.map((shot) => shot.shotNumber), [1, 2]);
    strict_1.default.deepEqual(second.recentShots.map((shot) => shot.playerId), [1, 1]);
    const third = (0, EIGHT_BALL_1.applyEightBallMove)(second, 2, Object.assign(Object.assign({}, quietShot), { cueX: 2500, cueY: 7900 })).state;
    strict_1.default.deepEqual(third.recentShots.map((shot) => shot.shotNumber), [3]);
    strict_1.default.deepEqual(third.recentShots.map((shot) => shot.playerId), [2]);
});
(0, node_test_1.default)("resolves the same quantized shot identically every time", () => {
    const shot = { aimX: 0, aimY: -10000, power: 900 };
    const first = (0, eightBallPhysics_1.simulateEightBallShot)((0, eightBallPhysics_1.createEightBallRack)(), shot);
    const second = (0, eightBallPhysics_1.simulateEightBallShot)((0, eightBallPhysics_1.createEightBallRack)(), shot);
    strict_1.default.deepEqual(first, second);
    strict_1.default.equal(first.events.firstHit, 1);
    strict_1.default.ok(first.steps > 1);
    assertBallsDoNotOverlap(first.balls);
});
(0, node_test_1.default)("loses a small realistic amount of speed in a head-on ball collision", () => {
    const balls = (0, eightBallPhysics_1.createEightBallRack)().map((ball) => (Object.assign(Object.assign({}, ball), { pocketed: ![0, 1].includes(ball.number) })));
    Object.assign(balls[0], { x: 2500, y: 7000, pocketed: false });
    Object.assign(balls[1], { x: 2500, y: 6000, pocketed: false });
    const simulation = (0, eightBallPhysics_1.simulateEightBallShot)(balls, { aimX: 0, aimY: -10000, power: 500 }, { captureEvery: 1 });
    const frames = simulation.frames;
    const contactIndex = frames.findIndex((frame, index) => (index > 0 && frames[index - 1].balls[1].y > frame.balls[1].y));
    strict_1.default.ok(contactIndex > 1, "the cue ball should contact the object ball");
    // Skip the partially-resolved contact frame and compare full-speed frames
    // immediately before and after the collision.
    const incomingCueTravel = frames[contactIndex - 2].balls[0].y - frames[contactIndex - 1].balls[0].y;
    const outgoingObjectTravel = frames[contactIndex].balls[1].y - frames[contactIndex + 1].balls[1].y;
    strict_1.default.ok(outgoingObjectTravel > 0, "most normal momentum should transfer to the object ball");
    strict_1.default.ok(outgoingObjectTravel < incomingCueTravel, "the collision should lose a small amount of speed");
});
(0, node_test_1.default)("requires a clean approach into a side pocket", () => {
    const shotFrom = (y) => {
        const balls = (0, eightBallPhysics_1.createEightBallRack)().map((ball) => (Object.assign(Object.assign({}, ball), { pocketed: ball.number !== 0 })));
        Object.assign(balls[0], { x: 500, y, pocketed: false });
        return (0, eightBallPhysics_1.simulateEightBallShot)(balls, { aimX: -10000, aimY: 0, power: 80 });
    };
    strict_1.default.equal(shotFrom(5000).events.pocketed.includes(0), true, "a centered shot should enter the pocket");
    strict_1.default.equal(shotFrom(5500).events.pocketed.includes(0), false, "an off-centre shot should catch the jaw");
});
(0, node_test_1.default)("deflects from cushion faces and their rounded jaw endpoints", () => {
    const balls = (0, eightBallPhysics_1.createEightBallRack)().map((ball) => (Object.assign(Object.assign({}, ball), { pocketed: ball.number !== 0 })));
    Object.assign(balls[0], { x: 800, y: 800, pocketed: false });
    const simulation = (0, eightBallPhysics_1.simulateEightBallShot)(balls, { aimX: -6000, aimY: -10000, power: 400 }, { captureEvery: 1 });
    const cueFrames = simulation.frames.map((frame) => frame.balls.find((ball) => ball.number === 0));
    const deltas = cueFrames.slice(1).map((ball, index) => ({
        x: ball.x - cueFrames[index].x,
        y: ball.y - cueFrames[index].y,
    }));
    strict_1.default.equal(simulation.events.pocketed.includes(0), false);
    strict_1.default.ok(deltas.some((delta) => delta.x < 0 && delta.y > 0), "top jaw should reverse the vertical component");
    strict_1.default.ok(deltas.some((delta) => delta.x > 0 && delta.y > 0), "rounded jaw tip should then reverse the horizontal component");
});
(0, node_test_1.default)("repairs overlapping persisted balls deterministically", () => {
    const state = (0, EIGHT_BALL_1.createEightBallState)(1, 2);
    state.balls[1].x = state.balls[2].x;
    state.balls[1].y = state.balls[2].y;
    const repaired = (0, EIGHT_BALL_1.normalizeEightBallState)(state);
    assertBallsDoNotOverlap(repaired.balls);
    strict_1.default.deepEqual(repaired, (0, EIGHT_BALL_1.normalizeEightBallState)(state));
});
(0, node_test_1.default)("allows break placement only behind the head line", () => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    const state = (0, EIGHT_BALL_1.createEightBallState)(1, 2);
    const result = (0, EIGHT_BALL_1.applyEightBallMove)(state, 1, {
        kind: "shot",
        physicsVersion: eightBallPhysicsV9_1.EIGHT_BALL_V9_PHYSICS_VERSION,
        aimX: 0,
        aimY: -10000,
        power: 100,
        cueX: 1900,
        cueY: 7800,
    });
    strict_1.default.deepEqual({
        aimX: (_a = result.state.lastShot) === null || _a === void 0 ? void 0 : _a.aimX,
        aimY: (_b = result.state.lastShot) === null || _b === void 0 ? void 0 : _b.aimY,
        cueX: (_c = result.state.lastShot) === null || _c === void 0 ? void 0 : _c.cueX,
        cueY: (_d = result.state.lastShot) === null || _d === void 0 ? void 0 : _d.cueY,
        power: (_e = result.state.lastShot) === null || _e === void 0 ? void 0 : _e.power,
    }, { aimX: 0, aimY: -10000, cueX: 1900, cueY: 7800, power: 100 });
    strict_1.default.equal((_g = (_f = result.state.lastShot) === null || _f === void 0 ? void 0 : _f.startBalls) === null || _g === void 0 ? void 0 : _g.length, 16);
    strict_1.default.deepEqual((_j = (_h = result.state.lastShot) === null || _h === void 0 ? void 0 : _h.startBalls) === null || _j === void 0 ? void 0 : _j.find((ball) => ball.number === 0), { number: 0, x: 1900, y: 7800, vx: 0, vy: 0, pocketed: false });
    strict_1.default.throws(() => (0, EIGHT_BALL_1.applyEightBallMove)(state, 1, {
        kind: "shot",
        physicsVersion: eightBallPhysicsV9_1.EIGHT_BALL_V9_PHYSICS_VERSION,
        aimX: 0,
        aimY: -10000,
        power: 100,
        cueX: 1900,
        cueY: 7000,
    }), /behind the head line/);
});
(0, node_test_1.default)("allows post-foul ball in hand anywhere on the clear table", () => {
    const state = (0, EIGHT_BALL_1.createEightBallState)(1, 2);
    state.breakShot = false;
    state.ballInHandFor = 1;
    state.balls[0].pocketed = true;
    strict_1.default.doesNotThrow(() => (0, EIGHT_BALL_1.applyEightBallMove)(state, 1, {
        kind: "shot",
        physicsVersion: eightBallPhysicsV9_1.EIGHT_BALL_V9_PHYSICS_VERSION,
        aimX: 0,
        aimY: -10000,
        power: 100,
        cueX: 1900,
        cueY: 1000,
    }));
});
(0, node_test_1.default)("pocketing the 8 ball before clearing your group loses", () => {
    const state = (0, EIGHT_BALL_1.createEightBallState)(1, 2);
    state.breakShot = false;
    state.groups = { "1": "SOLIDS", "2": "STRIPES" };
    state.balls.forEach((ball) => { ball.pocketed = ![0, 1, 8].includes(ball.number); });
    const cue = state.balls[0];
    cue.x = 1500;
    cue.y = 5000;
    const eight = state.balls[8];
    eight.x = 590;
    eight.y = 5000;
    const solid = state.balls[1];
    solid.x = 3500;
    solid.y = 7000;
    const result = (0, EIGHT_BALL_1.applyEightBallMove)(state, 1, { kind: "shot", physicsVersion: eightBallPhysicsV9_1.EIGHT_BALL_V9_PHYSICS_VERSION, aimX: -10000, aimY: 0, power: 1000 });
    strict_1.default.equal(result.winner, 2);
    strict_1.default.equal(result.nextPlayer, 0);
});
(0, node_test_1.default)("legally pocketing the 8 ball after clearing your group wins", () => {
    var _a;
    const state = (0, EIGHT_BALL_1.createEightBallState)(1, 2);
    state.breakShot = false;
    state.groups = { "1": "SOLIDS", "2": "STRIPES" };
    state.balls.forEach((ball) => { ball.pocketed = ![0, 8].includes(ball.number); });
    const cue = state.balls[0];
    cue.x = 1500;
    cue.y = 5000;
    const eight = state.balls[8];
    eight.x = 590;
    eight.y = 5000;
    const result = (0, EIGHT_BALL_1.applyEightBallMove)(state, 1, { kind: "shot", physicsVersion: eightBallPhysicsV9_1.EIGHT_BALL_V9_PHYSICS_VERSION, aimX: -10000, aimY: 0, power: 1000 });
    strict_1.default.equal(result.winner, 1);
    strict_1.default.equal(result.nextPlayer, 0);
    strict_1.default.equal((_a = result.state.lastShot) === null || _a === void 0 ? void 0 : _a.foul, null);
    strict_1.default.deepEqual(result.state.pocketedBy["1"], [8]);
});
