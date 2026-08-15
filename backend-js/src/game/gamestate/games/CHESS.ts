import { Chess, Color, PieceSymbol, Square } from "chess.js";

export type ChessPromotionPiece = "q" | "r" | "b" | "n";
export type ChessResultReason =
  | "CHECKMATE"
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
}

export interface ChessState {
  kind: "chess";
  player1: number;
  player2: number;
  whitePlayer: number;
  fen: string;
  moves: ChessMoveRecord[];
  lastMove: ChessMoveRecord | null;
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

function playerForColor(state: Pick<ChessState, "player1" | "player2" | "whitePlayer">, color: Color) {
  if (color === "w") return state.whitePlayer;
  return state.whitePlayer === state.player1 ? state.player2 : state.player1;
}

function resultReason(chess: Chess): ChessResultReason | null {
  if (chess.isCheckmate()) return "CHECKMATE";
  if (chess.isStalemate()) return "STALEMATE";
  if (chess.isThreefoldRepetition()) return "THREEFOLD_REPETITION";
  if (chess.isDrawByFiftyMoves()) return "FIFTY_MOVE_RULE";
  if (chess.isInsufficientMaterial()) return "INSUFFICIENT_MATERIAL";
  if (chess.isDraw()) return "DRAW";
  return null;
}

function replayMoves(rawMoves: unknown): { chess: Chess; moves: ChessMoveRecord[] } {
  if (!Array.isArray(rawMoves) || rawMoves.length > 1000) throw new Error("Stored chess history is invalid");
  const chess = new Chess();
  const moves: ChessMoveRecord[] = [];
  for (const rawMove of rawMoves) {
    if (!rawMove || typeof rawMove !== "object") throw new Error("Stored chess move is invalid");
    const value = rawMove as Partial<ChessMoveInput>;
    if (typeof value.from !== "string" || !SQUARE_PATTERN.test(value.from)
      || typeof value.to !== "string" || !SQUARE_PATTERN.test(value.to)) {
      throw new Error("Stored chess square is invalid");
    }
    const promotion = typeof value.promotion === "string" && PROMOTIONS.has(value.promotion as ChessPromotionPiece)
      ? value.promotion as ChessPromotionPiece
      : undefined;
    try {
      const played = chess.move({ from: value.from as Square, to: value.to as Square, promotion });
      moves.push({
        from: played.from,
        to: played.to,
        san: played.san,
        color: played.color,
        piece: played.piece,
        captured: played.captured,
        promotion: played.promotion,
      });
    } catch {
      throw new Error("Stored chess history contains an illegal move");
    }
  }
  return { chess, moves };
}

export function createChessState(player1: number, player2: number): ChessState {
  const chess = new Chess();
  return {
    kind: "chess",
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
  const replayed = replayMoves(value.moves);
  const moves = replayed.moves;
  return {
    kind: "chess",
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

export function applyChessMove(rawState: unknown, userId: number, rawMove: unknown): ChessMoveResult {
  const state = normalizeChessState(rawState);
  if (!rawMove || typeof rawMove !== "object") throw new Error("Choose a valid chess move");
  const move = rawMove as Partial<ChessMoveInput>;
  if (typeof move.from !== "string" || !SQUARE_PATTERN.test(move.from)
    || typeof move.to !== "string" || !SQUARE_PATTERN.test(move.to)) {
    throw new Error("Choose a valid chess move");
  }
  if (userId !== state.player1 && userId !== state.player2) throw new Error("You are not a player in this game");
  if (state.resultReason) throw new Error("This game has already finished");

  const replayed = replayMoves(state.moves);
  if (playerForColor(state, replayed.chess.turn()) !== userId) throw new Error("It is not your turn");
  const promotion = typeof move.promotion === "string" && PROMOTIONS.has(move.promotion as ChessPromotionPiece)
    ? move.promotion as ChessPromotionPiece
    : undefined;
  let played;
  try {
    played = replayed.chess.move({ from: move.from as Square, to: move.to as Square, promotion });
  } catch {
    throw new Error("That move is not legal");
  }
  const record: ChessMoveRecord = {
    from: played.from,
    to: played.to,
    san: played.san,
    color: played.color,
    piece: played.piece,
    captured: played.captured,
    promotion: played.promotion,
  };
  const reason = resultReason(replayed.chess);
  const nextState: ChessState = {
    ...state,
    fen: replayed.chess.fen(),
    moves: [...replayed.moves, record],
    lastMove: record,
    inCheck: replayed.chess.inCheck(),
    resultReason: reason,
  };
  return {
    state: nextState,
    winner: reason === "CHECKMATE" ? userId : reason ? -1 : 0,
    nextPlayer: reason ? 0 : playerForColor(nextState, replayed.chess.turn()),
  };
}
