"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.eightBallV9MinimumSeparationSquared = exports.simulateEightBallShotV9 = exports.EIGHT_BALL_V9_BALL_DIAMETER_SQUARED = exports.EIGHT_BALL_V9_MAX_SHOT_SPEED = exports.EIGHT_BALL_V9_MAX_SECONDS = exports.EIGHT_BALL_V9_STEP_HZ = exports.EIGHT_BALL_V9_PHYSICS_VERSION = void 0;
const eightBallPhysicsV8_1 = require("./eightBallPhysicsV8");
/**
 * v9 keeps v8's solver and shot tuning, but adds an authoritative vertical
 * pocket fall. Mouth entry preserves planar momentum; the pot completes only
 * after one ball diameter has dropped below the shelf. Captured frames retain
 * exact position and velocity for a seamless under-table ramp handoff.
 */
exports.EIGHT_BALL_V9_PHYSICS_VERSION = 9;
exports.EIGHT_BALL_V9_STEP_HZ = eightBallPhysicsV8_1.EIGHT_BALL_V8_STEP_HZ;
exports.EIGHT_BALL_V9_MAX_SECONDS = eightBallPhysicsV8_1.EIGHT_BALL_V8_MAX_SECONDS;
exports.EIGHT_BALL_V9_MAX_SHOT_SPEED = eightBallPhysicsV8_1.EIGHT_BALL_V8_MAX_SHOT_SPEED;
exports.EIGHT_BALL_V9_BALL_DIAMETER_SQUARED = eightBallPhysicsV8_1.EIGHT_BALL_V8_BALL_DIAMETER_SQUARED;
function simulateEightBallShotV9(inputBalls, shot, options = {}) {
    return (0, eightBallPhysicsV8_1.simulateEightBallShotV8)(inputBalls, shot, {
        ...options,
        authoritativePocketFall: true,
    });
}
exports.simulateEightBallShotV9 = simulateEightBallShotV9;
exports.eightBallV9MinimumSeparationSquared = eightBallPhysicsV8_1.eightBallV8MinimumSeparationSquared;
