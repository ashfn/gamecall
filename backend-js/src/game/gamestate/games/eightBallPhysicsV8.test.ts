import assert from "node:assert/strict";
import test from "node:test";
import {
  createEightBallRack,
  EIGHT_BALL_BALL_RADIUS,
  EIGHT_BALL_TABLE_WIDTH,
  EightBallPhysicsBall,
} from "./eightBallPhysics";
import {
  EIGHT_BALL_V8_BALL_DIAMETER_SQUARED,
  eightBallV8MinimumSeparationSquared,
  simulateEightBallShotV8,
} from "./eightBallPhysicsV8";

function tableWithOnly(activeNumbers: number[]): EightBallPhysicsBall[] {
  const active = new Set(activeNumbers);
  return createEightBallRack().map((ball) => ({ ...ball, pocketed: !active.has(ball.number) }));
}

function ballByNumber(balls: EightBallPhysicsBall[], number: number): EightBallPhysicsBall {
  const ball = balls.find((candidate) => candidate.number === number);
  assert.ok(ball, `ball ${number} must exist`);
  return ball;
}

test("v8 resolves an identical quantized break every time", () => {
  const shot = { aimX: 0, aimY: -10000, power: 900 };
  const first = simulateEightBallShotV8(createEightBallRack(), shot);
  const second = simulateEightBallShotV8(createEightBallRack(), shot);

  assert.deepEqual(first, second);
  assert.equal(first.events.firstHit, 1);
  assert.ok(first.durationSeconds > 0);
  assert.ok(first.profile.ballContacts > 0);
  assert.equal(first.profile.eventLimitHits, 0, "the rack must resolve without exhausting a tick's event budget");
  assert.ok(
    eightBallV8MinimumSeparationSquared(first.balls) >= EIGHT_BALL_V8_BALL_DIAMETER_SQUARED,
    "settled balls must not overlap",
  );
});

test("v8 swept contacts stop a full-power shot tunnelling through a ball", () => {
  const balls = tableWithOnly([0, 1]);
  Object.assign(ballByNumber(balls, 0), { x: 2500, y: 7000, pocketed: false });
  Object.assign(ballByNumber(balls, 1), { x: 2500, y: 5800, pocketed: false });

  const simulation = simulateEightBallShotV8(
    balls,
    { aimX: 0, aimY: -10000, power: 1000 },
    { captureHz: 120 },
  );
  const objectFrames = simulation.frames!.map((frame) => frame.balls.find((ball) => ball.number === 1)!);

  assert.equal(simulation.events.firstHit, 1);
  assert.ok(objectFrames.some((ball, index) => index > 0 && ball.y < objectFrames[index - 1].y));
  assert.ok(simulation.profile.pairQuadratics > 0);
  assert.ok(
    eightBallV8MinimumSeparationSquared(simulation.balls) >= EIGHT_BALL_V8_BALL_DIAMETER_SQUARED,
    "the colliding pair must finish separated",
  );
});

test("v8 rolling resistance preserves travel direction before contact", () => {
  const balls = tableWithOnly([0]);
  Object.assign(ballByNumber(balls, 0), { x: 2500, y: 7000, pocketed: false });
  const simulation = simulateEightBallShotV8(
    balls,
    { aimX: 3, aimY: -4, power: 120 },
    { captureHz: 120 },
  );
  const frames = simulation.frames!;

  for (let index = 1; index < Math.min(8, frames.length); index += 1) {
    const cue = frames[index].balls.find((ball) => ball.number === 0)!;
    if (cue.vx === 0 && cue.vy === 0) break;
    const crossProduct = cue.vx * -4 - cue.vy * 3;
    assert.ok(Math.abs(crossProduct) < 0.01, `drag bent the shot direction in frame ${index}`);
  }
});

