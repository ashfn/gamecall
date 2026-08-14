import {
  createEightBallRack,
  eightBallNumberGroup,
  EIGHT_BALL_BALL_RADIUS,
  EIGHT_BALL_TABLE_HEIGHT,
  EIGHT_BALL_TABLE_WIDTH,
  EIGHT_BALL_PHYSICS_VERSION as EIGHT_BALL_LEGACY_PHYSICS_VERSION,
  EightBallPhysicsBall,
  EightBallShotVector,
  isEightBallBreakPlacementLegal,
  isEightBallPlacementLegal,
  separateEightBallOverlaps,
  simulateEightBallShot as simulateLegacyEightBallShot,
} from "./eightBallPhysics";
import {
  EIGHT_BALL_V7_PHYSICS_VERSION,
  simulateEightBallShotV7,
} from "./eightBallPhysicsV7";
import {
  EIGHT_BALL_V8_PHYSICS_VERSION,
  simulateEightBallShotV8,
} from "./eightBallPhysicsV8";
import {
  EIGHT_BALL_V9_PHYSICS_VERSION,
  simulateEightBallShotV9,
} from "./eightBallPhysicsV9";

export const EIGHT_BALL_CURRENT_PHYSICS_VERSION = EIGHT_BALL_V9_PHYSICS_VERSION;

export type EightBallGroup = "OPEN" | "SOLIDS" | "STRIPES";

export interface EightBallLastShot {
  playerId: number;
  shotNumber?: number;
  physicsVersion?: number;
  startBalls?: EightBallPhysicsBall[];
  aimX?: number;
  aimY?: number;
  cueX?: number;
  cueY?: number;
  power: number;
  firstHit: number | null;
  pocketed: number[];
  foul: string | null;
}

export interface EightBallState {
  kind: "eight-ball";
  physicsVersion: number;
  player1: number;
  player2: number;
  balls: EightBallPhysicsBall[];
  groups: Record<string, EightBallGroup>;
  pocketedBy: Record<string, number[]>;
  breakShot: boolean;
  ballInHandFor: number | null;
  shotNumber: number;
  lastShot: EightBallLastShot | null;
  recentShots: EightBallLastShot[];
}

interface EightBallShotMove extends EightBallShotVector {
  kind: "shot";
  physicsVersion: number;
  cueX?: number;
  cueY?: number;
}

function otherPlayer(state: EightBallState, playerId: number) {
  return state.player1 === playerId ? state.player2 : state.player1;
}

function cleanBall(raw: unknown): EightBallPhysicsBall | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<EightBallPhysicsBall>;
  const number = Number(value.number);
  const x = Number(value.x);
  const y = Number(value.y);
  if (!Number.isInteger(number) || number < 0 || number > 15 || !Number.isInteger(x) || !Number.isInteger(y)) return null;
  return {
    number,
    x,
    y,
    vx: 0,
    vy: 0,
    pocketed: Boolean(value.pocketed),
  };
}

export function createEightBallState(player1: number, player2: number): EightBallState {
  return {
    kind: "eight-ball",
    physicsVersion: EIGHT_BALL_CURRENT_PHYSICS_VERSION,
    player1,
    player2,
    balls: createEightBallRack(),
    groups: { [player1]: "OPEN", [player2]: "OPEN" },
    pocketedBy: { [player1]: [], [player2]: [] },
    breakShot: true,
    ballInHandFor: null,
    shotNumber: 0,
    lastShot: null,
    recentShots: [],
  };
}

