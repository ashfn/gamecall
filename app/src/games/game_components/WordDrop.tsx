import { FontAwesome5 } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject, ReactNode, RefObject, SetStateAction } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import type { StyleProp, TextStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import type { GestureType } from "react-native-gesture-handler";
import Reanimated, {
  cancelAnimation,
  Easing,
  measure,
  runOnJS,
  useAnimatedRef,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import type { AnimatedRef, SharedValue } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { useLocalGameState } from "../../../util/localGameState";
import { colors } from "../../../util/theme";
import { primaryWordDropWord } from "../../../util/wordDrop";
import type {
  User,
  WordDropBoardTile,
  WordDropBonusType,
  WordDropGameSession,
  WordDropPlacement,
  WordDropTile,
} from "../../../util/types";
import type { GameViewProps } from "../GameLoader";
import TurnBasedGameHeader from "../components/TurnBasedGameHeader";
import { buildWordDropCellPath as buildWordBorderPath } from "../wordDropGeometry";
import { previewWordDropMove } from "../wordDropPreview";
import type { WordDropPreview } from "../wordDropPreview";

const BOARD_GAP = 1;
const BOARD_MAX_ZOOM = 3.25;
// Render the board at the maximum zoom resolution from the outset. Scaling a
// normal-resolution React Native view up during a pinch makes its text and
// edges blurry until the gesture finishes and React redraws it. A permanently
// high-resolution board only ever gets downscaled, so every intermediate pinch
// frame stays sharp without requiring React renders on the gesture path.
const BOARD_RENDER_SCALE = BOARD_MAX_ZOOM;
const RACK_SIZE = 7;
const RACK_TILE_SIZE = 48;
type RackDropResult =
  | { kind: "board" }
  | { kind: "reordered" }
  | { kind: "cancelled" };
const RACK_GAP = 4;
const RACK_EDGE_TOUCH_PADDING = 12;
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const WILDCARD_KEY = "?";
const VOWELS = new Set(["A", "E", "I", "O", "U"]);
const AnimatedPath = Reanimated.createAnimatedComponent(Path);
const AnimatedTextInput = Reanimated.createAnimatedComponent(TextInput);

interface RackDragState {
  tileId: string;
  from: number;
  to: number;
}

interface PendingWildcardPlacement {
  tileId: string;
  row: number;
  col: number;
}

interface WordDropLocalState {
  placements: WordDropPlacement[];
  rackOrder: string[];
}

function normalizeRackOrder(order: string[], rack: WordDropTile[]): string[] {
  const validIds = rack.map((tile) => tile.id);
  const validSet = new Set(validIds);
  const seen = new Set<string>();
  const normalized: string[] = [];
  order.forEach((id) => {
    if (!validSet.has(id) || seen.has(id)) return;
    seen.add(id);
    normalized.push(id);
  });
  validIds.forEach((id) => {
    if (seen.has(id)) return;
    seen.add(id);
    normalized.push(id);
  });
  return normalized;
}

function displayTileLetter(tile: WordDropTile): string {
  return tile.wildcard && !tile.letter ? WILDCARD_KEY : tile.letter;
}

function tileForPlacement(tile: WordDropTile, placement: WordDropPlacement): WordDropTile {
  return tile.wildcard && placement.letter ? { ...tile, letter: placement.letter } : tile;
}

interface TileConnections {
  top: boolean;
  right: boolean;
  bottom: boolean;
  left: boolean;
}

const NO_TILE_CONNECTIONS: TileConnections = { top: false, right: false, bottom: false, left: false };

interface TileSurfaceVariant {
  key: string;
  removedRow: number | null;
  removedCol: number | null;
  occupiedPath: string;
  pendingPath: string;
}

interface OccupiedBoardCell {
  key: string;
  row: number;
  col: number;
  tile: WordDropTile;
  pending: boolean;
}

interface LiftedWordPreview {
  tileId: string;
  cells: string[];
  score: number | null;
}

type WordScoreCorner = "topRight" | "topLeft" | "bottomRight" | "bottomLeft";

interface WordScoreVisual {
  tileId: string;
  score: number;
  row: number;
  col: number;
  corner: WordScoreCorner;
  inset: boolean;
}

export default function WordDrop(props: GameViewProps) {
  if (props.game.type !== "WORD_DROP") return null;
  return <WordDropGame {...props} game={props.game} />;
}

function WordDropGame({
  game,
  account,
  sending,
  onMove,
  turnIndicator,
  resultIndicator,
}: Omit<GameViewProps, "game"> & { game: WordDropGameSession }) {
  const windowSize = useWindowDimensions();
  const boardRef = useRef<View>(null);
  const boardCoordinateMapper = useRef<((pageX: number, pageY: number) => { row: number; col: number } | null) | null>(null);
  const refreshBoardMeasurement = useRef<(() => void) | null>(null);
  const rackRef = useRef<View>(null);
  const rackFrame = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const dragStateRef = useRef<RackDragState | null>(null);
  const lastRackHapticAt = useRef(0);
  const previewCache = useRef(new Map<string, WordDropPreview>());
  const returnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [contentSize, setContentSize] = useState(() => ({
    width: Math.max(0, windowSize.width - 16),
    height: Math.max(0, windowSize.height - 160),
  }));
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const state = game.state;
  const boardDimension = state.boardSize;
  const [localState, setLocalState, localStateHydrated] = useLocalGameState<WordDropLocalState>({
    userId: account.id,
    gameId: game.id,
    gameType: game.type,
    slot: "play-draft",
  }, { placements: [], rackOrder: [] });
  const placements = localState.placements;
  const rackOrder = localState.rackOrder;
  const setPlacements = useCallback((update: SetStateAction<WordDropPlacement[]>) => {
    setLocalState((current) => {
      const placements = typeof update === "function" ? update(current.placements) : update;
      return placements === current.placements ? current : { ...current, placements };
    });
  }, [setLocalState]);
  const setRackOrder = useCallback((update: SetStateAction<string[]>) => {
    setLocalState((current) => {
      const rackOrder = typeof update === "function" ? update(current.rackOrder) : update;
      return rackOrder === current.rackOrder ? current : { ...current, rackOrder };
    });
  }, [setLocalState]);
  const [dragState, setDragState] = useState<RackDragState | null>(null);
  const [bagOpen, setBagOpen] = useState(false);
  const [pendingWildcard, setPendingWildcard] = useState<PendingWildcardPlacement | null>(null);
  const [returningIds, setReturningIds] = useState<Set<string>>(() => new Set());
  const [calmReturningIds, setCalmReturningIds] = useState<Set<string>>(() => new Set());
  const [liftedPreviewTileId, setLiftedPreviewTileId] = useState<string | null>(null);
  const isMyTurn = game.status === "STARTED" && game.waitingOn === account.id;
  const boardSize = Math.max(0, Math.min(
    contentSize.width,
    contentSize.height > 219 ? contentSize.height - 219 : contentSize.width,
  ));
  const cellSize = Math.max(0, (boardSize - (boardDimension - 1) * BOARD_GAP) / boardDimension);
  const rackTileSize = Math.min(RACK_TILE_SIZE, Math.max(
    38,
    (contentSize.width - RACK_EDGE_TOUCH_PADDING * 2 - (RACK_SIZE - 1) * RACK_GAP) / RACK_SIZE,
  ));
  const rackWidth = RACK_SIZE * rackTileSize + (RACK_SIZE - 1) * RACK_GAP;
  const rackTouchableWidth = rackWidth + RACK_EDGE_TOUCH_PADDING * 2;
  const pendingByCell = useMemo(
    () => new Map(placements.map((placement) => [`${placement.row}:${placement.col}`, placement])),
    [placements],
  );
  const rackById = useMemo(() => new Map(state.rack.map((tile) => [tile.id, tile])), [state.rack]);
  const bonusByCell = useMemo(
    () => new Map(state.bonuses.map((bonus) => [`${bonus.row}:${bonus.col}`, bonus.type])),
    [state.bonuses],
  );
  const placedIds = useMemo(() => new Set(placements.map((placement) => placement.tileId)), [placements]);
  const resolvedRackOrder = useMemo(() => {
    return normalizeRackOrder(rackOrder, state.rack);
  }, [rackOrder, state.rack]);
  const rackSignature = state.rack.map((tile) => tile.id).join("|");
  const unseenLetters = useMemo(
    () => [...LETTERS, WILDCARD_KEY].map((letter) => ({ letter, count: state.unseenLetterCounts?.[letter] ?? 0 })),
    [state.unseenLetterCounts],
  );
  const previewPlacements = useMemo(
    () => liftedPreviewTileId ? placements.filter((placement) => placement.tileId !== liftedPreviewTileId) : placements,
    [liftedPreviewTileId, placements],
  );
  const previewMove = useCallback((nextPlacements: WordDropPlacement[]) => {
    const key = `${game.version}:` + nextPlacements
      .map((placement) => `${placement.tileId}:${placement.row}:${placement.col}:${placement.letter ?? ""}`)
      .sort()
      .join("|");
    const cached = previewCache.current.get(key);
    if (cached) return cached;
    const preview = previewWordDropMove(state.board, state.rack, state.bonuses, nextPlacements);
    previewCache.current.set(key, preview);
    if (previewCache.current.size > 96) {
      const oldest = previewCache.current.keys().next().value;
      if (oldest !== undefined) previewCache.current.delete(oldest);
    }
    return preview;
  }, [game.version, state.board, state.bonuses, state.rack]);
  const wordPreview = useMemo(
    () => isMyTurn && previewPlacements.length > 0
      ? previewMove(previewPlacements)
      : null,
    [isMyTurn, previewMove, previewPlacements],
  );
  const canDropWord = Boolean(
    !sending
    && isMyTurn
    && placements.length > 0
    && liftedPreviewTileId === null
    && wordPreview?.valid
    && wordPreview.score > 0
  );
  const validWordCells = useMemo(
    () => new Set(wordPreview?.valid ? wordPreview.cells : []),
    [wordPreview],
  );
  const liftedWordPreviews = useMemo<LiftedWordPreview[]>(() => placements.map((placement) => {
    const remaining = placements.filter((candidate) => candidate.tileId !== placement.tileId);
    const preview = isMyTurn && remaining.length > 0
      ? previewMove(remaining)
      : null;
    return {
      tileId: placement.tileId,
      cells: preview?.valid ? preview.cells : [],
      score: preview?.valid ? preview.score : null,
    };
  }), [isMyTurn, placements, previewMove]);

  useEffect(() => {
    previewCache.current.clear();
    setSelectedTileId(null);
    setLiftedPreviewTileId(null);
    setPendingWildcard(null);
    dragStateRef.current = null;
    setDragState(null);
  }, [game.id, game.version, game.status]);

  useEffect(() => {
    if (!localStateHydrated) return;
    setRackOrder((current) => {
      const next = normalizeRackOrder(current, state.rack);
      return next.length === current.length && next.every((id, index) => id === current[index]) ? current : next;
    });
    setPlacements((current) => {
      if (game.status !== "STARTED") return current.length === 0 ? current : [];
      const currentRackById = new Map(state.rack.map((tile) => [tile.id, tile]));
      const seenTiles = new Set<string>();
      const seenCells = new Set<string>();
      const next = current.filter((placement) => {
        const cell = `${placement.row}:${placement.col}`;
        const tile = currentRackById.get(placement.tileId);
        const hasValidLetter = tile?.wildcard
          ? typeof placement.letter === "string" && /^[A-Z]$/.test(placement.letter)
          : placement.letter === undefined;
        const valid = Boolean(tile)
          && hasValidLetter
          && !seenTiles.has(placement.tileId)
          && Number.isInteger(placement.row)
          && Number.isInteger(placement.col)
          && placement.row >= 0
          && placement.row < boardDimension
          && placement.col >= 0
          && placement.col < boardDimension
          && !state.board[placement.row * boardDimension + placement.col]
          && !seenCells.has(cell);
        if (valid) {
          seenTiles.add(placement.tileId);
          seenCells.add(cell);
        }
        return valid;
      });
      return next.length === current.length
        && next.every((placement, index) => placement.tileId === current[index].tileId
          && placement.row === current[index].row
          && placement.col === current[index].col
          && placement.letter === current[index].letter)
        ? current
        : next;
    });
  }, [boardDimension, game.status, game.version, localStateHydrated, rackSignature, state.board]);

  useEffect(() => () => {
    if (returnTimer.current) clearTimeout(returnTimer.current);
  }, []);

  const chooseTile = useCallback((tile: WordDropTile) => {
    if (!isMyTurn || sending) return;
    setSelectedTileId((current) => current === tile.id ? null : tile.id);
    void Haptics.selectionAsync();
  }, [isMyTurn, sending]);

  const animateRackReturn = useCallback((tileIds: string[], calm = false) => {
    if (returnTimer.current) clearTimeout(returnTimer.current);
    setReturningIds(new Set(tileIds));
    setCalmReturningIds(calm ? new Set(tileIds) : new Set());
    returnTimer.current = setTimeout(() => {
      setReturningIds(new Set());
      setCalmReturningIds(new Set());
    }, calm ? 180 : 520);
  }, []);

  const removePlacement = useCallback((tileId: string, select = true) => {
    animateRackReturn([tileId], true);
    setPlacements((current) => current.filter((item) => item.tileId !== tileId));
    setSelectedTileId(select ? tileId : null);
    void Haptics.selectionAsync();
  }, [animateRackReturn]);

  const returnPlacementToRack = useCallback((tileId: string, pageX: number, frame: { x: number; width: number }) => {
    const target = Math.max(0, Math.min(
      Math.max(0, state.rack.length - 1),
      Math.round((pageX - frame.x - RACK_EDGE_TOUCH_PADDING - rackTileSize / 2) / (rackTileSize + RACK_GAP)),
    ));
    setRackOrder((current) => {
      const next = normalizeRackOrder(current, state.rack);
      const from = next.indexOf(tileId);
      if (from < 0 || from === target) return next;
      next.splice(from, 1);
      next.splice(target, 0, tileId);
      return next;
    });
    removePlacement(tileId, false);
  }, [rackTileSize, removePlacement, state.rack]);

  const repositionPendingTile = useCallback((tileId: string, row: number, col: number) => {
    if (row < 0 || row >= boardDimension || col < 0 || col >= boardDimension || state.board[row * boardDimension + col]) return;
    setPlacements((current) => {
      if (current.some((placement) => placement.tileId !== tileId && placement.row === row && placement.col === col)) return current;
      return current.map((placement) => placement.tileId === tileId ? { ...placement, row, col } : placement);
    });
    void Haptics.selectionAsync();
  }, [boardDimension, state.board]);

  const dropPendingTile = useCallback((tileId: string, pageX: number, pageY: number) => {
    const moveOnBoard = () => {
      const cell = boardCoordinateMapper.current?.(pageX, pageY);
      if (cell) repositionPendingTile(tileId, cell.row, cell.col);
    };
    const cachedRack = rackFrame.current;
    const overCachedRack = Boolean(cachedRack && pageX >= cachedRack.x && pageX <= cachedRack.x + cachedRack.width
      && pageY >= cachedRack.y - 24 && pageY <= cachedRack.y + cachedRack.height + 24);
    if (overCachedRack) {
      returnPlacementToRack(tileId, pageX, cachedRack!);
      return;
    }
    if (cachedRack) {
      moveOnBoard();
      return;
    }
    const rack = rackRef.current;
    if (!rack) {
      moveOnBoard();
      return;
    }
    rack.measureInWindow((x, y, width, height) => {
      const overRack = pageX >= x && pageX <= x + width && pageY >= y - 24 && pageY <= y + height + 24;
      if (overRack) returnPlacementToRack(tileId, pageX, { x, width });
      else moveOnBoard();
    });
  }, [repositionPendingTile, returnPlacementToRack]);

  const commitPlacement = useCallback((tileId: string, row: number, col: number, letter?: string): boolean => {
    if (!isMyTurn || sending || !rackById.has(tileId)) return false;
    if (row < 0 || row >= boardDimension || col < 0 || col >= boardDimension) return false;
    if (state.board[row * boardDimension + col] || pendingByCell.has(`${row}:${col}`) || placedIds.has(tileId)) return false;
    const tile = rackById.get(tileId)!;
    if (tile.wildcard && (!letter || !/^[A-Z]$/.test(letter))) return false;
    setPlacements((current) => [...current, { tileId, row, col, ...(tile.wildcard ? { letter } : {}) }]);
    setSelectedTileId(null);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    return true;
  }, [boardDimension, isMyTurn, pendingByCell, placedIds, rackById, sending, state.board]);

  const placeTile = useCallback((tileId: string, row: number, col: number): boolean => {
    const tile = rackById.get(tileId);
    if (!tile || !isMyTurn || sending) return false;
    if (row < 0 || row >= boardDimension || col < 0 || col >= boardDimension) return false;
    if (state.board[row * boardDimension + col] || pendingByCell.has(`${row}:${col}`) || placedIds.has(tileId)) return false;
    if (tile.wildcard) {
      setPendingWildcard({ tileId, row, col });
      setSelectedTileId(null);
      void Haptics.selectionAsync();
      return true;
    }
    return commitPlacement(tileId, row, col);
  }, [boardDimension, commitPlacement, isMyTurn, pendingByCell, placedIds, rackById, sending, state.board]);

  const chooseWildcardLetter = useCallback((letter: string) => {
    const pending = pendingWildcard;
    if (!pending) return;
    setPendingWildcard(null);
    commitPlacement(pending.tileId, pending.row, pending.col, letter);
  }, [commitPlacement, pendingWildcard]);

  const chooseCell = useCallback((row: number, col: number) => {
    if (!isMyTurn || sending || state.board[row * boardDimension + col]) return;
    const pending = pendingByCell.get(`${row}:${col}`);
    if (pending) {
      removePlacement(pending.tileId);
      return;
    }
    if (selectedTileId) placeTile(selectedTileId, row, col);
  }, [boardDimension, isMyTurn, pendingByCell, placeTile, removePlacement, selectedTileId, sending, state.board]);

  const setRackDrag = useCallback((next: RackDragState | null) => {
    dragStateRef.current = next;
    setDragState(next);
  }, []);

  const measureRackFrame = useCallback(() => {
    rackRef.current?.measureInWindow((x, y, width, height) => {
      rackFrame.current = { x, y, width, height };
    });
  }, []);

  const beginRackDrag = useCallback((tileId: string) => {
    const from = resolvedRackOrder.indexOf(tileId);
    if (from < 0) return;
    // The first drag can begin before the board's asynchronous window
    // measurement has completed. Refresh it while the finger is still down,
    // well before the drop needs to map screen coordinates to a cell.
    refreshBoardMeasurement.current?.();
    setRackDrag({ tileId, from, to: from });
    measureRackFrame();
  }, [measureRackFrame, resolvedRackOrder, setRackDrag]);

  const moveRackDrag = useCallback((tileId: string, targetIndex: number) => {
    const current = dragStateRef.current;
    if (!current || current.tileId !== tileId) return;
    const to = Math.max(0, Math.min(Math.max(0, state.rack.length - 1), targetIndex));
    if (to === current.to) return;
    setRackDrag({ ...current, to });
    const now = Date.now();
    if (now - lastRackHapticAt.current >= 55) {
      lastRackHapticAt.current = now;
      void Haptics.selectionAsync();
    }
  }, [setRackDrag, state.rack.length]);

  const commitRackDrag = useCallback((tileId: string, targetIndex: number): boolean => {
    const current = dragStateRef.current;
    const target = Math.max(0, Math.min(Math.max(0, state.rack.length - 1), targetIndex));
    const reordered = Boolean(current?.tileId === tileId && current.from !== target);
    if (reordered && current) {
      setRackOrder((order) => {
        const next = normalizeRackOrder(order, state.rack);
        const from = next.indexOf(tileId);
        if (from < 0) return next;
        next.splice(from, 1);
        next.splice(target, 0, tileId);
        return next;
      });
    }
    setRackDrag(null);
    return reordered;
  }, [setRackDrag, setRackOrder, state.rack]);

  const dropTile = useCallback((
    tile: WordDropTile,
    boardPageX: number,
    boardPageY: number,
    overRack: boolean,
    targetIndex: number,
  ): RackDropResult => {
    if (overRack) {
      return commitRackDrag(tile.id, targetIndex) ? { kind: "reordered" } : { kind: "cancelled" };
    }
    const cell = boardCoordinateMapper.current?.(boardPageX, boardPageY);
    if (cell && placeTile(tile.id, cell.row, cell.col)) {
      setRackDrag(null);
      // The wildcard remains mounted behind its picker until a letter is
      // chosen, so cancelling the picker cannot leave a hidden rack tile.
      return { kind: tile.wildcard ? "cancelled" : "board" };
    }
    setRackDrag(null);
    return { kind: "cancelled" };
  }, [commitRackDrag, placeTile, setRackDrag]);

  const cancelRackDrag = useCallback(() => setRackDrag(null), [setRackDrag]);

  function shuffleRack() {
    if (game.status !== "STARTED" || sending || placements.length > 0) return;
    const ids = [...resolvedRackOrder];
    for (let index = ids.length - 1; index > 0; index -= 1) {
      const target = Math.floor(Math.random() * (index + 1));
      [ids[index], ids[target]] = [ids[target], ids[index]];
    }
    setSelectedTileId(null);
    setRackOrder(ids);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  function recallTiles() {
    animateRackReturn(placements.map((placement) => placement.tileId));
    setPlacements([]);
    setSelectedTileId(null);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  function passTurn() {
    if (!isMyTurn || sending) return;
    Alert.alert("Pass turn?", "Two passes in a row finish the game.", [
      { text: "Cancel", style: "cancel" },
      { text: "Pass", onPress: () => onMove({ kind: "pass" }) },
    ]);
  }

  const myScore = state.scores[String(account.id)] ?? 0;
  const opponentScore = state.scores[String(game.opponent.id)] ?? 0;
  const lastPlay = state.lastPlay;
  const finishPendingDrag = useCallback(() => setLiftedPreviewTileId(null), []);
  const openBag = useCallback(() => setBagOpen(true), []);
  const headerPlayer = useMemo(() => ({
    user: account,
    label: "YOU",
    score: myScore,
    active: isMyTurn,
  }), [account, isMyTurn, myScore]);
  const headerOpponent = useMemo(() => ({
    user: game.opponent,
    label: game.opponent.displayName.toUpperCase(),
    score: opponentScore,
    active: !isMyTurn && game.status === "STARTED",
  }), [game.opponent, game.status, isMyTurn, opponentScore]);
  const bagAccessory = useMemo(() => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${state.bagCount} tiles left in the bag`}
      style={({ pressed }) => [styles.bagButton, pressed && styles.bagButtonPressed]}
      onPress={openBag}
    >
      <BagProgress count={state.bagCount} size={55} />
    </Pressable>
  ), [openBag, state.bagCount]);

  return (
    <View
      style={styles.root}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setContentSize((current) => current.width === width && current.height === height ? current : { width, height });
      }}
    >
      <TurnBasedGameHeader
        player={headerPlayer}
        opponent={headerOpponent}
        turnIndicator={turnIndicator}
        resultIndicator={resultIndicator}
        centerAccessory={bagAccessory}
      />

      <View style={styles.lastPlayArea}>
        {lastPlay ? (
          <Text style={styles.lastPlay} numberOfLines={1}>
            {lastPlay.passed
              ? `${lastPlay.playerId === account.id ? "You" : game.opponent.displayName} passed`
              : `${lastPlay.playerId === account.id ? "You" : game.opponent.displayName} played ${primaryWordDropWord(lastPlay.words)} for ${lastPlay.score} point${lastPlay.score === 1 ? "" : "s"}`}
          </Text>
        ) : <Text style={styles.lastPlayMuted}>Drop the first word across the centre</Text>}
      </View>

      {boardSize > 0 && (
        <BoardGrid
          boardRef={boardRef}
          board={state.board}
          bonusByCell={bonusByCell}
          rackById={rackById}
          pendingByCell={pendingByCell}
          validWordCells={validWordCells}
          previewScore={wordPreview?.valid ? wordPreview.score : null}
          liftedWordPreviews={liftedWordPreviews}
          boardSize={boardSize}
          boardDimension={boardDimension}
          cellSize={cellSize}
          onCellPress={chooseCell}
          onPendingDrop={dropPendingTile}
          onPendingDragStart={setLiftedPreviewTileId}
          onPendingDragFinish={finishPendingDrag}
          coordinateMapperRef={boardCoordinateMapper}
          measurementRef={refreshBoardMeasurement}
        />
      )}

      <View style={styles.flexSpace} />

      <View style={[styles.bottomDock, dragState && styles.bottomDockDragging]}>
        <Text style={styles.rackHint}>
          {!isMyTurn ? "Rearrange or shuffle while you wait" : placements.length ? "Recall your tiles or drop the word" : "Drag a tile onto the board or along the rack"}
        </Text>
        <View ref={rackRef} collapsable={false} onLayout={measureRackFrame} style={[styles.rack, { width: rackTouchableWidth, height: rackTileSize + 4 }]}>
          {state.rack.map((tile) => {
            const index = resolvedRackOrder.indexOf(tile.id);
            const isPlaced = placedIds.has(tile.id);
            let shift = 0;
            if (dragState && tile.id !== dragState.tileId) {
              if (dragState.from < dragState.to && index > dragState.from && index <= dragState.to) shift = -(rackTileSize + RACK_GAP);
              if (dragState.from > dragState.to && index >= dragState.to && index < dragState.from) shift = rackTileSize + RACK_GAP;
            }
            return index >= 0 && !isPlaced ? (
              <DraggableRackTile
                key={`rack-tile-${tile.id}`}
                tile={tile}
                enabled={game.status === "STARTED" && !sending && !returningIds.has(tile.id)}
                selected={selectedTileId === tile.id}
                size={rackTileSize}
                rackIndex={index}
                rackCount={resolvedRackOrder.length}
                slotX={RACK_EDGE_TOUCH_PADDING + index * (rackTileSize + RACK_GAP)}
                shift={shift}
                rackDragActive={dragState !== null}
                active={dragState?.tileId === tile.id}
                edgeHitSlopLeft={index === 0 ? RACK_EDGE_TOUCH_PADDING : RACK_GAP / 2}
                edgeHitSlopRight={index === resolvedRackOrder.length - 1 ? RACK_EDGE_TOUCH_PADDING : RACK_GAP / 2}
                returning={returningIds.has(tile.id)}
                calmReturn={calmReturningIds.has(tile.id)}
                onPress={chooseTile}
                onDragStart={beginRackDrag}
                onDragMove={moveRackDrag}
                onDrop={dropTile}
                onCancel={cancelRackDrag}
              />
            ) : null;
          })}
        </View>

        {game.status === "STARTED" && (
          <View style={styles.actions}>
            <Pressable
              accessibilityLabel={placements.length ? "Recall tiles" : "Shuffle rack"}
              disabled={sending || (placements.length > 0 && !isMyTurn)}
              style={[styles.toolButton, sending && styles.disabled]}
              onPress={placements.length ? recallTiles : shuffleRack}
            >
              <FontAwesome5 name={placements.length ? "undo" : "random"} size={19} color={colors.text} />
              <Text style={styles.toolLabel}>{placements.length ? "Recall" : "Shuffle"}</Text>
            </Pressable>
            <Pressable disabled={sending || !isMyTurn || placements.length > 0} style={[styles.toolButton, (!isMyTurn || placements.length > 0) && styles.disabled]} onPress={passTurn}>
              <FontAwesome5 name="step-forward" size={17} color={colors.text} />
              <Text style={styles.toolLabel}>Pass</Text>
            </Pressable>
            <Pressable
              accessibilityState={{ disabled: !canDropWord }}
              disabled={!canDropWord}
              style={[styles.playButton, !canDropWord && styles.playButtonWaiting]}
              onPress={() => onMove({ kind: "play", placements })}
            >
              <Text style={[styles.playText, !canDropWord && styles.playTextWaiting]}>
                {!isMyTurn ? "Their turn" : placements.length ? "Drop word" : "Place tiles"}
              </Text>
            </Pressable>
          </View>
        )}
      </View>

      <TileBagSheet
        visible={bagOpen}
        bagCount={state.bagCount}
        opponentRackCount={state.rackCounts[String(game.opponent.id)] ?? 0}
        letters={unseenLetters}
        onClose={() => setBagOpen(false)}
      />
      <WildcardLetterSheet
        visible={pendingWildcard !== null}
        onChoose={chooseWildcardLetter}
        onClose={() => setPendingWildcard(null)}
      />
    </View>
  );
}

function BagProgress({ count, size }: { count: number; size: number }) {
  const tileSize = size * 0.52;
  const tileRadius = Math.max(3, size * 0.055);

  return (
    <View style={[styles.tileStackRing, { width: size, height: size }]}>
      <View style={[styles.tileStackBack, { width: tileSize, height: tileSize, borderRadius: tileRadius, left: size * 0.19, top: size * 0.18 }]} />
      <View style={[styles.tileStackFront, { width: tileSize, height: tileSize, borderRadius: tileRadius, left: size * 0.29, top: size * 0.28 }]}>
        <Text allowFontScaling={false} style={[styles.tileStackCount, { fontSize: size * (count >= 100 ? 0.13 : 0.18) }]}>{count}</Text>
      </View>
    </View>
  );
}

function TileBagSheet({
  visible,
  bagCount,
  opponentRackCount,
  letters,
  onClose,
}: {
  visible: boolean;
  bagCount: number;
  opponentRackCount: number;
  letters: Array<{ letter: string; count: number }>;
  onClose: () => void;
}) {
  const unseenTotal = letters.reduce((total, item) => total + item.count, 0);
  const vowelCount = letters.reduce((total, item) => total + (VOWELS.has(item.letter) ? item.count : 0), 0);
  const wildcardCount = letters.find((item) => item.letter === WILDCARD_KEY)?.count ?? 0;
  const consonantCount = unseenTotal - vowelCount - wildcardCount;

  return (
    <BottomSheetModal visible={visible} title="Tiles left" onClose={onClose}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetContent}>
        <View style={styles.bagSummary}>
          <View style={styles.largeBag}><BagProgress count={bagCount} size={88} /></View>
          <View style={styles.bagSummaryCopy}>
            <Text style={styles.bagSummaryTitle}>{bagCount} tile{bagCount === 1 ? "" : "s"} in the bag</Text>
            <Text style={styles.bagSummarySub}>{opponentRackCount} in your opponent’s rack</Text>
          </View>
        </View>

        <Text style={styles.unseenTitle}>{unseenTotal} unseen tiles</Text>
        <View style={styles.letterGrid}>
          {letters.map(({ letter, count }) => (
            <View key={letter} style={styles.letterCountItem}>
              <View style={[styles.countTile, count === 0 && styles.countTileEmpty, letter === WILDCARD_KEY && styles.countWildcardTile]}>
                <Text style={styles.countLetter}>{letter}</Text>
              </View>
              <Text style={[styles.letterCount, count === 0 && styles.letterCountEmpty]}>{count}</Text>
            </View>
          ))}
        </View>

        <View style={styles.letterTotals}>
          <Text style={styles.letterTotal}><Text style={styles.letterTotalLabel}>Vowels </Text>{vowelCount}</Text>
          <Text style={styles.letterTotal}><Text style={styles.letterTotalLabel}>Consonants </Text>{consonantCount}</Text>
          <Text style={styles.letterTotal}><Text style={styles.letterTotalLabel}>Wildcards </Text>{wildcardCount}</Text>
        </View>
      </ScrollView>
    </BottomSheetModal>
  );
}

function WildcardLetterSheet({
  visible,
  onChoose,
  onClose,
}: {
  visible: boolean;
  onChoose: (letter: string) => void;
  onClose: () => void;
}) {
  return (
    <BottomSheetModal visible={visible} title="Choose a letter" onClose={onClose} compact>
      <View style={styles.wildcardContent}>
        <Text style={styles.wildcardHelp}>Your wildcard will stay worth 0 points.</Text>
        <View style={styles.wildcardGrid}>
          {LETTERS.map((letter) => (
            <Pressable
              key={letter}
              accessibilityRole="button"
              accessibilityLabel={`Use wildcard as ${letter}`}
              onPress={() => onChoose(letter)}
              style={({ pressed }) => [styles.wildcardChoice, pressed && styles.wildcardChoicePressed]}
            >
              <Text style={styles.wildcardChoiceText}>{letter}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </BottomSheetModal>
  );
}

function BottomSheetModal({
  visible,
  title,
  onClose,
  compact = false,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  compact?: boolean;
  children: ReactNode;
}) {
  const sheetY = useSharedValue(760);
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: sheetY.value }] }));

  useEffect(() => {
    if (!visible) return;
    sheetY.value = 760;
    sheetY.value = withTiming(0, { duration: 260, easing: Easing.out(Easing.cubic) });
  }, [sheetY, visible]);

  const closeSheet = useCallback(() => {
    sheetY.value = withTiming(760, { duration: 220, easing: Easing.in(Easing.cubic) }, (finished) => {
      if (finished) runOnJS(onClose)();
    });
  }, [onClose, sheetY]);

  const sheetDrag = Gesture.Pan()
    .onUpdate((event) => {
      sheetY.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      if (event.translationY > 90 || event.velocityY > 850) {
        sheetY.value = withTiming(760, { duration: 220, easing: Easing.in(Easing.cubic) }, (finished) => {
          if (finished) runOnJS(onClose)();
        });
      } else {
        sheetY.value = withTiming(0, { duration: 180, easing: Easing.out(Easing.cubic) });
      }
    });

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={closeSheet}>
      <View style={styles.modalRoot}>
        <Pressable accessibilityLabel={`Close ${title}`} style={StyleSheet.absoluteFill} onPress={closeSheet} />
        <Reanimated.View style={[styles.sheetFrame, compact && styles.sheetFrameCompact, sheetStyle]}>
          <View style={styles.sheetSurface}>
            <GestureDetector gesture={sheetDrag}>
              <Reanimated.View style={styles.sheetDragArea}>
                <View style={styles.sheetHandle} />
                <View style={styles.sheetHeader}>
                  <Text style={styles.sheetTitle}>{title}</Text>
                </View>
              </Reanimated.View>
            </GestureDetector>
            <Pressable accessibilityLabel={`Close ${title}`} hitSlop={8} style={styles.sheetClose} onPress={closeSheet}>
              <FontAwesome5 name="times" size={22} color={colors.text} />
            </Pressable>
            {children}
          </View>
        </Reanimated.View>
      </View>
    </Modal>
  );
}

function findWordScoreAnchor(validWordCells: Set<string>, boardDimension: number) {
  if (validWordCells.size === 0) return null;
  const cells = [...validWordCells].map((key) => {
    const [row, col] = key.split(":").map(Number);
    return { key, row, col };
  });
  const cornerCandidates: Array<{ row: number; col: number; corner: WordScoreCorner; edgeAxes: number; priority: number }> = [];
  const edgeAxes = (vertexRow: number, vertexCol: number) => (
    Number(vertexRow <= 0 || vertexRow >= boardDimension)
    + Number(vertexCol <= 0 || vertexCol >= boardDimension)
  );
  cells.forEach(({ row, col }) => {
    if (!validWordCells.has(`${row - 1}:${col}`) && !validWordCells.has(`${row}:${col + 1}`)) {
      cornerCandidates.push({ row, col, corner: "topRight", edgeAxes: edgeAxes(row, col + 1), priority: 0 });
    }
    if (!validWordCells.has(`${row - 1}:${col}`) && !validWordCells.has(`${row}:${col - 1}`)) {
      cornerCandidates.push({ row, col, corner: "topLeft", edgeAxes: edgeAxes(row, col), priority: 1 });
    }
    if (!validWordCells.has(`${row + 1}:${col}`) && !validWordCells.has(`${row}:${col + 1}`)) {
      cornerCandidates.push({ row, col, corner: "bottomRight", edgeAxes: edgeAxes(row + 1, col + 1), priority: 2 });
    }
    if (!validWordCells.has(`${row + 1}:${col}`) && !validWordCells.has(`${row}:${col - 1}`)) {
      cornerCandidates.push({ row, col, corner: "bottomLeft", edgeAxes: edgeAxes(row + 1, col), priority: 3 });
    }
  });
  cornerCandidates.sort((left, right) => (
    left.edgeAxes - right.edgeAxes
      || left.priority - right.priority
      || left.row - right.row
      || right.col - left.col
  ));
  const anchor = cornerCandidates[0];
  if (!anchor) return null;
  return {
    row: anchor.row,
    col: anchor.col,
    corner: anchor.corner,
    inset: anchor.edgeAxes > 0,
  };
}

const StaticBoardCells = memo(function StaticBoardCells({
  board,
  bonusByCell,
  boardDimension,
  cellSize,
}: {
  board: Array<WordDropBoardTile | null>;
  bonusByCell: Map<string, WordDropBonusType>;
  boardDimension: number;
  cellSize: number;
}) {
  return (
    <>
      {Array.from({ length: boardDimension }, (_, row) => (
        <View key={row} style={[styles.boardRow, { gap: BOARD_GAP * BOARD_RENDER_SCALE }]}>
          {Array.from({ length: boardDimension }, (_unused, col) => {
            const tile = board[row * boardDimension + col];
            const bonus = bonusByCell.get(`${row}:${col}`);
            return (
              <View
                key={col}
                pointerEvents="none"
                style={[styles.cell, bonus && bonusStyle(bonus)]}
              >
                {bonus && !tile ? <BonusLabel type={bonus} size={cellSize} /> : null}
              </View>
            );
          })}
        </View>
      ))}
    </>
  );
});

const BoardGrid = memo(function BoardGrid({
  boardRef,
  board,
  bonusByCell,
  rackById,
  pendingByCell,
  validWordCells,
  previewScore,
  liftedWordPreviews,
  boardSize,
  boardDimension,
  cellSize,
  onCellPress,
  onPendingDrop,
  onPendingDragStart,
  onPendingDragFinish,
  coordinateMapperRef,
  measurementRef,
}: {
  boardRef: RefObject<View | null>;
  board: Array<WordDropBoardTile | null>;
  bonusByCell: Map<string, WordDropBonusType>;
  rackById: Map<string, WordDropTile>;
  pendingByCell: Map<string, WordDropPlacement>;
  validWordCells: Set<string>;
  previewScore: number | null;
  liftedWordPreviews: LiftedWordPreview[];
  boardSize: number;
  boardDimension: number;
  cellSize: number;
  onCellPress: (row: number, col: number) => void;
  onPendingDrop: (tileId: string, pageX: number, pageY: number) => void;
  onPendingDragStart: (tileId: string) => void;
  onPendingDragFinish: () => void;
  coordinateMapperRef: MutableRefObject<((pageX: number, pageY: number) => { row: number; col: number } | null) | null>;
  measurementRef: MutableRefObject<(() => void) | null>;
}) {
  const stageRef = useAnimatedRef<View>();
  const pinchGestureRef = useRef<GestureType | undefined>(undefined);
  const boardTapGestureRef = useRef<GestureType | undefined>(undefined);
  const pendingFinishTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDragSession = useRef(0);
  const onCellPressRef = useRef(onCellPress);
  onCellPressRef.current = onCellPress;
  const handleCellPress = useCallback((row: number, col: number) => {
    onCellPressRef.current(row, col);
  }, []);
  const [retainedDragVariant, setRetainedDragVariant] = useState<TileSurfaceVariant | null>(null);
  const [retainedDragCell, setRetainedDragCell] = useState<OccupiedBoardCell | null>(null);
  const scoreAnchor = useMemo(
    () => previewScore === null ? null : findWordScoreAnchor(validWordCells, boardDimension),
    [boardDimension, previewScore, validWordCells],
  );
  const zoom = useSharedValue(1);
  const zoomStart = useSharedValue(1);
  const pinchStartX = useSharedValue(0);
  const pinchStartY = useSharedValue(0);
  const pinchStartFocalX = useSharedValue(0);
  const pinchStartFocalY = useSharedValue(0);
  const offsetX = useSharedValue(0);
  const offsetY = useSharedValue(0);
  const panStartX = useSharedValue(0);
  const panStartY = useSharedValue(0);
  const stagePageX = useSharedValue(0);
  const stagePageY = useSharedValue(0);
  const pendingOverlayX = useSharedValue(0);
  const pendingOverlayY = useSharedValue(0);
  const pendingDragActive = useSharedValue(0);
  const pendingDragGeneration = useSharedValue(0);
  const draggedRow = useSharedValue(-1);
  const draggedCol = useSharedValue(-1);
  const draggedTileId = useSharedValue("");
  const wordPreviewDraggedTileId = useSharedValue("");
  const geometryCache = useRef(new Map<string, string>());
  const renderedBoardSize = boardSize * BOARD_RENDER_SCALE;
  const renderedCellSize = cellSize * BOARD_RENDER_SCALE;
  const renderedGap = BOARD_GAP * BOARD_RENDER_SCALE;
  const measureStage = useCallback(() => {
    stageRef.current?.measureInWindow((x, y) => {
      stagePageX.value = x;
      stagePageY.value = y;
    });
  }, [stagePageX, stagePageY, stageRef]);
  const pathForCells = useCallback((cells: Set<string>) => {
    const key = `${boardDimension}:${renderedBoardSize.toFixed(3)}:${renderedCellSize.toFixed(3)}:${[...cells].sort().join("|")}`;
    const cached = geometryCache.current.get(key);
    if (cached !== undefined) return cached;
    const path = buildWordBorderPath(cells, renderedBoardSize, renderedCellSize, {
      boardDimension,
      gap: renderedGap,
      cornerRadius: 2 * BOARD_RENDER_SCALE,
    });
    geometryCache.current.set(key, path);
    if (geometryCache.current.size > 160) {
      const oldest = geometryCache.current.keys().next().value;
      if (oldest !== undefined) geometryCache.current.delete(oldest);
    }
    return path;
  }, [boardDimension, renderedBoardSize, renderedCellSize, renderedGap]);
  const validWordBorderPath = useMemo(
    () => pathForCells(validWordCells),
    [pathForCells, validWordCells],
  );
  const liftedWordVisuals = useMemo(() => liftedWordPreviews.map((preview) => {
    const cells = new Set(preview.cells);
    return {
      ...preview,
      borderPath: pathForCells(cells),
      scoreAnchor: preview.score === null ? null : findWordScoreAnchor(cells, boardDimension),
    };
  }), [boardDimension, liftedWordPreviews, pathForCells]);
  const liftedScoreVisuals = useMemo<WordScoreVisual[]>(() => liftedWordVisuals.flatMap((preview) => (
    preview.score !== null && preview.scoreAnchor
      ? [{
        tileId: preview.tileId,
        score: preview.score,
        row: preview.scoreAnchor.row,
        col: preview.scoreAnchor.col,
        corner: preview.scoreAnchor.corner,
        inset: preview.scoreAnchor.inset,
      }]
      : []
  )), [liftedWordVisuals]);
  const occupiedBoardCells = useMemo(() => {
    const cells: OccupiedBoardCell[] = [];
    const occupiedKeys = new Set<string>();
    const pendingTileIds = new Set<string>();
    board.forEach((tile, index) => {
      if (!tile) return;
      const row = Math.floor(index / boardDimension);
      const col = index % boardDimension;
      const key = `${row}:${col}`;
      occupiedKeys.add(key);
      cells.push({ key, row, col, tile, pending: false });
    });
    pendingByCell.forEach((placement, key) => {
      const tile = rackById.get(placement.tileId);
      if (!tile || occupiedKeys.has(key) || pendingTileIds.has(tile.id)) return;
      const [row, col] = key.split(":").map(Number);
      occupiedKeys.add(key);
      pendingTileIds.add(tile.id);
      cells.push({ key, row, col, tile: tileForPlacement(tile, placement), pending: true });
    });
    return cells;
  }, [board, boardDimension, pendingByCell, rackById]);
  const occupiedCellKeys = useMemo(
    () => new Set(occupiedBoardCells.map((cell) => cell.key)),
    [occupiedBoardCells],
  );
  const tileSurfaceVariants = useMemo(() => {
    const pendingKeys = new Set(occupiedBoardCells.filter((cell) => cell.pending).map((cell) => cell.key));
    const makeVariant = (removedKey: string | null): TileSurfaceVariant => {
      const occupied = new Set([...occupiedCellKeys].filter((key) => key !== removedKey));
      const pending = new Set([...pendingKeys].filter((key) => key !== removedKey));
      const [removedRow, removedCol] = removedKey ? removedKey.split(":").map(Number) : [null, null];
      return {
        key: removedKey ?? "all",
        removedRow,
        removedCol,
        occupiedPath: pathForCells(occupied),
        pendingPath: pathForCells(pending),
      };
    };
    return [makeVariant(null), ...[...pendingKeys].map((key) => makeVariant(key))];
  }, [occupiedBoardCells, occupiedCellKeys, pathForCells]);
  const floatingOverlayCells = useMemo(() => {
    const cells = occupiedBoardCells.filter((cell) => cell.pending);
    if (retainedDragCell && !cells.some((cell) => cell.tile.id === retainedDragCell.tile.id)) cells.push(retainedDragCell);
    return cells;
  }, [occupiedBoardCells, retainedDragCell]);
  const boardLayoutStyle = useAnimatedStyle(() => {
    return {
      width: renderedBoardSize,
      height: renderedBoardSize,
      left: (boardSize - renderedBoardSize) / 2 + offsetX.value,
      top: (boardSize - renderedBoardSize) / 2 + offsetY.value,
      gap: renderedGap,
      transform: [{ scale: zoom.value / BOARD_RENDER_SCALE }],
    };
  }, [boardSize, renderedBoardSize, renderedGap]);
  const boardStageDragStyle = useAnimatedStyle(() => ({
    zIndex: pendingDragActive.value ? 1000 : 1,
    elevation: pendingDragActive.value ? 100 : 0,
  }));
  const pinch = Gesture.Pinch()
    .withRef(pinchGestureRef)
    .onStart((event) => {
      zoomStart.value = zoom.value;
      pinchStartX.value = offsetX.value;
      pinchStartY.value = offsetY.value;
      pinchStartFocalX.value = event.focalX - boardSize / 2;
      pinchStartFocalY.value = event.focalY - boardSize / 2;
    })
    .onUpdate((event) => {
      const nextZoom = Math.max(1, Math.min(BOARD_MAX_ZOOM, zoomStart.value * event.scale));
      const ratio = nextZoom / zoomStart.value;
      const focusX = event.focalX - boardSize / 2;
      const focusY = event.focalY - boardSize / 2;
      const limit = (boardSize * (nextZoom - 1)) / 2;
      zoom.value = nextZoom;
      offsetX.value = Math.max(-limit, Math.min(limit, focusX - ratio * (pinchStartFocalX.value - pinchStartX.value)));
      offsetY.value = Math.max(-limit, Math.min(limit, focusY - ratio * (pinchStartFocalY.value - pinchStartY.value)));
    });
  const pan = Gesture.Pan()
    .maxPointers(1)
    .minDistance(7)
    .onStart(() => {
      panStartX.value = offsetX.value;
      panStartY.value = offsetY.value;
    })
    .onUpdate((event) => {
      const limit = (boardSize * (zoom.value - 1)) / 2;
      offsetX.value = Math.max(-limit, Math.min(limit, panStartX.value + event.translationX));
      offsetY.value = Math.max(-limit, Math.min(limit, panStartY.value + event.translationY));
    });
  const tap = Gesture.Tap()
    .withRef(boardTapGestureRef)
    .maxDistance(6)
    .onEnd((event, success) => {
      if (!success) return;
      const localX = ((event.x - boardSize / 2 - offsetX.value) / zoom.value) + boardSize / 2;
      const localY = ((event.y - boardSize / 2 - offsetY.value) / zoom.value) + boardSize / 2;
      const stride = cellSize + BOARD_GAP;
      const col = Math.floor(localX / stride);
      const row = Math.floor(localY / stride);
      if (row >= 0 && row < boardDimension && col >= 0 && col < boardDimension) {
        runOnJS(handleCellPress)(row, col);
      }
    });
  const boardGesture = Gesture.Simultaneous(pinch, pan, tap);
  useEffect(() => () => {
    if (pendingFinishTimer.current) clearTimeout(pendingFinishTimer.current);
    pendingDragActive.value = 0;
    draggedRow.value = -1;
    draggedCol.value = -1;
    draggedTileId.value = "";
    wordPreviewDraggedTileId.value = "";
  }, [draggedCol, draggedRow, draggedTileId, pendingDragActive, wordPreviewDraggedTileId]);

  function beginPendingDrag(cell: OccupiedBoardCell) {
    pendingDragSession.current += 1;
    if (pendingFinishTimer.current) {
      clearTimeout(pendingFinishTimer.current);
      pendingFinishTimer.current = null;
    }
    setRetainedDragVariant(
      tileSurfaceVariants.find((variant) => variant.removedRow === cell.row && variant.removedCol === cell.col) ?? null,
    );
    setRetainedDragCell(cell);
    onPendingDragStart(cell.tile.id);
  }

  function finishPendingDrag() {
    if (pendingFinishTimer.current) clearTimeout(pendingFinishTimer.current);
    // Keep the floating tile briefly for a seamless React handoff, but switch
    // the word outline and score to the committed placement immediately.
    wordPreviewDraggedTileId.value = "";
    onPendingDragFinish();
    const session = pendingDragSession.current;
    const generation = pendingDragGeneration.value;
    const timer = setTimeout(() => {
      if (pendingDragSession.current !== session
        || pendingDragGeneration.value !== generation
        || pendingFinishTimer.current !== timer) return;
      pendingDragActive.value = 0;
      draggedRow.value = -1;
      draggedCol.value = -1;
      draggedTileId.value = "";
      pendingFinishTimer.current = null;
    }, 80);
    pendingFinishTimer.current = timer;
  }

  measurementRef.current = measureStage;

  useEffect(() => {
    // Reanimated refs may not be populated during the very first onLayout.
    // Retry for the first few frames so an untouched/empty board is fully
    // interactive before the player starts their first drag or pinch.
    let frame: number | null = null;
    let remainingAttempts = 3;
    const refresh = () => {
      measureStage();
      remainingAttempts -= 1;
      if (remainingAttempts > 0) frame = requestAnimationFrame(refresh);
    };
    frame = requestAnimationFrame(refresh);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      if (measurementRef.current === measureStage) measurementRef.current = null;
    };
  }, [measurementRef, measureStage]);

  coordinateMapperRef.current = (pageX: number, pageY: number) => {
    const screenX = pageX - stagePageX.value;
    const screenY = pageY - stagePageY.value;
    const localX = ((screenX - boardSize / 2 - offsetX.value) / zoom.value) + boardSize / 2;
    const localY = ((screenY - boardSize / 2 - offsetY.value) / zoom.value) + boardSize / 2;
    const stride = cellSize + BOARD_GAP;
    const col = Math.floor(localX / stride);
    const row = Math.floor(localY / stride);
    if (row < 0 || row >= boardDimension || col < 0 || col >= boardDimension) return null;

    // A zoomed edge cell can still be partly visible even when the dragged
    // tile's centre lands just beyond the clipped viewport. Accept that cell
    // if its rendered rectangle intersects the viewport; only fully hidden
    // cells should be unavailable as drop targets.
    const renderedBoardOrigin = (boardSize - boardSize * zoom.value) / 2;
    const cellLeft = renderedBoardOrigin + offsetX.value + col * stride * zoom.value;
    const cellTop = renderedBoardOrigin + offsetY.value + row * stride * zoom.value;
    const cellRight = cellLeft + cellSize * zoom.value;
    const cellBottom = cellTop + cellSize * zoom.value;
    const cellIsVisible = cellRight > 0
      && cellLeft < boardSize
      && cellBottom > 0
      && cellTop < boardSize;
    if (!cellIsVisible) return null;
    return { row, col };
  };

  return (
    <Reanimated.View
      ref={stageRef}
      collapsable={false}
      onLayout={measureStage}
      style={[styles.boardStage, boardStageDragStyle, { width: boardSize, height: boardSize }]}
    >
      <View style={styles.boardViewport}>
        <GestureDetector gesture={boardGesture}>
          <Reanimated.View collapsable={false} style={styles.boardGestureSurface}>
            <Reanimated.View ref={boardRef} collapsable={false} style={[styles.board, boardLayoutStyle]}>
              <StaticBoardCells
                board={board}
                bonusByCell={bonusByCell}
                boardDimension={boardDimension}
                cellSize={renderedCellSize}
              />
              <TileSurfaceLayer
                variants={tileSurfaceVariants}
                retainedDragVariant={retainedDragVariant}
                boardSize={renderedBoardSize}
                boardDimension={boardDimension}
                cellSize={renderedCellSize}
                gap={renderedGap}
                bonusByCell={bonusByCell}
                draggedRow={draggedRow}
                draggedCol={draggedCol}
              />
              <View pointerEvents="box-none" style={styles.tileContentLayer}>
                {occupiedBoardCells.map((cell) => {
                  const connections: TileConnections = {
                    top: occupiedCellKeys.has(`${cell.row - 1}:${cell.col}`),
                    right: occupiedCellKeys.has(`${cell.row}:${cell.col + 1}`),
                    bottom: occupiedCellKeys.has(`${cell.row + 1}:${cell.col}`),
                    left: occupiedCellKeys.has(`${cell.row}:${cell.col - 1}`),
                  };
                  return (
                    <PositionedBoardTile
                      key={cell.key}
                      cell={cell}
                      size={renderedCellSize}
                      displaySize={cellSize}
                      gap={renderedGap}
                      zoom={zoom}
                      connections={connections}
                      outlined={validWordCells.has(cell.key)}
                      draggedRow={draggedRow}
                      draggedCol={draggedCol}
                      draggedTileId={draggedTileId}
                      wordPreviewDraggedTileId={wordPreviewDraggedTileId}
                      stageRef={stageRef}
                      stagePageX={stagePageX}
                      stagePageY={stagePageY}
                      overlayX={pendingOverlayX}
                      overlayY={pendingOverlayY}
                      previewDragActive={pendingDragActive}
                      pendingDragGeneration={pendingDragGeneration}
                      pinchGestureRef={pinchGestureRef}
                      boardTapGestureRef={boardTapGestureRef}
                      onDragStart={() => beginPendingDrag(cell)}
                      onDragFinish={finishPendingDrag}
                      onDrop={onPendingDrop}
                    />
                  );
                })}
              </View>
              {validWordBorderPath || liftedWordVisuals.some((preview) => preview.borderPath) ? (
                <Reanimated.View pointerEvents="none" collapsable={false} style={styles.wordOutlineLayer}>
                  <Svg pointerEvents="none" style={styles.wordOutlineSvg} viewBox={`0 0 ${renderedBoardSize} ${renderedBoardSize}`}>
                    <AuthoritativeWordBorderPath
                      normalPath={validWordBorderPath}
                      liftedPaths={liftedWordVisuals.map((preview) => ({ tileId: preview.tileId, path: preview.borderPath }))}
                      draggedTileId={wordPreviewDraggedTileId}
                      zoom={zoom}
                    />
                  </Svg>
                </Reanimated.View>
              ) : null}
              <AuthoritativeWordScore
                normalScore={previewScore}
                normalAnchor={scoreAnchor}
                liftedScores={liftedScoreVisuals}
                draggedTileId={wordPreviewDraggedTileId}
                boardSize={renderedBoardSize}
                cellSize={renderedCellSize}
                gap={renderedGap}
                zoom={zoom}
              />
            </Reanimated.View>
          </Reanimated.View>
        </GestureDetector>
      </View>
      {floatingOverlayCells.map((cell) => (
        <FloatingTileOverlay
          key={`floating:${cell.tile.id}`}
          tile={cell.tile}
          row={cell.row}
          col={cell.col}
          cellSize={cellSize}
          zoom={zoom}
          overlayX={pendingOverlayX}
          overlayY={pendingOverlayY}
          draggedRow={draggedRow}
          draggedCol={draggedCol}
          draggedTileId={draggedTileId}
          previewDragActive={pendingDragActive}
        />
      ))}
    </Reanimated.View>
  );
});

function TileSurfaceLayer({
  variants,
  retainedDragVariant,
  boardSize,
  boardDimension,
  cellSize,
  gap,
  bonusByCell,
  draggedRow,
  draggedCol,
}: {
  variants: TileSurfaceVariant[];
  retainedDragVariant: TileSurfaceVariant | null;
  boardSize: number;
  boardDimension: number;
  cellSize: number;
  gap: number;
  bonusByCell: Map<string, WordDropBonusType>;
  draggedRow: SharedValue<number>;
  draggedCol: SharedValue<number>;
}) {
  const normal = variants[0];
  const alternates = variants.slice(1);
  if (retainedDragVariant && !alternates.some((variant) => variant.key === retainedDragVariant.key)) {
    alternates.push(retainedDragVariant);
  }
  return (
    <View pointerEvents="none" style={styles.tileSurfaceLayer}>
      <Svg pointerEvents="none" style={styles.tileSurfaceAlternateSvg} viewBox={`0 0 ${boardSize} ${boardSize}`}>
        <AuthoritativeTileSurfacePaths
          normal={normal}
          alternates={alternates}
          draggedRow={draggedRow}
          draggedCol={draggedCol}
        />
      </Svg>
      {alternates.map((variant) => (
        <DraggedCellRestore
          key={`restore:${variant.key}`}
          variant={variant}
          boardSize={boardSize}
          boardDimension={boardDimension}
          cellSize={cellSize}
          gap={gap}
          bonus={bonusByCell.get(`${variant.removedRow}:${variant.removedCol}`)}
          draggedRow={draggedRow}
          draggedCol={draggedCol}
        />
      ))}
    </View>
  );
}

function AuthoritativeTileSurfacePaths({
  normal,
  alternates,
  draggedRow,
  draggedCol,
}: {
  normal: TileSurfaceVariant;
  alternates: TileSurfaceVariant[];
  draggedRow: SharedValue<number>;
  draggedCol: SharedValue<number>;
}) {
  const occupiedProps = useAnimatedProps(() => {
    const selected = draggedRow.value >= 0 && draggedCol.value >= 0
      ? (alternates.find((variant) => (
        variant.removedRow === draggedRow.value && variant.removedCol === draggedCol.value
      )) ?? normal)
      : normal;
    return { d: selected.occupiedPath };
  }, [alternates, normal]);
  const pendingProps = useAnimatedProps(() => {
    const selected = draggedRow.value >= 0 && draggedCol.value >= 0
      ? (alternates.find((variant) => (
        variant.removedRow === draggedRow.value && variant.removedCol === draggedCol.value
      )) ?? normal)
      : normal;
    return { d: selected.pendingPath };
  }, [alternates, normal]);
  return (
    <>
      <AnimatedPath animatedProps={occupiedProps} d={normal.occupiedPath} fill="#B7E5BA" fillRule="evenodd" />
      <AnimatedPath animatedProps={pendingProps} d={normal.pendingPath} fill="#C5EEC8" fillRule="evenodd" />
    </>
  );
}

function DraggedCellRestore({
  variant,
  boardSize,
  boardDimension,
  cellSize,
  gap,
  bonus,
  draggedRow,
  draggedCol,
}: {
  variant: TileSurfaceVariant;
  boardSize: number;
  boardDimension: number;
  cellSize: number;
  gap: number;
  bonus?: WordDropBonusType;
  draggedRow: SharedValue<number>;
  draggedCol: SharedValue<number>;
}) {
  const row = variant.removedRow ?? 0;
  const col = variant.removedCol ?? 0;
  const stride = cellSize + gap;
  const left = col === 0 ? 0 : col * stride - gap / 2;
  const top = row === 0 ? 0 : row * stride - gap / 2;
  const right = col === boardDimension - 1 ? boardSize : (col + 1) * stride - gap / 2;
  const bottom = row === boardDimension - 1 ? boardSize : (row + 1) * stride - gap / 2;
  const cellLeft = col * stride;
  const cellTop = row * stride;
  const visibilityStyle = useAnimatedStyle(() => ({
    opacity: draggedRow.value === variant.removedRow && draggedCol.value === variant.removedCol ? 1 : 0,
  }));
  return (
    <Reanimated.View style={[styles.draggedCellRestoreGap, {
      left,
      top,
      width: right - left,
      height: bottom - top,
    }, visibilityStyle]}>
      <View style={[styles.draggedCellRestoreCell, {
        backgroundColor: bonusBackgroundColor(bonus),
        left: cellLeft - left,
        top: cellTop - top,
        width: cellSize,
        height: cellSize,
      }]}>
        {bonus ? <BonusLabel type={bonus} size={cellSize} /> : null}
      </View>
    </Reanimated.View>
  );
}

function PositionedBoardTile({
  cell,
  size,
  displaySize,
  gap,
  zoom,
  connections,
  outlined,
  draggedRow,
  draggedCol,
  draggedTileId,
  wordPreviewDraggedTileId,
  stageRef,
  stagePageX,
  stagePageY,
  overlayX,
  overlayY,
  previewDragActive,
  pendingDragGeneration,
  pinchGestureRef,
  boardTapGestureRef,
  onDragStart,
  onDragFinish,
  onDrop,
}: {
  cell: OccupiedBoardCell;
  size: number;
  displaySize: number;
  gap: number;
  zoom: SharedValue<number>;
  connections: TileConnections;
  outlined: boolean;
  draggedRow: SharedValue<number>;
  draggedCol: SharedValue<number>;
  draggedTileId: SharedValue<string>;
  wordPreviewDraggedTileId: SharedValue<string>;
  stageRef: AnimatedRef<View>;
  stagePageX: SharedValue<number>;
  stagePageY: SharedValue<number>;
  overlayX: SharedValue<number>;
  overlayY: SharedValue<number>;
  previewDragActive: SharedValue<number>;
  pendingDragGeneration: SharedValue<number>;
  pinchGestureRef: MutableRefObject<GestureType | undefined>;
  boardTapGestureRef: MutableRefObject<GestureType | undefined>;
  onDragStart: () => void;
  onDragFinish: () => void;
  onDrop: (tileId: string, pageX: number, pageY: number) => void;
}) {
  const stride = size + gap;
  return (
    <View pointerEvents={cell.pending ? "auto" : "none"} style={[styles.positionedBoardTile, {
      left: cell.col * stride,
      top: cell.row * stride,
      width: size,
      height: size,
    }]}>
      {cell.pending ? (
        <DraggableBoardTile
          tile={cell.tile}
          size={size}
          displaySize={displaySize}
          gap={gap}
          zoom={zoom}
          row={cell.row}
          col={cell.col}
          connections={connections}
          outlined={outlined}
          draggedRow={draggedRow}
          draggedCol={draggedCol}
          draggedTileId={draggedTileId}
          wordPreviewDraggedTileId={wordPreviewDraggedTileId}
          stageRef={stageRef}
          stagePageX={stagePageX}
          stagePageY={stagePageY}
          overlayX={overlayX}
          overlayY={overlayY}
          previewDragActive={previewDragActive}
          pendingDragGeneration={pendingDragGeneration}
          pinchGestureRef={pinchGestureRef}
          boardTapGestureRef={boardTapGestureRef}
          surface={false}
          onDragStart={onDragStart}
          onDragFinish={onDragFinish}
          onDrop={onDrop}
        />
      ) : (
        <BoardTile tile={cell.tile} size={size} gap={gap} zoom={zoom} surface={false} />
      )}
    </View>
  );
}

const FloatingTileOverlay = memo(function FloatingTileOverlay({
  tile,
  row,
  col,
  cellSize,
  zoom,
  overlayX,
  overlayY,
  draggedRow,
  draggedCol,
  draggedTileId,
  previewDragActive,
}: {
  tile: WordDropTile;
  row: number;
  col: number;
  cellSize: number;
  zoom: SharedValue<number>;
  overlayX: SharedValue<number>;
  overlayY: SharedValue<number>;
  draggedRow: SharedValue<number>;
  draggedCol: SharedValue<number>;
  draggedTileId: SharedValue<string>;
  previewDragActive: SharedValue<number>;
}) {
  const overlayStyle = useAnimatedStyle(() => ({
    left: overlayX.value,
    top: overlayY.value,
    width: cellSize * zoom.value,
    height: cellSize * zoom.value,
    opacity: previewDragActive.value && draggedTileId.value === tile.id ? 1 : 0,
  }));

  return (
    <Reanimated.View pointerEvents="none" style={[styles.pendingTileOverlay, overlayStyle]}>
      <BoardTile tile={tile} size={cellSize} zoom={zoom} pending scaleWithZoom />
    </Reanimated.View>
  );
});

function AuthoritativeWordBorderPath({
  normalPath,
  liftedPaths,
  draggedTileId,
  zoom,
}: {
  normalPath: string;
  liftedPaths: Array<{ tileId: string; path: string }>;
  draggedTileId: SharedValue<string>;
  zoom: SharedValue<number>;
}) {
  const animatedProps = useAnimatedProps(() => {
    const screenScale = 1 + (zoom.value - 1) * 0.35;
    return {
      d: draggedTileId.value
        ? (liftedPaths.find((preview) => preview.tileId === draggedTileId.value)?.path ?? normalPath)
        : normalPath,
      strokeWidth: 2.4 * screenScale * BOARD_RENDER_SCALE / zoom.value,
    };
  }, [liftedPaths, normalPath]);
  return (
    <AnimatedPath
      animatedProps={animatedProps}
      d={normalPath}
      fill="none"
      stroke="#4A98F0"
      strokeWidth={2.4 * BOARD_RENDER_SCALE}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

function AuthoritativeWordScore({
  normalScore,
  normalAnchor,
  liftedScores,
  draggedTileId,
  boardSize,
  cellSize,
  gap,
  zoom,
}: {
  normalScore: number | null;
  normalAnchor: ReturnType<typeof findWordScoreAnchor>;
  liftedScores: WordScoreVisual[];
  draggedTileId: SharedValue<string>;
  boardSize: number;
  cellSize: number;
  gap: number;
  zoom: SharedValue<number>;
}) {
  const stride = cellSize + gap;
  const layerStyle = useAnimatedStyle(() => {
    const selected = draggedTileId.value
      ? liftedScores.find((preview) => preview.tileId === draggedTileId.value)
      : (normalScore !== null && normalAnchor ? {
        tileId: "",
        score: normalScore,
        row: normalAnchor.row,
        col: normalAnchor.col,
        corner: normalAnchor.corner,
        inset: normalAnchor.inset,
      } : undefined);
    const screenScale = 1 + (zoom.value - 1) * 0.35;
    const renderedSize = 13 * screenScale * BOARD_RENDER_SCALE / zoom.value;
    const logicalRadius = renderedSize / 2;
    const edgePadding = 1.5 * screenScale * BOARD_RENDER_SCALE / zoom.value;
    const corner = selected?.corner ?? "topRight";
    const onTop = corner === "topRight" || corner === "topLeft";
    const onRight = corner === "topRight" || corner === "bottomRight";
    const rawX = (selected?.col ?? 0) * stride + (onRight ? cellSize + gap / 2 : -gap / 2);
    const rawY = (selected?.row ?? 0) * stride + (onTop ? -gap / 2 : cellSize + gap / 2);
    const centerX = Math.max(logicalRadius + edgePadding, Math.min(boardSize - logicalRadius - edgePadding, rawX));
    const centerY = Math.max(logicalRadius + edgePadding, Math.min(boardSize - logicalRadius - edgePadding, rawY));
    return {
      opacity: selected ? 1 : 0,
      left: centerX - renderedSize / 2,
      top: centerY - renderedSize / 2,
      width: renderedSize,
      height: renderedSize,
    };
  }, [boardSize, cellSize, gap, liftedScores, normalAnchor, normalScore, stride]);
  const badgeStyle = useAnimatedStyle(() => {
    const scale = (1 + (zoom.value - 1) * 0.35) * BOARD_RENDER_SCALE / zoom.value;
    return {
      top: 0,
      left: 0,
      width: 13 * scale,
      height: 13 * scale,
      borderRadius: 6.5 * scale,
    };
  });
  const badgeTextStyle = useAnimatedStyle(() => {
    const scale = (1 + (zoom.value - 1) * 0.35) * BOARD_RENDER_SCALE / zoom.value;
    return {
      fontSize: 8 * scale,
      lineHeight: 10 * scale,
    };
  });
  const animatedTextProps = useAnimatedProps(() => {
    const selected = draggedTileId.value
      ? liftedScores.find((preview) => preview.tileId === draggedTileId.value)
      : (normalScore !== null && normalAnchor ? { score: normalScore } : undefined);
    const text = selected ? String(selected.score) : "";
    return { text, defaultValue: text } as never;
  }, [liftedScores, normalAnchor, normalScore]);
  return (
    <Reanimated.View
      pointerEvents="none"
      style={[styles.wordScoreLayer, layerStyle]}
    >
      <Reanimated.View style={[styles.wordOutlineScore, badgeStyle]}>
        <AnimatedTextInput
          editable={false}
          caretHidden
          contextMenuHidden
          allowFontScaling={false}
          defaultValue={normalScore === null ? "" : String(normalScore)}
          animatedProps={animatedTextProps}
          style={[styles.wordOutlineScoreText, styles.wordOutlineScoreInput, badgeTextStyle]}
        />
      </Reanimated.View>
    </Reanimated.View>
  );
}

const DraggableRackTile = memo(function DraggableRackTile({
  tile,
  enabled,
  selected,
  size,
  rackIndex,
  rackCount,
  slotX,
  shift,
  rackDragActive,
  active,
  edgeHitSlopLeft,
  edgeHitSlopRight,
  returning,
  calmReturn,
  onPress,
  onDragStart,
  onDragMove,
  onDrop,
  onCancel,
}: {
  tile: WordDropTile;
  enabled: boolean;
  selected: boolean;
  size: number;
  rackIndex: number;
  rackCount: number;
  slotX: number;
  shift: number;
  rackDragActive: boolean;
  active: boolean;
  edgeHitSlopLeft: number;
  edgeHitSlopRight: number;
  returning: boolean;
  calmReturn: boolean;
  onPress: (tile: WordDropTile) => void;
  onDragStart: (tileId: string) => void;
  onDragMove: (tileId: string, targetIndex: number) => void;
  onDrop: (
    tile: WordDropTile,
    boardPageX: number,
    boardPageY: number,
    overRack: boolean,
    targetIndex: number,
  ) => RackDropResult;
  onCancel: () => void;
}) {
  const sourceRef = useAnimatedRef<View>();
  const initialReturnY = returning ? -(calmReturn ? Math.min(16, size * 0.3) : Math.max(90, size * 2.2)) : 0;
  const visualX = useSharedValue(slotX);
  const visualY = useSharedValue(initialReturnY);
  const scale = useSharedValue(returning ? (calmReturn ? 0.96 : 0.72) : 1);
  const opacity = useSharedValue(1);
  const lifted = useSharedValue(0);
  const dragStartX = useSharedValue(slotX);
  const dragStartY = useSharedValue(0);
  const rackPageX = useSharedValue(0);
  const rackPageY = useSharedValue(0);
  const liveTargetIndex = useSharedValue(rackIndex);
  const gestureStarted = useSharedValue(0);
  const gestureEnded = useSharedValue(0);
  const callbacks = useRef({ onPress, onDragStart, onDragMove, onDrop, onCancel });
  const tileRef = useRef(tile);
  callbacks.current = { onPress, onDragStart, onDragMove, onDrop, onCancel };
  tileRef.current = tile;

  useEffect(() => {
    if (active) return;
    cancelAnimation(visualX);
    visualX.value = withTiming(slotX + (rackDragActive ? shift : 0), {
      duration: rackDragActive ? 64 : 88,
      easing: Easing.out(Easing.quad),
    });
  }, [active, rackDragActive, shift, slotX, visualX]);

  useEffect(() => {
    if (active || returning) return;
    cancelAnimation(visualY);
    cancelAnimation(scale);
    cancelAnimation(opacity);
    opacity.value = 1;
    visualY.value = withTiming(0, { duration: 72, easing: Easing.out(Easing.quad) });
    scale.value = withTiming(1, { duration: 72, easing: Easing.out(Easing.quad) }, (finished) => {
      if (finished) scale.value = 1;
    });
  }, [active, opacity, returning, scale, visualY]);

  useEffect(() => {
    if (!returning) {
      return;
    }
    const returnY = -(calmReturn ? Math.min(16, size * 0.3) : Math.max(90, size * 2.2));
    cancelAnimation(visualY);
    cancelAnimation(scale);
    cancelAnimation(opacity);
    opacity.value = 1;
    visualY.value = returnY;
    scale.value = calmReturn ? 0.96 : 0.72;
    const duration = calmReturn ? 105 : 210;
    visualY.value = withTiming(0, { duration, easing: Easing.out(Easing.cubic) });
    scale.value = withTiming(1, { duration, easing: Easing.out(Easing.cubic) }, (finished) => {
      if (finished) scale.value = 1;
    });
  }, [calmReturn, opacity, returning, scale, size, visualY]);

  const startDragOnJS = useCallback(() => {
    callbacks.current.onDragStart(tileRef.current.id);
    void Haptics.selectionAsync();
  }, []);
  const moveDragOnJS = useCallback((targetIndex: number) => {
    callbacks.current.onDragMove(tileRef.current.id, targetIndex);
  }, []);
  const resolveDropOnJS = useCallback((
    boardPageX: number,
    boardPageY: number,
    overRack: boolean,
    targetIndex: number,
    fromIndex: number,
  ) => {
    const result = callbacks.current.onDrop(
      tileRef.current,
      boardPageX,
      boardPageY,
      overRack,
      targetIndex,
    );
    cancelAnimation(visualX);
    cancelAnimation(visualY);
    cancelAnimation(scale);
    cancelAnimation(opacity);
    scale.value = withTiming(1, { duration: 68, easing: Easing.out(Easing.quad) }, (finished) => {
      if (finished) scale.value = 1;
    });
    if (result.kind === "board") {
      // Keep the released copy exactly where the player dropped it until the
      // placement render replaces it in the same React commit. Hiding it here
      // creates a one-frame hole on fast devices; moving it home creates the
      // familiar rack flash.
      opacity.value = 1;
      return;
    }
    opacity.value = 1;
    const settledX = result.kind === "reordered"
      ? slotX + (targetIndex - fromIndex) * (size + RACK_GAP)
      : slotX;
    visualX.value = withTiming(settledX, { duration: 82, easing: Easing.out(Easing.quad) }, (finished) => {
      if (finished) lifted.value = 0;
    });
    visualY.value = withTiming(0, { duration: 82, easing: Easing.out(Easing.quad) });
  }, [lifted, opacity, scale, size, slotX, visualX, visualY]);
  const cancelDragOnJS = useCallback(() => {
    callbacks.current.onCancel();
    cancelAnimation(visualX);
    cancelAnimation(visualY);
    cancelAnimation(scale);
    opacity.value = 1;
    visualX.value = withTiming(slotX, { duration: 82, easing: Easing.out(Easing.quad) }, (finished) => {
      if (finished) lifted.value = 0;
    });
    visualY.value = withTiming(0, { duration: 82, easing: Easing.out(Easing.quad) });
    scale.value = withTiming(1, { duration: 68, easing: Easing.out(Easing.quad) }, (finished) => {
      if (finished) scale.value = 1;
    });
  }, [lifted, opacity, scale, slotX, visualX, visualY]);

  const drag = Gesture.Pan()
    .enabled(enabled)
    .maxPointers(1)
    .minDistance(3)
    .onStart((event) => {
      const sourceMeasurement = measure(sourceRef);
      gestureStarted.value = 1;
      gestureEnded.value = 0;
      lifted.value = 1;
      cancelAnimation(visualX);
      cancelAnimation(visualY);
      cancelAnimation(scale);
      cancelAnimation(opacity);
      opacity.value = 1;
      dragStartX.value = visualX.value;
      dragStartY.value = visualY.value;
      if (sourceMeasurement) {
        rackPageX.value = sourceMeasurement.pageX - visualX.value;
        rackPageY.value = sourceMeasurement.pageY - visualY.value - 2;
      } else {
        rackPageX.value = event.absoluteX - event.x - visualX.value;
        rackPageY.value = event.absoluteY - event.y - visualY.value - 2;
      }
      liveTargetIndex.value = rackIndex;
      scale.value = withTiming(1.16, { duration: 62, easing: Easing.out(Easing.quad) });
      runOnJS(startDragOnJS)();
    })
    .onUpdate((event) => {
      visualX.value = dragStartX.value + event.translationX;
      visualY.value = dragStartY.value + event.translationY;
      const alignedWithRack = event.absoluteY >= rackPageY.value - 18
        && event.absoluteY <= rackPageY.value + size + 26;
      const rawTarget = Math.round(
        (event.absoluteX - rackPageX.value - RACK_EDGE_TOUCH_PADDING - size / 2) / (size + RACK_GAP),
      );
      const nextTarget = alignedWithRack
        ? Math.max(0, Math.min(Math.max(0, rackCount - 1), rawTarget))
        : rackIndex;
      if (nextTarget !== liveTargetIndex.value) {
        liveTargetIndex.value = nextTarget;
        runOnJS(moveDragOnJS)(nextTarget);
      }
    })
    .onEnd((event) => {
      gestureEnded.value = 1;
      const overRack = event.absoluteY >= rackPageY.value - 22
        && event.absoluteY <= rackPageY.value + size + 30;
      const rawTarget = Math.round(
        (event.absoluteX - rackPageX.value - RACK_EDGE_TOUCH_PADDING - size / 2) / (size + RACK_GAP),
      );
      const targetIndex = overRack
        ? Math.max(0, Math.min(Math.max(0, rackCount - 1), rawTarget))
        : rackIndex;
      const tileCenterX = rackPageX.value + dragStartX.value + event.translationX + size / 2;
      const tileCenterY = rackPageY.value + 2 + dragStartY.value + event.translationY + size / 2;
      scale.value = withTiming(1, { duration: 68, easing: Easing.out(Easing.quad) });
      runOnJS(resolveDropOnJS)(tileCenterX, tileCenterY, overRack, targetIndex, rackIndex);
    })
    .onFinalize(() => {
      if (gestureStarted.value && !gestureEnded.value) runOnJS(cancelDragOnJS)();
      gestureStarted.value = 0;
      gestureEnded.value = 0;
    });
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    zIndex: lifted.value ? 100 : 21,
    elevation: lifted.value ? 20 : 0,
    transform: [
      { translateX: visualX.value },
      { translateY: visualY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={drag}>
      <Reanimated.View
        ref={sourceRef}
        collapsable={false}
        hitSlop={{ left: edgeHitSlopLeft, right: edgeHitSlopRight }}
        style={[
          styles.rackTilePosition,
          styles.rackTileWrap,
          { left: 0, top: 2, width: size, height: size },
          active && styles.rackSlotDragging,
          animatedStyle,
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tile.wildcard ? "Wildcard, zero points" : `${tile.letter}, ${tile.points} points`}
          onPress={() => callbacks.current.onPress(tileRef.current)}
          style={[styles.rackTile, { width: size, height: size }, selected && styles.rackTileSelected]}
        >
          <Text style={[styles.rackLetter, { fontSize: Math.min(28.6, size * 0.595) }]}>{displayTileLetter(tile)}</Text>
          <Text style={[styles.rackPoints, { fontSize: Math.min(11, size * 0.23) }]}>{tile.points}</Text>
        </Pressable>
      </Reanimated.View>
    </GestureDetector>
  );
});

function DraggableBoardTile({
  tile,
  size,
  displaySize,
  gap,
  zoom,
  row,
  col,
  connections,
  outlined,
  draggedRow,
  draggedCol,
  draggedTileId,
  wordPreviewDraggedTileId,
  stageRef,
  stagePageX,
  stagePageY,
  overlayX,
  overlayY,
  previewDragActive,
  pendingDragGeneration,
  pinchGestureRef,
  boardTapGestureRef,
  surface = true,
  onDragStart,
  onDragFinish,
  onDrop,
}: {
  tile: WordDropTile;
  size: number;
  displaySize: number;
  gap: number;
  zoom: SharedValue<number>;
  row: number;
  col: number;
  connections: TileConnections;
  outlined: boolean;
  draggedRow: SharedValue<number>;
  draggedCol: SharedValue<number>;
  draggedTileId: SharedValue<string>;
  wordPreviewDraggedTileId: SharedValue<string>;
  stageRef: AnimatedRef<View>;
  stagePageX: SharedValue<number>;
  stagePageY: SharedValue<number>;
  overlayX: SharedValue<number>;
  overlayY: SharedValue<number>;
  previewDragActive: SharedValue<number>;
  pendingDragGeneration: SharedValue<number>;
  pinchGestureRef: MutableRefObject<GestureType | undefined>;
  boardTapGestureRef: MutableRefObject<GestureType | undefined>;
  surface?: boolean;
  onDragStart: () => void;
  onDragFinish: () => void;
  onDrop: (tileId: string, pageX: number, pageY: number) => void;
}) {
  const sourceRef = useAnimatedRef<View>();
  const dragStartX = useSharedValue(0);
  const dragStartY = useSharedValue(0);
  const sourceStyle = useAnimatedStyle(() => ({
    opacity: previewDragActive.value && draggedTileId.value === tile.id ? 0 : 1,
  }));
  const drag = Gesture.Pan()
    .simultaneousWithExternalGesture(pinchGestureRef, boardTapGestureRef)
    .maxPointers(1)
    .minDistance(3)
    .onStart((event) => {
      const sourceMeasurement = measure(sourceRef);
      const stageMeasurement = measure(stageRef);
      if (sourceMeasurement && stageMeasurement) {
        stagePageX.value = stageMeasurement.pageX;
        stagePageY.value = stageMeasurement.pageY;
        dragStartX.value = sourceMeasurement.pageX - stageMeasurement.pageX;
        dragStartY.value = sourceMeasurement.pageY - stageMeasurement.pageY;
      } else {
        const currentDisplaySize = displaySize * zoom.value;
        dragStartX.value = event.absoluteX - stagePageX.value - currentDisplaySize / 2;
        dragStartY.value = event.absoluteY - stagePageY.value - currentDisplaySize / 2;
      }
      overlayX.value = dragStartX.value;
      overlayY.value = dragStartY.value;
      previewDragActive.value = 1;
      pendingDragGeneration.value += 1;
      draggedRow.value = row;
      draggedCol.value = col;
      draggedTileId.value = tile.id;
      wordPreviewDraggedTileId.value = tile.id;
      runOnJS(onDragStart)();
    })
    .onUpdate((event) => {
      overlayX.value = dragStartX.value + event.translationX;
      overlayY.value = dragStartY.value + event.translationY;
    })
    .onEnd((event) => {
      // The floating overlay follows dragStart + translation. Resolve the
      // destination from that visible tile's centre, not from the finger,
      // which may be holding any point within the tile.
      const currentDisplaySize = displaySize * zoom.value;
      const tileCenterX = stagePageX.value + dragStartX.value + event.translationX + currentDisplaySize / 2;
      const tileCenterY = stagePageY.value + dragStartY.value + event.translationY + currentDisplaySize / 2;
      runOnJS(onDrop)(tile.id, tileCenterX, tileCenterY);
    })
    .onFinalize(() => {
      runOnJS(onDragFinish)();
    });
  return (
    <GestureDetector gesture={drag}>
      <Reanimated.View ref={sourceRef} collapsable={false} style={[styles.pendingTileDrag, sourceStyle]}>
        <BoardTile
          tile={tile}
          size={size}
          gap={gap}
          zoom={zoom}
          pending
          row={row}
          col={col}
          connections={connections}
          outlined={outlined}
          draggedRow={draggedRow}
          draggedCol={draggedCol}
          surface={surface}
        />
      </Reanimated.View>
    </GestureDetector>
  );
}

function ZoomBoardText({
  text,
  zoom,
  fontSize,
  lineHeight,
  letterSpacing,
  style,
  scaleWithZoom = false,
}: {
  text: string;
  zoom: SharedValue<number>;
  fontSize: number;
  lineHeight?: number;
  letterSpacing?: number;
  style?: StyleProp<TextStyle>;
  scaleWithZoom?: boolean;
}) {
  const multiplier = scaleWithZoom ? zoom : null;
  const zoomedTextStyle = useAnimatedStyle(() => ({
    fontSize: fontSize * (multiplier?.value ?? 1),
    lineHeight: lineHeight === undefined ? undefined : lineHeight * (multiplier?.value ?? 1),
    letterSpacing: letterSpacing === undefined ? undefined : letterSpacing * (multiplier?.value ?? 1),
  }), [fontSize, letterSpacing, lineHeight, multiplier]);

  return <Reanimated.Text allowFontScaling={false} style={[style, zoomedTextStyle]}>{text}</Reanimated.Text>;
}

function BonusLabel({ type, size }: { type: WordDropBonusType; size: number }) {
  const isStart = type === "START";
  const fontSize = isStart ? Math.max(14, size * 0.7) : Math.max(11, size * 0.56);
  const lineHeight = fontSize;
  return (
    <Text
      pointerEvents="none"
      allowFontScaling={false}
      numberOfLines={1}
      style={[styles.bonusText, bonusTextStyle(type), {
        left: -1.5,
        top: (size - lineHeight) / 2,
        width: size + 3,
        height: lineHeight,
        fontSize,
        lineHeight,
        letterSpacing: isStart ? 0 : -0.35 * BOARD_RENDER_SCALE,
      }]}
    >
      {isStart ? "★" : type}
    </Text>
  );
}

function BoardTile({
  tile,
  size,
  gap = BOARD_GAP,
  zoom,
  pending = false,
  row = -100,
  col = -100,
  connections = NO_TILE_CONNECTIONS,
  outlined = false,
  draggedRow,
  draggedCol,
  surface = true,
  scaleWithZoom = false,
}: {
  tile: WordDropTile;
  size: number;
  gap?: number;
  zoom: SharedValue<number>;
  pending?: boolean;
  row?: number;
  col?: number;
  connections?: TileConnections;
  outlined?: boolean;
  draggedRow?: SharedValue<number>;
  draggedCol?: SharedValue<number>;
  surface?: boolean;
  scaleWithZoom?: boolean;
}) {
  const crispContentStyle = useAnimatedStyle(() => {
    if (scaleWithZoom) {
      return {
        left: 0,
        top: 0,
        width: size * zoom.value,
        height: size * zoom.value,
      };
    }
    return {
      left: 0,
      top: 0,
      width: size,
      height: size,
    };
  }, [scaleWithZoom, size]);
  const dividerCoverStyle = useAnimatedStyle(() => {
    const activeRow = draggedRow?.value ?? -100;
    const activeCol = draggedCol?.value ?? -100;
    const topConnected = connections.top && !(activeRow === row - 1 && activeCol === col);
    const rightConnected = connections.right && !(activeRow === row && activeCol === col + 1);
    const bottomConnected = connections.bottom && !(activeRow === row + 1 && activeCol === col);
    const leftConnected = connections.left && !(activeRow === row && activeCol === col - 1);
    const previewVisible = outlined;
    const multiplier = scaleWithZoom ? zoom.value : 1;
    const joinedCover = ((gap / 2) + 0.35 * (scaleWithZoom ? 1 : BOARD_RENDER_SCALE)) * multiplier;
    const outerCover = ((gap / 2) + (previewVisible ? 0.75 * (scaleWithZoom ? 1 : BOARD_RENDER_SCALE) : 0)) * multiplier;
    const radius = 2 * (scaleWithZoom ? 1 : BOARD_RENDER_SCALE) * multiplier;
    return {
      top: -(topConnected ? joinedCover : outerCover),
      right: -(rightConnected ? joinedCover : outerCover),
      bottom: -(bottomConnected ? joinedCover : outerCover),
      left: -(leftConnected ? joinedCover : outerCover),
      borderTopLeftRadius: topConnected || leftConnected ? 0 : radius,
      borderTopRightRadius: topConnected || rightConnected ? 0 : radius,
      borderBottomRightRadius: bottomConnected || rightConnected ? 0 : radius,
      borderBottomLeftRadius: bottomConnected || leftConnected ? 0 : radius,
    };
  }, [connections.bottom, connections.left, connections.right, connections.top, gap, outlined, row, col, scaleWithZoom]);
  const pointStyle = useAnimatedStyle(() => ({
    top: 1.65 * (scaleWithZoom ? zoom.value : BOARD_RENDER_SCALE),
    right: 2.4 * (scaleWithZoom ? zoom.value : BOARD_RENDER_SCALE),
    fontSize: Math.max(6.5 * (scaleWithZoom ? 1 : BOARD_RENDER_SCALE), size * 0.235) * (scaleWithZoom ? zoom.value : 1),
    lineHeight: Math.max(7.5 * (scaleWithZoom ? 1 : BOARD_RENDER_SCALE), size * 0.275) * (scaleWithZoom ? zoom.value : 1),
  }), [scaleWithZoom, size]);
  return (
    <Reanimated.View style={[
      styles.boardTile,
      !surface && styles.boardTileContent,
      surface && pending && styles.boardTilePending,
      surface && dividerCoverStyle,
    ]}>
      <Reanimated.View pointerEvents="none" style={[styles.boardTileCrispContent, crispContentStyle]}>
        <ZoomBoardText
          text={displayTileLetter(tile)}
          zoom={zoom}
          fontSize={Math.max(10 * (scaleWithZoom ? 1 : BOARD_RENDER_SCALE), size * 0.558)}
          style={styles.boardLetter}
          scaleWithZoom={scaleWithZoom}
        />
        <Reanimated.Text allowFontScaling={false} style={[styles.boardPoints, pointStyle]}>{tile.points}</Reanimated.Text>
      </Reanimated.View>
    </Reanimated.View>
  );
}

function bonusStyle(type: WordDropBonusType) {
  if (type === "3W") return styles.bonus3W;
  if (type === "2W") return styles.bonus2W;
  if (type === "3L") return styles.bonus3L;
  if (type === "2L") return styles.bonus2L;
  return styles.bonusStart;
}

function bonusBackgroundColor(type?: WordDropBonusType) {
  if (type === "3W") return "#512B49";
  if (type === "2W") return "#263E50";
  if (type === "3L") return "#29472D";
  if (type === "2L") return "#554A25";
  return "#202320";
}

function bonusTextStyle(type: WordDropBonusType) {
  if (type === "3W") return styles.bonus3WText;
  if (type === "2W") return styles.bonus2WText;
  if (type === "3L") return styles.bonus3LText;
  if (type === "2L") return styles.bonus2LText;
  return styles.bonusStartText;
}

const styles = StyleSheet.create({
  root: { flex: 1, width: "100%", maxWidth: 430, alignSelf: "center", alignItems: "center" },
  bagButton: { width: 65, height: 55, alignItems: "center", justifyContent: "center" },
  bagButtonPressed: { opacity: 0.7 },
  tileStackRing: { position: "relative", alignItems: "center", justifyContent: "center" },
  tileStackBack: { position: "absolute", zIndex: 1, backgroundColor: "#8FD695", transform: [{ rotate: "-7deg" }], shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 2, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  tileStackFront: { position: "absolute", zIndex: 2, backgroundColor: colors.green, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.28, shadowRadius: 2, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  tileStackCount: { color: colors.background, fontWeight: "900", textAlign: "center" },
  lastPlayArea: { width: "100%", height: 32, marginBottom: 4, alignItems: "center", justifyContent: "center" },
  lastPlay: { color: colors.green, fontSize: 11, fontWeight: "700", textAlign: "center", paddingHorizontal: 8 },
  lastPlayMuted: { color: colors.muted, fontSize: 10 },
  boardStage: { zIndex: 1, alignSelf: "center", overflow: "visible" },
  boardViewport: { ...StyleSheet.absoluteFillObject, overflow: "hidden", borderRadius: 3, backgroundColor: "#000000" },
  boardGestureSurface: { ...StyleSheet.absoluteFillObject },
  board: { position: "absolute", flexDirection: "column", backgroundColor: "#000000" },
  boardRow: { width: "100%", flex: 1, flexDirection: "row", gap: BOARD_GAP },
  cell: { flex: 1, height: "100%", alignItems: "center", justifyContent: "center", backgroundColor: "#202320" },
  bonus2L: { backgroundColor: "#554A25" },
  bonus3L: { backgroundColor: "#29472D" },
  bonus2W: { backgroundColor: "#263E50" },
  bonus3W: { backgroundColor: "#512B49" },
  bonusStart: { backgroundColor: "#202320" },
  bonusText: { position: "absolute", fontWeight: "900", textAlign: "center", textAlignVertical: "center", includeFontPadding: false, overflow: "visible" },
  bonus2LText: { color: "#FFE38D" },
  bonus3LText: { color: "#B8ECB8" },
  bonus2WText: { color: "#A9D9F6" },
  bonus3WText: { color: "#F4A6D8" },
  bonusStartText: { color: "#F06AAF" },
  tileSurfaceLayer: { ...StyleSheet.absoluteFillObject, zIndex: 40, overflow: "visible" },
  draggedCellRestoreGap: { position: "absolute", zIndex: 3, elevation: 3, backgroundColor: "#000000", overflow: "visible" },
  draggedCellRestoreCell: { position: "absolute", overflow: "visible" },
  tileSurfaceAlternateSvg: { ...StyleSheet.absoluteFillObject, zIndex: 2, overflow: "visible" },
  tileContentLayer: { ...StyleSheet.absoluteFillObject, zIndex: 50, overflow: "visible" },
  positionedBoardTile: { position: "absolute" },
  wordOutlineLayer: { ...StyleSheet.absoluteFillObject, zIndex: 60, overflow: "visible" },
  wordOutlineSvg: { ...StyleSheet.absoluteFillObject, overflow: "visible" },
  wordScoreLayer: { position: "absolute", zIndex: 100, elevation: 100, overflow: "visible" },
  wordOutlineScore: { position: "absolute", zIndex: 101, backgroundColor: "#4A98F0", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 101 },
  wordOutlineScoreText: { color: colors.white, fontWeight: "900" },
  wordOutlineScoreInput: { width: "100%", height: "100%", padding: 0, margin: 0, borderWidth: 0, textAlign: "center", textAlignVertical: "center", includeFontPadding: false },
  boardTile: { ...StyleSheet.absoluteFillObject, backgroundColor: "#B7E5BA", borderWidth: 0, alignItems: "center", justifyContent: "center" },
  boardTileContent: { backgroundColor: "transparent" },
  boardTilePending: { backgroundColor: "#C5EEC8" },
  boardTileCrispContent: { position: "absolute", alignItems: "center", justifyContent: "center" },
  boardLetter: { color: "#16351B", fontWeight: "900" },
  boardPoints: { position: "absolute", color: "#315A36", fontWeight: "900", textAlign: "center", includeFontPadding: false },
  pendingTileDrag: { ...StyleSheet.absoluteFillObject, overflow: "visible" },
  pendingTileOverlay: { position: "absolute", zIndex: 1001, elevation: 101 },
  flexSpace: { flex: 1, minHeight: 4 },
  bottomDock: { width: "100%", zIndex: 20, paddingBottom: 2 },
  bottomDockDragging: { zIndex: 1000, elevation: 100 },
  rackHint: { height: 17, color: colors.muted, fontSize: 10, textAlign: "center" },
  rack: { position: "relative", overflow: "visible", alignSelf: "center" },
  rackTilePosition: { position: "absolute" },
  rackSlotDragging: { zIndex: 1000, elevation: 100 },
  rackTileWrap: { width: RACK_TILE_SIZE, height: RACK_TILE_SIZE, zIndex: 21 },
  rackTile: { width: RACK_TILE_SIZE, height: RACK_TILE_SIZE, borderRadius: 6, backgroundColor: "#B8EDBC", borderWidth: 1, borderColor: "#8FD695", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.22, shadowRadius: 2, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  rackTileSelected: { borderWidth: 2, borderColor: colors.white },
  rackLetter: { color: "#16351B", fontSize: 29, fontWeight: "900" },
  rackPoints: { position: "absolute", top: 1.5, right: 3.5, color: "#315A36", fontSize: 11, fontWeight: "900" },
  actions: { width: "100%", height: 58, flexDirection: "row", alignItems: "stretch", gap: 6, marginTop: 5 },
  toolButton: { width: 62, borderRadius: 7, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", gap: 4 },
  toolLabel: { color: colors.text, fontSize: 10, fontWeight: "800" },
  playButton: { flex: 1, borderRadius: 6, backgroundColor: colors.green, alignItems: "center", justifyContent: "center" },
  playText: { color: colors.background, fontWeight: "900" },
  playButtonWaiting: { backgroundColor: colors.surfaceRaised },
  playTextWaiting: { color: colors.muted },
  disabled: { opacity: 0.32 },
  modalRoot: { flex: 1, backgroundColor: "transparent", justifyContent: "flex-end" },
  sheetFrame: { height: "80%", maxHeight: 720, backgroundColor: colors.border, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 1, paddingHorizontal: 1, overflow: "hidden" },
  sheetFrameCompact: { height: 440, maxHeight: "68%" },
  sheetSurface: { flex: 1, backgroundColor: "#121212", borderTopLeftRadius: 21, borderTopRightRadius: 21, overflow: "hidden" },
  sheetDragArea: { backgroundColor: "#121212" },
  sheetHandle: { width: 42, height: 4, marginTop: 8, marginBottom: 3, borderRadius: 2, backgroundColor: colors.muted, alignSelf: "center" },
  sheetHeader: { height: 58, paddingHorizontal: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  sheetTitle: { color: colors.text, fontSize: 22, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.5 },
  sheetClose: { position: "absolute", zIndex: 10, top: 22, right: 12, width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  sheetContent: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 36 },
  bagSummary: { minHeight: 94, paddingHorizontal: 4, flexDirection: "row", alignItems: "center", gap: 14 },
  largeBag: { width: 72, height: 72, alignItems: "center", justifyContent: "center" },
  bagSummaryCopy: { flex: 1 },
  bagSummaryTitle: { color: colors.text, fontSize: 17, fontWeight: "800" },
  bagSummarySub: { color: colors.muted, fontSize: 13, marginTop: 5 },
  unseenTitle: { color: colors.green, fontSize: 17, fontWeight: "800", textAlign: "center", marginTop: 28, marginBottom: 18, textTransform: "uppercase", letterSpacing: 0.6 },
  letterGrid: { width: 340, maxWidth: "100%", alignSelf: "center", flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 15 },
  letterCountItem: { width: 48, alignItems: "center" },
  countTile: { width: 43, height: 43, borderRadius: 7, backgroundColor: colors.greenStrong, alignItems: "center", justifyContent: "center" },
  countWildcardTile: { backgroundColor: "#A7DDAA", borderWidth: 1, borderColor: colors.green },
  countTileEmpty: { opacity: 0.3 },
  countLetter: { color: colors.background, fontSize: 22, fontWeight: "900" },
  letterCount: { color: colors.text, fontSize: 12, fontWeight: "700", marginTop: 3 },
  letterCountEmpty: { color: colors.muted },
  letterTotals: { marginTop: 28, flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", columnGap: 12, rowGap: 8 },
  letterTotal: { color: colors.text, fontSize: 14 },
  letterTotalLabel: { fontWeight: "900" },
  wildcardContent: { flex: 1, paddingHorizontal: 20, paddingTop: 17, paddingBottom: 28 },
  wildcardHelp: { color: colors.muted, fontSize: 13, textAlign: "center", marginBottom: 18 },
  wildcardGrid: { width: 340, maxWidth: "100%", alignSelf: "center", flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 },
  wildcardChoice: { width: 46, height: 46, borderRadius: 7, backgroundColor: "#B8EDBC", borderWidth: 1, borderColor: "#8FD695", alignItems: "center", justifyContent: "center" },
  wildcardChoicePressed: { transform: [{ scale: 0.94 }], backgroundColor: "#9EDF9F" },
  wildcardChoiceText: { color: "#16351B", fontSize: 23, fontWeight: "900" },
});
