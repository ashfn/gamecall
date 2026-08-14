import enableWords from "./data/enable1.json";
import type {
  WordDropBoardTile,
  WordDropBonus,
  WordDropPlacement,
  WordDropTile,
} from "../../util/types";

const RACK_SIZE = 7;
const rackIndexCache = new WeakMap<WordDropTile[], Map<string, WordDropTile>>();
const bonusIndexCache = new WeakMap<WordDropBonus[], Map<string, WordDropBonus["type"]>>();
const emptyBoardCache = new WeakMap<Array<WordDropBoardTile | null>, boolean>();

interface WordCell {
  row: number;
  col: number;
  tile: WordDropTile;
}

export interface WordDropPreview {
  valid: boolean;
  score: number;
  words: string[];
  cells: string[];
}

function index(row: number, col: number, boardSize: number) {
  return row * boardSize + col;
}

function inside(row: number, col: number, boardSize: number) {
  return row >= 0 && row < boardSize && col >= 0 && col < boardSize;
}

// ENABLE1 is alphabetically sorted, so binary search avoids constructing a
// second 172k-entry Set on the mobile JS thread.
function dictionaryHas(word: string) {
  const candidate = word.toLowerCase();
  let low = 0;
  let high = enableWords.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const current = enableWords[middle];
    if (current === candidate) return true;
    if (current < candidate) low = middle + 1;
    else high = middle - 1;
  }
  return false;
}

function collectWord(
  board: Array<WordDropBoardTile | WordDropTile | null>,
  boardSize: number,
  row: number,
  col: number,
  rowStep: number,
  colStep: number,
): WordCell[] {
  let startRow = row;
  let startCol = col;
  while (inside(startRow - rowStep, startCol - colStep, boardSize) && board[index(startRow - rowStep, startCol - colStep, boardSize)]) {
    startRow -= rowStep;
    startCol -= colStep;
  }
  const cells: WordCell[] = [];
  while (inside(startRow, startCol, boardSize)) {
    const tile = board[index(startRow, startCol, boardSize)];
    if (!tile) break;
    cells.push({ row: startRow, col: startCol, tile });
    startRow += rowStep;
    startCol += colStep;
  }
  return cells;
}

function invalid(): WordDropPreview {
  return { valid: false, score: 0, words: [], cells: [] };
}

function rackIndex(rack: WordDropTile[]) {
  const cached = rackIndexCache.get(rack);
  if (cached) return cached;
  const index = new Map(rack.map((tile) => [tile.id, tile]));
  rackIndexCache.set(rack, index);
  return index;
}

function bonusIndex(bonuses: WordDropBonus[]) {
  const cached = bonusIndexCache.get(bonuses);
  if (cached) return cached;
  const index = new Map(bonuses.map((bonus) => [`${bonus.row}:${bonus.col}`, bonus.type]));
  bonusIndexCache.set(bonuses, index);
  return index;
}

function boardIsEmpty(board: Array<WordDropBoardTile | null>) {
  const cached = emptyBoardCache.get(board);
  if (cached !== undefined) return cached;
  const empty = board.every((tile) => tile === null);
  emptyBoardCache.set(board, empty);
  return empty;
}

export function previewWordDropMove(
  currentBoard: Array<WordDropBoardTile | null>,
  rack: WordDropTile[],
  bonuses: WordDropBonus[],
  placements: WordDropPlacement[],
): WordDropPreview {
  const boardSize = Math.sqrt(currentBoard.length);
  if (!Number.isInteger(boardSize) || boardSize < 3 || boardSize % 2 === 0) return invalid();
  const centre = Math.floor(boardSize / 2);
  if (placements.length < 1 || placements.length > RACK_SIZE) return invalid();
  const placementCells = new Set(placements.map((item) => `${item.row}:${item.col}`));
  const tileIds = new Set(placements.map((item) => item.tileId));
  if (placementCells.size !== placements.length || tileIds.size !== placements.length) return invalid();

  const rackById = rackIndex(rack);
  const board: Array<WordDropBoardTile | WordDropTile | null> = [...currentBoard];
  for (const placement of placements) {
    const tile = rackById.get(placement.tileId);
    if (!tile || !inside(placement.row, placement.col, boardSize) || board[index(placement.row, placement.col, boardSize)]) return invalid();
    if (tile.wildcard && (!placement.letter || !/^[A-Z]$/.test(placement.letter))) return invalid();
    if (!tile.wildcard && placement.letter !== undefined) return invalid();
    board[index(placement.row, placement.col, boardSize)] = tile.wildcard
      ? { ...tile, letter: placement.letter! }
      : tile;
  }

  const oneRow = placements.every((item) => item.row === placements[0].row);
  const oneColumn = placements.every((item) => item.col === placements[0].col);
  if (placements.length > 1 && !oneRow && !oneColumn) return invalid();

  const boardWasEmpty = boardIsEmpty(currentBoard);
  if (boardWasEmpty) {
    if (!placementCells.has(`${centre}:${centre}`)) return invalid();
  } else {
    const touchesTile = placements.some((item) => [
      [item.row - 1, item.col], [item.row + 1, item.col], [item.row, item.col - 1], [item.row, item.col + 1],
    ].some(([row, col]) => inside(row, col, boardSize) && currentBoard[index(row, col, boardSize)] !== null));
    if (!touchesTile) return invalid();
  }

  const words: WordCell[][] = [];
  if (placements.length === 1) {
    const horizontal = collectWord(board, boardSize, placements[0].row, placements[0].col, 0, 1);
    const vertical = collectWord(board, boardSize, placements[0].row, placements[0].col, 1, 0);
    if (horizontal.length > 1) words.push(horizontal);
    if (vertical.length > 1) words.push(vertical);
  } else {
    const rowStep = oneColumn ? 1 : 0;
    const colStep = oneRow ? 1 : 0;
    const main = collectWord(board, boardSize, placements[0].row, placements[0].col, rowStep, colStep);
    const mainCells = new Set(main.map((cell) => `${cell.row}:${cell.col}`));
    if (!placements.every((item) => mainCells.has(`${item.row}:${item.col}`))) return invalid();
    words.push(main);
    for (const placement of placements) {
      const cross = collectWord(board, boardSize, placement.row, placement.col, colStep, rowStep);
      if (cross.length > 1) words.push(cross);
    }
  }

  const uniqueWords = [...new Map(words.filter((word) => word.length > 1).map((word) => [
    word.map((cell) => `${cell.row}:${cell.col}`).join("|"),
    word,
  ])).values()];
  if (uniqueWords.length === 0) return invalid();
  const labels = uniqueWords.map((word) => word.map((cell) => cell.tile.letter).join(""));
  if (labels.some((word) => !dictionaryHas(word))) return invalid();

  const bonusByCell = bonusIndex(bonuses);
  const score = uniqueWords.reduce((total, word) => {
    let letters = 0;
    let wordMultiplier = 1;
    for (const cell of word) {
      const key = `${cell.row}:${cell.col}`;
      const bonus = placementCells.has(key) ? bonusByCell.get(key) : undefined;
      letters += cell.tile.points * (bonus === "2L" ? 2 : bonus === "3L" ? 3 : 1);
      if (bonus === "2W") wordMultiplier *= 2;
      if (bonus === "3W") wordMultiplier *= 3;
    }
    return total + letters * wordMultiplier;
  }, placements.length === RACK_SIZE ? 35 : 0);

  const cells = [...new Set(uniqueWords.flatMap((word) => word.map((cell) => `${cell.row}:${cell.col}`)))];
  return { valid: true, score, words: labels, cells };
}
