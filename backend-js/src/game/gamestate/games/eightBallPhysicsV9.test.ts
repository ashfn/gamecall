import assert from "node:assert/strict";
import test from "node:test";
import {
  createEightBallRack,
  EIGHT_BALL_BALL_RADIUS,
  EightBallPhysicsBall,
} from "./eightBallPhysics";
import {
  EIGHT_BALL_V9_BALL_DIAMETER_SQUARED,
  eightBallV9MinimumSeparationSquared,
  simulateEightBallShotV9,
} from "./eightBallPhysicsV9";

function cueOnly(): EightBallPhysicsBall[] {
  return createEightBallRack().map((ball) => ({
    ...ball,
    pocketed: ball.number !== 0,
  }));
}

test("v9 captures only after the whole ball has fallen below the table surface", () => {
  const balls = cueOnly();
  Object.assign(balls[0], { x: 500, y: 5000, pocketed: false });
  const simulation = simulateEightBallShotV9(
    balls,
    { aimX: -10000, aimY: 0, power: 80 },
    { captureHz: 120 },
  );
  const cueFrames = simulation.frames?.flatMap((frame) => frame.balls)
    .filter((ball) => ball.number === 0) ?? [];
  const falling = cueFrames.find((ball) => !ball.pocketed && (ball.pocketDepth ?? 0) > 0);
  const captured = cueFrames.find((ball) => ball.pocketed);

  assert.ok(falling, "the shared engine must represent the visible vertical fall before capture");
  assert.ok(captured, "a centred side-pocket approach should be captured");
  assert.ok(
    (captured.pocketDepth ?? 0) >= EIGHT_BALL_BALL_RADIUS * 2,
    "the pot must not complete until a full ball diameter is below the shelf",
  );
});

test("v9 hits the rear liner before falling and preserves its exit velocity", () => {
  const balls = cueOnly();
  Object.assign(balls[0], { x: 500, y: 5000, pocketed: false });
  const simulation = simulateEightBallShotV9(
    balls,
    { aimX: -10000, aimY: 0, power: 80 },
    { captureHz: 120 },
  );
  const cueFrames = simulation.frames?.flatMap((frame) => frame.balls)
    .filter((ball) => ball.number === 0) ?? [];
  const entering = cueFrames.find((ball) => ball.pocketIndex === 2 && !ball.pocketLinerHit);
  const rebounding = cueFrames.find((ball) => ball.pocketIndex === 2 && ball.pocketLinerHit && !ball.pocketed);
  const captured = cueFrames.find((ball) => ball.pocketed);

  assert.ok(entering);
  assert.ok(rebounding);
  assert.ok(captured);
  assert.ok(entering.vx < 0, "the ball must keep travelling into the pocket before impact");
  assert.equal(entering.pocketDepth, 0, "vertical fall must not start before liner impact");
  assert.ok(rebounding.vx > 0, "the rear liner must reflect the ball toward the table centre");
  assert.ok((rebounding.pocketDepth ?? 0) > 0, "the drop begins only after the liner collision");
  assert.notEqual(captured.x, 0, "capture must not snap the centre to the pocket origin");
  assert.ok(captured.vx > 0, "capture must retain reflected liner velocity for the hidden ramp");
  assert.ok(Math.abs(captured.vy) < 1, "a straight entry must remain straight");
});

test("v9 remains deterministic", () => {
  const shot = { aimX: 0, aimY: -10000, power: 1000 };
  assert.deepEqual(
    simulateEightBallShotV9(createEightBallRack(), shot),
    simulateEightBallShotV9(createEightBallRack(), shot),
  );
});

test("v9 contains and separates a deterministic spread of arbitrary shots", () => {
  let seed = 0x91f15e;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let shotIndex = 0; shotIndex < 128; shotIndex += 1) {
    const angle = random() * Math.PI * 2;
    const simulation = simulateEightBallShotV9(createEightBallRack(), {
      aimX: Math.round(Math.cos(angle) * 10000),
      aimY: Math.round(Math.sin(angle) * 10000),
      power: 40 + Math.floor(random() * 961),
    });
    assert.equal(simulation.profile.eventLimitHits, 0, `shot ${shotIndex} exhausted its event budget`);
    assert.equal(simulation.profile.escapedBalls, 0, `shot ${shotIndex} escaped the table`);
    assert.ok(
      eightBallV9MinimumSeparationSquared(simulation.balls) >= EIGHT_BALL_V9_BALL_DIAMETER_SQUARED,
      `shot ${shotIndex} left overlapping balls`,
    );
  }
});
