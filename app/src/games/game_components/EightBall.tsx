import * as Haptics from "expo-haptics";
import { FontAwesome5 } from "@expo/vector-icons";
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  AppState,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { GestureResponderEvent } from "react-native";
import Svg, { Circle, Defs, G, Line, Mask, Path, Rect, Text as SvgText } from "react-native-svg";
import { saveLocalGameState, useLocalGameState } from "../../../util/localGameState";
import type { LocalGameStateScope } from "../../../util/localGameState";
import { colors } from "../../../util/theme";
import type { EightBallBall, EightBallGameSession, EightBallGroup, EightBallLastShot } from "../../../util/types";
import type { GameViewProps } from "../GameLoader";
import TurnBasedGameHeader from "../components/TurnBasedGameHeader";
import {
  EIGHT_BALL_BALL_RADIUS,
  EIGHT_BALL_HEAD_STRING_Y,
  EIGHT_BALL_MAX_POWER,
  EIGHT_BALL_POCKETS,
  EIGHT_BALL_PHYSICS_VERSION as EIGHT_BALL_LEGACY_PHYSICS_VERSION,
  EIGHT_BALL_TABLE_HEIGHT,
  EIGHT_BALL_TABLE_WIDTH,
  isEightBallBreakPlacementLegal,
  isEightBallPlacementLegal,
  simulateEightBallShot as simulateLegacyEightBallShot,
} from "../eightBallPhysics";
import {
  EIGHT_BALL_V7_PHYSICS_VERSION,
  simulateEightBallShotV7,
} from "../eightBallPhysicsV7";
import {
  EIGHT_BALL_V8_PHYSICS_VERSION,
  simulateEightBallShotV8,
} from "../eightBallPhysicsV8";
import {
  EIGHT_BALL_V9_PHYSICS_VERSION,
  simulateEightBallShotV9,
} from "../eightBallPhysicsV9";

const POWER_HEIGHT = 390;
const MAX_POWER_DRAG = 390;
const POWER_CANCEL_DISTANCE = 24;
const LEGACY_BALL_ANIMATION_FRAME_MS = 72;
const V7_CAPTURE_HZ = 60;
const SECONDARY_GUIDE_LENGTH = 805;
const TABLE_FRAME_BORDER = 10;
const TABLE_INSET = 18;
const POCKET_SIZE = 34;
const CUSHION_DEPTH = 11;
const CUE_PULL_DISTANCE = 55;
const SIDE_CUE_PULL_DISTANCE = 128;
const BALL_COLORS: Record<number, string> = {
  1: "#F4D03F", 2: "#316FD1", 3: "#D84943", 4: "#7048A8",
  5: "#E67E32", 6: "#2C9B59", 7: "#7E2532", 8: "#111111",
  9: "#F4D03F", 10: "#316FD1", 11: "#D84943", 12: "#7048A8",
  13: "#E67E32", 14: "#2C9B59", 15: "#7E2532",
};

interface TableSize { width: number; height: number }
interface CuePoint { x: number; y: number }
interface EightBallLocalState {
  placementEpoch: string;
  cuePlacement: CuePoint | null;
}
interface BallOrientation { w: number; x: number; y: number; z: number }
interface EightBallPlaybackFrame {
  timeMs: number;
  balls: Array<{
    number: number;
    x: number;
    y: number;
    vx?: number;
    vy?: number;
    pocketed: boolean;
    pocketDepth?: number;
    pocketIndex?: number;
  }>;
}
type EightBallSimulationFrames = EightBallPlaybackFrame[];
interface PocketTransitSample {
  x: number;
  y: number;
  underTable: boolean;
}
interface PocketTransit {
  startsAtMs: number;
  durationMs: number;
  samples: PocketTransitSample[];
}
interface QueuedOpponentShot {
  shot: EightBallLastShot;
  fallbackBalls: EightBallBall[];
}

const LOCAL_STRIKE_DURATION_MS = 14;
const CONTACT_VISUAL_LEAD_MS = 2;
const AIM_DRAG_SENSITIVITY = 0.58;
const TABLE_DRAG_THRESHOLD = 5;
const CUE_PLACEMENT_PERSIST_INTERVAL_MS = 120;
const VISUAL_STOP_SPEED = 10;
const MAX_VISUAL_PLAYBACK_MS = 22_000;
const ANIMATION_WATCHDOG_GRACE_MS = 1_500;
const OPPONENT_CUE_SETTLE_MS = 80;
const OPPONENT_CUE_PULL_MS = 220;
const OPPONENT_CUE_STRIKE_MS = 95;
const POCKET_TRANSIT_HZ = 120;
const POCKET_TRANSIT_MAX_SECONDS = 1.6;
const POCKET_CHANNEL_HALF_WIDTH = 320;

const IDENTITY_ORIENTATION: BallOrientation = { w: 1, x: 0, y: 0, z: 0 };

