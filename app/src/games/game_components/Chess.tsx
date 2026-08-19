import { FontAwesome5 } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Chess as ChessRules, Color, Move, PieceSymbol, Square } from "../chessEngine";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  GestureResponderEvent,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../../../util/theme";
import type { ChessGameSession, ChessMoveRecord, ChessPromotionPiece } from "../../../util/types";
import type { GameViewProps } from "../GameLoader";
import FogClouds from "../components/FogClouds";
import TurnBasedGameHeader from "../components/TurnBasedGameHeader";
import { chessPosition, isFogOfWar, moveHighlights, moveLabel, variantName, visibleSquares } from "../chessRules";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1] as const;
const PIECE_ICON: Record<PieceSymbol, string> = {
  p: "chess-pawn",
  n: "chess-knight",
  b: "chess-bishop",
  r: "chess-rook",
  q: "chess-queen",
  k: "chess-king",
};
const PIECE_VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const CAPTURE_ORDER: Record<PieceSymbol, number> = { q: 0, r: 1, b: 2, n: 3, p: 4, k: 5 };
const PROMOTIONS: ChessPromotionPiece[] = ["q", "r", "b", "n"];
const LIGHT_SQUARE = "#CDE6CB";
const DARK_SQUARE = "#648A6C";

interface BoardPoint { x: number; y: number }
interface PendingPromotion { from: Square; to: Square }
interface ScreenFrame { x: number; y: number; width: number; height: number }
interface CaptureFlight {
  key: string;
  capturer: Color;
  piece: PieceSymbol;
  expectedCount: number;
  targetIndex: number;
  /** Slot size of the rack this piece is flying into, once it has landed. */
  slotWidth?: number;
}
interface OptimisticCapture extends CaptureFlight { moveNumber: number }

/** A piece travelling between two squares, for a move the player did not drag. */
interface MoveSlide {
  key: string;
  to: Square;
  piece: PieceSymbol;
  color: Color;
}

/** Long enough to read as travel, short enough not to delay the next move. */
const SLIDE_MS = 190;

function capturedBy(moves: ChessMoveRecord[], color: Color): PieceSymbol[] {
  return moves
    .filter((move) => move.color === color && move.captured)
    .map((move) => move.captured!)
    .sort((left, right) => CAPTURE_ORDER[left] - CAPTURE_ORDER[right]);
}

function capturedScore(pieces: PieceSymbol[]) {
  return pieces.reduce((total, piece) => total + PIECE_VALUE[piece], 0);
}

/** Height of one slot in the captured rack; the flight lands in a box this size. */
const CAPTURED_PIECE_HEIGHT = 16;
const CAPTURED_ROWS = 2;
/** Below this the glyphs start overlapping each other, so the rack wraps instead. */
const CAPTURED_MIN_SLOT = 11;
const CAPTURED_MAX_SLOT = 16;

/**
 * How the rack lays out for `count` pieces in `width` points.
 *
 * Slots never shrink past a legible minimum: the rack wraps onto a second line
 * first, and only squeezes if even two full lines cannot hold everything (which
 * needs 33+ captures, so in practice never). Sizing from the measured width
 * rather than an assumed one is what stops the end pieces being clipped on
 * narrow screens, where the score card is laid out with flex rather than at its
 * nominal 124 points.
 */
function capturedLayout(count: number, width: number) {
  const usable = width > 0 ? width : CAPTURED_MIN_SLOT * count;
  const perRow = Math.max(1, Math.floor(usable / CAPTURED_MIN_SLOT));
  const rows = Math.min(CAPTURED_ROWS, Math.max(1, Math.ceil(count / perRow)));
  const columns = Math.max(1, Math.ceil(count / rows));
  const slotWidth = Math.min(CAPTURED_MAX_SLOT, usable / Math.max(1, columns));
  return { rows, columns, slotWidth };
}

function capturedIconSize(slotWidth: number) {
  return Math.min(13, Math.max(9, slotWidth - 1));
}

function withoutOnePiece(pieces: PieceSymbol[], piece: PieceSymbol) {
  const copy = [...pieces];
  const index = copy.lastIndexOf(piece);
  if (index >= 0) copy.splice(index, 1);
  return copy;
}

function isLightSquare(square: Square) {
  // a1 is dark on a standard chess board.
  return (FILES.indexOf(square[0] as typeof FILES[number]) + Number(square[1])) % 2 === 0;
}

/**
 * A player's colour on the scoreboard: the colour of the square their queen
 * started the game on. Read from the opening position, never the current one,
 * so a player's tile keeps the same colour from first move to last however the
 * queen moves or whether it survives. (In Chess960 the two queens always start
 * on opposite colours, so the two tiles still contrast.)
 */
function queenSquareColor(start: ChessRules, color: Color) {
  for (const rank of RANKS) {
    for (const file of FILES) {
      const square = `${file}${rank}` as Square;
      const piece = start.get(square);
      if (piece?.color === color && piece.type === "q") return isLightSquare(square) ? LIGHT_SQUARE : DARK_SQUARE;
    }
  }
  // No queen in the opening position at all: fall back to the classic pairing.
  return color === "w" ? LIGHT_SQUARE : DARK_SQUARE;
}

function PieceGraphic({ piece, color, size, muted = false, highlighted = false }: {
  piece: PieceSymbol;
  color: Color;
  size: number;
  muted?: boolean;
  highlighted?: boolean;
}) {
  return (
    <FontAwesome5
      name={PIECE_ICON[piece] as never}
      solid
      size={size}
      color={muted ? colors.muted : highlighted ? (color === "w" ? "#D8FFE0" : "#244D32") : color === "w" ? "#FFFDF2" : "#101A13"}
      style={color === "w" ? styles.whitePieceShadow : styles.blackPieceShadow}
    />
  );
}

