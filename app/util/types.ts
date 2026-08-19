export interface User {
  id: number;
  gameUserId?: number;
  accountId?: number | null;
  anonymous?: boolean;
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
  players: number[];
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

export type ChessColor = "w" | "b";
export type ChessPieceSymbol = "p" | "n" | "b" | "r" | "q" | "k";
export type ChessPromotionPiece = "q" | "r" | "b" | "n";
export type ChessVariant = "STANDARD" | "CHESS960" | "FOG_OF_WAR";
export type ChessResultReason =
  | "CHECKMATE"
  | "KING_CAPTURED"
  | "STALEMATE"
  | "THREEFOLD_REPETITION"
  | "FIFTY_MOVE_RULE"
  | "INSUFFICIENT_MATERIAL"
  | "DRAW";

export interface ChessSettings {
  variant: ChessVariant;
}

/**
 * A move as the server is willing to describe it to this player. Everything is
 * filled in for standard and Chess960; under fog of war the parts the viewer
 * did not witness arrive as null, and a move seen from neither end is `hidden`.
 */
export interface ChessMoveRecord {
  from: string | null;
  to: string | null;
  san: string | null;
  color: ChessColor;
  piece: ChessPieceSymbol | null;
  captured?: ChessPieceSymbol;
  promotion?: ChessPieceSymbol;
  castleKingTo?: string;
  castleRookTo?: string;
  hidden: boolean;
}

export interface ChessState {
  kind: "chess";
  variant: ChessVariant;
  startFen: string;
  /** Chess960 position number (0-959), null for the other variants. */
  startIndex: number | null;
  player1: number;
  player2: number;
  whitePlayer: number;
  /** Under fog of war, the position with every unseen square emptied. */
  fen: string;
  /**
   * 64 characters of '1' (seen) and '0' (fogged) ordered a8..h1, or null when
   * the whole board is visible.
   */
  visible: string | null;
  moves: ChessMoveRecord[];
  lastMove: ChessMoveRecord | null;
  inCheck: boolean;
  resultReason: ChessResultReason | null;
}

export type GameStatus = "LOBBY" | "STARTED" | "ENDED" | "ENDED_UNOPENED" | "CANCELLED";
export type GameType = "TIC_TAC_TOE" | "WORD_DROP" | "EIGHT_BALL" | "NUMBER_DROP" | "CHESS";

export interface GameSettingsByType {
  TIC_TAC_TOE: Record<string, never>;
  WORD_DROP: WordDropSettings;
  EIGHT_BALL: Record<string, never>;
  NUMBER_DROP: NumberDropSettings;
  CHESS: ChessSettings;
}

export type GameSelection = {
  [TType in GameType]: { type: TType; settings: GameSettingsByType[TType] }
}[GameType];

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
  players: User[];
  viewerGameUserId: number;
  minPlayers: number;
  maxPlayers: number;
}

export type TicTacToeGameSession = BaseGameSession<"TIC_TAC_TOE", TicTacToeState, GameSettingsByType["TIC_TAC_TOE"]>;
export type WordDropGameSession = BaseGameSession<"WORD_DROP", WordDropState, GameSettingsByType["WORD_DROP"]>;
export type EightBallGameSession = BaseGameSession<"EIGHT_BALL", EightBallState, GameSettingsByType["EIGHT_BALL"]>;
export type NumberDropGameSession = BaseGameSession<"NUMBER_DROP", NumberDropState, GameSettingsByType["NUMBER_DROP"]>;
export type ChessGameSession = BaseGameSession<"CHESS", ChessState, GameSettingsByType["CHESS"]>;
export type GameSession = TicTacToeGameSession | WordDropGameSession | EightBallGameSession | NumberDropGameSession | ChessGameSession;

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

type GameLobbyFor<TType extends GameType> = {
  id: number;
  type: TType;
  status: "LOBBY";
  settings: GameSettingsByType[TType];
  minPlayers: number;
  maxPlayers: number;
  createdByAccountId: number;
  createdAt: string;
  lastActivity: string;
  players: User[];
};

export type GameLobby = { [TType in GameType]: GameLobbyFor<TType> }[GameType];
