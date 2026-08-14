"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyNumberDropTurnTimeout = exports.applyNumberDropMove = exports.evaluateNumberDropSubmission = exports.viewNumberDropState = exports.normalizeNumberDropState = exports.createNumberDropState = exports.solveNumberDrop = exports.calculateNumberDropOperation = exports.numberDropScore = exports.normalizeNumberDropSettings = void 0;
const NUMBER_SETS = [
    [100, 75, 25, 8, 7, 3],
    [100, 50, 25, 9, 6, 4],
    [75, 50, 25, 10, 7, 2],
    [100, 25, 10, 8, 6, 3],
    [50, 25, 10, 9, 7, 4],
    [100, 75, 50, 8, 6, 3],
];
const MAX_INTERMEDIATE = 100000;
function normalizeNumberDropSettings(raw) {
    const candidate = raw && typeof raw === "object" ? raw : {};
    const rounds = candidate.rounds === 3 || candidate.rounds === 5 ? candidate.rounds : 1;
    const moveTimerSeconds = candidate.moveTimerSeconds === 120 || candidate.moveTimerSeconds === 300
        ? candidate.moveTimerSeconds
        : null;
    return { rounds, moveTimerSeconds };
}
exports.normalizeNumberDropSettings = normalizeNumberDropSettings;
function operationSymbol(operation) {
    if (operation === "ADD")
        return "+";
    if (operation === "SUBTRACT")
        return "−";
    if (operation === "MULTIPLY")
        return "×";
    return "÷";
}
function numberDropScore(distance) {
    if (!Number.isFinite(distance) || distance < 0)
        return 0;
    return Math.max(0, Math.round(100 - 12 * Math.sqrt(distance)));
}
exports.numberDropScore = numberDropScore;
function calculateNumberDropOperation(left, right, operation) {
    if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right) || left <= 0 || right <= 0)
        return null;
    let result;
    if (operation === "ADD")
        result = left + right;
    else if (operation === "SUBTRACT")
        result = left - right;
    else if (operation === "MULTIPLY")
        result = left * right;
    else {
        if (right === 0 || left % right !== 0)
            return null;
        result = left / right;
    }
    return Number.isSafeInteger(result) && result > 0 && result <= MAX_INTERMEDIATE ? result : null;
}
exports.calculateNumberDropOperation = calculateNumberDropOperation;
function addSolvedValue(map, candidate) {
    const current = map.get(candidate.value);
    if (!current || candidate.operations < current.operations) {
        map.set(candidate.value, candidate);
    }
    else if (candidate.operations === current.operations) {
        current.routeCount = Math.min(99, current.routeCount + candidate.routeCount);
    }
}
function buildNumberDropSolutions(numbers) {
    const size = 1 << numbers.length;
    const solved = Array.from({ length: size }, () => new Map());
    numbers.forEach((number, index) => solved[1 << index].set(number, {
        value: number,
        expression: String(number),
        operations: 0,
        routeCount: 1,
    }));
    for (let mask = 1; mask < solved.length; mask += 1) {
        if ((mask & (mask - 1)) === 0)
            continue;
        for (let leftMask = (mask - 1) & mask; leftMask > 0; leftMask = (leftMask - 1) & mask) {
            const rightMask = mask ^ leftMask;
            if (!rightMask || leftMask > rightMask)
                continue;
            for (const left of solved[leftMask].values()) {
                for (const right of solved[rightMask].values()) {
                    const operations = left.operations + right.operations + 1;
                    const candidates = [
                        [calculateNumberDropOperation(left.value, right.value, "ADD"), `(${left.expression} + ${right.expression})`],
                        [calculateNumberDropOperation(left.value, right.value, "MULTIPLY"), `(${left.expression} × ${right.expression})`],
                        [calculateNumberDropOperation(left.value, right.value, "SUBTRACT"), `(${left.expression} − ${right.expression})`],
                        [calculateNumberDropOperation(right.value, left.value, "SUBTRACT"), `(${right.expression} − ${left.expression})`],
                        [calculateNumberDropOperation(left.value, right.value, "DIVIDE"), `(${left.expression} ÷ ${right.expression})`],
                        [calculateNumberDropOperation(right.value, left.value, "DIVIDE"), `(${right.expression} ÷ ${left.expression})`],
                    ];
                    for (const [value, expression] of candidates) {
                        if (value === null)
                            continue;
                        addSolvedValue(solved[mask], {
                            value,
                            expression,
                            operations,
                            routeCount: Math.min(99, left.routeCount * right.routeCount),
                        });
                    }
                }
            }
        }
    }
    return solved;
}
function solveNumberDrop(numbers, target) {
    var _a;
    const solved = buildNumberDropSolutions(numbers);
    let best = null;
    for (let mask = 1; mask < solved.length; mask += 1) {
        for (const candidate of solved[mask].values()) {
            const distance = Math.abs(candidate.value - target);
            const bestDistance = best ? Math.abs(best.value - target) : Number.POSITIVE_INFINITY;
            if (distance < bestDistance || (distance === bestDistance && candidate.operations < ((_a = best === null || best === void 0 ? void 0 : best.operations) !== null && _a !== void 0 ? _a : Infinity))) {
                best = candidate;
            }
        }
    }
    if (!best)
        throw new Error("This puzzle has no legal answers");
    return Object.assign(Object.assign({}, best), { distance: Math.abs(best.value - target) });
}
exports.solveNumberDrop = solveNumberDrop;
const hardTargetCache = new Map();
function hardTargets(numbers) {
    const cacheKey = numbers.join(",");
    const cached = hardTargetCache.get(cacheKey);
    if (cached)
        return cached;
    const exactSolutions = new Map();
    for (const values of buildNumberDropSolutions(numbers)) {
        for (const solution of values.values()) {
            if (solution.value < 101 || solution.value > 999)
                continue;
            addSolvedValue(exactSolutions, Object.assign({}, solution));
        }
    }
    const targets = [...exactSolutions.values()]
        .filter((solution) => solution.operations >= 4 && solution.routeCount <= 12)
        .map((solution) => ({ target: solution.value, solution }));
    hardTargetCache.set(cacheKey, targets);
    return targets;
}
function puzzleForPlayers(player1, player2) {
    const setIndex = Math.abs((player1 * 31 + player2 * 17 + Date.now()) % NUMBER_SETS.length);
    const numbers = [...NUMBER_SETS[setIndex]];
    const candidates = hardTargets(numbers);
    if (candidates.length === 0)
        throw new Error("Could not generate a Number Drop puzzle");
    const candidate = candidates[Math.floor(Math.random() * candidates.length)];
    return Object.assign({ numbers }, candidate);
}
function createNumberDropState(player1, player2, rawSettings = {}) {
    const settings = normalizeNumberDropSettings(rawSettings);
    const puzzle = puzzleForPlayers(player1, player2);
    return {
        kind: "number-drop",
        player1,
        player2,
        totalRounds: settings.rounds,
        currentRound: 1,
        numbers: puzzle.numbers,
        target: puzzle.target,
        submissions: { [player1]: null, [player2]: null },
        bestValue: puzzle.solution.value,
        bestDistance: 0,
        bestExpression: puzzle.solution.expression,
        minimumOperations: puzzle.solution.operations,
        scores: { [player1]: 0, [player2]: 0 },
        rounds: [],
    };
}
exports.createNumberDropState = createNumberDropState;
function normalizeNumberDropState(raw) {
    var _a;
    if (!raw || typeof raw !== "object")
        throw new Error("Invalid Number Drop state");
    const candidate = raw;
    const state = Object.assign(Object.assign({}, candidate), { totalRounds: candidate.totalRounds === 3 || candidate.totalRounds === 5 ? candidate.totalRounds : 1, currentRound: Number.isInteger(candidate.currentRound) && candidate.currentRound > 0 ? candidate.currentRound : 1, scores: (_a = candidate.scores) !== null && _a !== void 0 ? _a : { [candidate.player1]: 0, [candidate.player2]: 0 }, rounds: Array.isArray(candidate.rounds) ? candidate.rounds : [] });
    if (state.kind !== "number-drop" || !Number.isInteger(state.player1) || !Number.isInteger(state.player2))
        throw new Error("Invalid Number Drop players");
    if (!Array.isArray(state.numbers) || state.numbers.length !== 6 || state.numbers.some((number) => !Number.isSafeInteger(number) || number <= 0))
        throw new Error("Invalid Number Drop numbers");
    if (!Number.isSafeInteger(state.target) || state.target < 100 || state.target > 999)
        throw new Error("Invalid Number Drop target");
    return state;
}
exports.normalizeNumberDropState = normalizeNumberDropState;
function viewNumberDropState(raw, viewerId) {
    const state = normalizeNumberDropState(raw);
    const finished = Boolean(state.submissions[String(state.player1)] && state.submissions[String(state.player2)]);
    return Object.assign(Object.assign({}, state), { submissions: {
            [state.player1]: finished || viewerId === state.player1 ? state.submissions[String(state.player1)] : null,
            [state.player2]: finished || viewerId === state.player2 ? state.submissions[String(state.player2)] : null,
        }, bestValue: finished ? state.bestValue : 0, bestDistance: finished ? state.bestDistance : 0, bestExpression: finished ? state.bestExpression : "", minimumOperations: finished ? state.minimumOperations : 0 });
}
exports.viewNumberDropState = viewNumberDropState;
function evaluateNumberDropSubmission(numbers, steps, resultId) {
    if (!Array.isArray(steps) || steps.length > numbers.length - 1)
        throw new Error("Invalid answer route");
    const available = new Map(numbers.map((value, index) => [`n${index}`, { value, expression: String(value) }]));
    const normalizedSteps = [];
    steps.forEach((step, index) => {
        if (!step || typeof step.leftId !== "string" || typeof step.rightId !== "string" || step.leftId === step.rightId)
            throw new Error("Invalid answer route");
        if (!["ADD", "SUBTRACT", "MULTIPLY", "DIVIDE"].includes(step.operation))
            throw new Error("Invalid operation");
        const left = available.get(step.leftId);
        const right = available.get(step.rightId);
        if (!left || !right)
            throw new Error("A number was reused or is unavailable");
        const value = calculateNumberDropOperation(left.value, right.value, step.operation);
        if (value === null)
            throw new Error("That calculation is not allowed");
        available.delete(step.leftId);
        available.delete(step.rightId);
        const resultKey = `r${index}`;
        available.set(resultKey, { value, expression: `(${left.expression} ${operationSymbol(step.operation)} ${right.expression})` });
        normalizedSteps.push({ leftId: step.leftId, rightId: step.rightId, operation: step.operation });
    });
    const result = available.get(resultId);
    if (!result)
        throw new Error("Choose an available result to submit");
    return Object.assign(Object.assign({}, result), { steps: normalizedSteps });
}
exports.evaluateNumberDropSubmission = evaluateNumberDropSubmission;
function applyNumberDropSubmission(state, playerId, submission) {
    var _a, _b;
    const submissions = Object.assign(Object.assign({}, state.submissions), { [playerId]: submission });
    const opponentId = playerId === state.player1 ? state.player2 : state.player1;
    const opponentSubmission = submissions[String(opponentId)];
    if (!opponentSubmission)
        return { state: Object.assign(Object.assign({}, state), { submissions }), winner: 0, nextPlayer: opponentId };
    const player1Submission = submissions[String(state.player1)];
    const player2Submission = submissions[String(state.player2)];
    const scores = Object.assign(Object.assign({}, state.scores), { [state.player1]: ((_a = state.scores[String(state.player1)]) !== null && _a !== void 0 ? _a : 0) + player1Submission.score, [state.player2]: ((_b = state.scores[String(state.player2)]) !== null && _b !== void 0 ? _b : 0) + player2Submission.score });
    const roundResult = {
        round: state.currentRound,
        numbers: state.numbers,
        target: state.target,
        submissions: {
            [state.player1]: player1Submission,
            [state.player2]: player2Submission,
        },
        bestValue: state.bestValue,
        bestExpression: state.bestExpression,
    };
    const rounds = [...state.rounds, roundResult];
    if (state.currentRound >= state.totalRounds) {
        const winner = scores[String(state.player1)] === scores[String(state.player2)]
            ? -1
            : scores[String(state.player1)] > scores[String(state.player2)] ? state.player1 : state.player2;
        return { state: Object.assign(Object.assign({}, state), { submissions, scores, rounds }), winner, nextPlayer: 0 };
    }
    const nextRound = state.currentRound + 1;
    const puzzle = puzzleForPlayers(state.player1 + nextRound * 13, state.player2 + nextRound * 29);
    const nextPlayer = nextRound % 2 === 1 ? state.player1 : state.player2;
    return {
        state: Object.assign(Object.assign({}, state), { currentRound: nextRound, numbers: puzzle.numbers, target: puzzle.target, submissions: { [state.player1]: null, [state.player2]: null }, bestValue: puzzle.solution.value, bestDistance: 0, bestExpression: puzzle.solution.expression, minimumOperations: puzzle.solution.operations, scores,
            rounds }),
        winner: 0,
        nextPlayer,
    };
}
function assertCanSubmit(state, playerId) {
    if (playerId !== state.player1 && playerId !== state.player2)
        throw new Error("You are not in this game");
    if (state.submissions[String(playerId)])
        throw new Error("You already submitted an answer");
}
function applyNumberDropMove(rawState, playerId, rawMove) {
    const state = normalizeNumberDropState(rawState);
    assertCanSubmit(state, playerId);
    if (!rawMove || typeof rawMove !== "object")
        throw new Error("Submit an answer");
    const move = rawMove;
    if (move.kind !== "submit" || !Array.isArray(move.steps) || typeof move.resultId !== "string")
        throw new Error("Submit a valid answer");
    const evaluated = evaluateNumberDropSubmission(state.numbers, move.steps, move.resultId);
    const distance = Math.abs(evaluated.value - state.target);
    return applyNumberDropSubmission(state, playerId, {
        playerId,
        value: evaluated.value,
        distance,
        score: numberDropScore(distance),
        operationCount: evaluated.steps.length,
        expression: evaluated.expression,
        steps: evaluated.steps,
    });
}
exports.applyNumberDropMove = applyNumberDropMove;
function applyNumberDropTurnTimeout(rawState, playerId) {
    const state = normalizeNumberDropState(rawState);
    assertCanSubmit(state, playerId);
    return applyNumberDropSubmission(state, playerId, {
        playerId,
        value: 0,
        distance: state.target,
        score: 0,
        operationCount: 0,
        expression: "Timed out",
        steps: [],
        timedOut: true,
    });
}
exports.applyNumberDropTurnTimeout = applyNumberDropTurnTimeout;