function CapturedPieces({ pieces, capturedColor, reverse = false, onFrame }: {
  pieces: PieceSymbol[];
  capturedColor: Color;
  reverse?: boolean;
  onFrame: (frame: ScreenFrame) => void;
}) {
  const rowRef = useRef<View>(null);
  const [width, setWidth] = useState(0);
  const { slotWidth } = capturedLayout(pieces.length, width);
  const iconSize = capturedIconSize(slotWidth);
  const measure = () => rowRef.current?.measureInWindow((x, y, measuredWidth, height) => {
    onFrame({ x, y, width: measuredWidth, height });
  });
  return (
    <View
      ref={rowRef}
      collapsable={false}
      onLayout={(event) => {
        setWidth(event.nativeEvent.layout.width);
        requestAnimationFrame(measure);
      }}
      style={[styles.capturedRack, reverse && styles.capturedRackReverse]}
    >
      {pieces.map((piece, index) => (
        <View key={`${piece}-${index}`} style={[styles.capturedPiece, { width: slotWidth }]}>
          <PieceGraphic piece={piece} color={capturedColor} size={iconSize} />
        </View>
      ))}
    </View>
  );
}

export default function Chess({ game, account, sending, onMove, turnIndicator, resultIndicator }: GameViewProps) {
  if (game.type !== "CHESS") return null;
  return (
    <ChessBoard
      game={game}
      account={account}
      sending={sending}
      onMove={onMove}
      turnIndicator={turnIndicator}
      resultIndicator={resultIndicator}
    />
  );
}

