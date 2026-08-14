export interface User {
  id: number;
  username: string;
  email?: string;
  displayName: string;
  accountCreated?: string;
}

export type TicTacToeMark = "X" | "O";
export type TicTacToeCell = TicTacToeMark | null;

export interface TicTacToeState {
  kind: "tic-tac-toe";
  player1: number;
  player2: number;
  xPlayer: number;
  board: TicTacToeCell[];
  moveCount: number;
  winningLine: number[] | null;
}

export type WordDropBonusType = "2L" | "3L" | "2W" | "3W" | "START";
export type WordDropVariant = "REGULAR" | "MINI" | "TEST";

export interface WordDropSettings {
  variant: WordDropVariant;
  moveTimerSeconds: null | 120 | 300;
}

export interface WordDropBonus {
  row: number;
  col: number;
  type: WordDropBonusType;
}

export interface WordDropTile {
  id: string;
  letter: string;
  points: number;
  wildcard?: boolean;
}

export interface WordDropBoardTile extends WordDropTile {
  ownerId: number;
  turn: number;
}

export interface WordDropPlacement {
  tileId: string;
  row: number;
  col: number;
  letter?: string;
}

export interface WordDropLastPlay {
  playerId: number;
  words: string[];
  score: number;
  placements: WordDropPlacement[];
  passed: boolean;
}

export interface WordDropState {
  kind: "word-drop";
  variant: WordDropVariant;
  boardSize: number;
  player1: number;
  player2: number;
  board: Array<WordDropBoardTile | null>;
  rack: WordDropTile[];
  rackCounts: Record<string, number>;
  bagCount: number;
  unseenLetterCounts: Record<string, number>;
  scores: Record<string, number>;
  turnNumber: number;
  consecutivePasses: number;
  lastPlay: WordDropLastPlay | null;
  bonuses: WordDropBonus[];
}

export type EightBallGroup = "OPEN" | "SOLIDS" | "STRIPES";

export interface EightBallBall {
  number: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  pocketed: boolean;
}

export interface EightBallLastShot {
  playerId: number;
  shotNumber?: number;
  physicsVersion?: number;
  startBalls?: EightBallBall[];
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
  physicsVersion?: number;
  player1: number;
  player2: number;
  balls: EightBallBall[];
  groups: Record<string, EightBallGroup>;
  pocketedBy: Record<string, number[]>;
  breakShot: boolean;
  ballInHandFor: number | null;
  shotNumber: number;
  lastShot: EightBallLastShot | null;
  recentShots?: EightBallLastShot[];
}

export type NumberDropOperation = "ADD" | "SUBTRACT" | "MULTIPLY" | "DIVIDE";

export interface NumberDropStep {
  leftId: string;
  rightId: string;
  operation: NumberDropOperation;
}

export interface NumberDropSubmission {
  playerId: number;
  value: number;
  distance: number;
  score: number;
  operationCount: number;
  expression: string;
  steps: NumberDropStep[];
  timedOut?: boolean;
}

export interface NumberDropSettings {
  rounds: 1 | 3 | 5;
  moveTimerSeconds: null | 120 | 300;
}

export interface NumberDropRoundResult {
  round: number;
  numbers: number[];
  target: number;
  submissions: Record<string, NumberDropSubmission>;
  bestValue: number;
  bestExpression: string;
}

export interface NumberDropState {
  kind: "number-drop";
  player1: number;
  player2: number;
  totalRounds: 1 | 3 | 5;
  currentRound: number;
  numbers: number[];
  target: number;
  submissions: Record<string, NumberDropSubmission | null>;
  bestValue: number;
  bestDistance: number;
  bestExpression: string;
  minimumOperations: number;
  scores: Record<string, number>;
  rounds: NumberDropRoundResult[];
}

export type GameStatus = "STARTED" | "ENDED" | "ENDED_UNOPENED" | "CANCELLED";
export type GameType = "TIC_TAC_TOE" | "WORD_DROP" | "EIGHT_BALL" | "NUMBER_DROP";

export interface GameSettingsByType {
  TIC_TAC_TOE: Record<string, never>;
  WORD_DROP: WordDropSettings;
  EIGHT_BALL: Record<string, never>;
  NUMBER_DROP: NumberDropSettings;
}

interface BaseGameSession<TType extends GameType, TState, TSettings> {
  id: number;
  type: TType;
  status: GameStatus;
  player1: number;
  player2: number;
  startedBy: number;
  winner: number;
  waitingOn: number;
  version: number;
  createdAt: string;
  lastActivity: string;
  rematchOf: number | null;
  settings: TSettings;
  turnDeadline: string | null;
  state: TState;
  opponent: User;
}

export type TicTacToeGameSession = BaseGameSession<"TIC_TAC_TOE", TicTacToeState, GameSettingsByType["TIC_TAC_TOE"]>;
export type WordDropGameSession = BaseGameSession<"WORD_DROP", WordDropState, GameSettingsByType["WORD_DROP"]>;
export type EightBallGameSession = BaseGameSession<"EIGHT_BALL", EightBallState, GameSettingsByType["EIGHT_BALL"]>;
export type NumberDropGameSession = BaseGameSession<"NUMBER_DROP", NumberDropState, GameSettingsByType["NUMBER_DROP"]>;
export type GameSession = TicTacToeGameSession | WordDropGameSession | EightBallGameSession | NumberDropGameSession;

export interface ApiResult<T> {
  status: -1 | 0 | 1;
  data?: T;
  error?: string;
}

export interface ChatMessage {
  id: number;
  senderId: number;
  recipientId: number;
  text: string;
  createdAt: string;
}