function monotonicNow() {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function legacyPlaybackFrames(
  frames: NonNullable<ReturnType<typeof simulateLegacyEightBallShot>["frames"]>,
): EightBallSimulationFrames {
  return frames.map((frame, index) => ({
    timeMs: index * LEGACY_BALL_ANIMATION_FRAME_MS,
    balls: frame.balls,
  }));
}

function v7PlaybackFrames(
  frames: NonNullable<ReturnType<typeof simulateEightBallShotV7>["frames"]>,
): EightBallSimulationFrames {
  return frames.map((frame) => ({ timeMs: frame.timeSeconds * 1000, balls: frame.balls }));
}

function v8PlaybackFrames(
  frames: NonNullable<ReturnType<typeof simulateEightBallShotV8>["frames"]>,
): EightBallSimulationFrames {
  return frames.map((frame) => ({ timeMs: frame.timeSeconds * 1000, balls: frame.balls }));
}

function v9PlaybackFrames(
  frames: NonNullable<ReturnType<typeof simulateEightBallShotV9>["frames"]>,
): EightBallSimulationFrames {
  return frames.map((frame) => ({ timeMs: frame.timeSeconds * 1000, balls: frame.balls }));
}

function playbackPositionAtTime(frames: EightBallSimulationFrames, elapsedMs: number): number {
  if (frames.length <= 1 || elapsedMs <= frames[0].timeMs) return 0;
  const lastIndex = frames.length - 1;
  if (elapsedMs >= frames[lastIndex].timeMs) return lastIndex;
  let low = 0;
  let high = lastIndex;
  while (low + 1 < high) {
    const middle = (low + high) >> 1;
    if (frames[middle].timeMs <= elapsedMs) low = middle;
    else high = middle;
  }
  const duration = Math.max(0.001, frames[high].timeMs - frames[low].timeMs);
  return low + Math.max(0, Math.min(1, (elapsedMs - frames[low].timeMs) / duration));
}

function buildPocketTransits(
  frames: EightBallSimulationFrames,
  renderScale: number,
): Map<number, PocketTransit> {
  const result = new Map<number, PocketTransit>();
  for (let frameIndex = 1; frameIndex < frames.length; frameIndex += 1) {
    const previousFrame = frames[frameIndex - 1];
    const frame = frames[frameIndex];
    const previousByNumber = new Map(previousFrame.balls.map((ball) => [ball.number, ball]));
    for (const ball of frame.balls) {
      const previous = previousByNumber.get(ball.number);
      if (!ball.pocketed || previous?.pocketed || !previous || result.has(ball.number)) continue;
      const beforeFrame = frames[Math.max(0, frameIndex - 2)];
      const before = beforeFrame.balls.find((candidate) => candidate.number === ball.number) ?? previous;
      const velocitySeconds = Math.max(1 / 240, (previousFrame.timeMs - beforeFrame.timeMs) / 1000);
      const hasAuthoritativeEntry = ball.pocketDepth !== undefined && ball.pocketIndex !== undefined;
      let velocityX = hasAuthoritativeEntry
        ? ball.vx ?? 0
        : (previous.x - before.x) / velocitySeconds;
      let velocityY = hasAuthoritativeEntry
        ? ball.vy ?? 0
        : (previous.y - before.y) / velocitySeconds;
      const incomingSpeed = Math.hypot(velocityX, velocityY);
      if (incomingSpeed > 3400) {
        velocityX *= 3400 / incomingSpeed;
        velocityY *= 3400 / incomingSpeed;
      }
      const pocket = ball.pocketIndex !== undefined
        ? EIGHT_BALL_POCKETS[ball.pocketIndex]
        : EIGHT_BALL_POCKETS.reduce((nearest, candidate) => (
          Math.hypot(ball.x - candidate.x, ball.y - candidate.y)
            < Math.hypot(ball.x - nearest.x, ball.y - nearest.y)
            ? candidate
            : nearest
        ));
      const pocketX = pocket.x;
      const pocketY = pocket.y;
      const inwardLength = Math.hypot(
        EIGHT_BALL_TABLE_WIDTH / 2 - pocketX,
        EIGHT_BALL_TABLE_HEIGHT / 2 - pocketY,
      ) || 1;
      const inwardX = (EIGHT_BALL_TABLE_WIDTH / 2 - pocketX) / inwardLength;
      const inwardY = (EIGHT_BALL_TABLE_HEIGHT / 2 - pocketY) / inwardLength;
      let x = hasAuthoritativeEntry ? ball.x : previous.x;
      let y = hasAuthoritativeEntry ? ball.y : previous.y;
      // Captured pocket frames intentionally zero velocity, so reconstruct it
      // from the two preceding authoritative samples. If capture happened at
      // almost zero sampled displacement, use a straight continuation into the
      // throat—not a force that could curve/orbit around the hole.
      if (incomingSpeed < 30 && !hasAuthoritativeEntry) {
        const throatX = pocketX - x;
        const throatY = pocketY - y;
        const throatLength = Math.hypot(throatX, throatY) || 1;
        velocityX = throatX / throatLength * 420;
        velocityY = throatY / throatLength * 420;
      }
      const samples: PocketTransitSample[] = [];
      const sampleCount = Math.ceil(POCKET_TRANSIT_MAX_SECONDS * POCKET_TRANSIT_HZ);
      const step = 1 / POCKET_TRANSIT_HZ;
      const apertureRadius = renderScale > 0 ? POCKET_SIZE / 2 / renderScale : 545;
      const fullyInsideRadius = Math.max(0, apertureRadius - EIGHT_BALL_BALL_RADIUS);
      let enteredUnderTable = hasAuthoritativeEntry
        || Math.hypot(x - pocketX, y - pocketY) <= fullyInsideRadius;
      let rampStarted = false;
      // The visual ends at the exact point the constant-size ball has cleared
      // the visible aperture. This keeps the score row synchronized with the
      // final exposed pixel instead of an arbitrary fade timer.
      const visibleClearDistance = renderScale > 0
        ? POCKET_SIZE / 2 / renderScale + EIGHT_BALL_BALL_RADIUS
        : 720;
      for (let sampleIndex = 0; sampleIndex <= sampleCount; sampleIndex += 1) {
        samples.push({
          x,
          y,
          underTable: enteredUnderTable,
        });
        if (sampleIndex === sampleCount) break;
        if (!enteredUnderTable) {
          // Above the shelf there is no top-down gravity. The ball continues on
          // its incoming tangent until its complete silhouette fits through the
          // aperture, preventing the non-physical circling seen with a spring.
          const entryDrag = Math.max(0, 1 - 0.18 * step);
          velocityX *= entryDrag;
          velocityY *= entryDrag;
          x += velocityX * step;
          y += velocityY * step;
          const radialX = x - pocketX;
          const radialY = y - pocketY;
          const radialDistance = Math.hypot(radialX, radialY);
          if (radialDistance <= fullyInsideRadius) enteredUnderTable = true;
        } else {
          // The under-table ramp is a channel exactly one pocket wide. Work in
          // channel coordinates so its two walls can return a physical lateral
          // impulse while gravity accelerates the ball toward the table centre.
          let forwardVelocity = velocityX * inwardX + velocityY * inwardY;
          let lateralVelocity = -velocityX * inwardY + velocityY * inwardX;
          let forward = (x - pocketX) * inwardX + (y - pocketY) * inwardY;
          let lateral = -(x - pocketX) * inwardY + (y - pocketY) * inwardX;
          if (!rampStarted) {
            rampStarted = true;
            // Entry momentum usually points into the outside/back wall. It is
            // retained here and reflected only if it actually reaches that
            // wall; the ramp never attracts the ball around the aperture.
            forwardVelocity = velocityX * inwardX + velocityY * inwardY;
            lateralVelocity = -velocityX * inwardY + velocityY * inwardX;
          }
          forwardVelocity += 4100 * step;
          const rampDrag = Math.max(0, 1 - 0.82 * step);
          forwardVelocity *= rampDrag;
          lateralVelocity *= rampDrag;
          forward += forwardVelocity * step;
          lateral += lateralVelocity * step;
          const rearWall = -Math.max(120, fullyInsideRadius * 0.72);
          if (forward < rearWall) {
            forward = rearWall;
            if (forwardVelocity < 0) forwardVelocity *= -0.56;
          }
          if (Math.abs(lateral) > POCKET_CHANNEL_HALF_WIDTH) {
            const wallSign = Math.sign(lateral) || 1;
            lateral = wallSign * POCKET_CHANNEL_HALF_WIDTH;
            if (lateralVelocity * wallSign > 0) lateralVelocity *= -0.48;
          }
          x = pocketX + inwardX * forward - inwardY * lateral;
          y = pocketY + inwardY * forward + inwardX * lateral;
          velocityX = inwardX * forwardVelocity - inwardY * lateralVelocity;
          velocityY = inwardY * forwardVelocity + inwardX * lateralVelocity;

          if (forward > 0 && Math.hypot(x - pocketX, y - pocketY) >= visibleClearDistance) break;
        }
      }
      result.set(ball.number, {
        startsAtMs: hasAuthoritativeEntry ? frame.timeMs : previousFrame.timeMs,
        durationMs: Math.max(1, samples.length - 1) / POCKET_TRANSIT_HZ * 1000,
        samples,
      });
    }
  }
  return result;
}

function samplePocketTransit(transit: PocketTransit, elapsedMs: number): PocketTransitSample {
  const position = Math.max(0, Math.min(
    transit.samples.length - 1,
    elapsedMs / 1000 * POCKET_TRANSIT_HZ,
  ));
  const index = Math.floor(position);
  const blend = position - index;
  const current = transit.samples[index];
  const following = transit.samples[Math.min(transit.samples.length - 1, index + 1)];
  return {
    x: current.x + (following.x - current.x) * blend,
    y: current.y + (following.y - current.y) * blend,
    underTable: current.underTable,
  };
}

function playbackDurationMs(frames: EightBallSimulationFrames, transits: Map<number, PocketTransit>): number {
  let duration = 0;
  for (let frameIndex = 1; frameIndex < frames.length; frameIndex += 1) {
    const previous = frames[frameIndex - 1];
    const frame = frames[frameIndex];
    const elapsedSeconds = Math.max(1 / 240, (frame.timeMs - previous.timeMs) / 1000);
    const previousByNumber = new Map(previous.balls.map((ball) => [ball.number, ball]));
    const stillMoving = frame.balls.some((ball) => {
      const prior = previousByNumber.get(ball.number);
      if (!prior || ball.pocketed !== prior.pocketed) return true;
      if (ball.pocketed) return false;
      const reportedSpeed = Math.hypot(ball.vx ?? 0, ball.vy ?? 0);
      const sampledSpeed = Math.hypot(ball.x - prior.x, ball.y - prior.y) / elapsedSeconds;
      return Math.max(reportedSpeed, sampledSpeed) > VISUAL_STOP_SPEED;
    });
    if (stillMoving && Number.isFinite(frame.timeMs)) duration = frame.timeMs;
  }
  transits.forEach((transit) => {
    duration = Math.max(duration, transit.startsAtMs + transit.durationMs);
  });
  return Math.max(0, Math.min(MAX_VISUAL_PLAYBACK_MS, Number.isFinite(duration) ? duration : 0));
}
// Preserve the original 56-segment visual fidelity, but calculate the unit
// circle once instead of running sin/cos for every striped ball on every frame.
const STRIPE_UNIT_CIRCLE = Array.from({ length: 57 }, (_, index) => {
  const angle = index / 56 * Math.PI * 2;
  return { cosine: Math.cos(angle), sine: Math.sin(angle) };
});

interface PoolBallHandle {
  update: (
    left: number,
    top: number,
    pocketed: boolean,
    orientation?: BallOrientation,
    visual?: { underTable: boolean; hidden: boolean },
  ) => void;
}

interface NativeSvgNode {
  setNativeProps: (props: any) => void;
}

function multiplyOrientation(left: BallOrientation, right: BallOrientation): BallOrientation {
  return {
    w: left.w * right.w - left.x * right.x - left.y * right.y - left.z * right.z,
    x: left.w * right.x + left.x * right.w + left.y * right.z - left.z * right.y,
    y: left.w * right.y - left.x * right.z + left.y * right.w + left.z * right.x,
    z: left.w * right.z + left.x * right.y - left.y * right.x + left.z * right.w,
  };
}

function rollOrientation(current: BallOrientation, dx: number, dy: number): BallOrientation {
  const distance = Math.hypot(dx, dy);
  if (distance < 0.01) return current;
  const halfAngle = distance / EIGHT_BALL_BALL_RADIUS / 2;
  const sine = Math.sin(halfAngle);
  const delta = {
    w: Math.cos(halfAngle),
    x: -dy / distance * sine,
    y: dx / distance * sine,
    z: 0,
  };
  const next = multiplyOrientation(delta, current);
  const length = Math.hypot(next.w, next.x, next.y, next.z) || 1;
  return { w: next.w / length, x: next.x / length, y: next.y / length, z: next.z / length };
}

function rotateVector(orientation: BallOrientation, vector: { x: number; y: number; z: number }) {
  const pure = { w: 0, ...vector };
  const inverse = { w: orientation.w, x: -orientation.x, y: -orientation.y, z: -orientation.z };
  const rotated = multiplyOrientation(multiplyOrientation(orientation, pure), inverse);
  return { x: rotated.x, y: rotated.y, z: rotated.z };
}

function projectFrontNumberSpot(orientation: BallOrientation, size: number) {
  const positiveNormal = rotateVector(orientation, { x: 0, y: 0, z: 1 });
  const face = positiveNormal.z >= 0 ? 1 : -1;
  const normal = face === 1 ? positiveNormal : {
    x: -positiveNormal.x,
    y: -positiveNormal.y,
    z: -positiveNormal.z,
  };
  const tangentX = rotateVector(orientation, { x: face, y: 0, z: 0 });
  const tangentY = rotateVector(orientation, { x: 0, y: 1, z: 0 });
  const radius = size * 0.235;
  const surfaceRadius = size * 0.43;
  // A physical ball may have matching spots on opposite faces, but the camera
  // can never see both faces at once. Keeping one native SVG node also avoids
  // stale opacity updates briefly exposing the rear number under Fabric.
  return {
    a: tangentX.x * radius,
    b: tangentX.y * radius,
    c: tangentY.x * radius,
    d: tangentY.y * radius,
    e: size / 2 + normal.x * surfaceRadius,
    f: size / 2 + normal.y * surfaceRadius,
    visibility: Math.max(0, Math.min(1, normal.z * 7)),
  };
}

function projectStripePaths(orientation: BallOrientation, size: number) {
  const axisX = rotateVector(orientation, { x: 1, y: 0, z: 0 });
  const axisZ = rotateVector(orientation, { x: 0, y: 0, z: 1 });
  const radius = size * 0.475;
  const segments: Array<Array<{ x: number; y: number }>> = [];
  let current: Array<{ x: number; y: number }> = [];
  for (let index = 0; index < STRIPE_UNIT_CIRCLE.length; index += 1) {
    const { cosine, sine } = STRIPE_UNIT_CIRCLE[index];
    const point = {
      x: axisX.x * cosine + axisZ.x * sine,
      y: axisX.y * cosine + axisZ.y * sine,
      z: axisX.z * cosine + axisZ.z * sine,
    };
    if (point.z >= -0.015) {
      current.push({ x: size / 2 + point.x * radius, y: size / 2 + point.y * radius });
    } else if (current.length) {
      segments.push(current);
      current = [];
    }
  }
  if (current.length) segments.push(current);
  if (segments.length > 1 && segments[0][0] && segments[segments.length - 1][0]) {
    segments[0] = [...segments[segments.length - 1], ...segments[0]];
    segments.pop();
  }
  return segments.filter((segment) => segment.length > 1).map((segment) => segment
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" "));
}

function groupLabel(group: EightBallGroup) {
  return group === "OPEN" ? "Open table" : group === "SOLIDS" ? "Solids" : "Stripes";
}

function remainingGroupCount(balls: EightBallBall[], group: EightBallGroup) {
  return group === "OPEN"
    ? 7
    : balls.filter((ball) => !ball.pocketed && (group === "SOLIDS"
      ? ball.number >= 1 && ball.number <= 7
      : ball.number >= 9)).length;
}

function visiblePottedBallsForGroup(balls: EightBallBall[], group: Exclude<EightBallGroup, "OPEN">) {
  return balls
    .filter((ball) => ball.pocketed && ball.number !== 0 && ball.number !== 8)
    .map((ball) => ball.number)
    .filter((number) => group === "SOLIDS" ? number <= 7 : number >= 9)
    .sort((left, right) => left - right);
}

function defaultCuePlacement(balls: EightBallBall[]): CuePoint {
  for (let y = 7600; y <= 9000; y += 320) {
    for (let x = 2500; x >= 700; x -= 320) {
      if (isEightBallPlacementLegal(balls, x, y, 0)) return { x, y };
    }
  }
  return { x: 2500, y: 7900 };
}

function cuePlacementIsLegal(balls: EightBallBall[], point: CuePoint, breakShot: boolean) {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
  return breakShot
    ? isEightBallBreakPlacementLegal(balls, point.x, point.y)
    : isEightBallPlacementLegal(balls, point.x, point.y, 0);
}

function distanceToCushion(point: CuePoint, dx: number, dy: number) {
  let distance = Number.POSITIVE_INFINITY;
  if (dx > 0) distance = Math.min(distance, (EIGHT_BALL_TABLE_WIDTH - EIGHT_BALL_BALL_RADIUS - point.x) / dx);
  if (dx < 0) distance = Math.min(distance, (EIGHT_BALL_BALL_RADIUS - point.x) / dx);
  if (dy > 0) distance = Math.min(distance, (EIGHT_BALL_TABLE_HEIGHT - EIGHT_BALL_BALL_RADIUS - point.y) / dy);
  if (dy < 0) distance = Math.min(distance, (EIGHT_BALL_BALL_RADIUS - point.y) / dy);
  return Number.isFinite(distance) ? Math.max(0, distance) : 0;
}

function distanceToNextBall(point: CuePoint, dx: number, dy: number, balls: EightBallBall[], ignoredNumbers: Set<number>) {
  let distance = Number.POSITIVE_INFINITY;
  const diameter = EIGHT_BALL_BALL_RADIUS * 2;
  for (const ball of balls) {
    if (ball.pocketed || ignoredNumbers.has(ball.number)) continue;
    const offsetX = ball.x - point.x;
    const offsetY = ball.y - point.y;
    const projection = offsetX * dx + offsetY * dy;
    if (projection <= 0) continue;
    const perpendicularSquared = offsetX * offsetX + offsetY * offsetY - projection * projection;
    if (perpendicularSquared >= diameter * diameter) continue;
    const hit = projection - Math.sqrt(Math.max(0, diameter * diameter - perpendicularSquared));
    if (hit > 0) distance = Math.min(distance, hit);
  }
  return distance;
}