test("v8 requires a clean side-pocket approach", () => {
  const shootFrom = (y: number) => {
    const balls = tableWithOnly([0]);
    Object.assign(ballByNumber(balls, 0), { x: 500, y, pocketed: false });
    return simulateEightBallShotV8(balls, { aimX: -10000, aimY: 0, power: 80 });
  };

  assert.equal(shootFrom(5000).events.pocketed.includes(0), true, "a centred ball should sink");
  assert.equal(shootFrom(5500).events.pocketed.includes(0), false, "an off-centre ball should catch the jaw");
});

test("v8 is horizontally mirror-symmetric", () => {
  const shotFrom = (x: number, aimX: number) => {
    const balls = tableWithOnly([0]);
    Object.assign(ballByNumber(balls, 0), { x, y: 2400, pocketed: false });
    return simulateEightBallShotV8(balls, { aimX, aimY: -4000, power: 350 });
  };
  const left = shotFrom(900, -2500);
  const right = shotFrom(EIGHT_BALL_TABLE_WIDTH - 900, 2500);
  const leftCue = ballByNumber(left.balls, 0);
  const rightCue = ballByNumber(right.balls, 0);

  assert.equal(left.events.cueScratch, right.events.cueScratch);
  assert.equal(leftCue.pocketed, rightCue.pocketed);
  assert.ok(Math.abs(leftCue.x - (EIGHT_BALL_TABLE_WIDTH - rightCue.x)) <= 1);
  assert.ok(Math.abs(leftCue.y - rightCue.y) <= 1);
});

test("v8 broad phase rejects most irrelevant pair quadratics", () => {
  const simulation = simulateEightBallShotV8(
    createEightBallRack(),
    { aimX: 3300, aimY: -10000, power: 280 },
  );

  assert.ok(simulation.profile.pairCandidates > 0);
  assert.ok(simulation.profile.pairQuadratics < simulation.profile.pairCandidates / 3);
  assert.equal(simulation.profile.capturedFrames, 0);
  assert.ok(simulation.profile.eventIterations >= simulation.profile.ticks);
});

test("v8 never increases translational energy between contact-free captured frames", () => {
  const balls = tableWithOnly([0]);
  Object.assign(ballByNumber(balls, 0), {
    x: EIGHT_BALL_TABLE_WIDTH / 2,
    y: 7000,
    pocketed: false,
  });
  const simulation = simulateEightBallShotV8(
    balls,
    { aimX: 1, aimY: 0, power: 120 },
    { captureHz: 120 },
  );
  const energies = simulation.frames!.slice(0, 10).map((frame) => frame.balls.reduce(
    (total, ball) => total + ball.vx * ball.vx + ball.vy * ball.vy,
    0,
  ));

  for (let index = 1; index < energies.length; index += 1) {
    assert.ok(energies[index] <= energies[index - 1] + 0.001, `energy rose in frame ${index}`);
  }
});

test("v8 uses the same physical ball diameter as the production table", () => {
  assert.equal(EIGHT_BALL_V8_BALL_DIAMETER_SQUARED, (EIGHT_BALL_BALL_RADIUS * 2) ** 2);
});

test("v8 contains and separates a deterministic spread of arbitrary shots", () => {
  let seed = 0x51f15e;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let shotIndex = 0; shotIndex < 128; shotIndex += 1) {
    const angle = random() * Math.PI * 2;
    const simulation = simulateEightBallShotV8(createEightBallRack(), {
      aimX: Math.round(Math.cos(angle) * 10000),
      aimY: Math.round(Math.sin(angle) * 10000),
      power: 40 + Math.floor(random() * 961),
    });
    assert.equal(simulation.profile.eventLimitHits, 0, `shot ${shotIndex} exhausted its event budget`);
    assert.equal(simulation.profile.escapedBalls, 0, `shot ${shotIndex} escaped the table`);
    assert.ok(
      eightBallV8MinimumSeparationSquared(simulation.balls) >= EIGHT_BALL_V8_BALL_DIAMETER_SQUARED,
      `shot ${shotIndex} left overlapping balls`,
    );
  }
});

