import { GameType } from "./gameTypes";
import {
  applyTicTacToeMove,
  createTicTacToeState,
  normalizeTicTacToeState,
} from "./gamestate/games/TIC_TAC_TOE";
import {
  applyWordDropMove,
  applyWordDropTurnTimeout,
  createWordDropState,
  normalizeWordDropSettings,
  normalizeWordDropState,
  viewWordDropState,
} from "./gamestate/games/WORD_DROP";
import {
  applyEightBallMove,
  createEightBallState,
  EightBallState,
  normalizeEightBallState,
} from "./gamestate/games/EIGHT_BALL";
import { GameNotificationModifier } from "../notifications/types";
import { TicTacToeState } from "./gamestate/games/TIC_TAC_TOE";
import { WordDropState } from "./gamestate/games/WORD_DROP";
import {
  applyNumberDropMove,
  applyNumberDropTurnTimeout,
  createNumberDropState,
  normalizeNumberDropSettings,
  normalizeNumberDropState,
  NumberDropState,
  viewNumberDropState,
} from "./gamestate/games/NUMBER_DROP";
import { applyChessMove, ChessState, createChessState, normalizeChessState } from "./gamestate/games/CHESS";

export interface AuthoritativeMoveResult {
  state: unknown;
  winner: number;
  nextPlayer: number;
}

export interface GameDefinition {
  type: GameType;
  displayName: string;
  normalizeSettings: (rawSettings: unknown) => unknown;
  turnDurationSeconds?: (settings: unknown) => number | null;
  createState: (player1: number, player2: number, settings: unknown) => unknown;
  normalizeState: (rawState: unknown) => unknown;
  viewState?: (normalizedState: unknown, viewerId: number) => unknown;
  applyMove: (rawState: unknown, playerId: number, move: unknown) => AuthoritativeMoveResult;
  applyTurnTimeout?: (rawState: unknown, playerId: number) => AuthoritativeMoveResult;
  legacyMoveCode?: (move: unknown) => number | null;
  modifyNotification?: GameNotificationModifier;
}

function moveCell(move: unknown): number {
  if (!move || typeof move !== "object") return Number.NaN;
  return Number((move as { cell?: unknown }).cell);
}

const ticTacToeNotification: GameNotificationModifier = (notification, context) => {
  if (context.event !== "turn" || !context.state || typeof context.state !== "object") return notification;
  const state = context.state as TicTacToeState;
  const mark = context.actorId === state.xPlayer ? "X" : "O";
  return { ...notification, body: `${context.actorName} placed ${mark}. Your move.` };
};

function primaryWord(words: string[]) {
  return [...words].sort((left, right) => right.length - left.length || left.localeCompare(right))[0] ?? "a word";
}

const wordDropNotification: GameNotificationModifier = (notification, context) => {
  if (!context.state || typeof context.state !== "object") return notification;
  const state = context.state as WordDropState;
  if (context.event === "started" || context.event === "rematch") {
    const variant = state.variant === "MINI" ? "Mini" : state.variant === "TEST" ? "Test" : "Regular";
    return { ...notification, body: `${variant} Word Drop is ready to play.` };
  }
  if (context.event !== "turn" || !state.lastPlay) return notification;
  if (state.lastPlay.passed) return { ...notification, body: `${context.actorName} passed. Your move.` };
  const word = primaryWord(state.lastPlay.words);
  const points = state.lastPlay.score;
  return {
    ...notification,
    body: `${context.actorName} played ${word} for ${points} point${points === 1 ? "" : "s"}.`,
  };
};

const eightBallNotification: GameNotificationModifier = (notification, context) => {
  if (context.event !== "turn" || !context.state || typeof context.state !== "object") return notification;
  const state = context.state as EightBallState;
  const shot = state.lastShot;
  if (!shot) return notification;
  if (shot.foul) return { ...notification, body: `${context.actorName} fouled: ${shot.foul}. You have ball in hand.` };
  const potted = shot.pocketed.filter((number) => number !== 0).length;
  return potted > 0
    ? { ...notification, body: `${context.actorName} potted ${potted} ball${potted === 1 ? "" : "s"}. Your shot.` }
    : { ...notification, body: `${context.actorName} took a shot. Your turn.` };
};

const numberDropNotification: GameNotificationModifier = (notification, context) => {
  if (context.event !== "turn" || !context.state || typeof context.state !== "object") return notification;
  const state = context.state as NumberDropState;
  const roundHasSubmission = Object.values(state.submissions).some(Boolean);
  return roundHasSubmission
    ? { ...notification, body: `${context.actorName} locked an answer. Your turn.` }
    : { ...notification, body: `Round ${state.currentRound} of ${state.totalRounds} is ready.` };
};

const chessNotification: GameNotificationModifier = (notification, context) => {
  if (context.event !== "turn" || !context.state || typeof context.state !== "object") return notification;
  const state = context.state as ChessState;
  const move = state.lastMove;
  if (!move) return notification;
  return {
    ...notification,
    body: `${context.actorName} played ${move.san}.${state.inCheck ? " Check." : " Your move."}`,
  };
};

const definitions: Record<GameType, GameDefinition> = {
  [GameType.TIC_TAC_TOE]: {
    type: GameType.TIC_TAC_TOE,
    displayName: "Tic Tac Toe",
    normalizeSettings: () => ({}),
    createState: createTicTacToeState,
    normalizeState: normalizeTicTacToeState,
    applyMove: (state, playerId, move) => applyTicTacToeMove(state, playerId, moveCell(move)),
    legacyMoveCode: moveCell,
    modifyNotification: ticTacToeNotification,
  },
  [GameType.WORD_DROP]: {
    type: GameType.WORD_DROP,
    displayName: "Word Drop",
    normalizeSettings: normalizeWordDropSettings,
    turnDurationSeconds: (settings) => normalizeWordDropSettings(settings).moveTimerSeconds,
    createState: createWordDropState,
    normalizeState: normalizeWordDropState,
    viewState: viewWordDropState,
    applyMove: applyWordDropMove,
    applyTurnTimeout: applyWordDropTurnTimeout,
    modifyNotification: wordDropNotification,
  },
  [GameType.EIGHT_BALL]: {
    type: GameType.EIGHT_BALL,
    displayName: "8 Ball",
    normalizeSettings: () => ({}),
    createState: createEightBallState,
    normalizeState: normalizeEightBallState,
    applyMove: applyEightBallMove,
    modifyNotification: eightBallNotification,
  },
  [GameType.NUMBER_DROP]: {
    type: GameType.NUMBER_DROP,
    displayName: "Number Drop",
    normalizeSettings: normalizeNumberDropSettings,
    turnDurationSeconds: (settings) => normalizeNumberDropSettings(settings).moveTimerSeconds,
    createState: createNumberDropState,
    normalizeState: normalizeNumberDropState,
    viewState: viewNumberDropState,
    applyMove: applyNumberDropMove,
    applyTurnTimeout: applyNumberDropTurnTimeout,
    modifyNotification: numberDropNotification,
  },
  [GameType.CHESS]: {
    type: GameType.CHESS,
    displayName: "Chess",
    normalizeSettings: () => ({}),
    createState: createChessState,
    normalizeState: normalizeChessState,
    applyMove: applyChessMove,
    modifyNotification: chessNotification,
  },
};

export const supportedGameTypes = Object.keys(definitions) as GameType[];

export function getGameDefinition(type: unknown): GameDefinition | null {
  if (typeof type !== "string") return null;
  return definitions[type as GameType] ?? null;
}