function projectedAim(cue: CuePoint, aimX: number, aimY: number, balls: EightBallBall[]) {
  const length = Math.hypot(aimX, aimY) || 1;
  const dx = aimX / length;
  const dy = aimY / length;
  const cushionDistance = distanceToCushion(cue, dx, dy);
  let ballDistance = Number.POSITIVE_INFINITY;
  let hitBall: EightBallBall | null = null;
  const radius = EIGHT_BALL_BALL_RADIUS * 2;
  for (const ball of balls) {
    if (ball.number === 0 || ball.pocketed) continue;
    const offsetX = ball.x - cue.x;
    const offsetY = ball.y - cue.y;
    const projection = offsetX * dx + offsetY * dy;
    if (projection <= 0) continue;
    const perpendicularSquared = offsetX * offsetX + offsetY * offsetY - projection * projection;
    if (perpendicularSquared > radius * radius) continue;
    const hit = projection - Math.sqrt(Math.max(0, radius * radius - perpendicularSquared));
    if (hit > 0 && hit < ballDistance) {
      ballDistance = hit;
      hitBall = ball;
    }
  }
  const hitsBallFirst = hitBall !== null && ballDistance <= cushionDistance;
  const distance = hitsBallFirst ? ballDistance : cushionDistance;
  const cueEnd = { x: cue.x + dx * distance, y: cue.y + dy * distance };
  let secondaryStart: CuePoint | null = null;
  let secondaryDirection: CuePoint | null = null;
  let secondaryStrength = 1;
  let secondaryMovingBall: number | null = null;
  if (hitsBallFirst && hitBall) {
    secondaryStart = { x: hitBall.x, y: hitBall.y };
    secondaryMovingBall = hitBall.number;
    const normalX = hitBall.x - cueEnd.x;
    const normalY = hitBall.y - cueEnd.y;
    const normalLength = Math.hypot(normalX, normalY) || 1;
    const unitNormalX = normalX / normalLength;
    const unitNormalY = normalY / normalLength;
    const transferredSpeed = Math.max(0, dx * unitNormalX + dy * unitNormalY);
    secondaryDirection = { x: unitNormalX, y: unitNormalY };
    secondaryStrength = transferredSpeed;
  } else {
    secondaryStart = cueEnd;
    const touchesVertical = Math.abs(cueEnd.x - EIGHT_BALL_BALL_RADIUS) < 2
      || Math.abs(cueEnd.x - (EIGHT_BALL_TABLE_WIDTH - EIGHT_BALL_BALL_RADIUS)) < 2;
    const touchesHorizontal = Math.abs(cueEnd.y - EIGHT_BALL_BALL_RADIUS) < 2
      || Math.abs(cueEnd.y - (EIGHT_BALL_TABLE_HEIGHT - EIGHT_BALL_BALL_RADIUS)) < 2;
    secondaryDirection = { x: touchesVertical ? -dx : dx, y: touchesHorizontal ? -dy : dy };
  }
  const nextBallDistance = secondaryStart && secondaryDirection && secondaryMovingBall !== null
    ? distanceToNextBall(secondaryStart, secondaryDirection.x, secondaryDirection.y, balls, new Set([0, secondaryMovingBall]))
    : Number.POSITIVE_INFINITY;
  const secondaryLength = secondaryStart && secondaryDirection
    ? Math.min(
      SECONDARY_GUIDE_LENGTH * secondaryStrength,
      distanceToCushion(secondaryStart, secondaryDirection.x, secondaryDirection.y),
      nextBallDistance,
    )
    : 0;
  return {
    cueEnd,
    secondaryStart,
    secondaryEnd: secondaryStart && secondaryDirection ? {
      x: secondaryStart.x + secondaryDirection.x * secondaryLength,
      y: secondaryStart.y + secondaryDirection.y * secondaryLength,
    } : null,
  };
}

export default function EightBall(props: GameViewProps) {
  if (props.game.type !== "EIGHT_BALL") return null;
  return <EightBallGame {...props} game={props.game} />;
}

