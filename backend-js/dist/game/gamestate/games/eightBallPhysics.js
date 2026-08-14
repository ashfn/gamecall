"use strict";
// Keep this file byte-for-byte identical to app/src/games/eightBallPhysics.ts.
// The simulation only persists integers and uses a fixed tick so the client
// preview and authoritative server resolve the same shot.
Object.defineProperty(exports, "__esModule", { value: true });
exports.eightBallNumberGroup = exports.simulateEightBallShot = exports.separateEightBallOverlaps = exports.isEightBallBreakPlacementLegal = exports.isEightBallPlacementLegal = exports.createEightBallRack = exports.EIGHT_BALL_CUSHION_SEGMENTS = exports.EIGHT_BALL_POCKETS = exports.EIGHT_BALL_MAX_STEPS = exports.EIGHT_BALL_MAX_SHOT_SPEED = exports.EIGHT_BALL_PHYSICS_VERSION = exports.EIGHT_BALL_MAX_POWER = exports.EIGHT_BALL_HEAD_STRING_Y = exports.EIGHT_BALL_POCKET_RADIUS = exports.EIGHT_BALL_BALL_RADIUS = exports.EIGHT_BALL_TABLE_HEIGHT = exports.EIGHT_BALL_TABLE_WIDTH = void 0;
exports.EIGHT_BALL_TABLE_WIDTH = 5000;
exports.EIGHT_BALL_TABLE_HEIGHT = 10000;
exports.EIGHT_BALL_BALL_RADIUS = 175;
// A ball must enter the pocket mouth cleanly; glancing approaches should catch
// a jaw instead of being captured from the edge of the opening.
exports.EIGHT_BALL_POCKET_RADIUS = 225;
exports.EIGHT_BALL_HEAD_STRING_Y = 7500;
exports.EIGHT_BALL_MAX_POWER = 1000;
exports.EIGHT_BALL_PHYSICS_VERSION = 6;
exports.EIGHT_BALL_MAX_SHOT_SPEED = 300;
exports.EIGHT_BALL_MAX_STEPS = 1800;
const FRICTION_NUMERATOR = 995;
const FRICTION_DENOMINATOR = 1000;
const CUSHION_NUMERATOR = 88;
const CUSHION_DENOMINATOR = 100;
// Equal-mass pool balls retain roughly 92% of their relative normal speed.
// The impulse uses (1 + restitution) / 2, hence 96/100 here.
const BALL_COLLISION_IMPULSE_NUMERATOR = 96;
const BALL_COLLISION_IMPULSE_DENOMINATOR = 100;
const STOP_SPEED = 2;
const PHYSICS_SUBSTEPS = 4;
const COLLISION_PASSES = 6;
const FRICTION_INTERVAL = 4;
const CORNER_JAW_INSET = 340;
const CORNER_MOUTH_INSET = 160;
const MIDDLE_JAW_INSET = 560;
const MIDDLE_MOUTH_INSET = 380;
const JAW_OUTSET = 220;
exports.EIGHT_BALL_POCKETS = [
    { x: 0, y: 0 },
    { x: exports.EIGHT_BALL_TABLE_WIDTH, y: 0 },
    { x: 0, y: exports.EIGHT_BALL_TABLE_HEIGHT / 2 },
    { x: exports.EIGHT_BALL_TABLE_WIDTH, y: exports.EIGHT_BALL_TABLE_HEIGHT / 2 },
    { x: 0, y: exports.EIGHT_BALL_TABLE_HEIGHT },
    { x: exports.EIGHT_BALL_TABLE_WIDTH, y: exports.EIGHT_BALL_TABLE_HEIGHT },
];
const middleY = exports.EIGHT_BALL_TABLE_HEIGHT / 2;
exports.EIGHT_BALL_CUSHION_SEGMENTS = [
    { x1: CORNER_JAW_INSET, y1: 0, x2: exports.EIGHT_BALL_TABLE_WIDTH - CORNER_JAW_INSET, y2: 0 },
    { x1: CORNER_MOUTH_INSET, y1: -JAW_OUTSET, x2: CORNER_JAW_INSET, y2: 0 },
    { x1: exports.EIGHT_BALL_TABLE_WIDTH - CORNER_JAW_INSET, y1: 0, x2: exports.EIGHT_BALL_TABLE_WIDTH - CORNER_MOUTH_INSET, y2: -JAW_OUTSET },
    { x1: CORNER_JAW_INSET, y1: exports.EIGHT_BALL_TABLE_HEIGHT, x2: exports.EIGHT_BALL_TABLE_WIDTH - CORNER_JAW_INSET, y2: exports.EIGHT_BALL_TABLE_HEIGHT },
    { x1: CORNER_MOUTH_INSET, y1: exports.EIGHT_BALL_TABLE_HEIGHT + JAW_OUTSET, x2: CORNER_JAW_INSET, y2: exports.EIGHT_BALL_TABLE_HEIGHT },
    { x1: exports.EIGHT_BALL_TABLE_WIDTH - CORNER_JAW_INSET, y1: exports.EIGHT_BALL_TABLE_HEIGHT, x2: exports.EIGHT_BALL_TABLE_WIDTH - CORNER_MOUTH_INSET, y2: exports.EIGHT_BALL_TABLE_HEIGHT + JAW_OUTSET },
    { x1: 0, y1: CORNER_JAW_INSET, x2: 0, y2: middleY - MIDDLE_JAW_INSET },
    { x1: -JAW_OUTSET, y1: CORNER_MOUTH_INSET, x2: 0, y2: CORNER_JAW_INSET },
    { x1: 0, y1: middleY - MIDDLE_JAW_INSET, x2: -JAW_OUTSET, y2: middleY - MIDDLE_MOUTH_INSET },
    { x1: 0, y1: middleY + MIDDLE_JAW_INSET, x2: 0, y2: exports.EIGHT_BALL_TABLE_HEIGHT - CORNER_JAW_INSET },
    { x1: -JAW_OUTSET, y1: middleY + MIDDLE_MOUTH_INSET, x2: 0, y2: middleY + MIDDLE_JAW_INSET },
    { x1: 0, y1: exports.EIGHT_BALL_TABLE_HEIGHT - CORNER_JAW_INSET, x2: -JAW_OUTSET, y2: exports.EIGHT_BALL_TABLE_HEIGHT - CORNER_MOUTH_INSET },
    { x1: exports.EIGHT_BALL_TABLE_WIDTH, y1: CORNER_JAW_INSET, x2: exports.EIGHT_BALL_TABLE_WIDTH, y2: middleY - MIDDLE_JAW_INSET },
    { x1: exports.EIGHT_BALL_TABLE_WIDTH + JAW_OUTSET, y1: CORNER_MOUTH_INSET, x2: exports.EIGHT_BALL_TABLE_WIDTH, y2: CORNER_JAW_INSET },
    { x1: exports.EIGHT_BALL_TABLE_WIDTH, y1: middleY - MIDDLE_JAW_INSET, x2: exports.EIGHT_BALL_TABLE_WIDTH + JAW_OUTSET, y2: middleY - MIDDLE_MOUTH_INSET },
    { x1: exports.EIGHT_BALL_TABLE_WIDTH, y1: middleY + MIDDLE_JAW_INSET, x2: exports.EIGHT_BALL_TABLE_WIDTH, y2: exports.EIGHT_BALL_TABLE_HEIGHT - CORNER_JAW_INSET },
    { x1: exports.EIGHT_BALL_TABLE_WIDTH + JAW_OUTSET, y1: middleY + MIDDLE_MOUTH_INSET, x2: exports.EIGHT_BALL_TABLE_WIDTH, y2: middleY + MIDDLE_JAW_INSET },
    { x1: exports.EIGHT_BALL_TABLE_WIDTH, y1: exports.EIGHT_BALL_TABLE_HEIGHT - CORNER_JAW_INSET, x2: exports.EIGHT_BALL_TABLE_WIDTH + JAW_OUTSET, y2: exports.EIGHT_BALL_TABLE_HEIGHT - CORNER_MOUTH_INSET },
];
function integerSqrt(value) {
    if (value <= 0)
        return 0;
    let x = Math.floor(Math.sqrt(value));
    while ((x + 1) * (x + 1) <= value)
        x += 1;
    while (x * x > value)
        x -= 1;
    return x;
}
function roundedDivide(numerator, denominator) {
    if (denominator === 0)
        return 0;
    const sign = numerator < 0 ? -1 : 1;
    return sign * Math.floor((Math.abs(numerator) + Math.floor(denominator / 2)) / denominator);
}
function ballGroup(number) {
    if (number >= 1 && number <= 7)
        return "SOLIDS";
    if (number >= 9 && number <= 15)
        return "STRIPES";
    return "SPECIAL";
}
function createEightBallRack() {
    const balls = [{ number: 0, x: 2500, y: 7900, vx: 0, vy: 0, pocketed: false }];
    const rows = [[1], [9, 2], [3, 8, 10], [11, 4, 12, 5], [6, 13, 7, 14, 15]];
    const spacing = exports.EIGHT_BALL_BALL_RADIUS * 2 + 8;
    const rowSpacing = Math.ceil(spacing * 866 / 1000);
    rows.forEach((row, rowIndex) => {
        const y = 3000 - rowIndex * rowSpacing;
        row.forEach((number, index) => {
            const x = 2500 + roundedDivide((index * 2 - rowIndex) * spacing, 2);
            balls.push({ number, x, y, vx: 0, vy: 0, pocketed: false });
        });
    });
    return balls.sort((left, right) => left.number - right.number);
}
exports.createEightBallRack = createEightBallRack;
function isEightBallPlacementLegal(balls, x, y, ignoreNumber = 0) {
    const radius = exports.EIGHT_BALL_BALL_RADIUS;
    if (!Number.isInteger(x) || !Number.isInteger(y))
        return false;
    if (x < radius || x > exports.EIGHT_BALL_TABLE_WIDTH - radius || y < radius || y > exports.EIGHT_BALL_TABLE_HEIGHT - radius)
        return false;
    if (exports.EIGHT_BALL_POCKETS.some((pocket) => {
        const dx = x - pocket.x;
        const dy = y - pocket.y;
        return dx * dx + dy * dy <= exports.EIGHT_BALL_POCKET_RADIUS * exports.EIGHT_BALL_POCKET_RADIUS;
    }))
        return false;
    const diameter = radius * 2;
    return !balls.some((ball) => {
        if (ball.number === ignoreNumber || ball.pocketed)
            return false;
        const dx = x - ball.x;
        const dy = y - ball.y;
        return dx * dx + dy * dy < diameter * diameter;
    });
}
exports.isEightBallPlacementLegal = isEightBallPlacementLegal;
function isEightBallBreakPlacementLegal(balls, x, y) {
    return y >= exports.EIGHT_BALL_HEAD_STRING_Y && isEightBallPlacementLegal(balls, x, y, 0);
}
exports.isEightBallBreakPlacementLegal = isEightBallBreakPlacementLegal;
function captureFrame(balls, step) {
    return {
        step,
        balls: balls.map(({ number, x, y, pocketed }) => ({ number, x, y, pocketed })),
    };
}
function resolveBallCollision(left, right, events) {
    if (left.pocketed || right.pocketed)
        return;
    let dx = right.x - left.x;
    let dy = right.y - left.y;
    if (dx === 0 && dy === 0)
        dx = left.number < right.number ? 1 : -1;
    const distanceSquared = dx * dx + dy * dy;
    const diameter = exports.EIGHT_BALL_BALL_RADIUS * 2;
    if (distanceSquared >= diameter * diameter)
        return;
    const distance = Math.max(1, integerSqrt(distanceSquared));
    const overlap = diameter - distance;
    if (overlap > 0) {
        const correction = Math.ceil(overlap / 2);
        const correctionX = roundedDivide(dx * correction, distance);
        const correctionY = roundedDivide(dy * correction, distance);
        left.x -= correctionX;
        left.y -= correctionY;
        right.x += correctionX;
        right.y += correctionY;
    }
    const relativeX = left.vx - right.vx;
    const relativeY = left.vy - right.vy;
    const approach = relativeX * dx + relativeY * dy;
    if (approach <= 0)
        return;
    if (events.firstHit === null) {
        if (left.number === 0 && right.number !== 0)
            events.firstHit = right.number;
        if (right.number === 0 && left.number !== 0)
            events.firstHit = left.number;
    }
    const impulseX = roundedDivide(approach * dx * BALL_COLLISION_IMPULSE_NUMERATOR, Math.max(1, distanceSquared * BALL_COLLISION_IMPULSE_DENOMINATOR));
    const impulseY = roundedDivide(approach * dy * BALL_COLLISION_IMPULSE_NUMERATOR, Math.max(1, distanceSquared * BALL_COLLISION_IMPULSE_DENOMINATOR));
    left.vx -= impulseX;
    left.vy -= impulseY;
    right.vx += impulseX;
    right.vy += impulseY;
}
function resolveCushionCollision(ball, segment) {
    const segmentX = segment.x2 - segment.x1;
    const segmentY = segment.y2 - segment.y1;
    const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
    const segmentLength = Math.max(1, integerSqrt(segmentLengthSquared));
    const projection = (ball.x - segment.x1) * segmentX + (ball.y - segment.y1) * segmentY;
    const clampedProjection = Math.max(0, Math.min(segmentLengthSquared, projection));
    const closestX = segment.x1 + roundedDivide(segmentX * clampedProjection, segmentLengthSquared);
    const closestY = segment.y1 + roundedDivide(segmentY * clampedProjection, segmentLengthSquared);
    const separationX = ball.x - closestX;
    const separationY = ball.y - closestY;
    const distanceSquared = separationX * separationX + separationY * separationY;
    const radiusSquared = exports.EIGHT_BALL_BALL_RADIUS * exports.EIGHT_BALL_BALL_RADIUS;
    if (distanceSquared >= radiusSquared)
        return false;
    let inwardX = -segmentY;
    let inwardY = segmentX;
    const midpointX = roundedDivide(segment.x1 + segment.x2, 2);
    const midpointY = roundedDivide(segment.y1 + segment.y2, 2);
    const towardCenter = inwardX * (exports.EIGHT_BALL_TABLE_WIDTH / 2 - midpointX)
        + inwardY * (exports.EIGHT_BALL_TABLE_HEIGHT / 2 - midpointY);
    if (towardCenter < 0) {
        inwardX = -inwardX;
        inwardY = -inwardY;
    }
    const inwardSide = separationX * inwardX + separationY * inwardY;
    const atEndpoint = clampedProjection === 0 || clampedProjection === segmentLengthSquared;
    // The rounded cap only exists on the playable side of a jaw. On the other
    // side is the pocket mouth, which must remain open.
    if (atEndpoint && inwardSide <= 0)
        return false;
    let normalX = separationX;
    let normalY = separationY;
    let distance = Math.max(1, integerSqrt(distanceSquared));
    if (inwardSide <= 0 || distanceSquared === 0) {
        normalX = inwardX;
        normalY = inwardY;
        distance = segmentLength;
    }
    const normalLengthSquared = Math.max(1, normalX * normalX + normalY * normalY);
    const signedDistance = inwardSide <= 0
        ? 0
        : Math.max(0, roundedDivide(inwardSide, segmentLength));
    const correction = Math.max(0, exports.EIGHT_BALL_BALL_RADIUS - (inwardSide <= 0 ? signedDistance : distance));
    ball.x += roundedDivide(normalX * correction, distance);
    ball.y += roundedDivide(normalY * correction, distance);
    const velocityAlongNormal = ball.vx * normalX + ball.vy * normalY;
    if (velocityAlongNormal < 0) {
        const impulseScale = velocityAlongNormal * (CUSHION_DENOMINATOR + CUSHION_NUMERATOR);
        const impulseDenominator = CUSHION_DENOMINATOR * normalLengthSquared;
        ball.vx -= roundedDivide(impulseScale * normalX, impulseDenominator);
        ball.vy -= roundedDivide(impulseScale * normalY, impulseDenominator);
    }
    return true;
}
function separateEightBallOverlaps(inputBalls) {
    const balls = inputBalls.map((ball) => (Object.assign(Object.assign({}, ball), { vx: 0, vy: 0 }))).sort((left, right) => left.number - right.number);
    const events = { firstHit: null, pocketed: [], cushionBalls: [], cueScratch: false };
    for (let pass = 0; pass < 20; pass += 1) {
        for (let leftIndex = 0; leftIndex < balls.length; leftIndex += 1) {
            for (let rightIndex = leftIndex + 1; rightIndex < balls.length; rightIndex += 1) {
                resolveBallCollision(balls[leftIndex], balls[rightIndex], events);
            }
        }
        for (const ball of balls) {
            if (ball.pocketed)
                continue;
            ball.x = Math.max(exports.EIGHT_BALL_BALL_RADIUS, Math.min(exports.EIGHT_BALL_TABLE_WIDTH - exports.EIGHT_BALL_BALL_RADIUS, ball.x));
            ball.y = Math.max(exports.EIGHT_BALL_BALL_RADIUS, Math.min(exports.EIGHT_BALL_TABLE_HEIGHT - exports.EIGHT_BALL_BALL_RADIUS, ball.y));
        }
    }
    return balls;
}
exports.separateEightBallOverlaps = separateEightBallOverlaps;
function applyFriction(ball) {
    ball.vx = Math.trunc(ball.vx * FRICTION_NUMERATOR / FRICTION_DENOMINATOR);
    ball.vy = Math.trunc(ball.vy * FRICTION_NUMERATOR / FRICTION_DENOMINATOR);
    if (Math.abs(ball.vx) <= STOP_SPEED)
        ball.vx = 0;
    if (Math.abs(ball.vy) <= STOP_SPEED)
        ball.vy = 0;
}
function simulateEightBallShot(inputBalls, shot, options = {}) {
    var _a;
    const balls = inputBalls.map((ball) => (Object.assign(Object.assign({}, ball), { vx: 0, vy: 0 }))).sort((left, right) => left.number - right.number);
    const cue = balls.find((ball) => ball.number === 0);
    if (!cue || cue.pocketed)
        throw new Error("Place the cue ball before shooting");
    const aimX = Math.trunc(shot.aimX);
    const aimY = Math.trunc(shot.aimY);
    const power = Math.trunc(shot.power);
    if (!Number.isInteger(aimX) || !Number.isInteger(aimY) || (aimX === 0 && aimY === 0))
        throw new Error("Choose a shot direction");
    if (!Number.isInteger(power) || power < 1 || power > exports.EIGHT_BALL_MAX_POWER)
        throw new Error("Choose a valid shot power");
    const aimLength = integerSqrt(aimX * aimX + aimY * aimY);
    if (aimLength < 1 || aimLength > 20000)
        throw new Error("Choose a valid shot direction");
    const speed = Math.max(1, roundedDivide(power * exports.EIGHT_BALL_MAX_SHOT_SPEED, exports.EIGHT_BALL_MAX_POWER));
    cue.vx = roundedDivide(aimX * speed, aimLength);
    cue.vy = roundedDivide(aimY * speed, aimLength);
    const events = { firstHit: null, pocketed: [], cushionBalls: [], cueScratch: false };
    const cushionSet = new Set();
    const captureEvery = Math.max(0, Math.trunc((_a = options.captureEvery) !== null && _a !== void 0 ? _a : 0));
    const frames = captureEvery ? [captureFrame(balls, 0)] : undefined;
    let steps = 0;
    for (let step = 1; step <= exports.EIGHT_BALL_MAX_STEPS; step += 1) {
        steps = step;
        for (let substep = 0; substep < PHYSICS_SUBSTEPS; substep += 1) {
            for (const ball of balls) {
                if (ball.pocketed)
                    continue;
                ball.x += roundedDivide(ball.vx, PHYSICS_SUBSTEPS);
                ball.y += roundedDivide(ball.vy, PHYSICS_SUBSTEPS);
                const pocket = exports.EIGHT_BALL_POCKETS.find((target) => {
                    const dx = ball.x - target.x;
                    const dy = ball.y - target.y;
                    return dx * dx + dy * dy <= exports.EIGHT_BALL_POCKET_RADIUS * exports.EIGHT_BALL_POCKET_RADIUS;
                });
                if (pocket) {
                    ball.pocketed = true;
                    ball.x = pocket.x;
                    ball.y = pocket.y;
                    ball.vx = 0;
                    ball.vy = 0;
                    events.pocketed.push(ball.number);
                    if (ball.number === 0)
                        events.cueScratch = true;
                    continue;
                }
                let cushioned = false;
                const nearCushion = ball.x <= exports.EIGHT_BALL_BALL_RADIUS
                    || ball.x >= exports.EIGHT_BALL_TABLE_WIDTH - exports.EIGHT_BALL_BALL_RADIUS
                    || ball.y <= exports.EIGHT_BALL_BALL_RADIUS
                    || ball.y >= exports.EIGHT_BALL_TABLE_HEIGHT - exports.EIGHT_BALL_BALL_RADIUS;
                if (nearCushion) {
                    for (const segment of exports.EIGHT_BALL_CUSHION_SEGMENTS) {
                        if (resolveCushionCollision(ball, segment))
                            cushioned = true;
                    }
                }
                if (cushioned && events.firstHit !== null)
                    cushionSet.add(ball.number);
            }
            for (let pass = 0; pass < COLLISION_PASSES; pass += 1) {
                for (let leftIndex = 0; leftIndex < balls.length; leftIndex += 1) {
                    for (let rightIndex = leftIndex + 1; rightIndex < balls.length; rightIndex += 1) {
                        resolveBallCollision(balls[leftIndex], balls[rightIndex], events);
                    }
                }
            }
        }
        if (step % FRICTION_INTERVAL === 0) {
            for (const ball of balls)
                if (!ball.pocketed)
                    applyFriction(ball);
        }
        let allStopped = true;
        for (const ball of balls) {
            if (!ball.pocketed && (ball.vx !== 0 || ball.vy !== 0)) {
                allStopped = false;
                break;
            }
        }
        if (frames && (step % captureEvery === 0 || allStopped)) {
            frames.push(captureFrame(balls, step));
        }
        if (allStopped)
            break;
    }
    events.cushionBalls = [...cushionSet].sort((left, right) => left - right);
    return { balls, events, steps, frames };
}
exports.simulateEightBallShot = simulateEightBallShot;
function eightBallNumberGroup(number) {
    return ballGroup(number);
}
exports.eightBallNumberGroup = eightBallNumberGroup;