export function normalizeEightBallState(raw: unknown): EightBallState {
  if (!raw || typeof raw !== "object") throw new Error("Invalid 8 Ball state");
  const value = raw as Partial<EightBallState>;
  const player1 = Number(value.player1);
  const player2 = Number(value.player2);
  if (!Number.isInteger(player1) || !Number.isInteger(player2) || player1 <= 0 || player2 <= 0 || player1 === player2) {
    throw new Error("Invalid 8 Ball players");
  }
  const parsedBalls = Array.isArray(value.balls) ? value.balls.map(cleanBall).filter((ball): ball is EightBallPhysicsBall => ball !== null) : [];
  const balls = separateEightBallOverlaps(parsedBalls);
  if (balls.length !== 16 || new Set(balls.map((ball) => ball.number)).size !== 16) throw new Error("Invalid 8 Ball table");
  const validGroup = (group: unknown): EightBallGroup => group === "SOLIDS" || group === "STRIPES" ? group : "OPEN";
  const ballInHandFor = Number(value.ballInHandFor);
  const storedPhysicsVersion = Math.trunc(Number(value.physicsVersion));
  const physicsVersion = storedPhysicsVersion === EIGHT_BALL_V9_PHYSICS_VERSION
    ? EIGHT_BALL_V9_PHYSICS_VERSION
    : storedPhysicsVersion === EIGHT_BALL_V8_PHYSICS_VERSION
      ? EIGHT_BALL_V8_PHYSICS_VERSION
      : storedPhysicsVersion === EIGHT_BALL_V7_PHYSICS_VERSION
        ? EIGHT_BALL_V7_PHYSICS_VERSION
        : EIGHT_BALL_LEGACY_PHYSICS_VERSION;
  const storedPocketedBy = value.pocketedBy && typeof value.pocketedBy === "object" ? value.pocketedBy : null;
  const cleanPocketed = (playerId: number) => {
    const stored = storedPocketedBy?.[String(playerId)];
    const legacy = !storedPocketedBy && value.lastShot?.playerId === playerId ? value.lastShot.pocketed : [];
    const source = Array.isArray(stored) ? stored : legacy;
    return [...new Set(source
      .map((number) => Number(number))
      .filter((number) => Number.isInteger(number) && number >= 1 && number <= 15))];
  };
  const shotNumber = Math.max(0, Math.trunc(Number(value.shotNumber) || 0));
  const lastShot = value.lastShot && typeof value.lastShot === "object"
    ? value.lastShot as EightBallLastShot
    : null;
  const storedRecentShots = Array.isArray(value.recentShots)
    ? value.recentShots.filter((shot): shot is EightBallLastShot => Boolean(shot && typeof shot === "object"))
    : [];
  const replaySource = storedRecentShots.length > 0 ? storedRecentShots : lastShot ? [lastShot] : [];
  const recentShots = replaySource.slice(-16).map((shot, index, shots) => ({
    ...shot,
    shotNumber: Number.isInteger(shot.shotNumber)
      ? shot.shotNumber
      : Math.max(1, shotNumber - shots.length + index + 1),
  }));
  return {
    kind: "eight-ball",
    physicsVersion,
    player1,
    player2,
    balls: balls.sort((left, right) => left.number - right.number),
    groups: {
      [player1]: validGroup(value.groups?.[String(player1)]),
      [player2]: validGroup(value.groups?.[String(player2)]),
    },
    pocketedBy: {
      [player1]: cleanPocketed(player1),
      [player2]: cleanPocketed(player2),
    },
    breakShot: Boolean(value.breakShot),
    ballInHandFor: ballInHandFor === player1 || ballInHandFor === player2 ? ballInHandFor : null,
    shotNumber,
    lastShot,
    recentShots,
  };
}

function parseShot(rawMove: unknown, expectedPhysicsVersion: number): EightBallShotMove {
  if (!rawMove || typeof rawMove !== "object") throw new Error("Choose a shot");
  const move = rawMove as Partial<EightBallShotMove>;
  if (move.kind !== "shot") throw new Error("Choose a shot");
  const parsed: EightBallShotMove = {
    kind: "shot",
    physicsVersion: Math.trunc(Number(move.physicsVersion)),
    aimX: Math.trunc(Number(move.aimX)),
    aimY: Math.trunc(Number(move.aimY)),
    power: Math.trunc(Number(move.power)),
  };
  if (parsed.physicsVersion !== expectedPhysicsVersion) {
    throw new Error("8 Ball physics update required");
  }
  if (move.cueX !== undefined || move.cueY !== undefined) {
    parsed.cueX = Math.trunc(Number(move.cueX));
    parsed.cueY = Math.trunc(Number(move.cueY));
  }
  return parsed;
}