function EightBallGame({
  game,
  account,
  sending,
  onMove,
  onPresentationBusyChange,
}: Omit<GameViewProps, "game"> & { game: EightBallGameSession }) {
  const initialReplayShots = game.state.recentShots?.filter((shot) => (
    shot.playerId === game.opponent.id && shot.startBalls?.length === 16
  )) ?? [];
  const initialReplayBalls = initialReplayShots[0]?.startBalls ?? game.state.balls;
  const authoritativeCue = game.state.balls.find((ball) => ball.number === 0);
  const placementEpoch = [
    game.state.shotNumber,
    game.waitingOn,
    game.state.ballInHandFor ?? "none",
    game.state.breakShot ? "break" : "open",
    authoritativeCue?.x ?? "missing",
    authoritativeCue?.y ?? "missing",
    authoritativeCue?.pocketed ? "pocketed" : "table",
  ].join(":");
  const defaultPlacement = useMemo(() => (
    game.state.breakShot && authoritativeCue
      ? { x: authoritativeCue.x, y: authoritativeCue.y }
      : defaultCuePlacement(game.state.balls)
  ), [authoritativeCue, game.state.balls, game.state.breakShot]);
  const cuePlacementScope = useMemo<LocalGameStateScope>(() => ({
    userId: account.id,
    gameId: game.id,
    gameType: "EIGHT_BALL",
    slot: "cue-placement",
  }), [account.id, game.id]);
  const initialLocalState = useMemo<EightBallLocalState>(() => ({
    placementEpoch,
    cuePlacement: null,
  }), [placementEpoch]);
  const [localState, setLocalState] = useLocalGameState<EightBallLocalState>(
    cuePlacementScope,
    initialLocalState,
  );
  const storedCuePlacement = localState.placementEpoch === placementEpoch
    && localState.cuePlacement
    && cuePlacementIsLegal(game.state.balls, localState.cuePlacement, game.state.breakShot)
    ? localState.cuePlacement
    : null;
  const cuePlacement = storedCuePlacement ?? defaultPlacement;
  const setCuePlacement = useCallback((point: CuePoint) => {
    setLocalState({ placementEpoch, cuePlacement: point });
  }, [placementEpoch, setLocalState]);
  const [tableSize, setTableSize] = useState<TableSize>({ width: 0, height: 0 });
  // An ended game can arrive with several unseen opponent shots. Initialize
  // directly from the first shot's table so the final black-ball state is
  // never painted for a frame before the replay effect runs.
  const [displayBalls, setDisplayBalls] = useState<EightBallBall[]>(initialReplayBalls);
  const [aim, setAim] = useState({ x: 0, y: -10000 });
  const [cueAngle, setCueAngle] = useState(-90);
  const [simulating, setSimulating] = useState(false);
  const [replayingOpponent, setReplayingOpponent] = useState(false);
  const [cueStriking, setCueStriking] = useState(false);
  const orientations = useRef<Record<number, BallOrientation>>(Object.fromEntries(
    game.state.balls.map((ball) => [ball.number, { ...IDENTITY_ORIENTATION }]),
  ));
  const animationFrame = useRef<number | null>(null);
  const animationWatchdog = useRef<ReturnType<typeof setTimeout> | null>(null);
  const simulatingRef = useRef(false);
  const latestServerBalls = useRef(game.state.balls);
  const authoritativeBalls = useRef(game.state.balls);
  const initialReplayCount = game.state.recentShots?.length ?? (game.state.lastShot ? 1 : 0);
  const observedShotNumber = useRef(Math.max(0, game.state.shotNumber - initialReplayCount));
  const initialServerSync = useRef(true);
  const replayQueue = useRef<QueuedOpponentShot[]>([]);
  const replayRunning = useRef(false);
  const activePocketTransits = useRef(new Map<number, PocketTransit>());
  const powerPull = useRef(new Animated.Value(0)).current;
  const cueStrike = useRef(new Animated.Value(0)).current;
  const cuePlacementRef = useRef(cuePlacement);
  const cuePointRef = useRef<CuePoint>(cuePlacement);
  const aimRef = useRef(aim);
  const cueAngleRef = useRef(-Math.PI / 2);
  const tableDragMode = useRef<"aim-from-cue" | "aim-to-point" | "cue">("aim-to-point");
  const tableDragStarted = useRef(false);
  const tableLastDragPoint = useRef<CuePoint | null>(null);
  const cuePlacementFrame = useRef<number | null>(null);
  const pendingCuePlacement = useRef<CuePoint | null>(null);
  const cuePlacementDirty = useRef(false);
  const lastCuePlacementPersistAt = useRef(0);
  const cuePlacementScopeRef = useRef(cuePlacementScope);
  const placementEpochRef = useRef(placementEpoch);
  const placementGuideRef = useRef<View>(null);
  const cuePivotRef = useRef<View>(null);
  const aimCueLineRef = useRef<NativeSvgNode | null>(null);
  const aimSecondaryLineRef = useRef<NativeSvgNode | null>(null);
  const aimTargetCircleRef = useRef<NativeSvgNode | null>(null);
  const tableFrameRef = useRef<View>(null);
  const tableFrameWindowOrigin = useRef({ x: 0, y: 0, ready: false });
  const tableFrameParentOffset = useRef({ x: 0, y: 0 });
  const pullDistance = useRef(0);
  const ballRefs = useRef(new Map<number, PoolBallHandle>());
  const renderedBallsRef = useRef<EightBallBall[]>(initialReplayBalls);
  const renderedPocketMask = useRef(initialReplayBalls.map((ball) => ball.pocketed ? "1" : "0").join(""));
  const tableGeometryRef = useRef({ originX: 0, originY: 0, scale: 0, ballSize: 0 });
  const statePhysicsVersion = game.state.physicsVersion ?? EIGHT_BALL_LEGACY_PHYSICS_VERSION;
  const physicsCompatible = statePhysicsVersion === EIGHT_BALL_LEGACY_PHYSICS_VERSION
    || statePhysicsVersion === EIGHT_BALL_V7_PHYSICS_VERSION
    || statePhysicsVersion === EIGHT_BALL_V8_PHYSICS_VERSION
    || statePhysicsVersion === EIGHT_BALL_V9_PHYSICS_VERSION;
  const isMyTurn = game.status === "STARTED" && game.waitingOn === account.id;
  const canInteract = physicsCompatible && isMyTurn && !sending && !simulating && !cueStriking;
  const showAimingCue = (isMyTurn && (!simulating || cueStriking))
    || (replayingOpponent && cueStriking);
  const hasBallInHand = game.state.ballInHandFor === account.id;
  const canPlaceCue = canInteract && (hasBallInHand || game.state.breakShot);
  const renderPlacedCue = (canInteract || (cueStriking && !replayingOpponent))
    && (hasBallInHand || game.state.breakShot);
  const myGroup = game.state.groups[String(account.id)] ?? "OPEN";
  const opponentGroup = game.state.groups[String(game.opponent.id)] ?? "OPEN";
  // Before groups are assigned, keep the two visual rows type-pure rather
  // than attributing every break pot to the shooter. Once assigned, these
  // display groups follow their real owners automatically.
  const myDisplayGroup: Exclude<EightBallGroup, "OPEN"> = myGroup === "OPEN" ? "SOLIDS" : myGroup;
  const opponentDisplayGroup: Exclude<EightBallGroup, "OPEN"> = opponentGroup === "OPEN" ? "STRIPES" : opponentGroup;
  const myVisiblePottedBalls = visiblePottedBallsForGroup(displayBalls, myDisplayGroup);
  const opponentVisiblePottedBalls = visiblePottedBallsForGroup(displayBalls, opponentDisplayGroup);

  // Native dragging intentionally avoids React renders. Do not let an
  // unrelated render overwrite the in-flight position with the last commit.
  if (!cuePlacementDirty.current) cuePlacementRef.current = cuePlacement;
  cuePlacementScopeRef.current = cuePlacementScope;
  placementEpochRef.current = placementEpoch;
  aimRef.current = aim;

  useEffect(() => () => {
    if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
    if (animationWatchdog.current !== null) clearTimeout(animationWatchdog.current);
    if (cuePlacementFrame.current !== null) cancelAnimationFrame(cuePlacementFrame.current);
    if (cuePlacementDirty.current) {
      const finalPoint = pendingCuePlacement.current ?? cuePlacementRef.current;
      void saveLocalGameState<EightBallLocalState>(cuePlacementScopeRef.current, {
        placementEpoch: placementEpochRef.current,
        cuePlacement: finalPoint,
      });
    }
  }, []);

  const cueBall = useMemo(() => {
    const serverCue = displayBalls.find((ball) => ball.number === 0);
    if (renderPlacedCue) return { ...(serverCue ?? { number: 0, vx: 0, vy: 0 }), ...cuePlacement, pocketed: false } as EightBallBall;
    return serverCue ?? null;
  }, [cuePlacement, displayBalls, renderPlacedCue]);
  if (cueBall) cuePointRef.current = { x: cueBall.x, y: cueBall.y };

  const renderSimulationPosition = useCallback((
    frames: EightBallSimulationFrames,
    position: number,
    previousBalls: EightBallSimulationFrames[number]["balls"],
    playbackTimeOverrideMs?: number,
  ) => {
    const index = Math.floor(position);
    const blend = position - index;
    const frame = frames[index];
    const followingFrame = frames[Math.min(frames.length - 1, index + 1)];
    if (!frame) return previousBalls;
    const playbackTimeMs = playbackTimeOverrideMs
      ?? frame.timeMs + (followingFrame.timeMs - frame.timeMs) * blend;
    const followingByNumber = new Array<EightBallSimulationFrames[number]["balls"][number] | undefined>(16);
    followingFrame?.balls.forEach((ball) => { followingByNumber[ball.number] = ball; });
    const previousByNumber = new Array<EightBallSimulationFrames[number]["balls"][number] | undefined>(16);
    previousBalls.forEach((ball) => { previousByNumber[ball.number] = ball; });
    const animatedBalls = frame.balls.map((ball) => {
      const following = followingByNumber[ball.number] ?? ball;
      const base = {
        number: ball.number,
        x: ball.x + (following.x - ball.x) * blend,
        y: ball.y + (following.y - ball.y) * blend,
        pocketed: ball.pocketed || (following.pocketed && blend > 0.82),
        visual: {
          underTable: ball.pocketIndex !== undefined,
          hidden: false,
        },
      };
      if (ball.pocketIndex !== undefined && tableGeometryRef.current.scale > 0) {
        const pocket = EIGHT_BALL_POCKETS[ball.pocketIndex];
        const visibleRadius = POCKET_SIZE / 2 / tableGeometryRef.current.scale
          + EIGHT_BALL_BALL_RADIUS;
        base.visual.hidden = Math.hypot(base.x - pocket.x, base.y - pocket.y) > visibleRadius;
      }
      const transit = activePocketTransits.current.get(ball.number);
      if (!transit) return base;
      // Until the exact authoritative full-clearance time, keep rendering the
      // interpolated approach. The generic pocket interpolation threshold used
      // to hide it during the final fraction of this interval, causing a flash.
      if (playbackTimeMs < transit.startsAtMs) return { ...base, pocketed: false };
      const transitElapsed = playbackTimeMs - transit.startsAtMs;
      if (transitElapsed >= transit.durationMs) return { ...base, pocketed: true };
      const visual = samplePocketTransit(transit, transitElapsed);
      return {
        ...base,
        x: visual.x,
        y: visual.y,
        pocketed: false,
        visual: { ...visual, hidden: false },
      };
    });
    const geometry = tableGeometryRef.current;
    animatedBalls.forEach((ball) => {
      const previous = previousByNumber[ball.number];
      const dx = previous ? ball.x - previous.x : 0;
      const dy = previous ? ball.y - previous.y : 0;
      let orientation: BallOrientation | undefined;
      if (!ball.pocketed && (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01)) {
        orientation = rollOrientation(
          orientations.current[ball.number] ?? IDENTITY_ORIENTATION,
          dx,
          dy,
        );
        orientations.current[ball.number] = orientation;
      }
      if (geometry.scale > 0 && (
        orientation
        || ball.pocketed !== previous?.pocketed
        || ball.visual.underTable
        || ball.visual.hidden
      )) {
        ballRefs.current.get(ball.number)?.update(
          geometry.originX + ball.x * geometry.scale - geometry.ballSize / 2,
          geometry.originY + ball.y * geometry.scale - geometry.ballSize / 2,
          ball.pocketed,
          orientation,
          ball.visual,
        );
      }
    });
    renderedBallsRef.current = animatedBalls.map((ball) => ({ ...ball, vx: 0, vy: 0 }));
    const pocketMask = animatedBalls.map((ball) => ball.pocketed ? "1" : "0").join("");
    if (pocketMask !== renderedPocketMask.current) {
      renderedPocketMask.current = pocketMask;
      // Scores and potted-ball rows are semantic UI, so React only needs to
      // hear about a frame when that semantic state changes.
      setDisplayBalls(renderedBallsRef.current);
    }
    return animatedBalls;
  }, []);

  const commitBallSnapshot = useCallback((balls: EightBallBall[]) => {
    const settled = balls.map((ball) => ({ ...ball, vx: 0, vy: 0 }));
    const geometry = tableGeometryRef.current;
    if (geometry.scale > 0) {
      settled.forEach((ball) => {
        ballRefs.current.get(ball.number)?.update(
          geometry.originX + ball.x * geometry.scale - geometry.ballSize / 2,
          geometry.originY + ball.y * geometry.scale - geometry.ballSize / 2,
          ball.pocketed,
          undefined,
          { underTable: false, hidden: false },
        );
      });
    }
    renderedBallsRef.current = settled;
    renderedPocketMask.current = settled.map((ball) => ball.pocketed ? "1" : "0").join("");
    setDisplayBalls(settled);
  }, []);

  const animateOpponentReplay = useCallback((
    frames: EightBallSimulationFrames,
    shotPower: number,
    onFinished?: () => void,
  ) => {
    if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
    if (animationWatchdog.current !== null) clearTimeout(animationWatchdog.current);
    if (frames.length === 0) {
      powerPull.setValue(0);
      cueStrike.setValue(0);
      setCueStriking(false);
      onFinished?.();
      return;
    }
    const startedAt = monotonicNow();
    let prior = frames[0]?.balls ?? [];
    let contactCommitted = false;
    const contactAt = OPPONENT_CUE_SETTLE_MS + OPPONENT_CUE_PULL_MS + OPPONENT_CUE_STRIKE_MS;
    activePocketTransits.current = buildPocketTransits(frames, tableGeometryRef.current.scale);
    const playbackDuration = playbackDurationMs(frames, activePocketTransits.current);
    let completed = false;
    const finish = () => {
      if (completed) return;
      completed = true;
      if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
      animationFrame.current = null;
      if (animationWatchdog.current !== null) clearTimeout(animationWatchdog.current);
      animationWatchdog.current = null;
      activePocketTransits.current.clear();
      powerPull.setValue(0);
      cueStrike.setValue(0);
      setCueStriking(false);
      onFinished?.();
    };
    animationWatchdog.current = setTimeout(
      finish,
      Math.min(MAX_VISUAL_PLAYBACK_MS, contactAt + playbackDuration) + ANIMATION_WATCHDOG_GRACE_MS,
    );
    const tick = () => {
      if (completed) return;
      try {
        const elapsed = monotonicNow() - startedAt;
        if (elapsed < OPPONENT_CUE_SETTLE_MS) {
          powerPull.setValue(0);
          cueStrike.setValue(0);
          animationFrame.current = requestAnimationFrame(tick);
          return;
        }
        if (elapsed < OPPONENT_CUE_SETTLE_MS + OPPONENT_CUE_PULL_MS) {
          const linear = (elapsed - OPPONENT_CUE_SETTLE_MS) / OPPONENT_CUE_PULL_MS;
          const eased = linear * linear * (3 - 2 * linear);
          powerPull.setValue(shotPower * eased);
          cueStrike.setValue(0);
          animationFrame.current = requestAnimationFrame(tick);
          return;
        }
        if (elapsed < contactAt) {
          const linear = (elapsed - OPPONENT_CUE_SETTLE_MS - OPPONENT_CUE_PULL_MS) / OPPONENT_CUE_STRIKE_MS;
          const eased = 1 - (1 - linear) ** 3;
          powerPull.setValue(shotPower * (1 - eased));
          cueStrike.setValue(eased);
          animationFrame.current = requestAnimationFrame(tick);
          return;
        }
        if (!contactCommitted) {
          contactCommitted = true;
          powerPull.setValue(0);
          cueStrike.setValue(0);
          setCueStriking(false);
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
        const physicsElapsed = elapsed - contactAt + CONTACT_VISUAL_LEAD_MS;
        const position = playbackPositionAtTime(frames, physicsElapsed);
        prior = renderSimulationPosition(frames, position, prior, physicsElapsed);
        if (physicsElapsed < playbackDuration) {
          animationFrame.current = requestAnimationFrame(tick);
        } else {
          finish();
        }
      } catch {
        finish();
      }
    };
    tick();
  }, [cueStrike, powerPull, renderSimulationPosition]);

  const playQueuedOpponentShots = useCallback(() => {
    if (replayRunning.current || replayQueue.current.length === 0) return;
    replayRunning.current = true;
    simulatingRef.current = true;
    setSimulating(true);
    setReplayingOpponent(true);
    onPresentationBusyChange?.(true);

    const finishSequence = () => {
      replayRunning.current = false;
      simulatingRef.current = false;
      activePocketTransits.current.clear();
      powerPull.setValue(0);
      cueStrike.setValue(0);
      setCueStriking(false);
      setSimulating(false);
      setReplayingOpponent(false);
      commitBallSnapshot(latestServerBalls.current);
      onPresentationBusyChange?.(false);
    };

    const playNext = () => {
      const queued = replayQueue.current.shift();
      if (!queued) {
        finishSequence();
        return;
      }
      const { shot } = queued;
      if (!Number.isFinite(shot.aimX) || !Number.isFinite(shot.aimY)) {
        playNext();
        return;
      }
      const replayStart = shot.startBalls?.length === 16 ? shot.startBalls : queued.fallbackBalls;
      const replayInput = replayStart.map((ball) => ball.number === 0
        && shot.cueX !== undefined
        && shot.cueY !== undefined
        ? { ...ball, x: shot.cueX, y: shot.cueY, pocketed: false }
        : ball);
      try {
        const replayShot = { aimX: shot.aimX!, aimY: shot.aimY!, power: shot.power };
        const replayPhysicsVersion = shot.physicsVersion ?? EIGHT_BALL_LEGACY_PHYSICS_VERSION;
        const replayFrames = replayPhysicsVersion === EIGHT_BALL_V9_PHYSICS_VERSION
          ? v9PlaybackFrames(simulateEightBallShotV9(replayInput, replayShot, { captureHz: V7_CAPTURE_HZ }).frames ?? [])
          : replayPhysicsVersion === EIGHT_BALL_V8_PHYSICS_VERSION
            ? v8PlaybackFrames(simulateEightBallShotV8(replayInput, replayShot, { captureHz: V7_CAPTURE_HZ }).frames ?? [])
            : replayPhysicsVersion === EIGHT_BALL_V7_PHYSICS_VERSION
              ? v7PlaybackFrames(simulateEightBallShotV7(replayInput, replayShot, { captureHz: V7_CAPTURE_HZ }).frames ?? [])
              : legacyPlaybackFrames(simulateLegacyEightBallShot(replayInput, replayShot, { captureEvery: 4 }).frames ?? []);
        const replayAngle = Math.atan2(replayShot.aimY, replayShot.aimX);
        const replayAim = { x: replayShot.aimX, y: replayShot.aimY };
        aimRef.current = replayAim;
        cueAngleRef.current = replayAngle;
        setAim(replayAim);
        setCueAngle(replayAngle * 180 / Math.PI);
        commitBallSnapshot(replayInput);
        setCueStriking(true);
        powerPull.setValue(0);
        cueStrike.setValue(0);
        animateOpponentReplay(replayFrames, shot.power, () => {
          playNext();
        });
      } catch {
        playNext();
      }
    };

    playNext();
  }, [animateOpponentReplay, commitBallSnapshot, cueStrike, onPresentationBusyChange, powerPull]);

  useLayoutEffect(() => {
    const priorBalls = authoritativeBalls.current;
    const isInitialSync = initialServerSync.current;
    initialServerSync.current = false;
    latestServerBalls.current = game.state.balls;
    authoritativeBalls.current = game.state.balls;
    const recentShots = game.state.recentShots?.length
      ? game.state.recentShots
      : game.state.lastShot ? [game.state.lastShot] : [];
    const firstShotNumber = Math.max(1, game.state.shotNumber - recentShots.length + 1);
    recentShots.forEach((shot, index) => {
      const shotNumber = Number.isInteger(shot.shotNumber) ? shot.shotNumber! : firstShotNumber + index;
      if (shotNumber <= observedShotNumber.current) return;
      observedShotNumber.current = shotNumber;
      if (shot.playerId !== game.opponent.id) return;
      if (isInitialSync && shot.startBalls?.length !== 16) return;
      replayQueue.current.push({ shot: { ...shot, shotNumber }, fallbackBalls: priorBalls });
    });
    playQueuedOpponentShots();

    if (!simulatingRef.current && replayQueue.current.length === 0) {
      commitBallSnapshot(game.state.balls);
    }

  }, [account.id, commitBallSnapshot, game.opponent.id, game.state.ballInHandFor, game.state.balls, game.state.breakShot, game.state.lastShot, game.state.recentShots, game.state.shotNumber, game.version, playQueuedOpponentShots]);

  const skipReplay = useCallback(() => {
    if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
    animationFrame.current = null;
    if (animationWatchdog.current !== null) clearTimeout(animationWatchdog.current);
    animationWatchdog.current = null;
    simulatingRef.current = false;
    replayRunning.current = false;
    replayQueue.current = [];
    activePocketTransits.current.clear();
    powerPull.stopAnimation();
    cueStrike.stopAnimation();
    powerPull.setValue(0);
    cueStrike.setValue(0);
    setSimulating(false);
    setReplayingOpponent(false);
    setCueStriking(false);
    commitBallSnapshot(latestServerBalls.current);
    onPresentationBusyChange?.(false);
  }, [commitBallSnapshot, cueStrike, onPresentationBusyChange, powerPull]);

  const prepareShot = useCallback((shotPower: number) => {
    if (!canInteract || !cueBall || shotPower < 40) throw new Error("Invalid shot");
    const shot = {
      kind: "shot",
      physicsVersion: statePhysicsVersion,
      aimX: Math.round(aimRef.current.x),
      aimY: Math.round(aimRef.current.y),
      power: Math.max(1, Math.min(EIGHT_BALL_MAX_POWER, Math.round(shotPower))),
      ...(canPlaceCue ? { cueX: Math.round(cuePlacementRef.current.x), cueY: Math.round(cuePlacementRef.current.y) } : {}),
    } as const;
    const input = game.state.balls.map((ball) => ball.number === 0 && canPlaceCue
      ? { ...ball, ...cuePlacementRef.current, pocketed: false }
      : ball);
    if (statePhysicsVersion === EIGHT_BALL_V9_PHYSICS_VERSION) {
      const simulation = simulateEightBallShotV9(input, shot, { captureHz: V7_CAPTURE_HZ });
      return { shot, frames: v9PlaybackFrames(simulation.frames ?? []), finalBalls: simulation.balls };
    }
    if (statePhysicsVersion === EIGHT_BALL_V8_PHYSICS_VERSION) {
      const simulation = simulateEightBallShotV8(input, shot, { captureHz: V7_CAPTURE_HZ });
      return { shot, frames: v8PlaybackFrames(simulation.frames ?? []), finalBalls: simulation.balls };
    }
    if (statePhysicsVersion === EIGHT_BALL_V7_PHYSICS_VERSION) {
      const simulation = simulateEightBallShotV7(input, shot, { captureHz: V7_CAPTURE_HZ });
      return { shot, frames: v7PlaybackFrames(simulation.frames ?? []), finalBalls: simulation.balls };
    }
    const simulation = simulateLegacyEightBallShot(input, shot, { captureEvery: 4 });
    return { shot, frames: legacyPlaybackFrames(simulation.frames ?? []), finalBalls: simulation.balls };
  }, [canInteract, canPlaceCue, cueBall, game.state.balls, statePhysicsVersion]);

  const animateLocalShot = useCallback((
    prepared: NonNullable<ReturnType<typeof prepareShot>>,
    shotPower: number,
  ) => {
    if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
    if (animationWatchdog.current !== null) clearTimeout(animationWatchdog.current);
    const frames = prepared.frames;
    if (frames.length === 0) throw new Error("Shot produced no animation");
    onPresentationBusyChange?.(true);
    const startedAt = monotonicNow();
    let contactAt: number | null = null;
    let prior = frames[0].balls;
    let networkStarted = false;
    let cueHidden = false;
    activePocketTransits.current = buildPocketTransits(frames, tableGeometryRef.current.scale);
    const playbackDuration = playbackDurationMs(frames, activePocketTransits.current);
    const startNetwork = () => {
      if (networkStarted) return;
      networkStarted = true;
      onMove(prepared.shot);
    };
    let completed = false;
    const finish = () => {
      if (completed) return;
      completed = true;
      if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
      animationFrame.current = null;
      if (animationWatchdog.current !== null) clearTimeout(animationWatchdog.current);
      animationWatchdog.current = null;
      startNetwork();
      simulatingRef.current = false;
      activePocketTransits.current.clear();
      powerPull.setValue(0);
      cueStrike.setValue(0);
      setCueStriking(false);
      setSimulating(false);
      commitBallSnapshot(prepared.finalBalls);
      onPresentationBusyChange?.(false);
    };
    animationWatchdog.current = setTimeout(
      finish,
      Math.min(MAX_VISUAL_PLAYBACK_MS, LOCAL_STRIKE_DURATION_MS + playbackDuration) + ANIMATION_WATCHDOG_GRACE_MS,
    );
    const tick = () => {
      if (completed) return;
      try {
        const now = monotonicNow();
        if (contactAt === null) {
          const strikeProgress = Math.min(1, (now - startedAt) / LOCAL_STRIKE_DURATION_MS);
          powerPull.setValue(shotPower * (1 - strikeProgress));
          cueStrike.setValue(strikeProgress);
          if (strikeProgress < 1) {
            animationFrame.current = requestAnimationFrame(tick);
            return;
          }
          // Contact and the first non-zero ball displacement are committed by
          // this same clock tick—there is no stationary frame-zero handoff.
          contactAt = now;
          simulatingRef.current = true;
          setSimulating(true);
          prior = renderSimulationPosition(
            frames,
            playbackPositionAtTime(frames, CONTACT_VISUAL_LEAD_MS),
            prior,
            CONTACT_VISUAL_LEAD_MS,
          );
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          animationFrame.current = requestAnimationFrame(tick);
          return;
        }

        const physicsElapsed = now - contactAt + CONTACT_VISUAL_LEAD_MS;
        const position = playbackPositionAtTime(frames, physicsElapsed);
        prior = renderSimulationPosition(frames, position, prior, physicsElapsed);
        if (!cueHidden) {
          cueHidden = true;
          cueStrike.setValue(0);
          setCueStriking(false);
        }
        // Start persistence only after the contact frame has been committed.
        startNetwork();
        if (physicsElapsed < playbackDuration) {
          animationFrame.current = requestAnimationFrame(tick);
        } else {
          finish();
        }
      } catch {
        finish();
      }
    };
    tick();
  }, [commitBallSnapshot, cueStrike, onMove, onPresentationBusyChange, powerPull, prepareShot, renderSimulationPosition]);

  const livePower = useRef(0);
  const resetCuePull = useCallback(() => {
    livePower.current = 0;
    pullDistance.current = 0;
    setCueStriking(false);
    Animated.parallel([
      Animated.spring(powerPull, { toValue: 0, speed: 28, bounciness: 0, useNativeDriver: true }),
      Animated.timing(cueStrike, { toValue: 0, duration: 80, useNativeDriver: true }),
    ]).start();
  }, [cueStrike, powerPull]);

  const releaseCue = useCallback(() => {
    const shotPower = livePower.current;
    if (pullDistance.current <= POWER_CANCEL_DISTANCE || shotPower < 40) {
      resetCuePull();
      return;
    }
    setCueStriking(true);
    livePower.current = 0;
    pullDistance.current = 0;
    try {
      const prepared = prepareShot(shotPower);
      animateLocalShot(prepared, shotPower);
    } catch {
      resetCuePull();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [animateLocalShot, prepareShot, resetCuePull]);

  const powerResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => canInteract,
    onMoveShouldSetPanResponder: () => canInteract,
    onPanResponderGrant: () => {
      livePower.current = 0;
      pullDistance.current = 0;
      powerPull.setValue(0);
      void Haptics.selectionAsync();
    },
    onPanResponderMove: (_event, gesture) => {
      const downwardDistance = Math.max(0, gesture.dy);
      pullDistance.current = downwardDistance;
      const dragProgress = Math.min(1, downwardDistance / MAX_POWER_DRAG);
      // Diminishing travel makes the last part of the pull require noticeably
      // more finger movement, like tension building in the stroke.
      const resistance = (1 - Math.exp(-2.35 * dragProgress)) / (1 - Math.exp(-2.35));
      const next = resistance * EIGHT_BALL_MAX_POWER;
      livePower.current = next;
      powerPull.setValue(next);
    },
    onPanResponderRelease: releaseCue,
    onPanResponderTerminationRequest: () => false,
    onPanResponderTerminate: resetCuePull,
  }), [canInteract, powerPull, releaseCue, resetCuePull]);

  const tableInnerWidth = Math.max(0, tableSize.width - TABLE_FRAME_BORDER * 2);
  const tableInnerHeight = Math.max(0, tableSize.height - TABLE_FRAME_BORDER * 2);
  const tableScale = Math.max(0, Math.min(
    (tableInnerWidth - TABLE_INSET * 2 - CUSHION_DEPTH * 2) / EIGHT_BALL_TABLE_WIDTH,
    (tableInnerHeight - TABLE_INSET * 2 - CUSHION_DEPTH * 2) / EIGHT_BALL_TABLE_HEIGHT,
  ));
  const playWidth = EIGHT_BALL_TABLE_WIDTH * tableScale;
  const playHeight = EIGHT_BALL_TABLE_HEIGHT * tableScale;
  const surfaceWidth = playWidth + CUSHION_DEPTH * 2;
  const surfaceHeight = playHeight + CUSHION_DEPTH * 2;
  const surfaceOriginX = (tableInnerWidth - surfaceWidth) / 2;
  const surfaceOriginY = (tableInnerHeight - surfaceHeight) / 2;
  const tableOriginX = surfaceOriginX + CUSHION_DEPTH;
  const tableOriginY = surfaceOriginY + CUSHION_DEPTH;

  function tablePoint(event: GestureResponderEvent): CuePoint | null {
    if (!tableScale) return null;
    const frameOrigin = tableFrameWindowOrigin.current;
    const localX = frameOrigin.ready
      ? event.nativeEvent.pageX - frameOrigin.x
      : event.nativeEvent.locationX - tableFrameParentOffset.current.x;
    const localY = frameOrigin.ready
      ? event.nativeEvent.pageY - frameOrigin.y
      : event.nativeEvent.locationY - tableFrameParentOffset.current.y;
    const x = (localX - TABLE_FRAME_BORDER - tableOriginX) / tableScale;
    const y = (localY - TABLE_FRAME_BORDER - tableOriginY) / tableScale;
    return { x: Math.round(x), y: Math.round(y) };
  }

  function measureTableFrame() {
    tableFrameRef.current?.measureInWindow((x, y) => {
      tableFrameWindowOrigin.current = { x, y, ready: true };
    });
  }

  function rotateAimFromDrag(previousPoint: CuePoint, point: CuePoint) {
    const cue = cuePointRef.current;
    const previousX = previousPoint.x - cue.x;
    const previousY = previousPoint.y - cue.y;
    const nextX = point.x - cue.x;
    const nextY = point.y - cue.y;
    const minimumRadius = Math.max(EIGHT_BALL_BALL_RADIUS * 1.25, 16 / Math.max(tableScale, 0.001));
    if (Math.hypot(previousX, previousY) < minimumRadius || Math.hypot(nextX, nextY) < minimumRadius) return;
    let delta = Math.atan2(nextY, nextX) - Math.atan2(previousY, previousX);
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    cueAngleRef.current += delta * AIM_DRAG_SENSITIVITY;
    const next = {
      x: Math.round(Math.cos(cueAngleRef.current) * 10000),
      y: Math.round(Math.sin(cueAngleRef.current) * 10000),
    };
    aimRef.current = next;
    setAim(next);
    setCueAngle(cueAngleRef.current * 180 / Math.PI);
  }

  function isTouchingCueHandle(point: CuePoint) {
    if (!tableScale) return false;
    const cue = cuePointRef.current;
    const offsetX = point.x - cue.x;
    const offsetY = point.y - cue.y;
    const aimX = aimRef.current.x / 10000;
    const aimY = aimRef.current.y / 10000;
    const behindDistance = -(offsetX * aimX + offsetY * aimY);
    const perpendicularDistance = Math.abs(offsetX * aimY - offsetY * aimX);
    const handleStart = EIGHT_BALL_BALL_RADIUS + 5 / tableScale;
    const handleEnd = handleStart + 174 / tableScale;
    return behindDistance >= handleStart
      && behindDistance <= handleEnd
      && perpendicularDistance <= 15 / tableScale;
  }

  function renderCuePlacementNative(point: CuePoint) {
    const geometry = tableGeometryRef.current;
    if (geometry.scale <= 0) return;
    const centerX = geometry.originX + point.x * geometry.scale;
    const centerY = geometry.originY + point.y * geometry.scale;
    ballRefs.current.get(0)?.update(
      centerX - geometry.ballSize / 2,
      centerY - geometry.ballSize / 2,
      false,
      undefined,
      { underTable: false, hidden: false },
    );
    const guideSize = Math.max(66, geometry.ballSize * 3.5);
    placementGuideRef.current?.setNativeProps({
      style: {
        left: centerX - guideSize / 2,
        top: centerY - guideSize / 2,
      },
    });
    cuePivotRef.current?.setNativeProps({
      style: {
        left: centerX,
        top: centerY,
        transform: [{ rotate: `${cueAngleRef.current * 180 / Math.PI}deg` }],
      },
    });

    const projection = projectedAim(point, aimRef.current.x, aimRef.current.y, renderedBallsRef.current);
    const mapX = (x: number) => geometry.originX + x * geometry.scale;
    const mapY = (y: number) => geometry.originY + y * geometry.scale;
    aimCueLineRef.current?.setNativeProps({
      x1: centerX,
      y1: centerY,
      x2: mapX(projection.cueEnd.x),
      y2: mapY(projection.cueEnd.y),
    });
    if (projection.secondaryStart && projection.secondaryEnd) {
      aimSecondaryLineRef.current?.setNativeProps({
        x1: mapX(projection.secondaryStart.x),
        y1: mapY(projection.secondaryStart.y),
        x2: mapX(projection.secondaryEnd.x),
        y2: mapY(projection.secondaryEnd.y),
        opacity: 1,
      });
    } else {
      aimSecondaryLineRef.current?.setNativeProps({ opacity: 0 });
    }
    aimTargetCircleRef.current?.setNativeProps({
      cx: mapX(projection.cueEnd.x),
      cy: mapY(projection.cueEnd.y),
    });
  }

  function scheduleCuePlacement(point: CuePoint) {
    cuePlacementRef.current = point;
    cuePointRef.current = point;
    pendingCuePlacement.current = point;
    cuePlacementDirty.current = true;
    if (cuePlacementFrame.current !== null) return;
    cuePlacementFrame.current = requestAnimationFrame(() => {
      cuePlacementFrame.current = null;
      const pending = pendingCuePlacement.current;
      pendingCuePlacement.current = null;
      if (pending) {
        renderCuePlacementNative(pending);
        const now = monotonicNow();
        if (now - lastCuePlacementPersistAt.current >= CUE_PLACEMENT_PERSIST_INTERVAL_MS) {
          lastCuePlacementPersistAt.current = now;
          void saveLocalGameState<EightBallLocalState>(cuePlacementScopeRef.current, {
            placementEpoch: placementEpochRef.current,
            cuePlacement: pending,
          });
        }
      }
    });
  }

  function commitCuePlacement() {
    if (cuePlacementFrame.current !== null) {
      cancelAnimationFrame(cuePlacementFrame.current);
      cuePlacementFrame.current = null;
    }
    const finalPoint = pendingCuePlacement.current ?? cuePlacementRef.current;
    pendingCuePlacement.current = null;
    renderCuePlacementNative(finalPoint);
    setCuePlacement(finalPoint);
    lastCuePlacementPersistAt.current = monotonicNow();
    cuePlacementDirty.current = false;
  }

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active" && cuePlacementDirty.current) commitCuePlacement();
    });
    return () => subscription.remove();
  }, [placementEpoch]);

  const tableResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => canInteract,
    onMoveShouldSetPanResponder: () => canInteract,
    onPanResponderGrant: (event) => {
      const point = tablePoint(event);
      if (!point) return;
      tableDragStarted.current = false;
      tableLastDragPoint.current = point;
      const cue = cuePointRef.current;
      const distanceFromCueBall = Math.hypot(point.x - cue.x, point.y - cue.y);
      const placementGuideRadius = Math.max(
        EIGHT_BALL_BALL_RADIUS * 1.75,
        42 / Math.max(tableScale, 0.001),
      );
      if (canPlaceCue && distanceFromCueBall <= placementGuideRadius && !isTouchingCueHandle(point)) {
        tableDragMode.current = "cue";
        return;
      }
      const offsetX = point.x - cue.x;
      const offsetY = point.y - cue.y;
      const isBehindCurrentCue = offsetX * aimRef.current.x + offsetY * aimRef.current.y < 0;
      tableDragMode.current = isBehindCurrentCue ? "aim-from-cue" : "aim-to-point";
    },
    onPanResponderMove: (event, gesture) => {
      const point = tablePoint(event);
      if (!point) return;
      if (!tableDragStarted.current) {
        if (Math.hypot(gesture.dx, gesture.dy) < TABLE_DRAG_THRESHOLD) return;
        tableDragStarted.current = true;
      }
      if (canPlaceCue && tableDragMode.current === "cue") {
        const placementIsLegal = game.state.breakShot
          ? isEightBallBreakPlacementLegal(game.state.balls, point.x, point.y)
          : isEightBallPlacementLegal(game.state.balls, point.x, point.y, 0);
        if (placementIsLegal) scheduleCuePlacement(point);
      } else if (tableDragMode.current !== "cue") {
        const previousPoint = tableLastDragPoint.current;
        if (previousPoint) rotateAimFromDrag(previousPoint, point);
      }
      tableLastDragPoint.current = point;
    },
    onPanResponderRelease: () => {
      if (tableDragMode.current === "cue" && tableDragStarted.current) commitCuePlacement();
      tableDragStarted.current = false;
      tableLastDragPoint.current = null;
    },
    onPanResponderTerminate: () => {
      if (tableDragMode.current === "cue" && tableDragStarted.current) commitCuePlacement();
      tableDragStarted.current = false;
      tableLastDragPoint.current = null;
    },
    onPanResponderTerminationRequest: () => false,
  }), [canInteract, canPlaceCue, game.state.balls, game.state.breakShot, tableOriginX, tableOriginY, tableScale]);

  const aimProjection = cueBall ? projectedAim(cueBall, aim.x, aim.y, displayBalls) : null;
  const mapTableX = (x: number) => tableOriginX + x * tableScale;
  const mapTableY = (y: number) => tableOriginY + y * tableScale;
  const ballSize = EIGHT_BALL_BALL_RADIUS * 2 * tableScale;
  tableGeometryRef.current = {
    originX: tableOriginX,
    originY: tableOriginY,
    scale: tableScale,
    ballSize,
  };
  useEffect(() => {
    const geometry = tableGeometryRef.current;
    if (geometry.scale <= 0) return;
    displayBalls.forEach((ball) => {
      const rendered = ball.number === 0 && renderPlacedCue
        ? { ...ball, ...cuePlacement, pocketed: false }
        : ball;
      ballRefs.current.get(rendered.number)?.update(
        geometry.originX + rendered.x * geometry.scale - geometry.ballSize / 2,
        geometry.originY + rendered.y * geometry.scale - geometry.ballSize / 2,
        rendered.pocketed,
      );
    });
    renderedBallsRef.current = displayBalls;
    renderedPocketMask.current = displayBalls.map((ball) => ball.pocketed ? "1" : "0").join("");
  }, [cuePlacement, displayBalls, renderPlacedCue, tableOriginX, tableOriginY, tableScale, ballSize]);
  const shotStatus = game.state.lastShot?.foul
    ? `${game.state.lastShot.playerId === account.id ? "You" : game.opponent.displayName} fouled · ${game.state.lastShot.foul}`
    : game.state.breakShot ? "Break · place behind the line" : hasBallInHand ? "Ball in hand · place anywhere" : `${groupLabel(myGroup)} · aim, then pull the cue`;

  return (
    <View style={styles.root}>
      <View style={styles.scoreHeader}>
        <TurnBasedGameHeader
          player={{
            user: account,
            label: "YOU",
            score: remainingGroupCount(displayBalls, myDisplayGroup),
            active: game.waitingOn === account.id,
          }}
          opponent={{
            user: game.opponent,
            label: game.opponent.displayName.toUpperCase(),
            score: remainingGroupCount(displayBalls, opponentDisplayGroup),
            active: game.waitingOn === game.opponent.id,
          }}
          centerAccessory={(
            <Text style={styles.shotStatus} numberOfLines={2}>
              {simulating ? (replayingOpponent ? `${game.opponent.displayName} is shooting…` : "Balls rolling…") : shotStatus}
            </Text>
          )}
        />
        <View pointerEvents="none" style={styles.poolDetailsRow}>
          <PlayerPoolDetails
            pottedBalls={myVisiblePottedBalls}
          />
          <PlayerPoolDetails
            pottedBalls={opponentVisiblePottedBalls}
            reverse
          />
        </View>
      </View>

      <View style={styles.tableStage} {...tableResponder.panHandlers}>
        <View
          ref={tableFrameRef}
          style={styles.tableFrame}
          onLayout={(event) => {
            const layout = event.nativeEvent.layout;
            tableFrameParentOffset.current = { x: layout.x, y: layout.y };
            setTableSize(layout);
            requestAnimationFrame(measureTableFrame);
          }}
        >
          <View style={styles.tableClip}>
            <View pointerEvents="none" style={styles.railInner} />
            <View style={[styles.cloth, {
              left: surfaceOriginX,
              top: surfaceOriginY,
              width: surfaceWidth,
              height: surfaceHeight,
            }]} />
            <PocketBackingLayer
              width={tableInnerWidth}
              height={tableInnerHeight}
              surfaceLeft={surfaceOriginX}
              surfaceTop={surfaceOriginY}
              surfaceWidth={surfaceWidth}
              surfaceHeight={surfaceHeight}
              pocketLeft={tableOriginX}
              pocketTop={tableOriginY}
              pocketWidth={playWidth}
              pocketHeight={playHeight}
            />

            <TableCushions
              left={surfaceOriginX}
              top={surfaceOriginY}
              width={surfaceWidth}
              height={surfaceHeight}
            />

          {game.state.breakShot && canInteract && (
            <View pointerEvents="none" style={[styles.headString, {
              left: tableOriginX,
              top: mapTableY(EIGHT_BALL_HEAD_STRING_Y),
              width: playWidth,
            }]} />
          )}

          {cueBall && aimProjection && canInteract && (
            <Svg pointerEvents="none" style={styles.aimGuide} width={tableInnerWidth} height={tableInnerHeight}>
              <Line
                ref={(node) => { aimCueLineRef.current = node; }}
                x1={mapTableX(cueBall.x)}
                y1={mapTableY(cueBall.y)}
                x2={mapTableX(aimProjection.cueEnd.x)}
                y2={mapTableY(aimProjection.cueEnd.y)}
                stroke="rgba(255,255,255,0.76)"
                strokeWidth={1.7}
              />
              {aimProjection.secondaryStart && aimProjection.secondaryEnd && (
                <Line
                  ref={(node) => { aimSecondaryLineRef.current = node; }}
                  x1={mapTableX(aimProjection.secondaryStart.x)}
                  y1={mapTableY(aimProjection.secondaryStart.y)}
                  x2={mapTableX(aimProjection.secondaryEnd.x)}
                  y2={mapTableY(aimProjection.secondaryEnd.y)}
                  stroke="rgba(255,255,255,0.5)"
                  strokeWidth={1.35}
                />
              )}
              <Circle
                ref={(node) => { aimTargetCircleRef.current = node; }}
                cx={mapTableX(aimProjection.cueEnd.x)}
                cy={mapTableY(aimProjection.cueEnd.y)}
                r={Math.max(5, ballSize / 2)}
                stroke="rgba(255,255,255,0.45)"
                strokeWidth={1}
                fill="transparent"
              />
            </Svg>
          )}

          {displayBalls.map((ball) => {
            const rendered = ball.number === 0 && renderPlacedCue ? { ...ball, ...cuePlacement, pocketed: false } : ball;
            return (
              <PoolBall
                key={rendered.number}
                ref={(handle) => {
                  if (handle) ballRefs.current.set(rendered.number, handle);
                  else ballRefs.current.delete(rendered.number);
                }}
                ball={rendered}
                size={ballSize}
                left={mapTableX(rendered.x) - ballSize / 2}
                top={mapTableY(rendered.y) - ballSize / 2}
                orientation={orientations.current[rendered.number] ?? IDENTITY_ORIENTATION}
              />
            );
          })}

          <PocketOcclusionLayer
            width={tableInnerWidth}
            height={tableInnerHeight}
            surfaceLeft={surfaceOriginX}
            surfaceTop={surfaceOriginY}
            surfaceWidth={surfaceWidth}
            surfaceHeight={surfaceHeight}
            pocketLeft={tableOriginX}
            pocketTop={tableOriginY}
            pocketWidth={playWidth}
            pocketHeight={playHeight}
          />

            {cueBall && canPlaceCue && (
              <CuePlacementGuide
                ref={placementGuideRef}
                size={Math.max(66, ballSize * 3.5)}
                left={mapTableX(cueBall.x)}
                top={mapTableY(cueBall.y)}
              />
            )}
          </View>

          {cueBall && showAimingCue && (
            <View ref={cuePivotRef} pointerEvents="none" style={[styles.cuePivot, {
              left: mapTableX(cueBall.x),
              top: mapTableY(cueBall.y),
              transform: [{ rotate: `${cueAngle}deg` }],
            }]}>
              <Animated.View style={[styles.cueStick, {
                right: ballSize / 2 + 8,
                transform: [{
                  translateX: Animated.add(
                    powerPull.interpolate({
                      inputRange: [0, EIGHT_BALL_MAX_POWER],
                      outputRange: [0, -CUE_PULL_DISTANCE],
                      extrapolate: "clamp",
                    }),
                    cueStrike.interpolate({ inputRange: [0, 1], outputRange: [0, 11] }),
                  ),
                }],
              }]}>
                <TableCueGraphic />
              </Animated.View>
            </View>
          )}

          {replayingOpponent && (
            <Pressable
              accessibilityLabel="Skip shot replay"
              hitSlop={10}
              onPress={skipReplay}
              style={({ pressed }) => [styles.skipReplay, pressed && styles.skipReplayPressed]}
            >
              <FontAwesome5 name="forward" size={13} color="#D0D0D0" />
            </Pressable>
          )}
        </View>

        <View style={[styles.powerControl, !canInteract && styles.powerDisabled]} {...powerResponder.panHandlers}>
          <View pointerEvents="none" style={styles.powerCueGuide}>
            {Array.from({ length: 9 }, (_, index) => (
              <View key={index} style={[styles.powerGaugeTick, { top: 15 + index * 36 }]} />
            ))}
          </View>
          <Animated.View style={[styles.powerCue, {
            transform: [{
              translateY: powerPull.interpolate({
                inputRange: [0, EIGHT_BALL_MAX_POWER],
                outputRange: [0, SIDE_CUE_PULL_DISTANCE],
                extrapolate: "clamp",
              }),
            }],
          }]}>
            <PowerCueGraphic />
          </Animated.View>
        </View>
      </View>

      <Text style={styles.hint}>
        {!physicsCompatible ? "8 Ball update required" : !canInteract ? "Waiting for the next shot" : game.state.breakShot ? "Drag the cue ball behind the line, aim, then pull down" : hasBallInHand ? "Place the cue ball anywhere, aim, then pull down" : "Drag around the cue ball to aim · pull down and release"}
      </Text>
    </View>
  );
}

