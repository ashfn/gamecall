import { performance } from "node:perf_hooks";
import {
  createEightBallRack,
  EightBallPhysicsBall,
  EightBallShotVector,
  simulateEightBallShot,
} from "./eightBallPhysics";
import { EightBallV7Profile, simulateEightBallShotV7 } from "./eightBallPhysicsV7";

interface Scenario {
  name: string;
  balls: EightBallPhysicsBall[];
  shot: EightBallShotVector;
}

interface BenchmarkRow {
  engine: string;
  scenario: string;
  iterations: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  shotsPerSecond: number;
  ticksOrSteps: number;
  eventIterations: number | string;
  eventLimitHits: number | string;
  escapedBalls: number | string;
  pairTests: number | string;
  pairSolves: number | string;
  cushionSolves: number | string;
  contacts: number | string;
}

function withOnly(activeNumbers: number[]): EightBallPhysicsBall[] {
  const active = new Set(activeNumbers);
  return createEightBallRack().map((ball) => ({ ...ball, pocketed: !active.has(ball.number) }));
}

function setBall(balls: EightBallPhysicsBall[], number: number, x: number, y: number): void {
  const ball = balls.find((candidate) => candidate.number === number);
  if (!ball) throw new Error(`Missing ball ${number}`);
  Object.assign(ball, { x, y, vx: 0, vy: 0, pocketed: false });
}

function createScenarios(): Scenario[] {
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
    { name: "full break", balls: createEightBallRack(), shot: { aimX: 0, aimY: -10000, power: 900 } },
  ];
}

function percentile(sorted: number[], fraction: number): number {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))];
}

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function timeCalls(iterations: number, call: () => void): number[] {
  for (let warmup = 0; warmup < 5; warmup += 1) call();
  const times = new Array<number>(iterations);
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const start = performance.now();
    call();
    times[iteration] = performance.now() - start;
  }
  return times.sort((left, right) => left - right);
}

function timingFields(times: number[]) {
  const mean = times.reduce((total, value) => total + value, 0) / times.length;
  return {
    meanMs: round(mean),
    p50Ms: round(percentile(times, 0.5)),
    p95Ms: round(percentile(times, 0.95)),
    maxMs: round(times[times.length - 1]),
    shotsPerSecond: round(1000 / mean, 1),
  };
}

function profileAverage(profile: EightBallV7Profile, calls: number, field: keyof EightBallV7Profile): number {
  return round(profile[field] / calls, 1);
}

function addProfile(target: EightBallV7Profile, profile: EightBallV7Profile): void {
  for (const key of Object.keys(target) as (keyof EightBallV7Profile)[]) target[key] += profile[key];
}

function emptyProfile(): EightBallV7Profile {
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

function benchmarkScenario(scenario: Scenario, iterations: number): BenchmarkRow[] {
  let legacySteps = 0;
  const legacyTimes = timeCalls(iterations, () => {
    legacySteps += simulateEightBallShot(scenario.balls, scenario.shot).steps;
  });

  const aggregate = emptyProfile();
  const v7Times = timeCalls(iterations, () => {
    addProfile(aggregate, simulateEightBallShotV7(scenario.balls, scenario.shot).profile);
  });

  // Warmups are intentionally included in work-counter averages because they
  // execute the identical deterministic workload. Timing statistics exclude them.
  const profiledCalls = iterations + 5;
  return [
    {
      engine: "v6 live",
      scenario: scenario.name,
      iterations,
      ...timingFields(legacyTimes),
      ticksOrSteps: round(legacySteps / profiledCalls, 1),
      eventIterations: "—",
      eventLimitHits: "—",
      escapedBalls: "—",
      pairTests: "—",
      pairSolves: "—",
      cushionSolves: "—",
      contacts: "—",
    },
    {
      engine: "v7 CCD",
      scenario: scenario.name,
      iterations,
      ...timingFields(v7Times),
      ticksOrSteps: profileAverage(aggregate, profiledCalls, "ticks"),
      eventIterations: profileAverage(aggregate, profiledCalls, "eventIterations"),
      eventLimitHits: profileAverage(aggregate, profiledCalls, "eventLimitHits"),
      escapedBalls: profileAverage(aggregate, profiledCalls, "escapedBalls"),
      pairTests: profileAverage(aggregate, profiledCalls, "pairCandidates"),
      pairSolves: profileAverage(aggregate, profiledCalls, "pairQuadratics"),
      cushionSolves: profileAverage(aggregate, profiledCalls, "cushionSolves"),
      contacts: round(
        (aggregate.ballContacts + aggregate.cushionContacts) / profiledCalls,
        1,
      ),
    },
  ];
}

const requestedIterations = Number.parseInt(process.env.EIGHT_BALL_BENCH_ITERATIONS ?? "40", 10);
const iterations = Number.isFinite(requestedIterations) ? Math.max(1, requestedIterations) : 40;
const rows = createScenarios().flatMap((scenario) => benchmarkScenario(scenario, iterations));

console.log(`Eight Ball calculation benchmark (${iterations} timed shots per workload; 5 warmups)`);
console.log("Times are complete shot calculations with frame capture disabled, not render-frame time.");
console.table(rows);
