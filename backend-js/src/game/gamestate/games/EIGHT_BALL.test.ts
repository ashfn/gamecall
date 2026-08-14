import assert from "node:assert/strict";
import test from "node:test";
import { applyEightBallMove, createEightBallState, normalizeEightBallState } from "./EIGHT_BALL";
import {
  createEightBallRack,
  EIGHT_BALL_BALL_RADIUS,
  EIGHT_BALL_PHYSICS_VERSION as EIGHT_BALL_LEGACY_PHYSICS_VERSION,
  simulateEightBallShot,
} from "./eightBallPhysics";
import { EIGHT_BALL_V7_PHYSICS_VERSION } from "./eightBallPhysicsV7";
import { EIGHT_BALL_V8_PHYSICS_VERSION } from "./eightBallPhysicsV8";
import { EIGHT_BALL_V9_PHYSICS_VERSION as EIGHT_BALL_PHYSICS_VERSION } from "./eightBallPhysicsV9";

function assertBallsDoNotOverlap(balls: ReturnType<typeof createEightBallRack>) {
  const diameterSquared = (EIGHT_BALL_BALL_RADIUS * 2) ** 2;
  for (let left = 0; left < balls.length; left += 1) {
    if (balls[left].pocketed) continue;
    for (let right = left + 1; right < balls.length; right += 1) {
      if (balls[right].pocketed) continue;
      const dx = balls[left].x - balls[right].x;
      const dy = balls[left].y - balls[right].y;
      assert.ok(dx * dx + dy * dy >= diameterSquared, `balls ${balls[left].number} and ${balls[right].number} overlap`);
    }
  }
}

test("creates a complete, non-overlapping deterministic rack", () => {
  const state = createEightBallState(1, 2);
  const rack = createEightBallRack();
  assert.deepEqual(rack.map((ball) => ball.number), Array.from({ length: 16 }, (_, number) => number));
  assert.equal(rack.find((ball) => ball.number === 8)?.y, 2378);
  assertBallsDoNotOverlap(rack);
  assert.deepEqual(state.pocketedBy, { "1": [], "2": [] });
  assert.equal(state.physicsVersion, EIGHT_BALL_PHYSICS_VERSION);
});

test("rejects a shot from a different physics protocol", () => {
  const state = createEightBallState(1, 2);
  assert.throws(() => applyEightBallMove(state, 1, {
    kind: "shot",
    physicsVersion: EIGHT_BALL_PHYSICS_VERSION - 1,
    aimX: 0,
    aimY: -10000,
    power: 500,
  }), /physics update required/);
});

test("keeps an existing v6 game on v6 and labels its replay shot", () => {
  const legacy = createEightBallState(1, 2);
  legacy.physicsVersion = EIGHT_BALL_LEGACY_PHYSICS_VERSION;
  const normalized = normalizeEightBallState(legacy);
  assert.equal(normalized.physicsVersion, EIGHT_BALL_LEGACY_PHYSICS_VERSION);

  const result = applyEightBallMove(normalized, 1, {
    kind: "shot",
    physicsVersion: EIGHT_BALL_LEGACY_PHYSICS_VERSION,
    aimX: 0,
    aimY: -10000,
    power: 100,
  });
  assert.equal(result.state.physicsVersion, EIGHT_BALL_LEGACY_PHYSICS_VERSION);
  assert.equal(result.state.lastShot?.physicsVersion, EIGHT_BALL_LEGACY_PHYSICS_VERSION);
});

test("keeps an existing v7 game on v7", () => {
  const existing = createEightBallState(1, 2);
  existing.physicsVersion = EIGHT_BALL_V7_PHYSICS_VERSION;
  const normalized = normalizeEightBallState(existing);
  assert.equal(normalized.physicsVersion, EIGHT_BALL_V7_PHYSICS_VERSION);
});

test("keeps an existing v8 game on v8", () => {
  const existing = createEightBallState(1, 2);
  existing.physicsVersion = EIGHT_BALL_V8_PHYSICS_VERSION;
  const normalized = normalizeEightBallState(existing);
  assert.equal(normalized.physicsVersion, EIGHT_BALL_V8_PHYSICS_VERSION);
});

test("normalizes legacy pocket history from the last shot", () => {
  const state = createEightBallState(1, 2);
  state.lastShot = { playerId: 2, power: 600, firstHit: 3, pocketed: [0, 3, 12, 12], foul: null };
  const legacy = { ...state } as Partial<typeof state>;
  delete legacy.pocketedBy;
  assert.deepEqual(normalizeEightBallState(legacy).pocketedBy, { "1": [], "2": [3, 12] });
});