function PlayerPoolDetails({
  pottedBalls,
  reverse = false,
}: {
  pottedBalls: number[];
  reverse?: boolean;
}) {
  return (
    <View style={[styles.poolDetails, reverse && styles.poolDetailsReverse]}>
      <View style={[styles.pottedRow, reverse && styles.pottedRowReverse]}>
        {pottedBalls.map((number) => <MiniPoolBall key={number} number={number} />)}
      </View>
    </View>
  );
}

function MiniPoolBall({ number }: { number: number }) {
  const striped = number >= 9;
  return (
    <View style={[styles.miniBall, { backgroundColor: striped ? "#F7F4EC" : BALL_COLORS[number] }]}>
      {striped && <View style={[styles.miniStripe, { backgroundColor: BALL_COLORS[number] }]} />}
      <View style={styles.miniNumberSpot}>
        <Text style={styles.miniNumber}>{number}</Text>
      </View>
    </View>
  );
}

function TableCueGraphic() {
  return (
    <Svg pointerEvents="none" width={174} height={12} viewBox="0 0 174 12">
      <Path d="M 0 0 L 144 4 L 144 8 L 0 12 Z" fill="#D5A467" />
      <Path d="M 0 0 L 56 1.55 L 56 10.45 L 0 12 Z" fill="#5A2417" />
      <Path d="M 54 1.5 L 61 1.7 L 61 10.3 L 54 10.5 Z" fill="#B98554" />
      <Path d="M 144 4 L 168 4.65 L 168 7.35 L 144 8 Z" fill="#F0E5D0" />
      <Path d="M 168 4.65 L 174 4.82 L 174 7.18 L 168 7.35 Z" fill="#3D7E83" />
    </Svg>
  );
}

