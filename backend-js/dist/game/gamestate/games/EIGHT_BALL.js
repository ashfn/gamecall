"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyEightBallMove = exports.normalizeEightBallState = exports.createEightBallState = exports.EIGHT_BALL_CURRENT_PHYSICS_VERSION = void 0;
const eightBallPhysics_1 = require("./eightBallPhysics");
const eightBallPhysicsV7_1 = require("./eightBallPhysicsV7");
const eightBallPhysicsV8_1 = require("./eightBallPhysicsV8");
const eightBallPhysicsV9_1 = require("./eightBallPhysicsV9");
exports.EIGHT_BALL_CURRENT_PHYSICS_VERSION = eightBallPhysicsV9_1.EIGHT_BALL_V9_PHYSICS_VERSION;
function otherPlayer(state, playerId) {
    return state.player1 === playerId ? state.player2 : state.player1;
}
function cleanBall(raw) {
    if (!raw || typeof raw !== "object")
        return null;
    const value = raw;
    const number = Number(value.number);
    const x = Number(value.x);
    const y = Number(value.y);
    if (!Number.isInteger(number) || number < 0 || number > 15 || !Number.isInteger(x) || !Number.isInteger(y))
        return null;
    return {
        number,
        x,
        y,
        vx: 0,
        vy: 0,
        pocketed: Boolean(value.pocketed),
    };
}
function createEightBallState(player1, player2) {
    return {
        kind: "eight-ball",
        physicsVersion: exports.EIGHT_BALL_CURRENT_PHYSICS_VERSION,
        player1,
        player2,
        balls: (0, eightBallPhysics_1.createEightBallRack)(),
        groups: { [player1]: "OPEN", [player2]: "OPEN" },
        pocketedBy: { [player1]: [], [player2]: [] },
        breakShot: true,
        ballInHandFor: null,
        shotNumber: 0,
        lastShot: null,
        recentShots: [],
    };
}
exports.createEightBallState = createEightBallState;
function normalizeEightBallState(raw) {
    if (!raw || typeof raw !== "object")
        throw new Error("Invalid 8 Ball state");
    const value = raw;
    const player1 = Number(value.player1);
    const player2 = Number(value.player2);
    if (!Number.isInteger(player1) || !Number.isInteger(player2) || player1 <= 0 || player2 <= 0 || player1 === player2) {
        throw new Error("Invalid 8 Ball players");
    }
    const parsedBalls = Array.isArray(value.balls) ? value.balls.map(cleanBall).filter((ball) => ball !== null) : [];
    const balls = (0, eightBallPhysics_1.separateEightBallOverlaps)(parsedBalls);
    if (balls.length !== 16 || new Set(balls.map((ball) => ball.number)).size !== 16)
        throw new Error("Invalid 8 Ball table");
    const validGroup = (group) => group === "SOLIDS" || group === "STRIPES" ? group : "OPEN";
    const ballInHandFor = Number(value.ballInHandFor);
    const storedPhysicsVersion = Math.trunc(Number(value.physicsVersion));
    const physicsVersion = storedPhysicsVersion === eightBallPhysicsV9_1.EIGHT_BALL_V9_PHYSICS_VERSION
        ? eightBallPhysicsV9_1.EIGHT_BALL_V9_PHYSICS_VERSION
        : storedPhysicsVersion === eightBallPhysicsV8_1.EIGHT_BALL_V8_PHYSICS_VERSION
            ? eightBallPhysicsV8_1.EIGHT_BALL_V8_PHYSICS_VERSION
            : storedPhysicsVersion === eightBallPhysicsV7_1.EIGHT_BALL_V7_PHYSICS_VERSION
                ? eightBallPhysicsV7_1.EIGHT_BALL_V7_PHYSICS_VERSION
                : eightBallPhysics_1.EIGHT_BALL_PHYSICS_VERSION;
    const storedPocketedBy = value.pocketedBy && typeof value.pocketedBy === "object" ? value.pocketedBy : null;
    const cleanPocketed = (playerId) => {
        const stored = storedPocketedBy?.[String(playerId)];
        const legacy = !storedPocketedBy && value.lastShot?.playerId === playerId ? value.lastShot.pocketed : [];
        const source = Array.isArray(stored) ? stored : legacy;
        return [...new Set(source
                .map((number) => Number(number))
                .filter((number) => Number.isInteger(number) && number >= 1 && number <= 15))];
    };
    const shotNumber = Math.max(0, Math.trunc(Number(value.shotNumber) || 0));
    const lastShot = value.lastShot && typeof value.lastShot === "object"
        ? value.lastShot
        : null;
    const storedRecentShots = Array.isArray(value.recentShots)
        ? value.recentShots.filter((shot) => Boolean(shot && typeof shot === "object"))
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
exports.normalizeEightBallState = normalizeEightBallState;
function parseShot(rawMove, expectedPhysicsVersion) {
    if (!rawMove || typeof rawMove !== "object")
        throw new Error("Choose a shot");
    const move = rawMove;
    if (move.kind !== "shot")
        throw new Error("Choose a shot");
    const parsed = {
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
function remainingGroupBalls(balls, group) {
    if (group === "OPEN")
        return [];
    return balls.filter((ball) => !ball.pocketed && (0, eightBallPhysics_1.eightBallNumberGroup)(ball.number) === group);
}
function findOpenSpot(balls, preferredY) {
    for (let offset = 0; offset <= 3000; offset += eightBallPhysics_1.EIGHT_BALL_BALL_RADIUS * 2 + 10) {
        for (const direction of [1, -1]) {
            const y = Math.max(eightBallPhysics_1.EIGHT_BALL_BALL_RADIUS, Math.min(eightBallPhysics_1.EIGHT_BALL_TABLE_HEIGHT - eightBallPhysics_1.EIGHT_BALL_BALL_RADIUS, preferredY + offset * direction));
            if ((0, eightBallPhysics_1.isEightBallPlacementLegal)(balls, eightBallPhysics_1.EIGHT_BALL_TABLE_WIDTH / 2, y, 8))
                return { x: eightBallPhysics_1.EIGHT_BALL_TABLE_WIDTH / 2, y };
        }
    }
    return { x: eightBallPhysics_1.EIGHT_BALL_TABLE_WIDTH / 2, y: eightBallPhysics_1.EIGHT_BALL_TABLE_HEIGHT / 2 };
}
function legalFirstTarget(state, playerId, firstHit) {
    if (firstHit === null)
        return false;
    if (state.breakShot)
        return firstHit === 1;
    const group = state.groups[String(playerId)] ?? "OPEN";
    if (group === "OPEN")
        return firstHit !== 8;
    if (remainingGroupBalls(state.balls, group).length === 0)
        return firstHit === 8;
    return (0, eightBallPhysics_1.eightBallNumberGroup)(firstHit) === group;
}
function applyEightBallMove(rawState, playerId, rawMove) {
    const state = normalizeEightBallState(rawState);
    if (playerId !== state.player1 && playerId !== state.player2)
        throw new Error("You are not in this game");
    const opponentId = otherPlayer(state, playerId);
    const move = parseShot(rawMove, state.physicsVersion);
    const balls = state.balls.map((ball) => ({ ...ball }));
    const cue = balls.find((ball) => ball.number === 0);
    if (state.breakShot && (move.cueX !== undefined || move.cueY !== undefined)) {
        if (move.cueX === undefined || move.cueY === undefined || !(0, eightBallPhysics_1.isEightBallBreakPlacementLegal)(balls, move.cueX, move.cueY)) {
            throw new Error("Place the cue ball behind the head line");
        }
        cue.x = move.cueX;
        cue.y = move.cueY;
        cue.pocketed = false;
    }
    else if (state.ballInHandFor === playerId) {
        if (move.cueX === undefined || move.cueY === undefined || !(0, eightBallPhysics_1.isEightBallPlacementLegal)(balls, move.cueX, move.cueY, 0)) {
            throw new Error("Place the cue ball in a clear position");
        }
        cue.x = move.cueX;
        cue.y = move.cueY;
        cue.pocketed = false;
    }
    else if (cue.pocketed) {
        throw new Error("The cue ball must be placed before shooting");
    }
    const startBalls = balls.map((ball) => ({ ...ball, vx: 0, vy: 0 }));
    const simulation = state.physicsVersion === eightBallPhysicsV9_1.EIGHT_BALL_V9_PHYSICS_VERSION
        ? (0, eightBallPhysicsV9_1.simulateEightBallShotV9)(balls, move)
        : state.physicsVersion === eightBallPhysicsV8_1.EIGHT_BALL_V8_PHYSICS_VERSION
            ? (0, eightBallPhysicsV8_1.simulateEightBallShotV8)(balls, move)
            : state.physicsVersion === eightBallPhysicsV7_1.EIGHT_BALL_V7_PHYSICS_VERSION
                ? (0, eightBallPhysicsV7_1.simulateEightBallShotV7)(balls, move)
                : (0, eightBallPhysics_1.simulateEightBallShot)(balls, move);
    const events = simulation.events;
    const pocketedObjects = events.pocketed.filter((number) => number !== 0 && number !== 8);
    const hitLegalTarget = legalFirstTarget(state, playerId, events.firstHit);
    const breakLegal = !state.breakShot || (events.firstHit === 1 && (pocketedObjects.length > 0 || events.cushionBalls.filter((number) => number !== 0).length >= 4));
    let foul = null;
    if (events.cueScratch)
        foul = "Cue ball pocketed";
    else if (events.firstHit === null)
        foul = "No ball was hit";
    else if (!hitLegalTarget)
        foul = "Wrong ball hit first";
    else if (!breakLegal)
        foul = "Illegal break";
    else if (events.pocketed.length === 0 && events.cushionBalls.length === 0)
        foul = "No ball reached a cushion";
    const eightPocketed = events.pocketed.includes(8);
    const nextPocketedBy = {
        [state.player1]: [...state.pocketedBy[String(state.player1)]],
        [state.player2]: [...state.pocketedBy[String(state.player2)]],
    };
    const newlyPocketed = events.pocketed.filter((number) => number !== 0 && !(state.breakShot && number === 8));
    for (const number of newlyPocketed) {
        if (!nextPocketedBy[playerId].includes(number))
            nextPocketedBy[playerId].push(number);
    }
    const playerGroupBefore = state.groups[String(playerId)] ?? "OPEN";
    const clearedBeforeShot = playerGroupBefore !== "OPEN" && remainingGroupBalls(state.balls, playerGroupBefore).length === 0;
    const completedShotNumber = state.shotNumber + 1;
    const completedShot = (shotFoul) => ({
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
    const appendRecentShot = (shot) => (state.recentShots[state.recentShots.length - 1]?.playerId === playerId
        ? [...state.recentShots, shot].slice(-16)
        : [shot]);
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
        const eight = simulation.balls.find((ball) => ball.number === 8);
        const spot = findOpenSpot(simulation.balls, 3000);
        eight.x = spot.x;
        eight.y = spot.y;
        eight.vx = 0;
        eight.vy = 0;
        eight.pocketed = false;
    }
    const nextGroups = { ...state.groups };
    if (!foul && !state.breakShot && playerGroupBefore === "OPEN") {
        const assignedNumber = events.pocketed.find((number) => (0, eightBallPhysics_1.eightBallNumberGroup)(number) !== "SPECIAL");
        if (assignedNumber !== undefined) {
            const assigned = (0, eightBallPhysics_1.eightBallNumberGroup)(assignedNumber);
            nextGroups[String(playerId)] = assigned;
            nextGroups[String(opponentId)] = assigned === "SOLIDS" ? "STRIPES" : "SOLIDS";
        }
    }
    const effectiveGroup = nextGroups[String(playerId)] ?? "OPEN";
    const pocketedOwn = pocketedObjects.some((number) => effectiveGroup === "OPEN" || (0, eightBallPhysics_1.eightBallNumberGroup)(number) === effectiveGroup);
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
exports.applyEightBallMove = applyEightBallMove;
