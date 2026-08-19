import {
  Chess,
  ChessVariant,
  Color,
  DEFAULT_POSITION,
  PieceSymbol,
  Square,
  randomChess960,
} from "./chessEngine";

export type ChessPromotionPiece = "q" | "r" | "b" | "n";

/** The three ways to play. Stored on the game state, chosen when it is created. */
export type ChessGameVariant = "STANDARD" | "CHESS960" | "FOG_OF_WAR";

export interface ChessSettings {
  variant: ChessGameVariant;
}

export type ChessResultReason =
  | "CHECKMATE"
  | "KING_CAPTURED"
  | "STALEMATE"
  | "THREEFOLD_REPETITION"
  | "FIFTY_MOVE_RULE"
  | "INSUFFICIENT_MATERIAL"
  | "DRAW";

export interface ChessMoveRecord {
  from: Square;
  to: Square;
  san: string;
  color: Color;
  piece: PieceSymbol;
  captured?: PieceSymbol;
  promotion?: PieceSymbol;
  enPassant?: boolean;
  /** Where the king and rook land when castling; `to` is the rook in Chess960. */
  castleKingTo?: Square;
  castleRookTo?: Square;
}

/**
 * A move as one player is allowed to know it. Outside fog of war every field is
 * filled in; under fog, anything the viewer did not witness comes back null.
 */
export interface ChessViewMove {
  from: Square | null;
  to: Square | null;
  san: string | null;
  color: Color;
  piece: PieceSymbol | null;
  captured?: PieceSymbol;
  promotion?: PieceSymbol;
  castleKingTo?: Square;
  castleRookTo?: Square;
  /** True when the viewer saw no part of this move — a move happened, no more. */
  hidden: boolean;
}

export interface ChessState {
  kind: "chess";
  variant: ChessGameVariant;
  /** The opening position; only Chess960 makes this interesting. */
  startFen: string;
  /** Chess960 position number (0-959), null for the other variants. */
  startIndex: number | null;
  player1: number;
  player2: number;
  whitePlayer: number;
  fen: string;
  moves: ChessMoveRecord[];
  lastMove: ChessMoveRecord | null;
  inCheck: boolean;
  resultReason: ChessResultReason | null;
}

/**
 * What actually goes over the wire. For standard and Chess960 it carries the
 * same information as `ChessState`; for fog of war the position, the move list
 * and the move history are all cut down to what the viewer can see.
 */
export interface ChessViewState {
  kind: "chess";
  variant: ChessGameVariant;
  startFen: string;
  startIndex: number | null;
  player1: number;
  player2: number;
  whitePlayer: number;
  fen: string;
  /**
   * 64 characters of '1' (seen) and '0' (fogged), ordered a8..h1 like the board
   * half of a FEN. Null when the whole board is visible.
   */
  visible: string | null;
  moves: ChessViewMove[];
  lastMove: ChessViewMove | null;
  inCheck: boolean;
  resultReason: ChessResultReason | null;
}

export interface ChessMoveInput {
  from: Square;
  to: Square;
  promotion?: ChessPromotionPiece;
}

export interface ChessMoveResult {
  state: ChessState;
  winner: number;
  nextPlayer: number;
}

const SQUARE_PATTERN = /^[a-h][1-8]$/;
const PROMOTIONS = new Set<ChessPromotionPiece>(["q", "r", "b", "n"]);
const GAME_VARIANTS = new Set<ChessGameVariant>(["STANDARD", "CHESS960", "FOG_OF_WAR"]);
const MAX_MOVES = 1000;

const ENGINE_VARIANTS: Record<ChessGameVariant, ChessVariant> = {
  STANDARD: "standard",
  CHESS960: "chess960",
  FOG_OF_WAR: "fog",
};

export function normalizeChessSettings(rawSettings: unknown): ChessSettings {
  const value = rawSettings && typeof rawSettings === "object"
    ? (rawSettings as { variant?: unknown }).variant
    : undefined;
  return { variant: GAME_VARIANTS.has(value as ChessGameVariant) ? value as ChessGameVariant : "STANDARD" };
}

function playerForColor(state: Pick<ChessState, "player1" | "player2" | "whitePlayer">, color: Color) {
  if (color === "w") return state.whitePlayer;
  return state.whitePlayer === state.player1 ? state.player2 : state.player1;
}

function colorForPlayer(state: Pick<ChessState, "player1" | "player2" | "whitePlayer">, playerId: number): Color {
  return playerId === state.whitePlayer ? "w" : "b";
}

function resultReason(chess: Chess): ChessResultReason | null {
  if (chess.capturedKing()) return "KING_CAPTURED";
  if (chess.isCheckmate()) return "CHECKMATE";
  if (chess.isStalemate()) return "STALEMATE";
  if (chess.isThreefoldRepetition()) return "THREEFOLD_REPETITION";
  if (chess.isDrawByFiftyMoves()) return "FIFTY_MOVE_RULE";
  if (chess.isInsufficientMaterial()) return "INSUFFICIENT_MATERIAL";
  if (chess.isDraw()) return "DRAW";
  return null;
}