function PowerCueGraphic() {
  return (
    <Svg pointerEvents="none" width={14} height={224} viewBox="0 0 14 224">
      <Path d="M 5.2 34 L 8.8 34 L 12.5 224 L 1.5 224 Z" fill="#D5A467" />
      <Path d="M 2.65 164 L 11.35 164 L 12.5 224 L 1.5 224 Z" fill="#5A2417" />
      <Path d="M 2.65 164 L 11.35 164 L 11.5 172 L 2.5 172 Z" fill="#B98554" />
      <Path d="M 5.2 7 L 8.8 7 L 8.8 34 L 5.2 34 Z" fill="#F0E5D0" />
      <Path d="M 5.2 0 L 8.8 0 L 8.8 7 L 5.2 7 Z" fill="#3D7E83" />
    </Svg>
  );
}

function TableCushions({ left, top, width, height }: { left: number; top: number; width: number; height: number }) {
  const thickness = CUSHION_DEPTH;
  const radius = POCKET_SIZE / 2;
  // Include cushion stroke width in the clearance so antialiasing can never
  // paint green over the black aperture at a tangent point.
  const jawRadius = radius + 1.5;
  const outerOffset = Math.sqrt(Math.max(0, jawRadius * jawRadius - thickness * thickness));
  const innerLeft = left + thickness;
  const innerRight = left + width - thickness;
  const innerTop = top + thickness;
  const innerBottom = top + height - thickness;
  const centerY = innerTop + (innerBottom - innerTop) / 2;
  const right = left + width;
  const bottom = top + height;
  const paths = [
    // Every jaw terminates exactly on the corresponding circular aperture.
    `M ${innerLeft + outerOffset} ${top} L ${innerRight - outerOffset} ${top} L ${innerRight - jawRadius} ${innerTop} L ${innerLeft + jawRadius} ${innerTop} Z`,
    `M ${innerLeft + outerOffset} ${bottom} L ${innerRight - outerOffset} ${bottom} L ${innerRight - jawRadius} ${innerBottom} L ${innerLeft + jawRadius} ${innerBottom} Z`,
    `M ${left} ${innerTop + outerOffset} L ${left} ${centerY - outerOffset} L ${innerLeft} ${centerY - jawRadius} L ${innerLeft} ${innerTop + jawRadius} Z`,
    `M ${left} ${centerY + outerOffset} L ${left} ${innerBottom - outerOffset} L ${innerLeft} ${innerBottom - jawRadius} L ${innerLeft} ${centerY + jawRadius} Z`,
    `M ${right} ${innerTop + outerOffset} L ${right} ${centerY - outerOffset} L ${innerRight} ${centerY - jawRadius} L ${innerRight} ${innerTop + jawRadius} Z`,
    `M ${right} ${centerY + outerOffset} L ${right} ${innerBottom - outerOffset} L ${innerRight} ${innerBottom - jawRadius} L ${innerRight} ${centerY + jawRadius} Z`,
  ];
  return (
    <Svg pointerEvents="none" style={styles.cushions}>
      {paths.map((path, index) => (
        <Path
          key={index}
          d={path}
          fill="#115C43"
          stroke="rgba(4,25,18,0.72)"
          strokeWidth={1.25}
          strokeLinejoin="round"
        />
      ))}
    </Svg>
  );
}