function ChessBoard({ game, account, sending, onMove, turnIndicator, resultIndicator }: Omit<GameViewProps, "game"> & { game: ChessGameSession }) {
  const { width, height } = useWindowDimensions();
  const boardSize = Math.min(width - 16, height - 255, 520);
  const cellSize = boardSize / 8;
  const myColor: Color = game.state.whitePlayer === account.id ? "w" : "b";
  const opponentColor: Color = myColor === "w" ? "b" : "w";
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [draggingFrom, setDraggingFrom] = useState<Square | null>(null);
  const [dragVisualPiece, setDragVisualPiece] = useState<{ type: PieceSymbol; color: Color } | null>(null);
  const [landingSquare, setLandingSquare] = useState<Square | null>(null);
  const [settlingDrag, setSettlingDrag] = useState(false);
  const [hoveredSquare, setHoveredSquare] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);
  const [optimisticFen, setOptimisticFen] = useState<string | null>(null);
  const [optimisticLastMove, setOptimisticLastMove] = useState<{ from: Square; to: Square } | null>(null);
  const [captureFlight, setCaptureFlight] = useState<CaptureFlight | null>(null);
  const [moveSlide, setMoveSlide] = useState<MoveSlide | null>(null);
  const [optimisticCapture, setOptimisticCapture] = useState<OptimisticCapture | null>(null);
  const canInteract = game.status === "STARTED" && game.waitingOn === account.id && !sending && !settlingDrag;
  const dragPosition = useRef(new Animated.ValueXY()).current;
  const dragScale = useRef(new Animated.Value(1)).current;
  const slidePosition = useRef(new Animated.ValueXY()).current;
  const moveHistoryRef = useRef<ScrollView>(null);
  const rootRef = useRef<View>(null);
  const boardRef = useRef<View>(null);
  const boardOrigin = useRef({ x: 0, y: 0, ready: false });
  const rootFrame = useRef<ScreenFrame | null>(null);
  const myCaptureFrame = useRef<ScreenFrame | null>(null);
  const opponentCaptureFrame = useRef<ScreenFrame | null>(null);
  const capturePosition = useRef(new Animated.ValueXY()).current;
  const captureScale = useRef(new Animated.Value(1)).current;
  const animatedCaptureKey = useRef<string | null>(null);
  const observedGame = useRef({ id: game.id, moveCount: game.state.moves.length });
  const gestureSource = useRef<Square | null>(null);
  const gestureStartedOn = useRef<Square | null>(null);
  const touchedSquare = useRef<Square | null>(null);
  const gestureLegalMoves = useRef<Move[]>([]);
  const dragActive = useRef(false);
  const hoveredSquareRef = useRef<Square | null>(null);
  const sendingObserved = useRef(false);
  const optimisticVersion = useRef<number | null>(null);

  const fogOfWar = isFogOfWar(game.state);
  const position = useMemo(() => {
    try {
      return chessPosition(game.state, optimisticFen ?? game.state.fen);
    } catch {
      return chessPosition(game.state);
    }
  }, [game.state, optimisticFen]);
  const files = myColor === "w" ? FILES : [...FILES].reverse();
  const ranks = myColor === "w" ? RANKS : [...RANKS].reverse();
  const squares = useMemo(() => ranks.flatMap((rank) => files.map((file) => `${file}${rank}` as Square)), [files, ranks]);
  /*
   * Under fog the server sends a board with the unseen squares emptied plus the
   * mask of what this player covers, so "no piece here" and "no idea" are
   * different states and only the second one gets clouds. Optimistic moves keep
   * the last mask until the server answers: the piece slides, the fog holds.
   */
  const fogged = useMemo(() => {
    const visible = visibleSquares(game.state);
    if (!visible) return null;
    return new Set(squares.filter((square) => !visible.has(square)));
  }, [game.state, squares]);
  const legalMoves = useMemo<Move[]>(() => {
    if (!selectedSquare || !canInteract) return [];
    try {
      return position.moves({ square: selectedSquare, verbose: true });
    } catch {
      return [];
    }
  }, [canInteract, position, selectedSquare]);
  const legalTargets = useMemo(() => new Set(legalMoves.map((move) => move.to)), [legalMoves]);
  const serverMyCaptures = capturedBy(game.state.moves, myColor);
  const serverOpponentCaptures = capturedBy(game.state.moves, opponentColor);
  const serverHasOptimisticCapture = optimisticCapture !== null && game.state.moves.length >= optimisticCapture.moveNumber;
  const myCaptures = optimisticCapture?.capturer === myColor && !serverHasOptimisticCapture
    ? [...serverMyCaptures, optimisticCapture.piece].sort((left, right) => CAPTURE_ORDER[left] - CAPTURE_ORDER[right])
    : serverMyCaptures;
  const opponentCaptures = optimisticCapture?.capturer === opponentColor && !serverHasOptimisticCapture
    ? [...serverOpponentCaptures, optimisticCapture.piece].sort((left, right) => CAPTURE_ORDER[left] - CAPTURE_ORDER[right])
    : serverOpponentCaptures;
  const incomingCapture = (() => {
    const latest = game.state.lastMove;
    const moveCount = game.state.moves.length;
    if (observedGame.current.id !== game.id || moveCount <= observedGame.current.moveCount || !latest?.captured) return null;
    const key = `${game.id}:${moveCount}:${latest.from}:${latest.to}`;
    if (animatedCaptureKey.current === key) return null;
    const finalCaptures = capturedBy(game.state.moves, latest.color);
    return {
      key,
      capturer: latest.color,
      piece: latest.captured,
      expectedCount: finalCaptures.length,
      targetIndex: Math.max(0, finalCaptures.lastIndexOf(latest.captured)),
    } satisfies CaptureFlight;
  })();
  const visibilityFlight = captureFlight ?? incomingCapture;
  const visibleMyCaptures = visibilityFlight?.capturer === myColor && myCaptures.length >= visibilityFlight.expectedCount
    ? withoutOnePiece(myCaptures, visibilityFlight.piece)
    : myCaptures;
  const visibleOpponentCaptures = visibilityFlight?.capturer === opponentColor && opponentCaptures.length >= visibilityFlight.expectedCount
    ? withoutOnePiece(opponentCaptures, visibilityFlight.piece)
    : opponentCaptures;
  /*
   * Read check off the position actually on screen rather than off the server
   * state. While an optimistic move is showing, `game.state.inCheck` still
   * describes the position before that move while the board has already handed
   * the turn over — pairing the two put the red square on the opponent's king
   * every time a player moved out of check.
   */
  const inCheck = useMemo(() => position.isCheck(), [position]);
  const startPosition = useMemo(() => {
    try {
      return chessPosition(game.state, game.state.startFen);
    } catch {
      return chessPosition(game.state);
    }
  }, [game.state]);
  const myQueenSquareColor = queenSquareColor(startPosition, myColor);
  const opponentQueenSquareColor = queenSquareColor(startPosition, opponentColor);
  // Either end of the last move can be missing under fog — a piece can arrive
  // from somewhere you were not watching, or leave for somewhere you are not.
  const displayedLastMove = optimisticLastMove ?? moveHighlights(game.state.lastMove);
  const moveHistory = useMemo(() => {
    const rows: Array<{ number: number; white?: ChessMoveRecord; black?: ChessMoveRecord }> = [];
    for (let index = 0; index < game.state.moves.length; index += 2) {
      rows.push({ number: index / 2 + 1, white: game.state.moves[index], black: game.state.moves[index + 1] });
    }
    return rows;
  }, [game.state.moves]);

  useEffect(() => {
    setSelectedSquare(null);
    if (!settlingDrag) {
      setDraggingFrom(null);
      setDragVisualPiece(null);
      setLandingSquare(null);
      dragPosition.stopAnimation();
      dragScale.stopAnimation();
      dragScale.setValue(1);
    }
    setHoveredSquare(null);
    hoveredSquareRef.current = null;
    setPendingPromotion(null);
    setOptimisticFen(null);
    setOptimisticLastMove(null);
    setOptimisticCapture(null);
    optimisticVersion.current = null;
    sendingObserved.current = false;
  }, [game.id, game.version]);

  useLayoutEffect(() => {
    const observed = observedGame.current;
    if (observed.id !== game.id) {
      observedGame.current = { id: game.id, moveCount: game.state.moves.length };
      animatedCaptureKey.current = null;
      setCaptureFlight(null);
      setMoveSlide(null);
      return;
    }
    const moveCount = game.state.moves.length;
    const latest = game.state.lastMove;

    /*
     * Exactly one new move by the other player: show it travelling. Several at
     * once means this screen is catching up rather than watching, and under fog
     * either end of the move can be hidden, in which case there is nothing to
     * animate between.
     */
    if (moveCount === observed.moveCount + 1 && latest && latest.color !== myColor) {
      const from = latest.from as Square | null;
      const to = (latest.castleKingTo ?? latest.to) as Square | null;
      if (from && to && latest.piece) {
        startMoveSlide(from, to, latest.piece, latest.color, `${game.id}:${moveCount}`);
      }
    }

    if (moveCount > observed.moveCount && latest?.captured) {
      const key = `${game.id}:${moveCount}:${latest.from}:${latest.to}`;
      const finalCaptures = capturedBy(game.state.moves, latest.color);
      const targetIndex = Math.max(0, finalCaptures.lastIndexOf(latest.captured));
      startCaptureFlight(latest, finalCaptures.length, targetIndex, key);
    }
    observedGame.current = { id: game.id, moveCount };
  }, [game.id, game.state.moves.length]);

  useEffect(() => {
    if (sending) sendingObserved.current = true;
    else if (sendingObserved.current && optimisticVersion.current === game.version) {
      setOptimisticFen(null);
      setOptimisticLastMove(null);
      optimisticVersion.current = null;
      sendingObserved.current = false;
    }
  }, [game.version, sending]);

  function measureBoard() {
    boardRef.current?.measureInWindow((x, y) => {
      boardOrigin.current = { x, y, ready: true };
    });
  }

  function measureRoot() {
    rootRef.current?.measureInWindow((x, y, width, measuredHeight) => {
      rootFrame.current = { x, y, width, height: measuredHeight };
    });
  }

  function boardPoint(event: GestureResponderEvent): BoardPoint {
    const { pageX, pageY, locationX, locationY } = event.nativeEvent;
    if (boardOrigin.current.ready && Number.isFinite(pageX) && Number.isFinite(pageY)) {
      return { x: pageX - boardOrigin.current.x, y: pageY - boardOrigin.current.y };
    }
    return { x: locationX, y: locationY };
  }

  function exactTouchPoint(event: GestureResponderEvent, square: Square): BoardPoint {
    const { locationX, locationY, pageX, pageY } = event.nativeEvent;
    const index = squares.indexOf(square);
    const column = index % 8;
    const row = Math.floor(index / 8);
    // Native touch coordinates are normally relative to the touched square;
    // React Native Web can instead report them relative to the board.
    const x = locationX >= 0 && locationX <= cellSize
      ? column * cellSize + locationX
      : locationX;
    const y = locationY >= 0 && locationY <= cellSize
      ? row * cellSize + locationY
      : locationY;
    if (Number.isFinite(pageX) && Number.isFinite(pageY)) {
      boardOrigin.current = { x: pageX - x, y: pageY - y, ready: true };
    }
    return { x, y };
  }

  function squareAt(point: BoardPoint): Square | null {
    if (point.x < 0 || point.y < 0 || point.x >= boardSize || point.y >= boardSize) return null;
    return squares[Math.floor(point.y / cellSize) * 8 + Math.floor(point.x / cellSize)] ?? null;
  }

  function moveDrag(point: BoardPoint) {
    dragPosition.setValue({ x: point.x - cellSize / 2, y: point.y - cellSize / 2 });
  }

  function updateHoveredSquare(square: Square | null) {
    if (hoveredSquareRef.current === square) return;
    hoveredSquareRef.current = square;
    setHoveredSquare(square);
  }

  /**
   * Slide a piece from one square to the other.
   *
   * Played when the move was not dragged: watching the opponent, and your own
   * tap-to-move — in both cases the piece would otherwise teleport. A dragged
   * piece is already under the finger that carried it, so it is left alone.
   */
  function startMoveSlide(from: Square, to: Square, piece: PieceSymbol, color: Color, key: string) {
    if (squares.indexOf(from) < 0 || squares.indexOf(to) < 0) return;
    slidePosition.stopAnimation();
    slidePosition.setValue(squarePosition(from));
    setMoveSlide({ key, to, piece, color });
    Animated.timing(slidePosition, {
      toValue: squarePosition(to),
      duration: SLIDE_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setMoveSlide((current) => (current?.key === key ? null : current));
    });
  }

  function squarePosition(square: Square) {
    const index = squares.indexOf(square);
    return { x: (index % 8) * cellSize, y: Math.floor(index / 8) * cellSize };
  }

  function startCaptureFlight(
    move: Pick<ChessMoveRecord, "from" | "to" | "color" | "captured">,
    expectedCount: number,
    targetIndex: number,
    key: string,
    optimisticMoveNumber?: number,
  ) {
    if (!move.captured || animatedCaptureKey.current === key) return;
    animatedCaptureKey.current = key;

    /*
     * The flight is a copy of the destination slot — same box, same icon size —
     * so it only has to shrink to scale 1 and stop. Animating a board-sized
     * piece down to a guessed scale instead left the glyph resting off its slot,
     * because a font's ink does not sit in the middle of its line box and the
     * two boxes are not proportional.
     *
     * Lay the rack out for the count it will have *after* this piece lands, not
     * the count it shows now — the rack hides the piece in flight, so it may
     * still be one line while the piece is on its way to a two-line rack.
     */
    const rack = move.color === myColor ? myCaptureFrame.current : opponentCaptureFrame.current;
    const layout = capturedLayout(expectedCount, rack?.width ?? 0);
    const slotWidth = layout.slotWidth;
    const startScale = (cellSize * 0.66) / capturedIconSize(slotWidth);
    const flight: CaptureFlight = { key, capturer: move.color, piece: move.captured, expectedCount, targetIndex, slotWidth };
    const squareCentre = (squareIndex: number) => ({
      x: boardOrigin.current.x + (squareIndex % 8) * cellSize + cellSize / 2 - slotWidth / 2,
      y: boardOrigin.current.y + Math.floor(squareIndex / 8) * cellSize + cellSize / 2 - CAPTURED_PIECE_HEIGHT / 2,
    });

    const initialRoot = rootFrame.current;
    const initialSquareIndex = squares.indexOf(move.to as Square);
    if (initialRoot && boardOrigin.current.ready && initialSquareIndex >= 0) {
      const centre = squareCentre(initialSquareIndex);
      capturePosition.setValue({ x: centre.x - initialRoot.x, y: centre.y - initialRoot.y });
      captureScale.setValue(startScale);
    }
    setCaptureFlight(flight);
    if (optimisticMoveNumber) setOptimisticCapture({ ...flight, moveNumber: optimisticMoveNumber });

    const begin = (attempt = 0) => {
      const root = rootFrame.current;
      const row = move.color === myColor ? myCaptureFrame.current : opponentCaptureFrame.current;
      const squareIndex = squares.indexOf(move.to as Square);
      if ((!root || !row || !boardOrigin.current.ready || squareIndex < 0) && attempt < 6) {
        requestAnimationFrame(() => begin(attempt + 1));
        return;
      }
      if (!root || !row || squareIndex < 0) {
        setCaptureFlight(null);
        return;
      }
      const centre = squareCentre(squareIndex);
      const start = { x: centre.x - root.x, y: centre.y - root.y };
      const fromRight = move.color !== myColor;

      /*
       * Exactly where the piece will come to rest: its slot in the rack, which
       * may be on the second line. The rack is centred in its footer, so its
       * centre stays put as it grows — that is the one measurement that is
       * still valid once the extra line appears.
       */
      const slotRow = Math.floor(targetIndex / layout.columns);
      const slotColumn = targetIndex % layout.columns;
      const slotCentre = (slotColumn + 0.5) * slotWidth;
      const targetCentreX = fromRight ? row.x + row.width - slotCentre : row.x + slotCentre;
      const rackCentreY = row.y + row.height / 2;
      const targetCentreY = rackCentreY
        - (layout.rows * CAPTURED_PIECE_HEIGHT) / 2
        + slotRow * CAPTURED_PIECE_HEIGHT
        + CAPTURED_PIECE_HEIGHT / 2;
      const target = {
        x: targetCentreX - root.x - slotWidth / 2,
        y: targetCentreY - root.y - CAPTURED_PIECE_HEIGHT / 2,
      };
      capturePosition.setValue(start);
      captureScale.setValue(startScale);
      Animated.parallel([
        Animated.timing(capturePosition, {
          toValue: target,
          duration: 340,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(captureScale, {
          toValue: 1,
          duration: 340,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => {
        setCaptureFlight((current) => current?.key === key ? null : current);
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
      });
    };
    requestAnimationFrame(() => begin());
  }

  function settlePieceAt(square: Square, complete: () => void) {
    setSettlingDrag(true);
    Animated.parallel([
      Animated.spring(dragPosition, {
        toValue: squarePosition(square),
        damping: 21,
        stiffness: 310,
        mass: 0.55,
        useNativeDriver: true,
      }),
      Animated.spring(dragScale, {
        toValue: 1,
        damping: 18,
        stiffness: 270,
        mass: 0.5,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setDraggingFrom(null);
      setDragVisualPiece(null);
      setLandingSquare(null);
      setSettlingDrag(false);
      updateHoveredSquare(null);
      complete();
    });
  }

  function commitMove(from: Square, to: Square, promotion?: ChessPromotionPiece, preserveDrag = false) {
    let played: Move;
    try {
      const preview = chessPosition(game.state);
      played = preview.move({ from, to, promotion });
      setOptimisticFen(preview.fen());
      // Castling is drawn where the king lands, which in Chess960 is not `to`.
      const landed = (played.castleKingTo ?? to) as Square;
      setOptimisticLastMove({ from, to: landed });
      optimisticVersion.current = game.version;
      // Tap-to-move gets the same travel the opponent's moves get; a dragged
      // piece already made the journey under the player's finger.
      // `landingSquare` means a drag just settled there — which happens when a
      // promotion is chosen after dragging, where the piece has already arrived.
      if (!preserveDrag && landingSquare !== landed) {
        startMoveSlide(from, landed, played.piece, played.color, `local:${game.version}:${from}${landed}`);
      }
    } catch {
      return;
    }
    setSelectedSquare(null);
    if (!preserveDrag) {
      setDraggingFrom(null);
      setDragVisualPiece(null);
      setLandingSquare(null);
    }
    setPendingPromotion(null);
    if (played.captured) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const moveNumber = game.state.moves.length + 1;
      const key = `${game.id}:${moveNumber}:${played.from}:${played.to}`;
      const existing = capturedBy(game.state.moves, played.color);
      const finalCaptures = [...existing, played.captured].sort((left, right) => CAPTURE_ORDER[left] - CAPTURE_ORDER[right]);
      startCaptureFlight(played, finalCaptures.length, finalCaptures.lastIndexOf(played.captured), key, moveNumber);
    } else void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onMove({ from, to, promotion });
  }

  function chooseDestination(from: Square, to: Square, preserveDrag = false) {
    const matching = position.moves({ square: from, verbose: true }).filter((move) => move.to === to);
    if (matching.length === 0) return;
    if (matching.some((move) => move.isPromotion())) {
      setPendingPromotion({ from, to });
      setDraggingFrom(null);
      return;
    }
    commitMove(from, to, undefined, preserveDrag);
  }

  const boardResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => canInteract,
    onMoveShouldSetPanResponder: () => canInteract,
    onPanResponderGrant: (event) => {
      const exactTouched = touchedSquare.current;
      let point = exactTouched ? exactTouchPoint(event, exactTouched) : boardPoint(event);
      // The exact child square is more reliable for taps than mixing
      // screen coordinates with a measured safe-area origin. Dragging still
      // uses board coordinates once the gesture has started.
      const touched = exactTouched ?? squareAt(point);
      touchedSquare.current = null;
      gestureStartedOn.current = touched;
      gestureSource.current = null;
      gestureLegalMoves.current = [];
      dragActive.current = false;
      updateHoveredSquare(null);
      if (!touched) return;
      if (selectedSquare && legalTargets.has(touched)) {
        gestureSource.current = selectedSquare;
        gestureLegalMoves.current = legalMoves;
        return;
      }
      const piece = position.get(touched);
      if (piece?.color === myColor) {
        setSelectedSquare(touched);
        gestureSource.current = touched;
        gestureLegalMoves.current = position.moves({ square: touched, verbose: true });
        moveDrag(point);
        void Haptics.selectionAsync();
      } else {
        setSelectedSquare(null);
      }
    },
    onPanResponderMove: (event, gesture) => {
      const source = gestureSource.current;
      if (!source || gestureStartedOn.current !== source) return;
      if (!dragActive.current && Math.hypot(gesture.dx, gesture.dy) > 3) {
        dragActive.current = true;
        setDraggingFrom(source);
        const liftedPiece = position.get(source);
        if (liftedPiece) setDragVisualPiece({ type: liftedPiece.type, color: liftedPiece.color });
        dragScale.setValue(1);
        Animated.spring(dragScale, {
          toValue: 1.48,
          damping: 16,
          stiffness: 260,
          mass: 0.48,
          useNativeDriver: true,
        }).start();
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      const point = boardPoint(event);
      moveDrag(point);
      const nextHover = squareAt(point);
      if (nextHover !== hoveredSquareRef.current
        && gestureLegalMoves.current.some((move) => move.to === nextHover)) {
        void Haptics.selectionAsync();
      }
      updateHoveredSquare(nextHover);
    },
    onPanResponderRelease: (event) => {
      const source = gestureSource.current;
      const destination = squareAt(boardPoint(event));
      const validDestination = source && destination && destination !== source
        && gestureLegalMoves.current.some((move) => move.to === destination);
      if (source && destination && validDestination) {
        const requiresPromotion = gestureLegalMoves.current.some((move) => move.to === destination && move.isPromotion());
        // A Chess960 castle is played by dropping the king on its own rook, so
        // the piece has to settle where the king actually ends up.
        const chosen = gestureLegalMoves.current.find((move) => move.to === destination);
        const landing = (chosen?.castleKingTo as Square | undefined) ?? destination;
        if (dragActive.current && !requiresPromotion) {
          setLandingSquare(landing);
          chooseDestination(source, destination, true);
          settlePieceAt(landing, () => undefined);
        } else if (dragActive.current) {
          setLandingSquare(landing);
          setPendingPromotion({ from: source, to: destination });
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          settlePieceAt(landing, () => undefined);
        }
        else chooseDestination(source, destination);
      } else if (source && dragActive.current) {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
        settlePieceAt(source, () => undefined);
      } else {
        setDraggingFrom(null);
        updateHoveredSquare(null);
      }
      gestureSource.current = null;
      gestureStartedOn.current = null;
      touchedSquare.current = null;
      gestureLegalMoves.current = [];
      dragActive.current = false;
    },
    onPanResponderTerminate: () => {
      dragPosition.stopAnimation();
      dragScale.stopAnimation();
      dragScale.setValue(1);
      setDraggingFrom(null);
      setDragVisualPiece(null);
      setLandingSquare(null);
      setSettlingDrag(false);
      gestureSource.current = null;
      gestureStartedOn.current = null;
      touchedSquare.current = null;
      gestureLegalMoves.current = [];
      dragActive.current = false;
      updateHoveredSquare(null);
    },
    onPanResponderTerminationRequest: () => false,
  }), [boardSize, canInteract, cellSize, legalMoves, legalTargets, myColor, position, selectedSquare, squares]);

  const draggedPiece = dragVisualPiece ?? (draggingFrom ? position.get(draggingFrom) : null);
  const whitePlayer = game.players.find((player) => player.id === game.state.whitePlayer);
  const blackPlayer = game.players.find((player) => player.id !== game.state.whitePlayer);
  const myUser = account;
  const opponentUser = game.opponent;

  return (
    <View ref={rootRef} collapsable={false} onLayout={() => requestAnimationFrame(measureRoot)} style={styles.root}>
      <View style={styles.scoreHeader}>
        <TurnBasedGameHeader
          player={{
            user: myUser,
            label: "YOU",
            score: capturedScore(visibleMyCaptures),
            active: game.waitingOn === account.id,
            backgroundColor: myQueenSquareColor,
            foregroundColor: myQueenSquareColor === LIGHT_SQUARE ? "#152018" : "#F5FAF5",
            footer: <CapturedPieces pieces={visibleMyCaptures} capturedColor={opponentColor} onFrame={(frame) => { myCaptureFrame.current = frame; }} />,
          }}
          opponent={{
            user: opponentUser,
            label: opponentUser.displayName.toUpperCase(),
            score: capturedScore(visibleOpponentCaptures),
            active: game.waitingOn === opponentUser.id,
            backgroundColor: opponentQueenSquareColor,
            foregroundColor: opponentQueenSquareColor === LIGHT_SQUARE ? "#152018" : "#F5FAF5",
            footer: <CapturedPieces pieces={visibleOpponentCaptures} capturedColor={myColor} reverse onFrame={(frame) => { opponentCaptureFrame.current = frame; }} />,
          }}
          turnIndicator={turnIndicator}
          centerAccessory={
            inCheck && game.status === "STARTED"
              ? <Text style={styles.checkLabel}>CHECK</Text>
              : game.state.variant !== "STANDARD"
                ? <Text style={styles.variantLabel}>{variantName(game.state.variant).toUpperCase()}</Text>
                : null
          }
          resultIndicator={resultIndicator}
        />
      </View>

      <View
        ref={boardRef}
        collapsable={false}
        style={[styles.board, { width: boardSize, height: boardSize }]}
        onLayout={() => requestAnimationFrame(measureBoard)}
        accessibilityLabel={`Chess board. ${whitePlayer?.displayName ?? "White"} is white, ${blackPlayer?.displayName ?? "Black"} is black.`}
        {...boardResponder.panHandlers}
      >
        {squares.map((square, index) => {
          const row = Math.floor(index / 8);
          const column = index % 8;
          const piece = position.get(square);
          const isLight = isLightSquare(square);
          const isFrom = displayedLastMove?.from === square;
          const isTo = displayedLastMove?.to === square;
          const isSelected = selectedSquare === square;
          const legal = legalTargets.has(square);
          const isHoveredTarget = draggingFrom !== null && hoveredSquare === square && legal;
          const isCheckKing = inCheck && piece?.type === "k" && piece.color === position.turn();
          return (
            <View
              key={square}
              onStartShouldSetResponder={() => {
                touchedSquare.current = square;
                return false;
              }}
              style={[
                styles.square,
                { width: cellSize, height: cellSize, left: column * cellSize, top: row * cellSize },
                isLight ? styles.lightSquare : styles.darkSquare,
                isFrom && styles.lastFrom,
                isTo && styles.lastTo,
                isSelected && styles.selectedSquare,
                isHoveredTarget && styles.hoveredSquare,
                isCheckKing && styles.checkedSquare,
              ]}
            >
              {column === 0 && <Text style={[styles.rankLabel, isLight ? styles.darkCoordinate : styles.lightCoordinate]}>{square[1]}</Text>}
              {row === 7 && <Text style={[styles.fileLabel, isLight ? styles.darkCoordinate : styles.lightCoordinate]}>{square[0]}</Text>}
              {piece && draggingFrom !== square && landingSquare !== square && moveSlide?.to !== square && (
                <View pointerEvents="none" style={styles.pieceHost}>
                  <PieceGraphic piece={piece.type} color={piece.color} size={cellSize * 0.66} highlighted={isSelected || isHoveredTarget} />
                </View>
              )}
              {legal && (
                <View pointerEvents="none" style={[styles.moveDot, { width: cellSize * 0.23, height: cellSize * 0.23, borderRadius: cellSize }]} />
              )}
            </View>
          );
        })}
        {/* Stays mounted while the variant is fogged, so cloud tiles can play
            their exit as squares come into view rather than blinking out. */}
        {fogged && (
          <FogClouds squares={squares} fogged={fogged} cellSize={cellSize} boardSize={boardSize} />
        )}
        {moveSlide && (
          <Animated.View
            pointerEvents="none"
            style={[styles.slidingPiece, {
              width: cellSize,
              height: cellSize,
              transform: slidePosition.getTranslateTransform(),
            }]}
          >
            <PieceGraphic piece={moveSlide.piece} color={moveSlide.color} size={cellSize * 0.66} />
          </Animated.View>
        )}
        {draggingFrom && draggedPiece && (
          <Animated.View pointerEvents="none" style={[styles.dragPiece, {
            width: cellSize,
            height: cellSize,
            transform: dragPosition.getTranslateTransform(),
          }]}>
            <Animated.View style={[styles.dragPieceScale, {
              width: cellSize,
              height: cellSize,
              transform: [{ scale: dragScale }],
            }]}>
              <PieceGraphic piece={draggedPiece.type} color={draggedPiece.color} size={cellSize * 0.66} highlighted />
            </Animated.View>
          </Animated.View>
        )}
      </View>
      {captureFlight && (() => {
        // Drawn as its destination slot, flown at scale and settling to 1, so
        // the last frame of the animation is the resting piece itself.
        const slotWidth = captureFlight.slotWidth ?? CAPTURED_MAX_SLOT;
        return (
          <Animated.View pointerEvents="none" style={[styles.captureFlight, {
            width: slotWidth,
            height: CAPTURED_PIECE_HEIGHT,
            transform: capturePosition.getTranslateTransform(),
          }]}>
            <Animated.View style={[styles.captureFlightScale, {
              width: slotWidth,
              height: CAPTURED_PIECE_HEIGHT,
              transform: [{ scale: captureScale }],
            }]}>
              <PieceGraphic
                piece={captureFlight.piece}
                color={captureFlight.capturer === "w" ? "b" : "w"}
                size={capturedIconSize(slotWidth)}
              />
            </Animated.View>
          </Animated.View>
        );
      })()}
      <View style={styles.moveHistory}>
        <Text style={styles.moveHistoryLabel}>MOVES</Text>
        <ScrollView
          ref={moveHistoryRef}
          horizontal
          style={styles.moveHistoryScroll}
          contentContainerStyle={styles.moveHistoryContent}
          showsHorizontalScrollIndicator={false}
          onContentSizeChange={() => moveHistoryRef.current?.scrollToEnd({ animated: true })}
        >
          {moveHistory.length === 0 ? (
            <Text style={styles.moveHistoryEmpty}>
              {fogOfWar
                ? `You are ${myColor === "w" ? "White" : "Black"} — capture the king`
                : myColor === "w" ? "You are White" : "You are Black"}
            </Text>
          ) : moveHistory.map((row, index) => (
            <View key={row.number} style={[styles.movePair, index === moveHistory.length - 1 && styles.movePairLatest]}>
              <Text style={styles.moveNumber}>{row.number}.</Text>
              <Text style={[styles.moveNotation, row.white?.hidden && styles.moveNotationHidden]}>
                {row.white ? moveLabel(row.white) : "—"}
              </Text>
              <Text style={[styles.moveNotation, row.black?.hidden && styles.moveNotationHidden]}>
                {row.black ? moveLabel(row.black) : "…"}
              </Text>
            </View>
          ))}
        </ScrollView>
      </View>

      <PromotionPicker
        visible={pendingPromotion !== null}
        color={myColor}
        destination={pendingPromotion?.to ?? null}
        onChoose={(promotion) => {
          if (pendingPromotion) commitMove(pendingPromotion.from, pendingPromotion.to, promotion);
        }}
      />
    </View>
  );
}

function PromotionPicker({ visible, color, destination, onChoose }: {
  visible: boolean;
  color: Color;
  destination: Square | null;
  onChoose: (piece: ChessPromotionPiece) => void;
}) {
  const destinationColor = destination && isLightSquare(destination) ? LIGHT_SQUARE : DARK_SQUARE;
  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={() => undefined}>
      <View style={styles.promotionRoot}>
        <View style={styles.promotionSpacer} />
        <SafeAreaView style={styles.promotionSheet} edges={["bottom"]}>
          <Text style={styles.promotionTitle}>Promote pawn</Text>
          <Text style={styles.promotionSubtitle}>Choose the piece your pawn becomes</Text>
          <View style={styles.promotionChoices}>
            {PROMOTIONS.map((piece) => (
              <Pressable
                key={piece}
                accessibilityRole="button"
                accessibilityLabel={`Promote to ${piece === "q" ? "queen" : piece === "r" ? "rook" : piece === "b" ? "bishop" : "knight"}`}
                style={({ pressed }) => [styles.promotionChoice, { backgroundColor: destinationColor }, pressed && styles.promotionChoicePressed]}
                onPress={() => onChoose(piece)}
              >
                <PieceGraphic piece={piece} color={color} size={39} />
              </Pressable>
            ))}
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center" },
  scoreHeader: { width: "100%", minHeight: 101 },
  capturedRack: {
    width: "100%",
    maxHeight: CAPTURED_PIECE_HEIGHT * CAPTURED_ROWS,
    flexDirection: "row",
    flexWrap: "wrap",
    alignContent: "flex-start",
    alignItems: "center",
    overflow: "hidden",
  },
  capturedRackReverse: { flexDirection: "row-reverse" },
  capturedPiece: { height: CAPTURED_PIECE_HEIGHT, alignItems: "center", justifyContent: "center" },
  checkLabel: { color: "#EF7777", fontSize: 12, fontWeight: "900", letterSpacing: 1.2 },
  variantLabel: { color: colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.1 },
  board: { position: "relative", overflow: "hidden", borderRadius: 5, backgroundColor: "#365A43" },
  square: { position: "absolute", alignItems: "center", justifyContent: "center" },
  lightSquare: { backgroundColor: LIGHT_SQUARE },
  darkSquare: { backgroundColor: DARK_SQUARE },
  lastFrom: { backgroundColor: "#789DB2" },
  lastTo: { backgroundColor: "#7FC09C" },
  selectedSquare: { backgroundColor: "#75B5C6" },
  hoveredSquare: { backgroundColor: "#8BCFA4" },
  checkedSquare: { backgroundColor: "#C55C5C" },
  pieceHost: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", zIndex: 2 },
  whitePieceShadow: { textShadowColor: "rgba(4,12,7,0.9)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2.4 },
  blackPieceShadow: { textShadowColor: "rgba(236,255,239,0.34)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 1.5 },
  moveDot: { position: "absolute", backgroundColor: "rgba(12,28,19,0.43)", zIndex: 4 },
  // Below the fog (zIndex 8) on purpose: a piece crossing hidden ground should
  // pass behind the cloud bank rather than over it.
  slidingPiece: { position: "absolute", left: 0, top: 0, zIndex: 7, alignItems: "center", justifyContent: "center" },
  dragPiece: { position: "absolute", left: 0, top: 0, alignItems: "center", justifyContent: "center", zIndex: 20, elevation: 20 },
  dragPieceScale: { alignItems: "center", justifyContent: "center" },
  captureFlight: { position: "absolute", left: 0, top: 0, alignItems: "center", justifyContent: "center", zIndex: 60, elevation: 60 },
  captureFlightScale: { alignItems: "center", justifyContent: "center" },
  rankLabel: { position: "absolute", left: 3, top: 1, fontSize: 9, lineHeight: 11, fontWeight: "900", zIndex: 6 },
  fileLabel: { position: "absolute", right: 3, bottom: 1, fontSize: 9, lineHeight: 11, fontWeight: "900", zIndex: 6 },
  lightCoordinate: { color: LIGHT_SQUARE },
  darkCoordinate: { color: DARK_SQUARE },
  moveHistory: { width: "100%", height: 43, marginTop: 7, borderRadius: 7, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", overflow: "hidden" },
  moveHistoryLabel: { paddingLeft: 10, paddingRight: 8, color: colors.muted, fontSize: 8, fontWeight: "900", letterSpacing: 0.9 },
  moveHistoryScroll: { flex: 1 },
  moveHistoryContent: { minWidth: "100%", paddingRight: 7, alignItems: "center", gap: 5 },
  moveHistoryEmpty: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  movePair: { height: 29, paddingHorizontal: 7, borderRadius: 5, backgroundColor: colors.surfaceRaised, flexDirection: "row", alignItems: "center", gap: 7 },
  movePairLatest: { borderWidth: 1, borderColor: colors.greenStrong },
  moveNumber: { color: colors.muted, fontSize: 10, fontWeight: "800" },
  moveNotation: { minWidth: 27, color: colors.text, fontSize: 12, fontWeight: "800", fontVariant: ["tabular-nums"] },
  moveNotationHidden: { color: colors.muted, letterSpacing: 1 },
  promotionRoot: { flex: 1, justifyContent: "flex-end" },
  promotionSpacer: { flex: 1 },
  promotionSheet: { minHeight: 226, backgroundColor: colors.surface, borderWidth: 1, borderBottomWidth: 0, borderColor: colors.border, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingTop: 19, paddingHorizontal: 18, overflow: "hidden" },
  promotionTitle: { color: colors.text, textAlign: "center", fontSize: 22, fontWeight: "900" },
  promotionSubtitle: { color: colors.muted, textAlign: "center", fontSize: 13, marginTop: 4 },
  promotionChoices: { flexDirection: "row", alignItems: "center", gap: 9, marginTop: 18, marginBottom: 16 },
  promotionChoice: { flex: 1, aspectRatio: 1, borderRadius: 9, borderWidth: 1, borderColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" },
  promotionChoicePressed: { borderColor: colors.green, transform: [{ scale: 0.97 }] },
});