function remainingGroupBalls(balls: EightBallPhysicsBall[], group: EightBallGroup) {
  if (group === "OPEN") return [];
  return balls.filter((ball) => !ball.pocketed && eightBallNumberGroup(ball.number) === group);
}

function findOpenSpot(balls: EightBallPhysicsBall[], preferredY: number) {
  for (let offset = 0; offset <= 3000; offset += EIGHT_BALL_BALL_RADIUS * 2 + 10) {
    for (const direction of [1, -1]) {
      const y = Math.max(EIGHT_BALL_BALL_RADIUS, Math.min(EIGHT_BALL_TABLE_HEIGHT - EIGHT_BALL_BALL_RADIUS, preferredY + offset * direction));
      if (isEightBallPlacementLegal(balls, EIGHT_BALL_TABLE_WIDTH / 2, y, 8)) return { x: EIGHT_BALL_TABLE_WIDTH / 2, y };
    }
  }
  return { x: EIGHT_BALL_TABLE_WIDTH / 2, y: EIGHT_BALL_TABLE_HEIGHT / 2 };
}

function legalFirstTarget(state: EightBallState, playerId: number, firstHit: number | null) {
  if (firstHit === null) return false;
  if (state.breakShot) return firstHit === 1;
  const group = state.groups[String(playerId)] ?? "OPEN";
  if (group === "OPEN") return firstHit !== 8;
  if (remainingGroupBalls(state.balls, group).length === 0) return firstHit === 8;
  return eightBallNumberGroup(firstHit) === group;
}

