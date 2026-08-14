"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
const node_perf_hooks_1 = require("node:perf_hooks");
const eightBallPhysics_1 = require("./eightBallPhysics");
const eightBallPhysicsV7_1 = require("./eightBallPhysicsV7");
function withOnly(activeNumbers) {
    const active = new Set(activeNumbers);
    return (0, eightBallPhysics_1.createEightBallRack)().map((ball) => (Object.assign(Object.assign({}, ball), { pocketed: !active.has(ball.number) })));
}
function setBall(balls, number, x, y) {
    const ball = balls.find((candidate) => candidate.number === number);
    if (!ball)
        throw new Error(`Missing ball ${number}`);
    Object.assign(ball, { x, y, vx: 0, vy: 0, pocketed: false });
}
function createScenarios() {
    const straight = withOnly([0, 1]);
    setBall(straight, 0, 2500, 7200);
    setBall(straight, 1, 2500, 5600);
    const bank = withOnly([0, 3]);
    setBall(bank, 0, 1200, 7000);
    setBall(bank, 3, 3300, 4000);
    const cluster = withOnly([0, 1, 2, 3, 4, 5, 6]);
    setBall(cluster, 0, 2500, 7200);
    setBall(cluster, 1, 2500, 4100);
    setBall(cluster, 2, 2321, 3790);
    setBall(cluster, 3, 2679, 3790);
    setBall(cluster, 4, 2142, 3480);
    setBall(cluster, 5, 2500, 3480);
    setBall(cluster, 6, 2858, 3480);
    return [
        { name: "two-ball straight", balls: straight, shot: { aimX: 0, aimY: -10000, power: 650 } },
        { name: "contact and rails", balls: bank, shot: { aimX: 5000, aimY: -10000, power: 600 } },
        { name: "seven-ball cluster", balls: cluster, shot: { aimX: 0, aimY: -10000, power: 850 } },
        { name: "full break", balls: (0, eightBallPhysics_1.createEightBallRack)(), shot: { aimX: 0, aimY: -10000, power: 900 } },
    ];
}
function percentile(sorted, fraction) {
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))];
}
function round(value, digits = 3) {
    const factor = Math.pow(10, digits);
    return Math.round(value * factor) / factor;
}
function timeCalls(iterations, call) {
    for (let warmup = 0; warmup < 5; warmup += 1)
        call();
    const times = new Array(iterations);
    for (let iteration = 0; iteration < iterations; iteration += 1) {
        const start = node_perf_hooks_1.performance.now();
        call();
        times[iteration] = node_perf_hooks_1.performance.now() - start;
    }
    return times.sort((left, right) => left - right);
}
function timingFields(times) {
    const mean = times.reduce((total, value) => total + value, 0) / times.length;
    return {
        meanMs: round(mean),
        p50Ms: round(percentile(times, 0.5)),
        p95Ms: round(percentile(times, 0.95)),
        maxMs: round(times[times.length - 1]),
        shotsPerSecond: round(1000 / mean, 1),
    };
}
function profileAverage(profile, calls, field) {
    return round(profile[field] / calls, 1);
}
function addProfile(target, profile) {
    for (const key of Object.keys(target))
        target[key] += profile[key];
}
function emptyProfile() {
    return {
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
}
function benchmarkScenario(scenario, iterations) {
    let legacySteps = 0;
    const legacyTimes = timeCalls(iterations, () => {
        legacySteps += (0, eightBallPhysics_1.simulateEightBallShot)(scenario.balls, scenario.shot).steps;
    });
    const aggregate = emptyProfile();
    const v7Times = timeCalls(iterations, () => {
        addProfile(aggregate, (0, eightBallPhysicsV7_1.simulateEightBallShotV7)(scenario.balls, scenario.shot).profile);
    });
    // Warmups are intentionally included in work-counter averages because they
    // execute the identical deterministic workload. Timing statistics exclude them.
    const profiledCalls = iterations + 5;
    return [
        Object.assign(Object.assign({ engine: "v6 live", scenario: scenario.name, iterations }, timingFields(legacyTimes)), { ticksOrSteps: round(legacySteps / profiledCalls, 1), eventIterations: "—", eventLimitHits: "—", escapedBalls: "—", pairTests: "—", pairSolves: "—", cushionSolves: "—", contacts: "—" }),
        Object.assign(Object.assign({ engine: "v7 CCD", scenario: scenario.name, iterations }, timingFields(v7Times)), { ticksOrSteps: profileAverage(aggregate, profiledCalls, "ticks"), eventIterations: profileAverage(aggregate, profiledCalls, "eventIterations"), eventLimitHits: profileAverage(aggregate, profiledCalls, "eventLimitHits"), escapedBalls: profileAverage(aggregate, profiledCalls, "escapedBalls"), pairTests: profileAverage(aggregate, profiledCalls, "pairCandidates"), pairSolves: profileAverage(aggregate, profiledCalls, "pairQuadratics"), cushionSolves: profileAverage(aggregate, profiledCalls, "cushionSolves"), contacts: round((aggregate.ballContacts + aggregate.cushionContacts) / profiledCalls, 1) }),
    ];
}
const requestedIterations = Number.parseInt((_a = process.env.EIGHT_BALL_BENCH_ITERATIONS) !== null && _a !== void 0 ? _a : "40", 10);
const iterations = Number.isFinite(requestedIterations) ? Math.max(1, requestedIterations) : 40;
const rows = createScenarios().flatMap((scenario) => benchmarkScenario(scenario, iterations));
console.log(`Eight Ball calculation benchmark (${iterations} timed shots per workload; 5 warmups)`);
console.log("Times are complete shot calculations with frame capture disabled, not render-frame time.");
console.table(rows);