function recordMove(played: ReturnType<Chess["move"]>): ChessMoveRecord {
  return {
    from: played.from,
    to: played.to,
    san: played.san,
    color: played.color,
    piece: played.piece,
    ...(played.captured ? { captured: played.captured } : {}),
    ...(played.promotion ? { promotion: played.promotion } : {}),
    ...(played.isEnPassant() ? { enPassant: true } : {}),
    ...(played.castleKingTo ? { castleKingTo: played.castleKingTo, castleRookTo: played.castleRookTo } : {}),
  };
}

function newEngine(variant: ChessGameVariant, startFen: string): Chess {
  return new Chess(startFen, { variant: ENGINE_VARIANTS[variant] });
}

function parseMoveInput(rawMove: unknown, message: string): ChessMoveInput {
  if (!rawMove || typeof rawMove !== "object") throw new Error(message);
  const value = rawMove as Partial<ChessMoveInput>;
  if (typeof value.from !== "string" || !SQUARE_PATTERN.test(value.from)
    || typeof value.to !== "string" || !SQUARE_PATTERN.test(value.to)) {
    throw new Error(message);
  }
  const promotion = typeof value.promotion === "string" && PROMOTIONS.has(value.promotion as ChessPromotionPiece)
    ? value.promotion as ChessPromotionPiece
    : undefined;
  return { from: value.from as Square, to: value.to as Square, promotion };
}

function replayMoves(
  variant: ChessGameVariant,
  startFen: string,
  rawMoves: unknown,
): { chess: Chess; moves: ChessMoveRecord[] } {
  if (!Array.isArray(rawMoves) || rawMoves.length > MAX_MOVES) throw new Error("Stored chess history is invalid");
  const chess = newEngine(variant, startFen);
  const moves: ChessMoveRecord[] = [];
  for (const rawMove of rawMoves) {
    const move = parseMoveInput(rawMove, "Stored chess move is invalid");
    try {
      moves.push(recordMove(chess.move(move)));
    } catch {
      throw new Error("Stored chess history contains an illegal move");
    }
  }
  return { chess, moves };
}

export function createChessState(player1: number, player2: number, rawSettings: unknown): ChessState {
  const { variant } = normalizeChessSettings(rawSettings);
  const opening = variant === "CHESS960" ? randomChess960() : { index: null, fen: DEFAULT_POSITION };
  const chess = newEngine(variant, opening.fen);
  return {
    kind: "chess",
    variant,
    startFen: chess.fen(),
    startIndex: opening.index,
    player1,
    player2,
    whitePlayer: player1,
    fen: chess.fen(),
    moves: [],
    lastMove: null,
    inCheck: false,
    resultReason: null,
  };
}

export function normalizeChessState(raw: unknown): ChessState {
  if (!raw || typeof raw !== "object") throw new Error("Stored chess state is invalid");
  const value = raw as Partial<ChessState>;
  if (!Number.isInteger(value.player1) || !Number.isInteger(value.player2)
    || value.player1 === value.player2) throw new Error("Stored chess players are invalid");
  if (value.whitePlayer !== value.player1 && value.whitePlayer !== value.player2) {
    throw new Error("Stored chess colors are invalid");
  }
  const player1 = value.player1 as number;
  const player2 = value.player2 as number;
  const whitePlayer = value.whitePlayer as number;

  // Games created before variants existed carry neither field.
  const variant = GAME_VARIANTS.has(value.variant as ChessGameVariant)
    ? value.variant as ChessGameVariant
    : "STANDARD";
  const startFen = typeof value.startFen === "string" && value.startFen.length > 0
    ? value.startFen
    : DEFAULT_POSITION;
  const startIndex = Number.isInteger(value.startIndex) ? value.startIndex as number : null;

  let replayed;
  try {
    replayed = replayMoves(variant, startFen, value.moves);
  } catch (error) {
    // An unloadable opening position is as broken as an illegal move.
    throw error instanceof Error ? error : new Error("Stored chess state is invalid");
  }

  const moves = replayed.moves;
  return {
    kind: "chess",
    variant,
    startFen,
    startIndex,
    player1,
    player2,
    whitePlayer,
    fen: replayed.chess.fen(),
    moves,
    lastMove: moves[moves.length - 1] ?? null,
    inCheck: replayed.chess.inCheck(),
    resultReason: resultReason(replayed.chess),
  };
}

function fullViewMove(move: ChessMoveRecord): ChessViewMove {
  return { ...move, hidden: false };
}

/**
 * The square that actually empties when a move captures — the destination,
 * except for en passant, where the pawn taken is the one beside it.
 */
function capturedSquare(move: ChessMoveRecord): Square {
  if (!move.enPassant) return move.to;
  return `${move.to[0]}${move.color === "w" ? "5" : "4"}` as Square;
}