interface PocketLayerProps {
  width: number;
  height: number;
  surfaceLeft: number;
  surfaceTop: number;
  surfaceWidth: number;
  surfaceHeight: number;
  pocketLeft: number;
  pocketTop: number;
  pocketWidth: number;
  pocketHeight: number;
}

function pocketLayerCenters({
  pocketLeft,
  pocketTop,
  pocketWidth,
  pocketHeight,
}: PocketLayerProps): Array<[number, number]> {
  return [
    [pocketLeft, pocketTop],
    [pocketLeft + pocketWidth, pocketTop],
    [pocketLeft, pocketTop + pocketHeight / 2],
    [pocketLeft + pocketWidth, pocketTop + pocketHeight / 2],
    [pocketLeft, pocketTop + pocketHeight],
    [pocketLeft + pocketWidth, pocketTop + pocketHeight],
  ];
}

function PocketBackingLayer(props: PocketLayerProps) {
  if (props.width <= 0 || props.height <= 0) return null;
  const radius = POCKET_SIZE / 2;
  return (
    <Svg
      pointerEvents="none"
      style={styles.pocketBacking}
      width={props.width}
      height={props.height}
      viewBox={`0 0 ${props.width} ${props.height}`}
    >
      {pocketLayerCenters(props).map(([cx, cy], index) => (
        <Circle
          key={index}
          cx={cx}
          cy={cy}
          r={radius}
          fill="#010201"
          stroke="#2B1A11"
          strokeWidth={1.5}
        />
      ))}
    </Svg>
  );
}

