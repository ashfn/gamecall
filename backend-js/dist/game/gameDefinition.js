"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGameDefinition = exports.supportedGameTypes = void 0;
const gameTypes_1 = require("./gameTypes");
const TIC_TAC_TOE_1 = require("./gamestate/games/TIC_TAC_TOE");
const WORD_DROP_1 = require("./gamestate/games/WORD_DROP");
const EIGHT_BALL_1 = require("./gamestate/games/EIGHT_BALL");
const NUMBER_DROP_1 = require("./gamestate/games/NUMBER_DROP");
const CHESS_1 = require("./gamestate/games/CHESS");
function moveCell(move) {
    if (!move || typeof move !== "object")
        return Number.NaN;
    return Number(move.cell);
}
const ticTacToeNotification = (notification, context) => {
    if (context.event !== "turn" || !context.state || typeof context.state !== "object")
        return notification;
    const state = context.state;
    const mark = context.actorId === state.xPlayer ? "X" : "O";
    return { ...notification, body: `${context.actorName} placed ${mark}. Your move.` };
};
function primaryWord(words) {
    return [...words].sort((left, right) => right.length - left.length || left.localeCompare(right))[0] ?? "a word";
}
const wordDropNotification = (notification, context) => {
    if (!context.state || typeof context.state !== "object")
        return notification;
    const state = context.state;
    if (context.event === "started" || context.event === "rematch") {
        const variant = state.variant === "MINI" ? "Mini" : state.variant === "TEST" ? "Test" : "Regular";
        return { ...notification, body: `${variant} Word Drop is ready to play.` };
    }
    if (context.event !== "turn" || !state.lastPlay)
        return notification;
    if (state.lastPlay.passed)
        return { ...notification, body: `${context.actorName} passed. Your move.` };
    const word = primaryWord(state.lastPlay.words);
    const points = state.lastPlay.score;
    return {
        ...notification,
        body: `${context.actorName} played ${word} for ${points} point${points === 1 ? "" : "s"}.`,
    };
};
const eightBallNotification = (notification, context) => {
    if (context.event !== "turn" || !context.state || typeof context.state !== "object")
        return notification;
    const state = context.state;
    const shot = state.lastShot;
    if (!shot)
        return notification;
    if (shot.foul)
        return { ...notification, body: `${context.actorName} fouled: ${shot.foul}. You have ball in hand.` };
    const potted = shot.pocketed.filter((number) => number !== 0).length;
    return potted > 0
        ? { ...notification, body: `${context.actorName} potted ${potted} ball${potted === 1 ? "" : "s"}. Your shot.` }
        : { ...notification, body: `${context.actorName} took a shot. Your turn.` };
};
const numberDropNotification = (notification, context) => {
    if (context.event !== "turn" || !context.state || typeof context.state !== "object")
        return notification;
    const state = context.state;
    const roundHasSubmission = Object.values(state.submissions).some(Boolean);
    return roundHasSubmission
        ? { ...notification, body: `${context.actorName} locked an answer. Your turn.` }
        : { ...notification, body: `Round ${state.currentRound} of ${state.totalRounds} is ready.` };
};
const chessNotification = (notification, context) => {
    if (!context.state || typeof context.state !== "object")
        return notification;
    const state = context.state;
    if (context.event === "started" || context.event === "rematch") {
        if (state.variant === "CHESS960") {
            return { ...notification, body: `Chess960 position ${state.startIndex ?? "?"} is on the board.` };
        }
        if (state.variant === "FOG_OF_WAR") {
            return { ...notification, body: "Fog of War chess is ready. Capture the king to win." };
        }
        return notification;
    }
    if (context.event !== "turn")
        return notification;
    const move = state.lastMove;
    if (!move)
        return notification;
    // Under fog the notification is the one place the move could still leak, so
    // it says only that a move happened.
    if (state.variant === "FOG_OF_WAR") {
        return { ...notification, body: `${context.actorName} moved. Your turn.` };
    }
    return {
        ...notification,
        body: `${context.actorName} played ${move.san}.${state.inCheck ? " Check." : " Your move."}`,
    };
};
const definitions = {
    [gameTypes_1.GameType.TIC_TAC_TOE]: {
        type: gameTypes_1.GameType.TIC_TAC_TOE,
        displayName: "Tic Tac Toe",
        normalizeSettings: () => ({}),
        createState: TIC_TAC_TOE_1.createTicTacToeState,
        normalizeState: TIC_TAC_TOE_1.normalizeTicTacToeState,
        applyMove: (state, playerId, move) => (0, TIC_TAC_TOE_1.applyTicTacToeMove)(state, playerId, moveCell(move)),
        legacyMoveCode: moveCell,
        modifyNotification: ticTacToeNotification,
    },
    [gameTypes_1.GameType.WORD_DROP]: {
        type: gameTypes_1.GameType.WORD_DROP,
        displayName: "Word Drop",
        normalizeSettings: WORD_DROP_1.normalizeWordDropSettings,
        turnDurationSeconds: (settings) => (0, WORD_DROP_1.normalizeWordDropSettings)(settings).moveTimerSeconds,
        createState: WORD_DROP_1.createWordDropState,
        normalizeState: WORD_DROP_1.normalizeWordDropState,
        viewState: WORD_DROP_1.viewWordDropState,
        applyMove: WORD_DROP_1.applyWordDropMove,
        applyTurnTimeout: WORD_DROP_1.applyWordDropTurnTimeout,
        modifyNotification: wordDropNotification,
    },
    [gameTypes_1.GameType.EIGHT_BALL]: {
        type: gameTypes_1.GameType.EIGHT_BALL,
        displayName: "8 Ball",
        normalizeSettings: () => ({}),
        createState: EIGHT_BALL_1.createEightBallState,
        normalizeState: EIGHT_BALL_1.normalizeEightBallState,
        applyMove: EIGHT_BALL_1.applyEightBallMove,
        modifyNotification: eightBallNotification,
    },
    [gameTypes_1.GameType.NUMBER_DROP]: {
        type: gameTypes_1.GameType.NUMBER_DROP,
        displayName: "Number Drop",
        normalizeSettings: NUMBER_DROP_1.normalizeNumberDropSettings,
        turnDurationSeconds: (settings) => (0, NUMBER_DROP_1.normalizeNumberDropSettings)(settings).moveTimerSeconds,
        createState: NUMBER_DROP_1.createNumberDropState,
        normalizeState: NUMBER_DROP_1.normalizeNumberDropState,
        viewState: NUMBER_DROP_1.viewNumberDropState,
        applyMove: NUMBER_DROP_1.applyNumberDropMove,
        applyTurnTimeout: NUMBER_DROP_1.applyNumberDropTurnTimeout,
        modifyNotification: numberDropNotification,
    },
    [gameTypes_1.GameType.CHESS]: {
        type: gameTypes_1.GameType.CHESS,
        displayName: "Chess",
        normalizeSettings: CHESS_1.normalizeChessSettings,
        createState: CHESS_1.createChessState,
        normalizeState: CHESS_1.normalizeChessState,
        viewState: CHESS_1.viewChessState,
        applyMove: CHESS_1.applyChessMove,
        modifyNotification: chessNotification,
    },
};
exports.supportedGameTypes = Object.keys(definitions);
function getGameDefinition(type) {
    if (typeof type !== "string")
        return null;
    return definitions[type] ?? null;
}
exports.getGameDefinition = getGameDefinition;
