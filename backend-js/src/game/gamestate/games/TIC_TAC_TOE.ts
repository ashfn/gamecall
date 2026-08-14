import {
  GameMove,
  GameMoveResult,
  GameMoveStatus,
  GameState,
  GameStateManipulator,
} from "../gamestate";

export type TicTacToeMark = "X" | "O";
export type TicTacToeCell = TicTacToeMark | null;

export interface TicTacToeState extends GameState {
  kind: "tic-tac-toe";
  xPlayer: number;
  board: TicTacToeCell[];
  moveCount: number;
  winningLine: number[] | null;
}

export interface TicTacToeMoveResult {
  state: TicTacToeState;
  winner: number;
  nextPlayer: number;
}

const WINNING_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
] as const;

export function createTicTacToeState(player1: number, player2: number): TicTacToeState {
  return {
    kind: "tic-tac-toe",
    player1,
    player2,
    xPlayer: player1,
    board: Array<TicTacToeCell>(9).fill(null),
    moveCount: 0,
    winningLine: null,
  };
}

export function normalizeTicTacToeState(raw: unknown): TicTacToeState {
  if (!raw || typeof raw !== "object") throw new Error("Stored game state is invalid");
  const value = raw as Partial<TicTacToeState>;
  const rawBoard: unknown = (raw as { board?: unknown }).board;
  if (!Number.isInteger(value.player1) || !Number.isInteger(value.player2)) {
    throw new Error("Stored players are invalid");
  }

  let board: TicTacToeCell[];
  const isLegacyBoard = Array.isArray(rawBoard) && rawBoard.length === 3 && Array.isArray(rawBoard[0]);
  // The prototype let the invited player move first; new games let the challenger move first.
  const xPlayer = isLegacyBoard ? value.player2 as number : value.xPlayer ?? value.player1 as number;
  if (xPlayer !== value.player1 && xPlayer !== value.player2) throw new Error("Stored marks are invalid");
  if (isLegacyBoard) {
    board = (rawBoard as number[][]).flat().map((cell) => {
      if (cell === 0) return null;
      if (cell === xPlayer) return "X";
      if (cell === (xPlayer === value.player1 ? value.player2 : value.player1)) return "O";
      throw new Error("Stored board contains an invalid player");
    });
  } else if (Array.isArray(rawBoard) && rawBoard.length === 9) {
    board = rawBoard.map((cell) => {
      if (cell === null || cell === "X" || cell === "O") return cell;
      throw new Error("Stored board contains an invalid mark");
    });
  } else {
    throw new Error("Stored board is invalid");
  }

  const xCount = board.filter((cell) => cell === "X").length;
  const oCount = board.filter((cell) => cell === "O").length;
  if (oCount > xCount || xCount - oCount > 1) throw new Error("Stored turn order is invalid");

  return {
    kind: "tic-tac-toe",
    player1: value.player1 as number,
    player2: value.player2 as number,
    xPlayer,
    board,
    moveCount: xCount + oCount,
    winningLine: findWinningLine(board),
  };
}

export function findWinningLine(board: TicTacToeCell[]): number[] | null {
  for (const line of WINNING_LINES) {
    const [a, b, c] = line;
    if (board[a] !== null && board[a] === board[b] && board[a] === board[c]) return [...line];
  }
  return null;
}

export function applyTicTacToeMove(
  rawState: unknown,
  userId: number,
  cell: number,
): TicTacToeMoveResult {
  const state = normalizeTicTacToeState(rawState);
  if (!Number.isInteger(cell) || cell < 0 || cell > 8) throw new Error("Choose a valid square");
  if (userId !== state.player1 && userId !== state.player2) throw new Error("You are not a player in this game");
  if (state.winningLine || state.moveCount === 9) throw new Error("This game has already finished");
  if (state.board[cell] !== null) throw new Error("That square is already taken");

  const oPlayer = state.xPlayer === state.player1 ? state.player2 : state.player1;
  const expectedPlayer = state.moveCount % 2 === 0 ? state.xPlayer : oPlayer;
  if (userId !== expectedPlayer) throw new Error("It is not your turn");

  const mark: TicTacToeMark = userId === state.xPlayer ? "X" : "O";
  const board = [...state.board];
  board[cell] = mark;
  const winningLine = findWinningLine(board);
  const moveCount = state.moveCount + 1;

  return {
    state: { ...state, board, moveCount, winningLine },
    winner: winningLine ? userId : moveCount === 9 ? -1 : 0,
    nextPlayer: winningLine || moveCount === 9
      ? 0
      : userId === state.player1 ? state.player2 : state.player1,
  };
}

// Kept as a pure adapter for the prototype's older game registry.
export const TIC_TAC_TOE: GameStateManipulator = {
  async init(user1: number, user2: number) {
    return createTicTacToeState(user1, user2);
  },
  async processMove(state: GameState, userId: number, move: GameMove): Promise<GameMoveResult> {
    try {
      const result = applyTicTacToeMove(state, userId, move.actions[0]);
      return {
        status: result.winner === 0 ? GameMoveStatus.ACCEPTED : GameMoveStatus.ENDED,
        state: result.state,
        game: null,
      };
    } catch {
      return { status: GameMoveStatus.INVALID, state, game: null };
    }
  },
};
