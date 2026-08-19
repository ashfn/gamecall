import { Chess, ChessVariant as EngineVariant, Square } from "./chessEngine";
import type { ChessMoveRecord, ChessState, ChessVariant } from "../../util/types";

/*
 * The client plays by exactly the same engine as the server — the file next to
 * this one is a byte-for-byte copy of the server's — so a board drawn here and
 * a move accepted there can never disagree about the rules.
 */
const ENGINE_VARIANTS: Record<ChessVariant, EngineVariant> = {
  STANDARD: "standard",
  CHESS960: "chess960",
  FOG_OF_WAR: "fog",
};

export function engineVariant(variant: ChessVariant): EngineVariant {
  return ENGINE_VARIANTS[variant] ?? "standard";
}

export function isFogOfWar(state: Pick<ChessState, "variant">): boolean {
  return state.variant === "FOG_OF_WAR";
}

/**
 * Load a position out of game state. Under fog this is the *fogged* FEN, which
 * is deliberately a partial board — the engine's fog variant is built to accept
 * one, and the moves it generates from it are exactly the moves the server will
 * accept, so the board can be driven from it directly.
 */
export function chessPosition(state: Pick<ChessState, "variant" | "fen">, fen?: string): Chess {
  return new Chess(fen ?? state.fen, { variant: engineVariant(state.variant) });
}

/**
 * The squares this player can see, or null when nothing is hidden. Expands the
 * 64-character mask the server sends (ordered a8..h1, like a FEN).
 */
export function visibleSquares(state: Pick<ChessState, "visible">): Set<string> | null {
  const mask = state.visible;
  if (!mask || mask.length !== 64) return null;

  const squares = new Set<string>();
  for (let index = 0; index < 64; index++) {
    if (mask[index] === "1") squares.add(`${"abcdefgh"[index % 8]}${8 - Math.floor(index / 8)}`);
  }
  return squares;
}

export function variantName(variant: ChessVariant): string {
  if (variant === "CHESS960") return "Chess960";
  if (variant === "FOG_OF_WAR") return "Fog of War";
  return "Chess";
}

export function variantDetail(variant: ChessVariant): string {
  if (variant === "CHESS960") return "Shuffled back rank";
  if (variant === "FOG_OF_WAR") return "See only what you cover";
  return "Standard chess";
}

/**
 * How a move reads in the move list. Fogged moves have no SAN — the server
 * withholds it, because SAN disambiguation ("Nbd2") would testify to pieces
 * elsewhere on the board — so they are rendered from whatever was witnessed.
 */
export function moveLabel(move: ChessMoveRecord): string {
  if (move.san) return move.san;
  if (move.hidden) return "•••";
  if (move.castleKingTo) return "O-O";
  const piece = move.piece && move.piece !== "p" ? move.piece.toUpperCase() : "";
  if (move.from && move.to) return `${piece}${move.from}${move.captured ? "×" : "–"}${move.to}`;
  if (move.to) return `${piece}${move.captured ? "×" : ""}${move.to}`;
  if (move.from) return `${piece}${move.from}→?`;
  return "•••";
}

/**
 * Where a move visibly starts and ends, for last-move highlighting. Either end
 * can be missing under fog.
 */
export function moveHighlights(move: ChessMoveRecord | null): { from: Square | null; to: Square | null } {
  if (!move) return { from: null, to: null };
  return {
    from: (move.from as Square) ?? null,
    // A castle is drawn where the king landed, not on the rook it "captured".
    to: ((move.castleKingTo ?? move.to) as Square) ?? null,
  };
}
