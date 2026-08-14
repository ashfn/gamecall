"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const eightBallPhysics_1 = require("./eightBallPhysics");
const eightBallPhysicsV8_1 = require("./eightBallPhysicsV8");
function tableWithOnly(activeNumbers) {
    const active = new Set(activeNumbers);
    return (0, eightBallPhysics_1.createEightBallRack)().map((ball) => (Object.assign(Object.assign({}, ball), { pocketed: !active.has(ball.number) })));
}
function ballByNumber(balls, number) {
    const ball = balls.find((candidate) => candidate.number === number);
    strict_1.default.ok(ball, `ball ${number} must exist`);
    return ball;
}
(0, node_test_1.default)("v8 resolves an identical quantized break every time", () => {
    const shot = { aimX: 0, aimY: -10000, power: 900 };
    const first = (0, eightBallPhysicsV8_1.simulateEightBallShotV8)((0, eightBallPhysics_1.createEightBallRack)(), shot);
    const second = (0, eightBallPhysicsV8_1.simulateEightBallShotV8)((0, eightBallPhysics_1.createEightBallRack)(), shot);
    strict_1.default.deepEqual(first, second);
    strict_1.default.equal(first.events.firstHit, 1);
    strict_1.default.ok(first.durationSeconds > 0);
    strict_1.default.ok(first.profile.ballContacts > 0);
    strict_1.default.equal(first.profile.eventLimitHits, 0, "the rack must resolve without exhausting a tick's event budget");
    strict_1.default.ok((0, eightBallPhysicsV8_1.eightBallV8MinimumSeparationSquared)(first.balls) >= eightBallPhysicsV8_1.EIGHT_BALL_V8_BALL_DIAMETER_SQUARED, "settled balls must not overlap");
});
(0, node_test_1.default)("v8 swept contacts stop a full-power shot tunnelling through a ball", () => {
    const balls = tableWithOnly([0, 1]);
    Object.assign(ballByNumber(balls, 0), { x: 2500, y: 7000, pocketed: false });
    Object.assign(ballByNumber(balls, 1), { x: 2500, y: 5800, pocketed: false });
    const simulation = (0, eightBallPhysicsV8_1.simulateEightBallShotV8)(balls, { aimX: 0, aimY: -10000, power: 1000 }, { captureHz: 120 });
    const objectFrames = simulation.frames.map((frame) => frame.balls.find((ball) => ball.number === 1));
    strict_1.default.equal(simulation.events.firstHit, 1);
    strict_1.default.ok(objectFrames.some((ball, index) => index > 0 && ball.y < objectFrames[index - 1].y));
    strict_1.default.ok(simulation.profile.pairQuadratics > 0);
    strict_1.default.ok((0, eightBallPhysicsV8_1.eightBallV8MinimumSeparationSquared)(simulation.balls) >= eightBallPhysicsV8_1.EIGHT_BALL_V8_BALL_DIAMETER_SQUARED, "the colliding pair must finish separated");
});
(0, node_test_1.default)("v8 rolling resistance preserves travel direction before contact", () => {
    const balls = tableWithOnly([0]);
    Object.assign(ballByNumber(balls, 0), { x: 2500, y: 7000, pocketed: false });
    const simulation = (0, eightBallPhysicsV8_1.simulateEightBallShotV8)(balls, { aimX: 3, aimY: -4, power: 120 }, { captureHz: 120 });
    const frames = simulation.frames;
    for (let index = 1; index < Math.min(8, frames.length); index += 1) {
        const cue = frames[index].balls.find((ball) => ball.number === 0);
        if (cue.vx === 0 && cue.vy === 0)
            break;
        const crossProduct = cue.vx * -4 - cue.vy * 3;
        strict_1.default.ok(Math.abs(crossProduct) < 0.01, `drag bent the shot direction in frame ${index}`);
    }
});
(0, node_test_1.default)("v8 requires a clean side-pocket approach", () => {
    const shootFrom = (y) => {
        const balls = tableWithOnly([0]);
        Object.assign(ballByNumber(balls, 0), { x: 500, y, pocketed: false });
        return (0, eightBallPhysicsV8_1.simulateEightBallShotV8)(balls, { aimX: -10000, aimY: 0, power: 80 });
    };
    strict_1.default.equal(shootFrom(5000).events.pocketed.includes(0), true, "a centred ball should sink");
    strict_1.default.equal(shootFrom(5500).events.pocketed.includes(0), false, "an off-centre ball should catch the jaw");
});
(0, node_test_1.default)("v8 is horizontally mirror-symmetric", () => {
    const shotFrom = (x, aimX) => {
        const balls = tableWithOnly([0]);
        Object.assign(ballByNumber(balls, 0), { x, y: 2400, pocketed: false });
        return (0, eightBallPhysicsV8_1.simulateEightBallShotV8)(balls, { aimX, aimY: -4000, power: 350 });
    };
    const left = shotFrom(900, -2500);
    const right = shotFrom(eightBallPhysics_1.EIGHT_BALL_TABLE_WIDTH - 900, 2500);
    const leftCue = ballByNumber(left.balls, 0);
    const rightCue = ballByNumber(right.balls, 0);
    strict_1.default.equal(left.events.cueScratch, right.events.cueScratch);
    strict_1.default.equal(leftCue.pocketed, rightCue.pocketed);
    strict_1.default.ok(Math.abs(leftCue.x - (eightBallPhysics_1.EIGHT_BALL_TABLE_WIDTH - rightCue.x)) <= 1);
    strict_1.default.ok(Math.abs(leftCue.y - rightCue.y) <= 1);
});
(0, node_test_1.default)("v8 broad phase rejects most irrelevant pair quadratics", () => {
    const simulation = (0, eightBallPhysicsV8_1.simulateEightBallShotV8)((0, eightBallPhysics_1.createEightBallRack)(), { aimX: 3300, aimY: -10000, power: 280 });
    strict_1.default.ok(simulation.profile.pairCandidates > 0);
    strict_1.default.ok(simulation.profile.pairQuadratics < simulation.profile.pairCandidates / 3);
    strict_1.default.equal(simulation.profile.capturedFrames, 0);
    strict_1.default.ok(simulation.profile.eventIterations >= simulation.profile.ticks);
});
(0, node_test_1.default)("v8 never increases translational energy between contact-free captured frames", () => {
    const balls = tableWithOnly([0]);
    Object.assign(ballByNumber(balls, 0), {
        x: eightBallPhysics_1.EIGHT_BALL_TABLE_WIDTH / 2,
        y: 7000,
        pocketed: false,
    });
    const simulation = (0, eightBallPhysicsV8_1.simulateEightBallShotV8)(balls, { aimX: 1, aimY: 0, power: 120 }, { captureHz: 120 });
    const energies = simulation.frames.slice(0, 10).map((frame) => frame.balls.reduce((total, ball) => total + ball.vx * ball.vx + ball.vy * ball.vy, 0));
    for (let index = 1; index < energies.length; index += 1) {
        strict_1.default.ok(energies[index] <= energies[index - 1] + 0.001, `energy rose in frame ${index}`);
    }
});
(0, node_test_1.default)("v8 uses the same physical ball diameter as the production table", () => {
    strict_1.default.equal(eightBallPhysicsV8_1.EIGHT_BALL_V8_BALL_DIAMETER_SQUARED, Math.pow((eightBallPhysics_1.EIGHT_BALL_BALL_RADIUS * 2), 2));
});
(0, node_test_1.default)("v8 contains and separates a deterministic spread of arbitrary shots", () => {
    let seed = 0x51f15e;
    const random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
    };
    for (let shotIndex = 0; shotIndex < 128; shotIndex += 1) {
        const angle = random() * Math.PI * 2;
        const simulation = (0, eightBallPhysicsV8_1.simulateEightBallShotV8)((0, eightBallPhysics_1.createEightBallRack)(), {
            aimX: Math.round(Math.cos(angle) * 10000),
            aimY: Math.round(Math.sin(angle) * 10000),
            power: 40 + Math.floor(random() * 961),
        });
        strict_1.default.equal(simulation.profile.eventLimitHits, 0, `shot ${shotIndex} exhausted its event budget`);
        strict_1.default.equal(simulation.profile.escapedBalls, 0, `shot ${shotIndex} escaped the table`);
        strict_1.default.ok((0, eightBallPhysicsV8_1.eightBallV8MinimumSeparationSquared)(simulation.balls) >= eightBallPhysicsV8_1.EIGHT_BALL_V8_BALL_DIAMETER_SQUARED, `shot ${shotIndex} left overlapping balls`);
    }
});
