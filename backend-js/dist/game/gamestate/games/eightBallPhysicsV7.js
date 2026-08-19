"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EIGHT_BALL_V7_BALL_DIAMETER_SQUARED = exports.eightBallV7MinimumSeparationSquared = exports.simulateEightBallShotV7 = exports.EIGHT_BALL_V7_MAX_SHOT_SPEED = exports.EIGHT_BALL_V7_MAX_SECONDS = exports.EIGHT_BALL_V7_STEP_HZ = exports.EIGHT_BALL_V7_PHYSICS_VERSION = void 0;
const eightBallPhysics_1 = require("./eightBallPhysics");
/**
 * Experimental pool-specific solver.
 *
 * This deliberately lives beside the production v6 engine. It is not yet used
 * to resolve live games. The first milestone replaces penetration/substep
 * collisions with swept time-of-impact contacts and replaces component-wise
 * exponential drag with magnitude-preserving rolling resistance.
 *
 * State is held in typed arrays and quantized after every physics tick. The
 * public object conversion happens only for captured frames and the final
 * result, keeping the calculation loop allocation-light and deterministic.
 */
exports.EIGHT_BALL_V7_PHYSICS_VERSION = 7;
exports.EIGHT_BALL_V7_STEP_HZ = 240;
exports.EIGHT_BALL_V7_MAX_SECONDS = 20;
exports.EIGHT_BALL_V7_MAX_SHOT_SPEED = 15000;
const STEP_SECONDS = 1 / exports.EIGHT_BALL_V7_STEP_HZ;
const BALL_DIAMETER = eightBallPhysics_1.EIGHT_BALL_BALL_RADIUS * 2;
const BALL_DIAMETER_SQUARED = BALL_DIAMETER * BALL_DIAMETER;
const BALL_RESTITUTION = 0.93;
const CUSHION_RESTITUTION = 0.88;
const ROLLING_DECELERATION = 900;
const STOP_SPEED = 8;
const POSITION_QUANTUM = 1 / 1024;
const VELOCITY_QUANTUM = 1 / 1024;
const TIME_EPSILON = 1e-9;
const CONTACT_TIME_EPSILON = 1e-7;
const CONTACT_SLOP = 1e-5;
const MAX_EVENTS_PER_TICK = 96;
const MAX_BATCH_EVENTS = 256;
const CORNER_POCKET_SINK_RADIUS = 170;
// The side-pocket sink reaches the throat behind both jaw tips. A small
// circular sink leaves a non-physical escape corridor between the jaws: a ball
// can miss the visible hole yet travel out through the opening forever.
const SIDE_POCKET_SINK_RADIUS = 390;
const EVENT_BALL = 1;
const EVENT_CUSHION_FACE = 2;
const EVENT_CUSHION_CAP = 3;
const EVENT_POCKET = 4;
function pocketSinkRadius(pocketIndex) {
    return pocketIndex === 2 || pocketIndex === 3
        ? SIDE_POCKET_SINK_RADIUS
        : CORNER_POCKET_SINK_RADIUS;
}
function quantize(value, quantum) {
    return Math.round(value / quantum) * quantum;
}
function prepareCushion(segment) {
    const dx = segment.x2 - segment.x1;
    const dy = segment.y2 - segment.y1;
    const length = Math.hypot(dx, dy) || 1;
    let nx = -dy / length;
    let ny = dx / length;
    const midpointX = (segment.x1 + segment.x2) / 2;
    const midpointY = (segment.y1 + segment.y2) / 2;
    if (nx * (eightBallPhysics_1.EIGHT_BALL_TABLE_WIDTH / 2 - midpointX) + ny * (eightBallPhysics_1.EIGHT_BALL_TABLE_HEIGHT / 2 - midpointY) < 0) {
        nx = -nx;
        ny = -ny;
    }
    return {
        ...segment,
        dx,
        dy,
        length,
        nx,
        ny,
        minX: Math.min(segment.x1, segment.x2) - eightBallPhysics_1.EIGHT_BALL_BALL_RADIUS,
        minY: Math.min(segment.y1, segment.y2) - eightBallPhysics_1.EIGHT_BALL_BALL_RADIUS,
        maxX: Math.max(segment.x1, segment.x2) + eightBallPhysics_1.EIGHT_BALL_BALL_RADIUS,
        maxY: Math.max(segment.y1, segment.y2) + eightBallPhysics_1.EIGHT_BALL_BALL_RADIUS,
    };
}
const PREPARED_CUSHIONS = eightBallPhysics_1.EIGHT_BALL_CUSHION_SEGMENTS.map(prepareCushion);
const CUSHION_CAPS = (() => {
    const unique = new Map();
    for (const segment of eightBallPhysics_1.EIGHT_BALL_CUSHION_SEGMENTS) {
        unique.set(`${segment.x1}:${segment.y1}`, { x: segment.x1, y: segment.y1 });
        unique.set(`${segment.x2}:${segment.y2}`, { x: segment.x2, y: segment.y2 });
    }
    return [...unique.values()];
})();
function createState(inputBalls) {
    const sorted = [...inputBalls].sort((left, right) => left.number - right.number);
    const count = sorted.length;
    const state = {
        count,
        numbers: new Int16Array(count),
        x: new Float64Array(count),
        y: new Float64Array(count),
        vx: new Float64Array(count),
        vy: new Float64Array(count),
        pocketed: new Uint8Array(count),
    };
    for (let index = 0; index < count; index += 1) {
        const ball = sorted[index];
        state.numbers[index] = ball.number;
        state.x[index] = quantize(ball.x, POSITION_QUANTUM);
        state.y[index] = quantize(ball.y, POSITION_QUANTUM);
        state.pocketed[index] = ball.pocketed ? 1 : 0;
    }
    return state;
}
function createBatch() {
    return {
        time: Number.POSITIVE_INFINITY,
        count: 0,
        type: new Uint8Array(MAX_BATCH_EVENTS),
        a: new Int16Array(MAX_BATCH_EVENTS),
        b: new Int16Array(MAX_BATCH_EVENTS),
        nx: new Float64Array(MAX_BATCH_EVENTS),
        ny: new Float64Array(MAX_BATCH_EVENTS),
    };
}
function resetBatch(batch) {
    batch.time = Number.POSITIVE_INFINITY;
    batch.count = 0;
}
function addBatchEvent(batch, time, type, a, b, nx = 0, ny = 0) {
    if (time < -TIME_EPSILON)
        return;
    const normalizedTime = Math.max(0, time);
    if (normalizedTime < batch.time - CONTACT_TIME_EPSILON) {
        batch.time = normalizedTime;
        batch.count = 0;
    }
    if (Math.abs(normalizedTime - batch.time) > CONTACT_TIME_EPSILON || batch.count >= MAX_BATCH_EVENTS)
        return;
    const index = batch.count;
    batch.type[index] = type;
    batch.a[index] = a;
    batch.b[index] = b;
    batch.nx[index] = nx;
    batch.ny[index] = ny;
    batch.count += 1;
}
function sweptCircleTime(px, py, vx, vy, radius, maxTime) {
    const c = px * px + py * py - radius * radius;
    const approach = px * vx + py * vy;
    if (c <= CONTACT_SLOP)
        return approach < 0 ? 0 : null;
    const a = vx * vx + vy * vy;
    if (a <= TIME_EPSILON || approach >= 0)
        return null;
    const b = 2 * approach;
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0)
        return null;
    const time = (-b - Math.sqrt(discriminant)) / (2 * a);
    return time >= -TIME_EPSILON && time <= maxTime + TIME_EPSILON ? Math.max(0, time) : null;
}
function sweptAabbCanMeet(left, right, leftVelocity, rightVelocity, radius, maxTime) {
    const relative = rightVelocity - leftVelocity;
    const future = right + relative * maxTime;
    return Math.min(right, future) - radius <= left && Math.max(right, future) + radius >= left;
}
function findCollisionBatch(state, maxTime, batch, profile) {
    resetBatch(batch);
    for (let left = 0; left < state.count; left += 1) {
        if (state.pocketed[left])
            continue;
        for (let right = left + 1; right < state.count; right += 1) {
            if (state.pocketed[right])
                continue;
            if (state.vx[left] === state.vx[right] && state.vy[left] === state.vy[right])
                continue;
            profile.pairCandidates += 1;
            if (!sweptAabbCanMeet(state.x[left], state.x[right], state.vx[left], state.vx[right], BALL_DIAMETER, maxTime)
                || !sweptAabbCanMeet(state.y[left], state.y[right], state.vy[left], state.vy[right], BALL_DIAMETER, maxTime))
                continue;
            profile.pairQuadratics += 1;
            const time = sweptCircleTime(state.x[right] - state.x[left], state.y[right] - state.y[left], state.vx[right] - state.vx[left], state.vy[right] - state.vy[left], BALL_DIAMETER, maxTime);
            if (time !== null)
                addBatchEvent(batch, time, EVENT_BALL, left, right);
        }
    }
    for (let ball = 0; ball < state.count; ball += 1) {
        if (state.pocketed[ball])
            continue;
        if (state.vx[ball] === 0 && state.vy[ball] === 0)
            continue;
        const startX = state.x[ball];
        const startY = state.y[ball];
        const velocityX = state.vx[ball];
        const velocityY = state.vy[ball];
        const endX = startX + velocityX * maxTime;
        const endY = startY + velocityY * maxTime;
        const sweptMinX = Math.min(startX, endX);
        const sweptMaxX = Math.max(startX, endX);
        const sweptMinY = Math.min(startY, endY);
        const sweptMaxY = Math.max(startY, endY);
        for (let cushionIndex = 0; cushionIndex < PREPARED_CUSHIONS.length; cushionIndex += 1) {
            const cushion = PREPARED_CUSHIONS[cushionIndex];
            profile.cushionCandidates += 1;
            if (sweptMaxX < cushion.minX || sweptMinX > cushion.maxX || sweptMaxY < cushion.minY || sweptMinY > cushion.maxY)
                continue;
            const normalVelocity = velocityX * cushion.nx + velocityY * cushion.ny;
            if (normalVelocity >= -TIME_EPSILON)
                continue;
            profile.cushionSolves += 1;
            const signedDistance = (startX - cushion.x1) * cushion.nx + (startY - cushion.y1) * cushion.ny;
            const time = (eightBallPhysics_1.EIGHT_BALL_BALL_RADIUS - signedDistance) / normalVelocity;
            if (time < -TIME_EPSILON || time > maxTime + TIME_EPSILON)
                continue;
            const hitX = startX + velocityX * Math.max(0, time);
            const hitY = startY + velocityY * Math.max(0, time);
            const projection = ((hitX - cushion.x1) * cushion.dx + (hitY - cushion.y1) * cushion.dy) / (cushion.length * cushion.length);
            if (projection >= -TIME_EPSILON && projection <= 1 + TIME_EPSILON) {
                addBatchEvent(batch, time, EVENT_CUSHION_FACE, ball, cushionIndex, cushion.nx, cushion.ny);
            }
        }
        for (let capIndex = 0; capIndex < CUSHION_CAPS.length; capIndex += 1) {
            const cap = CUSHION_CAPS[capIndex];
            if (sweptMaxX < cap.x - eightBallPhysics_1.EIGHT_BALL_BALL_RADIUS || sweptMinX > cap.x + eightBallPhysics_1.EIGHT_BALL_BALL_RADIUS
                || sweptMaxY < cap.y - eightBallPhysics_1.EIGHT_BALL_BALL_RADIUS || sweptMinY > cap.y + eightBallPhysics_1.EIGHT_BALL_BALL_RADIUS)
                continue;
            profile.cushionSolves += 1;
            const time = sweptCircleTime(startX - cap.x, startY - cap.y, velocityX, velocityY, eightBallPhysics_1.EIGHT_BALL_BALL_RADIUS, maxTime);
            if (time !== null)
                addBatchEvent(batch, time, EVENT_CUSHION_CAP, ball, capIndex);
        }
        for (let pocketIndex = 0; pocketIndex < eightBallPhysics_1.EIGHT_BALL_POCKETS.length; pocketIndex += 1) {
            const pocket = eightBallPhysics_1.EIGHT_BALL_POCKETS[pocketIndex];
            const sinkRadius = pocketSinkRadius(pocketIndex);
            if (sweptMaxX < pocket.x - sinkRadius || sweptMinX > pocket.x + sinkRadius
                || sweptMaxY < pocket.y - sinkRadius || sweptMinY > pocket.y + sinkRadius)
                continue;
            profile.pocketSolves += 1;
            const time = sweptCircleTime(startX - pocket.x, startY - pocket.y, velocityX, velocityY, sinkRadius, maxTime);
            if (time !== null)
                addBatchEvent(batch, time, EVENT_POCKET, ball, pocketIndex);
        }
    }
}
function advance(state, seconds) {
    if (seconds <= 0)
        return;
    for (let index = 0; index < state.count; index += 1) {
        if (state.pocketed[index])
            continue;
        state.x[index] += state.vx[index] * seconds;
        state.y[index] += state.vy[index] * seconds;
    }
}
function resolveBallContact(state, left, right, events) {
    if (state.pocketed[left] || state.pocketed[right])
        return false;
    let dx = state.x[right] - state.x[left];
    let dy = state.y[right] - state.y[left];
    let distance = Math.hypot(dx, dy);
    if (distance <= TIME_EPSILON) {
        dx = state.numbers[left] < state.numbers[right] ? 1 : -1;
        dy = 0;
        distance = 1;
    }
    const nx = dx / distance;
    const ny = dy / distance;
    const relativeNormalVelocity = (state.vx[right] - state.vx[left]) * nx
        + (state.vy[right] - state.vy[left]) * ny;
    if (relativeNormalVelocity >= -TIME_EPSILON)
        return false;
    if (events.firstHit === null) {
        if (state.numbers[left] === 0 && state.numbers[right] !== 0)
            events.firstHit = state.numbers[right];
        else if (state.numbers[right] === 0 && state.numbers[left] !== 0)
            events.firstHit = state.numbers[left];
    }
    const impulse = -(1 + BALL_RESTITUTION) * relativeNormalVelocity / 2;
    state.vx[left] -= impulse * nx;
    state.vy[left] -= impulse * ny;
    state.vx[right] += impulse * nx;
    state.vy[right] += impulse * ny;
    // Numerical contact slop is corrected symmetrically. Exact time-of-impact
    // normally makes this zero; this branch protects imported or quantized state.
    const penetration = BALL_DIAMETER - distance;
    if (penetration > 0) {
        const correction = penetration / 2 + POSITION_QUANTUM;
        state.x[left] -= correction * nx;
        state.y[left] -= correction * ny;
        state.x[right] += correction * nx;
        state.y[right] += correction * ny;
    }
    return true;
}
function resolveCushionContact(state, ball, nx, ny) {
    if (state.pocketed[ball])
        return false;
    const normalVelocity = state.vx[ball] * nx + state.vy[ball] * ny;
    if (normalVelocity >= -TIME_EPSILON)
        return false;
    state.vx[ball] -= (1 + CUSHION_RESTITUTION) * normalVelocity * nx;
    state.vy[ball] -= (1 + CUSHION_RESTITUTION) * normalVelocity * ny;
    return true;
}
function resolveBatch(state, batch, events, cushionSet, profile) {
    let resolved = 0;
    // A pocket event wins over a simultaneous jaw event for the same ball only
    // once the centre has reached the smaller sink region.
    for (let index = 0; index < batch.count; index += 1) {
        if (batch.type[index] !== EVENT_POCKET)
            continue;
        const ball = batch.a[index];
        if (state.pocketed[ball])
            continue;
        const pocket = eightBallPhysics_1.EIGHT_BALL_POCKETS[batch.b[index]];
        state.pocketed[ball] = 1;
        state.x[ball] = pocket.x;
        state.y[ball] = pocket.y;
        state.vx[ball] = 0;
        state.vy[ball] = 0;
        events.pocketed.push(state.numbers[ball]);
        if (state.numbers[ball] === 0)
            events.cueScratch = true;
        resolved += 1;
    }
    // Repeated fixed-order passes handle simultaneous rack contacts without
    // depending on object allocation or hash/set iteration order.
    for (let pass = 0; pass < 8; pass += 1) {
        let changed = false;
        for (let index = 0; index < batch.count; index += 1) {
            const type = batch.type[index];
            const ball = batch.a[index];
            if (type === EVENT_BALL) {
                if (resolveBallContact(state, ball, batch.b[index], events)) {
                    profile.ballContacts += 1;
                    changed = true;
                    resolved += 1;
                }
            }
            else if (type === EVENT_CUSHION_FACE) {
                if (resolveCushionContact(state, ball, batch.nx[index], batch.ny[index])) {
                    profile.cushionContacts += 1;
                    if (events.firstHit !== null)
                        cushionSet.add(state.numbers[ball]);
                    changed = true;
                    resolved += 1;
                }
            }
            else if (type === EVENT_CUSHION_CAP && !state.pocketed[ball]) {
                const cap = CUSHION_CAPS[batch.b[index]];
                const dx = state.x[ball] - cap.x;
                const dy = state.y[ball] - cap.y;
                const length = Math.hypot(dx, dy) || 1;
                if (resolveCushionContact(state, ball, dx / length, dy / length)) {
                    profile.cushionContacts += 1;
                    if (events.firstHit !== null)
                        cushionSet.add(state.numbers[ball]);
                    changed = true;
                    resolved += 1;
                }
            }
        }
        if (!changed)
            break;
    }
    return resolved;
}
function applyRollingResistance(state) {
    const speedReduction = ROLLING_DECELERATION * STEP_SECONDS;
    for (let index = 0; index < state.count; index += 1) {
        if (state.pocketed[index])
            continue;
        const speed = Math.hypot(state.vx[index], state.vy[index]);
        if (speed <= STOP_SPEED + speedReduction) {
            state.vx[index] = 0;
            state.vy[index] = 0;
            continue;
        }
        const scale = (speed - speedReduction) / speed;
        state.vx[index] = quantize(state.vx[index] * scale, VELOCITY_QUANTUM);
        state.vy[index] = quantize(state.vy[index] * scale, VELOCITY_QUANTUM);
    }
}
function quantizeState(state) {
    for (let index = 0; index < state.count; index += 1) {
        if (state.pocketed[index])
            continue;
        state.x[index] = quantize(state.x[index], POSITION_QUANTUM);
        state.y[index] = quantize(state.y[index], POSITION_QUANTUM);
        state.vx[index] = quantize(state.vx[index], VELOCITY_QUANTUM);
        state.vy[index] = quantize(state.vy[index], VELOCITY_QUANTUM);
    }
}
function isStopped(state) {
    for (let index = 0; index < state.count; index += 1) {
        if (!state.pocketed[index] && (state.vx[index] !== 0 || state.vy[index] !== 0))
            return false;
    }
    return true;
}
function captureFrame(state, timeSeconds) {
    const balls = new Array(state.count);
    for (let index = 0; index < state.count; index += 1) {
        balls[index] = {
            number: state.numbers[index],
            x: state.x[index],
            y: state.y[index],
            vx: state.vx[index],
            vy: state.vy[index],
            pocketed: Boolean(state.pocketed[index]),
        };
    }
    return { timeSeconds, balls };
}
function exportBalls(state) {
    const result = new Array(state.count);
    for (let index = 0; index < state.count; index += 1) {
        result[index] = {
            number: state.numbers[index],
            x: Math.round(state.x[index]),
            y: Math.round(state.y[index]),
            vx: 0,
            vy: 0,
            pocketed: Boolean(state.pocketed[index]),
        };
    }
    // The public protocol persists integer centres. A perfectly separated
    // sub-unit contact can round inward by one unit, so repair only that export
    // artefact deterministically without changing the simulated velocities.
    for (let pass = 0; pass < 24; pass += 1) {
        let changed = false;
        for (let left = 0; left < result.length; left += 1) {
            if (result[left].pocketed)
                continue;
            for (let right = left + 1; right < result.length; right += 1) {
                if (result[right].pocketed)
                    continue;
                let dx = result[right].x - result[left].x;
                let dy = result[right].y - result[left].y;
                let distance = Math.hypot(dx, dy);
                if (distance >= BALL_DIAMETER)
                    continue;
                if (distance === 0) {
                    dx = result[left].number < result[right].number ? 1 : -1;
                    dy = 0;
                    distance = 1;
                }
                const correction = (BALL_DIAMETER - distance) / 2 + 1;
                const correctionX = Math.round(dx / distance * correction);
                const correctionY = Math.round(dy / distance * correction);
                result[left].x -= correctionX;
                result[left].y -= correctionY;
                result[right].x += correctionX;
                result[right].y += correctionY;
                changed = true;
            }
        }
        if (!changed)
            break;
    }
    return result;
}
function countEscapedBalls(state) {
    let escaped = 0;
    for (let index = 0; index < state.count; index += 1) {
        if (state.pocketed[index])
            continue;
        if (state.x[index] < -eightBallPhysics_1.EIGHT_BALL_BALL_RADIUS
            || state.x[index] > eightBallPhysics_1.EIGHT_BALL_TABLE_WIDTH + eightBallPhysics_1.EIGHT_BALL_BALL_RADIUS
            || state.y[index] < -eightBallPhysics_1.EIGHT_BALL_BALL_RADIUS
            || state.y[index] > eightBallPhysics_1.EIGHT_BALL_TABLE_HEIGHT + eightBallPhysics_1.EIGHT_BALL_BALL_RADIUS)
            escaped += 1;
    }
    return escaped;
}
function simulateEightBallShotV7(inputBalls, shot, options = {}) {
    const state = createState(inputBalls);
    const cueIndex = Array.from(state.numbers).findIndex((number) => number === 0);
    if (cueIndex < 0 || state.pocketed[cueIndex])
        throw new Error("Place the cue ball before shooting");
    const aimX = Math.trunc(shot.aimX);
    const aimY = Math.trunc(shot.aimY);
    const power = Math.trunc(shot.power);
    const aimLength = Math.hypot(aimX, aimY);
    if (!Number.isFinite(aimLength) || aimLength <= 0)
        throw new Error("Choose a valid shot direction");
    if (!Number.isInteger(power) || power < 1 || power > eightBallPhysics_1.EIGHT_BALL_MAX_POWER)
        throw new Error("Choose a valid shot power");
    const speed = power * exports.EIGHT_BALL_V7_MAX_SHOT_SPEED / eightBallPhysics_1.EIGHT_BALL_MAX_POWER;
    state.vx[cueIndex] = quantize(aimX / aimLength * speed, VELOCITY_QUANTUM);
    state.vy[cueIndex] = quantize(aimY / aimLength * speed, VELOCITY_QUANTUM);
    const events = { firstHit: null, pocketed: [], cushionBalls: [], cueScratch: false };
    const cushionSet = new Set();
    const profile = {
        ticks: 0,
        eventIterations: 0,
        eventLimitHits: 0,
        escapedBalls: 0,
        pairCandidates: 0,
        pairQuadratics: 0,
        cushionCandidates: 0,
        cushionSolves: 0,
        pocketSolves: 0,
        ballContacts: 0,
        cushionContacts: 0,
        maxEventsInTick: 0,
        capturedFrames: 0,
    };
    const batch = createBatch();
    const maxSeconds = Math.max(STEP_SECONDS, Math.min(60, options.maxSeconds ?? exports.EIGHT_BALL_V7_MAX_SECONDS));
    const maxTicks = Math.ceil(maxSeconds * exports.EIGHT_BALL_V7_STEP_HZ);
    const captureHz = Math.max(0, Math.min(exports.EIGHT_BALL_V7_STEP_HZ, Math.trunc(options.captureHz ?? 0)));
    const captureEveryTicks = captureHz ? Math.max(1, Math.round(exports.EIGHT_BALL_V7_STEP_HZ / captureHz)) : 0;
    const frames = captureEveryTicks ? [captureFrame(state, 0)] : undefined;
    for (let tick = 1; tick <= maxTicks; tick += 1) {
        profile.ticks = tick;
        let remaining = STEP_SECONDS;
        let eventsThisTick = 0;
        while (remaining > TIME_EPSILON && eventsThisTick < MAX_EVENTS_PER_TICK) {
            profile.eventIterations += 1;
            findCollisionBatch(state, remaining, batch, profile);
            if (!Number.isFinite(batch.time) || batch.time > remaining) {
                advance(state, remaining);
                remaining = 0;
                break;
            }
            advance(state, batch.time);
            remaining -= batch.time;
            const resolved = resolveBatch(state, batch, events, cushionSet, profile);
            eventsThisTick += Math.max(1, resolved);
            // A zero-time contact that made no change must not trap the solver.
            if (batch.time <= TIME_EPSILON && resolved === 0) {
                const nudge = Math.min(remaining, STEP_SECONDS / 4096);
                advance(state, nudge);
                remaining -= nudge;
            }
        }
        if (eventsThisTick >= MAX_EVENTS_PER_TICK)
            profile.eventLimitHits += 1;
        if (remaining > TIME_EPSILON)
            advance(state, remaining);
        profile.maxEventsInTick = Math.max(profile.maxEventsInTick, eventsThisTick);
        applyRollingResistance(state);
        quantizeState(state);
        const stopped = isStopped(state);
        if (frames && (tick % captureEveryTicks === 0 || stopped))
            frames.push(captureFrame(state, tick * STEP_SECONDS));
        if (stopped)
            break;
    }
    events.cushionBalls = [...cushionSet].sort((left, right) => left - right);
    profile.capturedFrames = frames?.length ?? 0;
    profile.escapedBalls = countEscapedBalls(state);
    return {
        balls: exportBalls(state),
        events,
        durationSeconds: profile.ticks * STEP_SECONDS,
        frames,
        profile,
    };
}
exports.simulateEightBallShotV7 = simulateEightBallShotV7;
function eightBallV7MinimumSeparationSquared(balls) {
    let minimum = Number.POSITIVE_INFINITY;
    for (let left = 0; left < balls.length; left += 1) {
        if (balls[left].pocketed)
            continue;
        for (let right = left + 1; right < balls.length; right += 1) {
            if (balls[right].pocketed)
                continue;
            const dx = balls[right].x - balls[left].x;
            const dy = balls[right].y - balls[left].y;
            minimum = Math.min(minimum, dx * dx + dy * dy);
        }
    }
    return minimum;
}
exports.eightBallV7MinimumSeparationSquared = eightBallV7MinimumSeparationSquared;
exports.EIGHT_BALL_V7_BALL_DIAMETER_SQUARED = BALL_DIAMETER_SQUARED;
