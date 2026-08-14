import type { EightBallPhysicsBall, EightBallShotVector } from "./eightBallPhysics";
import {
  EIGHT_BALL_V8_BALL_DIAMETER_SQUARED,
  EIGHT_BALL_V8_MAX_SECONDS,
  EIGHT_BALL_V8_MAX_SHOT_SPEED,
  EIGHT_BALL_V8_STEP_HZ,
  eightBallV8MinimumSeparationSquared,
  simulateEightBallShotV8,
} from "./eightBallPhysicsV8";
import type {
  EightBallV8Frame,
  EightBallV8FrameBall,
  EightBallV8Events,
  EightBallV8Options,
  EightBallV8Profile,
  EightBallV8Simulation,
} from "./eightBallPhysicsV8";

/**
 * v9 keeps v8's solver and shot tuning, but adds an authoritative vertical
 * pocket fall. Mouth entry preserves planar momentum; the pot completes only
 * after one ball diameter has dropped below the shelf. Captured frames retain
 * exact position and velocity for a seamless under-table ramp handoff.
 */
export const EIGHT_BALL_V9_PHYSICS_VERSION = 9;
export const EIGHT_BALL_V9_STEP_HZ = EIGHT_BALL_V8_STEP_HZ;
export const EIGHT_BALL_V9_MAX_SECONDS = EIGHT_BALL_V8_MAX_SECONDS;
export const EIGHT_BALL_V9_MAX_SHOT_SPEED = EIGHT_BALL_V8_MAX_SHOT_SPEED;
export const EIGHT_BALL_V9_BALL_DIAMETER_SQUARED = EIGHT_BALL_V8_BALL_DIAMETER_SQUARED;

export type EightBallV9FrameBall = EightBallV8FrameBall;
export type EightBallV9Frame = EightBallV8Frame;
export type EightBallV9Events = EightBallV8Events;
export type EightBallV9Profile = EightBallV8Profile;
export type EightBallV9Simulation = EightBallV8Simulation;
export type EightBallV9Options = Omit<EightBallV8Options, "authoritativePocketFall">;

export function simulateEightBallShotV9(
  inputBalls: EightBallPhysicsBall[],
  shot: EightBallShotVector,
  options: EightBallV9Options = {},
): EightBallV9Simulation {
  return simulateEightBallShotV8(inputBalls, shot, {
    ...options,
    authoritativePocketFall: true,
  });
}

export const eightBallV9MinimumSeparationSquared = eightBallV8MinimumSeparationSquared;