test("normalizes a legacy last shot into numbered replay history", () => {
  const state = createEightBallState(1, 2);
  state.shotNumber = 4;
  state.lastShot = { playerId: 2, power: 300, firstHit: 6, pocketed: [6], foul: null };
  const legacy = { ...state } as Partial<typeof state>;
  delete legacy.recentShots;

  const normalized = normalizeEightBallState(legacy);
  assert.equal(normalized.recentShots.length, 1);
  assert.equal(normalized.recentShots[0].shotNumber, 4);
  assert.equal(normalized.recentShots[0].playerId, 2);
});

test("keeps a consecutive shooter's shots together and resets for the next shooter", () => {
  const state = createEightBallState(1, 2);
  state.physicsVersion = EIGHT_BALL_LEGACY_PHYSICS_VERSION;
  const quietShot = {
    kind: "shot" as const,
    physicsVersion: EIGHT_BALL_LEGACY_PHYSICS_VERSION,
    aimX: 0,
    aimY: 10000,
    power: 1,
  };
  const first = applyEightBallMove(state, 1, quietShot).state;
  const second = applyEightBallMove(first, 1, quietShot).state;
  assert.deepEqual(second.recentShots.map((shot) => shot.shotNumber), [1, 2]);
  assert.deepEqual(second.recentShots.map((shot) => shot.playerId), [1, 1]);

  const third = applyEightBallMove(second, 2, {
    ...quietShot,
    cueX: 2500,
    cueY: 7900,
  }).state;
  assert.deepEqual(third.recentShots.map((shot) => shot.shotNumber), [3]);
  assert.deepEqual(third.recentShots.map((shot) => shot.playerId), [2]);
});

test("resolves the same quantized shot identically every time", () => {
  const shot = { aimX: 0, aimY: -10000, power: 900 };
  const first = simulateEightBallShot(createEightBallRack(), shot);
  const second = simulateEightBallShot(createEightBallRack(), shot);
  assert.deepEqual(first, second);
  assert.equal(first.events.firstHit, 1);
  assert.ok(first.steps > 1);
  assertBallsDoNotOverlap(first.balls);
});

test("loses a small realistic amount of speed in a head-on ball collision", () => {
  const balls = createEightBallRack().map((ball) => ({ ...ball, pocketed: ![0, 1].includes(ball.number) }));
  Object.assign(balls[0], { x: 2500, y: 7000, pocketed: false });
  Object.assign(balls[1], { x: 2500, y: 6000, pocketed: false });
  const simulation = simulateEightBallShot(balls, { aimX: 0, aimY: -10000, power: 500 }, { captureEvery: 1 });
  const frames = simulation.frames!;
  const contactIndex = frames.findIndex((frame, index) => (
    index > 0 && frames[index - 1].balls[1].y > frame.balls[1].y
  ));
  assert.ok(contactIndex > 1, "the cue ball should contact the object ball");
  // Skip the partially-resolved contact frame and compare full-speed frames
  // immediately before and after the collision.
  const incomingCueTravel = frames[contactIndex - 2].balls[0].y - frames[contactIndex - 1].balls[0].y;
  const outgoingObjectTravel = frames[contactIndex].balls[1].y - frames[contactIndex + 1].balls[1].y;
  assert.ok(outgoingObjectTravel > 0, "most normal momentum should transfer to the object ball");
  assert.ok(outgoingObjectTravel < incomingCueTravel, "the collision should lose a small amount of speed");
});

test("requires a clean approach into a side pocket", () => {
  const shotFrom = (y: number) => {
    const balls = createEightBallRack().map((ball) => ({ ...ball, pocketed: ball.number !== 0 }));
    Object.assign(balls[0], { x: 500, y, pocketed: false });
    return simulateEightBallShot(balls, { aimX: -10000, aimY: 0, power: 80 });
  };
  assert.equal(shotFrom(5000).events.pocketed.includes(0), true, "a centered shot should enter the pocket");
  assert.equal(shotFrom(5500).events.pocketed.includes(0), false, "an off-centre shot should catch the jaw");
});