/**
 * Redact one move down to what `visibleBefore`/`visibleAfter` justify:
 *
 *  - the origin, only if the viewer could see the piece standing there;
 *  - the destination (and so the piece and any promotion), only if the viewer
 *    can see where it landed, or could already see that square;
 *  - the capture, only if the viewer could see the piece that was taken;
 *  - never the SAN, whose disambiguation ("Nbd2") would testify to pieces
 *    somewhere else on the board.
 *
 * A move the viewer saw nothing of still appears, as `hidden`. That the
 * opponent moved is not a secret — both players count the same plies.
 */
function fogViewMove(
  move: ChessMoveRecord,
  visibleBefore: Set<string>,
  visibleAfter: Set<string>,
): ChessViewMove {
  const fromSeen = visibleBefore.has(move.from);
  const toSeen = visibleAfter.has(move.to) || visibleBefore.has(move.to);
  const captureSeen = Boolean(move.captured) && visibleBefore.has(capturedSquare(move));

  return {
    from: fromSeen ? move.from : null,
    to: toSeen ? move.to : null,
    san: null,
    color: move.color,
    piece: fromSeen || toSeen ? move.piece : null,
    ...(captureSeen && move.captured ? { captured: move.captured } : {}),
    ...(toSeen && move.promotion ? { promotion: move.promotion } : {}),
    ...(toSeen && move.castleKingTo
      ? { castleKingTo: move.castleKingTo, castleRookTo: move.castleRookTo }
      : {}),
    hidden: !fromSeen && !toSeen && !captureSeen,
  };
}

/**
 * The game as one player is entitled to see it.
 *
 * For standard and Chess960 that is the whole state. For fog of war this is the
 * only thing the server ever sends: a fogged FEN, a visibility mask, and a
 * redacted history. Nothing here is a hint the client is trusted to ignore —
 * the hidden pieces are simply not in the payload, so intercepting the request
 * tells an opponent no more than the screen does.
 */
export function viewChessState(raw: unknown, viewerId: number): ChessViewState {
  const state = normalizeChessState(raw);

  if (state.variant !== "FOG_OF_WAR") {
    return {
      ...state,
      visible: null,
      moves: state.moves.map(fullViewMove),
      lastMove: state.lastMove ? fullViewMove(state.lastMove) : null,
    };
  }

  if (viewerId !== state.player1 && viewerId !== state.player2) {
    throw new Error("You are not a player in this game");
  }

  const viewerColor = colorForPlayer(state, viewerId);
  const chess = newEngine(state.variant, state.startFen);
  const moves: ChessViewMove[] = [];

  for (const move of state.moves) {
    const visibleBefore = new Set<string>(chess.visibleSquares(viewerColor));
    chess.move({ from: move.from, to: move.to, promotion: move.promotion });
    const visibleAfter = new Set<string>(chess.visibleSquares(viewerColor));
    moves.push(fogViewMove(move, visibleBefore, visibleAfter));
  }

  const finished = state.resultReason !== null;

  return {
    kind: state.kind,
    variant: state.variant,
    startFen: state.startFen,
    startIndex: state.startIndex,
    player1: state.player1,
    player2: state.player2,
    whitePlayer: state.whitePlayer,
    // Once the game is over there is nothing left to protect, so lift the fog.
    fen: finished ? state.fen : chess.fogFen(viewerColor),
    visible: finished ? null : chess.fogMask(viewerColor),
    moves: finished ? state.moves.map(fullViewMove) : moves,
    lastMove: finished
      ? (state.lastMove ? fullViewMove(state.lastMove) : null)
      : moves[moves.length - 1] ?? null,
    inCheck: false,
    resultReason: state.resultReason,
  };
}

export function applyChessMove(rawState: unknown, userId: number, rawMove: unknown): ChessMoveResult {
  const state = normalizeChessState(rawState);
  const move = parseMoveInput(rawMove, "Choose a valid chess move");
  if (userId !== state.player1 && userId !== state.player2) throw new Error("You are not a player in this game");
  if (state.resultReason) throw new Error("This game has already finished");
  if (state.moves.length >= MAX_MOVES) throw new Error("This game has run too long");

  const replayed = replayMoves(state.variant, state.startFen, state.moves);
  if (playerForColor(state, replayed.chess.turn()) !== userId) throw new Error("It is not your turn");

  let played;
  try {
    played = replayed.chess.move(move);
  } catch {
    throw new Error("That move is not legal");
  }

  const record = recordMove(played);
  const reason = resultReason(replayed.chess);
  const nextState: ChessState = {
    ...state,
    fen: replayed.chess.fen(),
    moves: [...replayed.moves, record],
    lastMove: record,
    inCheck: replayed.chess.inCheck(),
    resultReason: reason,
  };

  // Checkmate and a captured king are wins; everything else that ends a game is a draw.
  const decisive = reason === "CHECKMATE" || reason === "KING_CAPTURED";
  return {
    state: nextState,
    winner: decisive ? userId : reason ? -1 : 0,
    nextPlayer: reason ? 0 : playerForColor(nextState, replayed.chess.turn()),
  };
}