function PocketOcclusionLayer(props: PocketLayerProps) {
  const {
  width,
  height,
  surfaceLeft,
  surfaceTop,
  surfaceWidth,
  surfaceHeight,
  } = props;
  if (width <= 0 || height <= 0) return null;
  const radius = POCKET_SIZE / 2;
  const holes = pocketLayerCenters(props);
  return (
    <Svg
      pointerEvents="none"
      style={styles.pocketOccluder}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
    >
      <Defs>
        <Mask
          id="eightBallPocketCutouts"
          x={0}
          y={0}
          width={width}
          height={height}
          maskUnits="userSpaceOnUse"
        >
          <Rect x={0} y={0} width={width} height={height} fill="#FFF" />
          {holes.map(([cx, cy], index) => (
            <Circle key={index} cx={cx} cy={cy} r={radius} fill="#000" />
          ))}
        </Mask>
      </Defs>
      <G mask="url(#eightBallPocketCutouts)">
        <Rect x={0} y={0} width={width} height={height} fill="#A65F32" />
        <Rect
          x={surfaceLeft}
          y={surfaceTop}
          width={surfaceWidth}
          height={surfaceHeight}
          fill="#176B4D"
        />
      </G>
      {holes.map(([cx, cy], index) => (
        <Circle
          key={index}
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="#2B1A11"
          strokeWidth={1.5}
        />
      ))}
    </Svg>
  );
}

const CuePlacementGuide = memo(forwardRef<View, {
  size: number;
  left: number;
  top: number;
}>(function CuePlacementGuide({ size, left, top }, forwardedRef) {
  const arrowSize = Math.max(20, size * 0.31);
  return (
    <View ref={forwardedRef} pointerEvents="none" style={[styles.placementGuide, {
      width: size,
      height: size,
      left: left - size / 2,
      top: top - size / 2,
      borderRadius: size / 2,
    }]}>
      <Text allowFontScaling={false} style={[styles.placementArrow, styles.placementArrowTop, { fontSize: arrowSize, lineHeight: arrowSize }]}>↑</Text>
      <Text allowFontScaling={false} style={[styles.placementArrow, styles.placementArrowRight, { fontSize: arrowSize, lineHeight: arrowSize }]}>→</Text>
      <Text allowFontScaling={false} style={[styles.placementArrow, styles.placementArrowBottom, { fontSize: arrowSize, lineHeight: arrowSize }]}>↓</Text>
      <Text allowFontScaling={false} style={[styles.placementArrow, styles.placementArrowLeft, { fontSize: arrowSize, lineHeight: arrowSize }]}>←</Text>
    </View>
  );
}));

const PoolBall = memo(forwardRef<PoolBallHandle, {
  ball: EightBallBall;
  size: number;
  left: number;
  top: number;
  orientation: BallOrientation;
}>(function PoolBall({
  ball,
  size,
  left,
  top,
  orientation,
}, forwardedRef) {
  const color = ball.number === 0 ? "#F5F2E9" : BALL_COLORS[ball.number];
  const striped = ball.number >= 9;
  const spot = projectFrontNumberSpot(orientation, size);
  const stripePaths = striped ? projectStripePaths(orientation, size) : [];
  const rootRef = useRef<View>(null);
  const stripeRefs = useRef<Array<NativeSvgNode | null>>([]);
  const spotRef = useRef<NativeSvgNode | null>(null);

  useImperativeHandle(forwardedRef, () => ({
    update(nextLeft, nextTop, pocketed, nextOrientation, visual) {
      rootRef.current?.setNativeProps({
        style: {
          left: nextLeft,
          top: nextTop,
          opacity: pocketed || visual?.hidden ? 0 : 1,
          zIndex: visual?.underTable ? 2 : 8,
        },
      });
      if (!nextOrientation || ball.number === 0) return;
      if (striped) {
        const paths = projectStripePaths(nextOrientation, size);
        stripeRefs.current.forEach((pathRef, index) => {
          pathRef?.setNativeProps({ d: paths[index] ?? "" });
        });
      }
      const nextSpot = projectFrontNumberSpot(nextOrientation, size);
      spotRef.current?.setNativeProps({
        opacity: nextSpot.visibility,
        transform: `matrix(${nextSpot.a} ${nextSpot.b} ${nextSpot.c} ${nextSpot.d} ${nextSpot.e} ${nextSpot.f})`,
      });
    },
  }), [ball.number, size, striped]);

  return (
    <View ref={rootRef} style={[styles.ball, {
      width: size,
      height: size,
      borderRadius: size / 2,
      left,
      top,
      opacity: ball.pocketed ? 0 : 1,
      backgroundColor: striped ? "#F5F2E9" : color,
    }]}>
      {ball.number !== 0 && (
        <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width={size} height={size}>
          {striped && [0, 1].map((index) => (
            <Path ref={(node) => { stripeRefs.current[index] = node; }} key={`stripe-${index}`} d={stripePaths[index] ?? ""} fill="none" stroke={color} strokeWidth={size * 0.39} strokeLinecap="round" strokeLinejoin="round" />
          ))}
          <G
            ref={(node) => { spotRef.current = node; }}
            opacity={spot.visibility}
            transform={`matrix(${spot.a} ${spot.b} ${spot.c} ${spot.d} ${spot.e} ${spot.f})`}
          >
            <Circle cx={0} cy={0} r={1} fill="#F8F7F1" stroke="rgba(0,0,0,0.38)" strokeWidth={0.08} />
            <SvgText
              x={0}
              y={0.04}
              fill="#111"
              fontSize={ball.number >= 10 ? 0.82 : 1.02}
              fontWeight="900"
              textAnchor="middle"
              alignmentBaseline="central"
            >
              {ball.number}
            </SvgText>
          </G>
        </Svg>
      )}
      <View pointerEvents="none" style={[styles.ballShade, { borderRadius: size / 2 }]} />
      <View style={[styles.ballGlint, { width: size * 0.17, height: size * 0.11, borderRadius: size * 0.08, left: size * 0.22, top: size * 0.13 }]} />
    </View>
  );
}), (previous, next) => (
  previous.ball.number === next.ball.number
  && previous.size === next.size
));

const styles = StyleSheet.create({
  root: { flex: 1, width: "100%", maxWidth: 430, alignSelf: "center", paddingTop: 3, paddingBottom: 3 },
  scoreHeader: { height: 94, position: "relative", marginBottom: 3 },
  poolDetailsRow: { position: "absolute", left: 0, right: 0, top: 58, flexDirection: "row", justifyContent: "space-between" },
  poolDetails: { width: 116, minHeight: 27, alignItems: "flex-start", paddingHorizontal: 7 },
  poolDetailsReverse: { alignItems: "flex-end" },
  pottedRow: { height: 17, flexDirection: "row", alignItems: "center", gap: 2, overflow: "hidden" },
  pottedRowReverse: { flexDirection: "row-reverse" },
  miniBall: { width: 14, height: 14, borderRadius: 7, overflow: "hidden", alignItems: "center", justifyContent: "center", borderWidth: 0.5, borderColor: "rgba(255,255,255,0.35)" },
  miniStripe: { position: "absolute", left: 0, right: 0, top: 4, height: 6 },
  miniNumberSpot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#F7F4EC", alignItems: "center", justifyContent: "center" },
  miniNumber: { color: "#111", fontSize: 4.4, lineHeight: 6, fontWeight: "900", includeFontPadding: false },
  shotStatus: { width: 108, paddingHorizontal: 2, color: colors.green, fontSize: 9, lineHeight: 12, fontWeight: "800", textAlign: "center" },
  tableStage: { flex: 1, width: "100%", alignItems: "center" },
  tableFrame: { height: "100%", aspectRatio: 0.568, maxWidth: "100%", borderRadius: 19, borderWidth: TABLE_FRAME_BORDER, borderColor: "#542B18", backgroundColor: "#A65F32", overflow: "visible", shadowColor: "#000", shadowOpacity: 0.45, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  tableClip: { ...StyleSheet.absoluteFillObject, borderRadius: 9, overflow: "hidden" },
  railInner: { ...StyleSheet.absoluteFillObject, zIndex: 5, borderWidth: 2, borderColor: "#C77B46", borderRadius: 9 },
  cloth: { position: "absolute", zIndex: 1, borderRadius: 3, backgroundColor: "#176B4D" },
  pocketBacking: { ...StyleSheet.absoluteFillObject, zIndex: 2 },
  pocketOccluder: { ...StyleSheet.absoluteFillObject, zIndex: 3 },
  cushions: { ...StyleSheet.absoluteFillObject, zIndex: 4 },
  aimGuide: { ...StyleSheet.absoluteFillObject, zIndex: 6 },
  headString: { position: "absolute", height: 1, marginTop: -0.5, backgroundColor: "rgba(255,255,255,0.3)", zIndex: 5 },
  ball: { position: "absolute", zIndex: 8, overflow: "hidden", alignItems: "center", justifyContent: "center", borderWidth: 0.7, borderColor: "rgba(0,0,0,0.65)", shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 1.5, shadowOffset: { width: 0, height: 1 }, elevation: 4 },
  ballShade: { ...StyleSheet.absoluteFillObject, borderWidth: 1, borderTopColor: "rgba(255,255,255,0.25)", borderLeftColor: "rgba(255,255,255,0.13)", borderRightColor: "rgba(0,0,0,0.32)", borderBottomColor: "rgba(0,0,0,0.42)" },
  ballGlint: { position: "absolute", backgroundColor: "rgba(255,255,255,0.48)" },
  placementGuide: { position: "absolute", zIndex: 13, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.82)", backgroundColor: "rgba(0,0,0,0.08)" },
  placementArrow: { position: "absolute", width: 24, height: 24, color: "#FFFFFF", fontWeight: "900", includeFontPadding: false, textAlign: "center", textAlignVertical: "center", textShadowColor: "rgba(0,0,0,0.75)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  placementArrowTop: { top: -12, left: "50%", marginLeft: -12 },
  placementArrowRight: { right: -12, top: "50%", marginTop: -12 },
  placementArrowBottom: { bottom: -12, left: "50%", marginLeft: -12 },
  placementArrowLeft: { left: -12, top: "50%", marginTop: -12 },
  cuePivot: { position: "absolute", zIndex: 14, elevation: 14, width: 1, height: 1 },
  cueStick: { position: "absolute", top: -6, width: 174, height: 12, shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
  skipReplay: { position: "absolute", zIndex: 30, left: "50%", top: "50%", marginLeft: -15, marginTop: -15, width: 30, height: 30, borderRadius: 15, backgroundColor: "rgba(69,69,69,0.9)", alignItems: "center", justifyContent: "center" },
  skipReplayPressed: { opacity: 0.72, transform: [{ scale: 0.96 }] },
  powerControl: { position: "absolute", zIndex: 20, right: -6, top: "50%", marginTop: -POWER_HEIGHT / 2, width: 58, height: POWER_HEIGHT, alignItems: "center" },
  powerDisabled: { opacity: 0.28 },
  powerCueGuide: { position: "absolute", top: 4, bottom: 4, width: 36, borderRadius: 14, backgroundColor: "rgba(8,10,9,0.28)", borderWidth: 1.5, borderColor: "rgba(190,190,190,0.42)" },
  powerGaugeTick: { position: "absolute", right: 4, width: 8, height: 1, backgroundColor: "rgba(190,190,190,0.52)" },
  powerCue: { position: "absolute", top: -5, width: 14, height: 224, alignItems: "center", shadowColor: "#000", shadowOpacity: 0.42, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
  hint: { height: 25, paddingTop: 7, color: colors.muted, fontSize: 10, textAlign: "center" },
});