test("deflects from cushion faces and their rounded jaw endpoints", () => {
  const balls = createEightBallRack().map((ball) => ({ ...ball, pocketed: ball.number !== 0 }));
  Object.assign(balls[0], { x: 800, y: 800, pocketed: false });
  const simulation = simulateEightBallShot(balls, { aimX: -6000, aimY: -10000, power: 400 }, { captureEvery: 1 });
  const cueFrames = simulation.frames!.map((frame) => frame.balls.find((ball) => ball.number === 0)!);
  const deltas = cueFrames.slice(1).map((ball, index) => ({
    x: ball.x - cueFrames[index].x,
    y: ball.y - cueFrames[index].y,
  }));
  assert.equal(simulation.events.pocketed.includes(0), false);
  assert.ok(deltas.some((delta) => delta.x < 0 && delta.y > 0), "top jaw should reverse the vertical component");
  assert.ok(deltas.some((delta) => delta.x > 0 && delta.y > 0), "rounded jaw tip should then reverse the horizontal component");
});

test("repairs overlapping persisted balls deterministically", () => {
  const state = createEightBallState(1, 2);
  state.balls[1].x = state.balls[2].x;
  state.balls[1].y = state.balls[2].y;
  const repaired = normalizeEightBallState(state);
  assertBallsDoNotOverlap(repaired.balls);
  assert.deepEqual(repaired, normalizeEightBallState(state));
});

test("allows break placement only behind the head line", () => {
  const state = createEightBallState(1, 2);
  const result = applyEightBallMove(state, 1, {
    kind: "shot",
    physicsVersion: EIGHT_BALL_PHYSICS_VERSION,
    aimX: 0,
    aimY: -10000,
    power: 100,
    cueX: 1900,
    cueY: 7800,
  });
  assert.deepEqual(
    {
      aimX: result.state.lastShot?.aimX,
      aimY: result.state.lastShot?.aimY,
      cueX: result.state.lastShot?.cueX,
      cueY: result.state.lastShot?.cueY,
      power: result.state.lastShot?.power,
    },
    { aimX: 0, aimY: -10000, cueX: 1900, cueY: 7800, power: 100 },
  );
  assert.equal(result.state.lastShot?.startBalls?.length, 16);
  assert.deepEqual(
    result.state.lastShot?.startBalls?.find((ball) => ball.number === 0),
    { number: 0, x: 1900, y: 7800, vx: 0, vy: 0, pocketed: false },
  );
  assert.throws(() => applyEightBallMove(state, 1, {
    kind: "shot",
    physicsVersion: EIGHT_BALL_PHYSICS_VERSION,
    aimX: 0,
    aimY: -10000,
    power: 100,
    cueX: 1900,
    cueY: 7000,
  }), /behind the head line/);
});

test("allows post-foul ball in hand anywhere on the clear table", () => {
  const state = createEightBallState(1, 2);
  state.breakShot = false;
  state.ballInHandFor = 1;
  state.balls[0].pocketed = true;
  assert.doesNotThrow(() => applyEightBallMove(state, 1, {
    kind: "shot",
    physicsVersion: EIGHT_BALL_PHYSICS_VERSION,
    aimX: 0,
    aimY: -10000,
    power: 100,
    cueX: 1900,
    cueY: 1000,
  }));
});

test("pocketing the 8 ball before clearing your group loses", () => {
  const state = createEightBallState(1, 2);
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

  const result = applyEightBallMove(state, 1, { kind: "shot", physicsVersion: EIGHT_BALL_PHYSICS_VERSION, aimX: -10000, aimY: 0, power: 1000 });
  assert.equal(result.winner, 2);
  assert.equal(result.nextPlayer, 0);
});

test("legally pocketing the 8 ball after clearing your group wins", () => {
  const state = createEightBallState(1, 2);
  state.breakShot = false;
  state.groups = { "1": "SOLIDS", "2": "STRIPES" };
  state.balls.forEach((ball) => { ball.pocketed = ![0, 8].includes(ball.number); });
  const cue = state.balls[0];
  cue.x = 1500;
  cue.y = 5000;
  const eight = state.balls[8];
  eight.x = 590;
  eight.y = 5000;

  const result = applyEightBallMove(state, 1, { kind: "shot", physicsVersion: EIGHT_BALL_PHYSICS_VERSION, aimX: -10000, aimY: 0, power: 1000 });
  assert.equal(result.winner, 1);
  assert.equal(result.nextPlayer, 0);
  assert.equal(result.state.lastShot?.foul, null);
  assert.deepEqual(result.state.pocketedBy["1"], [8]);
});
