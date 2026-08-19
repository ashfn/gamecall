"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const eightBallPhysics_1 = require("./eightBallPhysics");
const eightBallPhysicsV9_1 = require("./eightBallPhysicsV9");
function cueOnly() {
    return (0, eightBallPhysics_1.createEightBallRack)().map((ball) => ({
        ...ball,
        pocketed: ball.number !== 0,
    }));
}
(0, node_test_1.default)("v9 captures only after the whole ball has fallen below the table surface", () => {
    const balls = cueOnly();
    Object.assign(balls[0], { x: 500, y: 5000, pocketed: false });
    const simulation = (0, eightBallPhysicsV9_1.simulateEightBallShotV9)(balls, { aimX: -10000, aimY: 0, power: 80 }, { captureHz: 120 });
    const cueFrames = simulation.frames?.flatMap((frame) => frame.balls)
        .filter((ball) => ball.number === 0) ?? [];
    const falling = cueFrames.find((ball) => !ball.pocketed && (ball.pocketDepth ?? 0) > 0);
    const captured = cueFrames.find((ball) => ball.pocketed);
    strict_1.default.ok(falling, "the shared engine must represent the visible vertical fall before capture");
    strict_1.default.ok(captured, "a centred side-pocket approach should be captured");
    strict_1.default.ok((captured.pocketDepth ?? 0) >= eightBallPhysics_1.EIGHT_BALL_BALL_RADIUS * 2, "the pot must not complete until a full ball diameter is below the shelf");
});
(0, node_test_1.default)("v9 hits the rear liner before falling and preserves its exit velocity", () => {
    const balls = cueOnly();
    Object.assign(balls[0], { x: 500, y: 5000, pocketed: false });
    const simulation = (0, eightBallPhysicsV9_1.simulateEightBallShotV9)(balls, { aimX: -10000, aimY: 0, power: 80 }, { captureHz: 120 });
    const cueFrames = simulation.frames?.flatMap((frame) => frame.balls)
        .filter((ball) => ball.number === 0) ?? [];
    const entering = cueFrames.find((ball) => ball.pocketIndex === 2 && !ball.pocketLinerHit);
    const rebounding = cueFrames.find((ball) => ball.pocketIndex === 2 && ball.pocketLinerHit && !ball.pocketed);
    const captured = cueFrames.find((ball) => ball.pocketed);
    strict_1.default.ok(entering);
    strict_1.default.ok(rebounding);
    strict_1.default.ok(captured);
    strict_1.default.ok(entering.vx < 0, "the ball must keep travelling into the pocket before impact");
    strict_1.default.equal(entering.pocketDepth, 0, "vertical fall must not start before liner impact");
    strict_1.default.ok(rebounding.vx > 0, "the rear liner must reflect the ball toward the table centre");
    strict_1.default.ok((rebounding.pocketDepth ?? 0) > 0, "the drop begins only after the liner collision");
    strict_1.default.notEqual(captured.x, 0, "capture must not snap the centre to the pocket origin");
    strict_1.default.ok(captured.vx > 0, "capture must retain reflected liner velocity for the hidden ramp");
    strict_1.default.ok(Math.abs(captured.vy) < 1, "a straight entry must remain straight");
});
(0, node_test_1.default)("v9 remains deterministic", () => {
    const shot = { aimX: 0, aimY: -10000, power: 1000 };
    strict_1.default.deepEqual((0, eightBallPhysicsV9_1.simulateEightBallShotV9)((0, eightBallPhysics_1.createEightBallRack)(), shot), (0, eightBallPhysicsV9_1.simulateEightBallShotV9)((0, eightBallPhysics_1.createEightBallRack)(), shot));
});
(0, node_test_1.default)("v9 contains and separates a deterministic spread of arbitrary shots", () => {
    let seed = 0x91f15e;
    const random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
    };
    for (let shotIndex = 0; shotIndex < 128; shotIndex += 1) {
        const angle = random() * Math.PI * 2;
        const simulation = (0, eightBallPhysicsV9_1.simulateEightBallShotV9)((0, eightBallPhysics_1.createEightBallRack)(), {
            aimX: Math.round(Math.cos(angle) * 10000),
            aimY: Math.round(Math.sin(angle) * 10000),
            power: 40 + Math.floor(random() * 961),
        });
        strict_1.default.equal(simulation.profile.eventLimitHits, 0, `shot ${shotIndex} exhausted its event budget`);
        strict_1.default.equal(simulation.profile.escapedBalls, 0, `shot ${shotIndex} escaped the table`);
        strict_1.default.ok((0, eightBallPhysicsV9_1.eightBallV9MinimumSeparationSquared)(simulation.balls) >= eightBallPhysicsV9_1.EIGHT_BALL_V9_BALL_DIAMETER_SQUARED, `shot ${shotIndex} left overlapping balls`);
    }
});