export function applyEightBallMove(rawState: unknown, playerId: number, rawMove: unknown) {
  const state = normalizeEightBallState(rawState);
  if (playerId !== state.player1 && playerId !== state.player2) throw new Error("You are not in this game");
  const opponentId = otherPlayer(state, playerId);
  const move = parseShot(rawMove, state.physicsVersion);
  const balls = state.balls.map((ball) => ({ ...ball }));
  const cue = balls.find((ball) => ball.number === 0)!;

  if (state.breakShot && (move.cueX !== undefined || move.cueY !== undefined)) {
    if (move.cueX === undefined || move.cueY === undefined || !isEightBallBreakPlacementLegal(balls, move.cueX, move.cueY)) {
      throw new Error("Place the cue ball behind the head line");
    }
    cue.x = move.cueX;
    cue.y = move.cueY;
    cue.pocketed = false;
  } else if (state.ballInHandFor === playerId) {
    if (move.cueX === undefined || move.cueY === undefined || !isEightBallPlacementLegal(balls, move.cueX, move.cueY, 0)) {
      throw new Error("Place the cue ball in a clear position");
    }
    cue.x = move.cueX;
    cue.y = move.cueY;
    cue.pocketed = false;
  } else if (cue.pocketed) {
    throw new Error("The cue ball must be placed before shooting");
  }

  const startBalls = balls.map((ball) => ({ ...ball, vx: 0, vy: 0 }));
  const simulation = state.physicsVersion === EIGHT_BALL_V9_PHYSICS_VERSION
    ? simulateEightBallShotV9(balls, move)
    : state.physicsVersion === EIGHT_BALL_V8_PHYSICS_VERSION
      ? simulateEightBallShotV8(balls, move)
      : state.physicsVersion === EIGHT_BALL_V7_PHYSICS_VERSION
        ? simulateEightBallShotV7(balls, move)
        : simulateLegacyEightBallShot(balls, move);
  const events = simulation.events;
  const pocketedObjects = events.pocketed.filter((number) => number !== 0 && number !== 8);
  const hitLegalTarget = legalFirstTarget(state, playerId, events.firstHit);
  const breakLegal = !state.breakShot || (events.firstHit === 1 && (pocketedObjects.length > 0 || events.cushionBalls.filter((number) => number !== 0).length >= 4));
  let foul: string | null = null;
  if (events.cueScratch) foul = "Cue ball pocketed";
  else if (events.firstHit === null) foul = "No ball was hit";
  else if (!hitLegalTarget) foul = "Wrong ball hit first";
  else if (!breakLegal) foul = "Illegal break";
  else if (events.pocketed.length === 0 && events.cushionBalls.length === 0) foul = "No ball reached a cushion";

  const eightPocketed = events.pocketed.includes(8);
  const nextPocketedBy = {
    [state.player1]: [...state.pocketedBy[String(state.player1)]],
    [state.player2]: [...state.pocketedBy[String(state.player2)]],
  };
  const newlyPocketed = events.pocketed.filter((number) => number !== 0 && !(state.breakShot && number === 8));
  for (const number of newlyPocketed) {
    if (!nextPocketedBy[playerId].includes(number)) nextPocketedBy[playerId].push(number);
  }
  const playerGroupBefore = state.groups[String(playerId)] ?? "OPEN";
  const clearedBeforeShot = playerGroupBefore !== "OPEN" && remainingGroupBalls(state.balls, playerGroupBefore).length === 0;
  const completedShotNumber = state.shotNumber + 1;
  const completedShot = (shotFoul: string | null): EightBallLastShot => ({
    playerId,
    shotNumber: completedShotNumber,
    physicsVersion: state.physicsVersion,
    startBalls,
    aimX: move.aimX,
    aimY: move.aimY,
    ...(move.cueX !== undefined && move.cueY !== undefined ? { cueX: move.cueX, cueY: move.cueY } : {}),
    power: move.power,
    firstHit: events.firstHit,
    pocketed: events.pocketed,
    foul: shotFoul,
  });
  const appendRecentShot = (shot: EightBallLastShot) => (
    state.recentShots[state.recentShots.length - 1]?.playerId === playerId
      ? [...state.recentShots, shot].slice(-16)
      : [shot]
  );
  if (eightPocketed && !state.breakShot) {
    const legalEight = !foul && clearedBeforeShot && events.firstHit === 8;
    const shot = completedShot(legalEight ? null : foul ?? "8 ball pocketed early");
    return {
      state: {
        ...state,
        balls: simulation.balls,
        pocketedBy: nextPocketedBy,
        breakShot: false,
        ballInHandFor: null,
        shotNumber: completedShotNumber,
        lastShot: shot,
        recentShots: appendRecentShot(shot),
      },
      winner: legalEight ? playerId : opponentId,
      nextPlayer: 0,
    };
  }

  if (eightPocketed && state.breakShot) {
    const eight = simulation.balls.find((ball) => ball.number === 8)!;
    const spot = findOpenSpot(simulation.balls, 3000);
    eight.x = spot.x;
    eight.y = spot.y;
    eight.vx = 0;
    eight.vy = 0;
    eight.pocketed = false;
  }

  const nextGroups = { ...state.groups };
  if (!foul && !state.breakShot && playerGroupBefore === "OPEN") {
    const assignedNumber = events.pocketed.find((number) => eightBallNumberGroup(number) !== "SPECIAL");
    if (assignedNumber !== undefined) {
      const assigned = eightBallNumberGroup(assignedNumber) as Exclude<EightBallGroup, "OPEN">;
      nextGroups[String(playerId)] = assigned;
      nextGroups[String(opponentId)] = assigned === "SOLIDS" ? "STRIPES" : "SOLIDS";
    }
  }

  const effectiveGroup = nextGroups[String(playerId)] ?? "OPEN";
  const pocketedOwn = pocketedObjects.some((number) => effectiveGroup === "OPEN" || eightBallNumberGroup(number) === effectiveGroup);
  const continueTurn = !foul && pocketedOwn;
  const nextPlayer = continueTurn ? playerId : opponentId;
  const shot = completedShot(foul);
  return {
    state: {
      ...state,
      balls: simulation.balls,
      groups: nextGroups,
      pocketedBy: nextPocketedBy,
      breakShot: false,
      ballInHandFor: foul ? opponentId : null,
      shotNumber: completedShotNumber,
      lastShot: shot,
      recentShots: appendRecentShot(shot),
    },
    winner: 0,
    nextPlayer,
  };
}
