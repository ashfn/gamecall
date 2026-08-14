import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalGameState } from "../../../util/localGameState";
import {
  calculateNumberDropOperation,
  numberDropOperationSymbol,
  numberDropScore,
  replayNumberDropSteps,
} from "../../../util/numberDrop";
import { colors } from "../../../util/theme";
import type {
  NumberDropGameSession,
  NumberDropOperation,
  NumberDropStep,
} from "../../../util/types";
import type { GameViewProps } from "../GameLoader";
import TurnBasedGameHeader from "../components/TurnBasedGameHeader";

interface Draft {
  puzzleKey: string;
  steps: NumberDropStep[];
  resultId: string;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface OperationChoice {
  leftId: string;
  rightId: string;
  operation: NumberDropOperation;
  left: number;
  right: number;
  result: number;
}

function choicesFor(source: { id: string; value: number }, target: { id: string; value: number }): OperationChoice[] {
  const candidates: Array<Omit<OperationChoice, "result">> = [
    { leftId: source.id, rightId: target.id, operation: "ADD", left: source.value, right: target.value },
    { leftId: source.id, rightId: target.id, operation: "MULTIPLY", left: source.value, right: target.value },
    { leftId: source.id, rightId: target.id, operation: "SUBTRACT", left: source.value, right: target.value },
    { leftId: target.id, rightId: source.id, operation: "SUBTRACT", left: target.value, right: source.value },
    { leftId: source.id, rightId: target.id, operation: "DIVIDE", left: source.value, right: target.value },
    { leftId: target.id, rightId: source.id, operation: "DIVIDE", left: target.value, right: source.value },
  ];
  const seen = new Set<string>();
  return candidates.flatMap((candidate) => {
    const result = calculateNumberDropOperation(candidate.left, candidate.right, candidate.operation);
    if (result === null) return [];
    const key = `${candidate.operation}:${candidate.left}:${candidate.right}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ ...candidate, result }];
  });
}

function NumberTile({
  id,
  value,
  selected,
  dropTarget,
  disabled,
  register,
  onDragStart,
  onDragMove,
  onDrop,
  onPress,
}: {
  id: string;
  value: number;
  selected: boolean;
  dropTarget: boolean;
  disabled: boolean;
  register: (id: string, view: View | null) => void;
  onDragStart: (id: string) => Rect | null;
  onDragMove: (id: string, x: number, y: number, dx: number, dy: number, origin: Rect | null) => string | null;
  onDrop: (id: string, targetId: string | null, releaseX: number, releaseY: number, dx: number, dy: number, origin: Rect | null) => void;
  onPress: () => void;
}) {
  const tileRef = useRef<View | null>(null);
  const dragOrigin = useRef<Rect | null>(null);
  const hoveredTarget = useRef<string | null>(null);
  const startedDrag = useRef(false);
  const translation = useRef(new Animated.ValueXY()).current;
  const scale = useRef(new Animated.Value(1)).current;
  const [dragging, setDragging] = useState(false);
  const dropRef = useRef(onDrop);
  const startRef = useRef(onDragStart);
  const moveRef = useRef(onDragMove);
  const pressRef = useRef(onPress);
  dropRef.current = onDrop;
  startRef.current = onDragStart;
  moveRef.current = onDragMove;
  pressRef.current = onPress;

  useEffect(() => {
    translation.setValue({ x: 0, y: 0 });
    scale.setValue(1);
    setDragging(false);
  }, [id, scale, translation]);

  const panResponder = useMemo(() => PanResponder.create({
    // The tile owns the touch from the start. A nested Pressable used to win
    // some gestures, making certain source/destination directions unreliable.
    onStartShouldSetPanResponder: () => !disabled,
    onStartShouldSetPanResponderCapture: () => !disabled,
    onMoveShouldSetPanResponder: () => !disabled,
    onMoveShouldSetPanResponderCapture: () => !disabled,
    onPanResponderGrant: () => {
      startedDrag.current = false;
      dragOrigin.current = startRef.current(id);
      hoveredTarget.current = null;
      if (!dragOrigin.current) {
        tileRef.current?.measureInWindow((x, y, width, height) => {
          // Never replace the origin once movement has begun: transformed
          // measurements would otherwise apply the drag offset twice.
          if (!startedDrag.current) dragOrigin.current = { x, y, width, height };
        });
      }
    },
    onPanResponderMove: (event, gesture) => {
      if (!startedDrag.current && Math.abs(gesture.dx) + Math.abs(gesture.dy) <= 3) return;
      if (!startedDrag.current) {
        startedDrag.current = true;
        setDragging(true);
        void Haptics.selectionAsync();
        Animated.spring(scale, { toValue: 1.12, speed: 30, bounciness: 4, useNativeDriver: false }).start();
      }
      translation.setValue({ x: gesture.dx, y: gesture.dy });
      const pageX = event.nativeEvent.pageX ?? gesture.moveX;
      const pageY = event.nativeEvent.pageY ?? gesture.moveY;
      hoveredTarget.current = moveRef.current(id, pageX, pageY, gesture.dx, gesture.dy, dragOrigin.current);
    },
    onPanResponderRelease: (event, gesture) => {
      if (!startedDrag.current) {
        pressRef.current();
        return;
      }
      const pageX = event.nativeEvent.pageX ?? gesture.moveX;
      const pageY = event.nativeEvent.pageY ?? gesture.moveY;
      dropRef.current(id, hoveredTarget.current, pageX, pageY, gesture.dx, gesture.dy, dragOrigin.current);
      hoveredTarget.current = null;
      startedDrag.current = false;
      Animated.parallel([
        Animated.spring(translation, { toValue: { x: 0, y: 0 }, speed: 36, bounciness: 2, useNativeDriver: false }),
        Animated.spring(scale, { toValue: 1, speed: 36, bounciness: 2, useNativeDriver: false }),
      ]).start(() => setDragging(false));
    },
    onPanResponderTerminate: () => {
      moveRef.current(id, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, 0, 0, null);
      hoveredTarget.current = null;
      startedDrag.current = false;
      translation.setValue({ x: 0, y: 0 });
      scale.setValue(1);
      setDragging(false);
    },
    onPanResponderTerminationRequest: () => false,
  }), [disabled, id, scale, translation]);

  return (
    <Animated.View
      ref={(view) => {
        const nativeView = view as unknown as View | null;
        tileRef.current = nativeView;
        register(id, nativeView);
      }}
      collapsable={false}
      style={[
        styles.numberTile,
        selected && styles.numberTileSelected,
        dropTarget && styles.numberTileDropTarget,
        dragging && styles.numberTileDragging,
        { transform: [...translation.getTranslateTransform(), { scale }] },
      ]}
      {...panResponder.panHandlers}
    >
      <View pointerEvents="none" style={styles.numberTilePressable}>
        <Text style={[styles.numberTileText, selected && styles.numberTileTextSelected]} adjustsFontSizeToFit numberOfLines={1}>{value}</Text>
      </View>
    </Animated.View>
  );
}

function SubmissionCard({ label, value, distance, score, expression, winner }: {
  label: string;
  value: number;
  distance: number;
  score: number;
  expression: string;
  winner: boolean;
}) {
  return (
    <View style={[styles.submissionCard, winner && styles.submissionWinner]}>
      <Text style={styles.submissionLabel}>{label}</Text>
      <Text style={styles.submissionValue}>{value}</Text>
      <Text style={styles.submissionScore}>{score} pts · {distance === 0 ? "exact" : `${distance} away`}</Text>
      <Text style={styles.submissionExpression} numberOfLines={2}>{expression}</Text>
    </View>
  );
}

export default function NumberDrop({ game: rawGame, account, sending, onMove, turnIndicator, resultIndicator }: GameViewProps) {
  const game = rawGame as NumberDropGameSession;
  const puzzleKey = `${game.state.target}:${game.state.numbers.join(",")}`;
  const initialDraft = useMemo<Draft>(() => ({ puzzleKey, steps: [], resultId: "n0" }), [puzzleKey]);
  const [storedDraft, setStoredDraft, hydrated] = useLocalGameState<Draft>({
    userId: account.id,
    gameId: game.id,
    gameType: "NUMBER_DROP",
    slot: "working-answer",
  }, initialDraft);
  const draft = storedDraft.puzzleKey === puzzleKey ? storedDraft : initialDraft;
  const replay = useMemo(() => replayNumberDropSteps(game.state.numbers, draft.steps), [draft.steps, game.state.numbers]);
  const selected = replay.tiles.find((tile) => tile.id === draft.resultId) ?? replay.tiles[replay.tiles.length - 1];
  const ownSubmission = game.state.submissions[String(account.id)];
  const opponentSubmission = game.state.submissions[String(game.opponent.id)];
  const finished = game.status !== "STARTED" && Boolean(ownSubmission && opponentSubmission);
  const myScore = game.state.scores[String(account.id)] ?? 0;
  const opponentScore = game.state.scores[String(game.opponent.id)] ?? 0;
  const isMyTurn = game.status === "STARTED" && game.waitingOn === account.id;
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
    active: game.status === "STARTED" && !isMyTurn,
  }), [game.opponent, game.status, isMyTurn, opponentScore]);
  const roundAccessory = useMemo(() => (
    <View style={styles.roundPill}>
      <Text style={styles.roundPillText}>ROUND {game.state.currentRound} OF {game.state.totalRounds}</Text>
    </View>
  ), [game.state.currentRound, game.state.totalRounds]);
  const scoreHeader = (
    <TurnBasedGameHeader
      player={headerPlayer}
      opponent={headerOpponent}
      turnIndicator={turnIndicator}
      resultIndicator={resultIndicator}
      centerAccessory={roundAccessory}
    />
  );
  const canSubmit = game.status === "STARTED" && game.waitingOn === account.id && !ownSubmission && Boolean(selected) && !sending;
  // Submitting locks the authoritative answer, not the local workspace. Players
  // can keep exploring calculations while they wait for the other answer.
  const canWork = game.status === "STARTED" && !sending;
  const tileRefs = useRef(new Map<string, View>());
  const tileRects = useRef(new Map<string, Rect>());
  const [operationChoices, setOperationChoices] = useState<OperationChoice[]>([]);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  useEffect(() => {
    if (storedDraft.puzzleKey !== puzzleKey) setStoredDraft(initialDraft);
  }, [initialDraft, puzzleKey, setStoredDraft, storedDraft.puzzleKey]);

  const register = useCallback((id: string, view: View | null) => {
    if (view) tileRefs.current.set(id, view);
    else tileRefs.current.delete(id);
  }, []);

  const measureTiles = useCallback((onComplete?: () => void) => {
    const entries = [...tileRefs.current.entries()];
    if (!entries.length) {
      onComplete?.();
      return;
    }
    let remaining = entries.length;
    entries.forEach(([id, view]) => {
      view.measureInWindow((x, y, width, height) => {
        tileRects.current.set(id, { x, y, width, height });
        remaining -= 1;
        if (remaining === 0) onComplete?.();
      });
    });
  }, []);

  const tileLayoutKey = replay.tiles.map((tile) => tile.id).join(":");
  useEffect(() => {
    const frame = requestAnimationFrame(() => measureTiles());
    return () => cancelAnimationFrame(frame);
  }, [measureTiles, tileLayoutKey]);

  const targetAtPoint = useCallback((sourceId: string, x: number, y: number, dx: number, dy: number, origin: Rect | null) => {
    const movedRect = origin ? { ...origin, x: origin.x + dx, y: origin.y + dy } : null;
    const movedCenter = movedRect ? {
      x: movedRect.x + movedRect.width / 2,
      y: movedRect.y + movedRect.height / 2,
    } : { x, y };
    const target = [...tileRects.current.entries()]
      .filter(([id]) => id !== sourceId)
      .map(([id, rect]) => {
        const overlapWidth = movedRect
          ? Math.max(0, Math.min(movedRect.x + movedRect.width, rect.x + rect.width) - Math.max(movedRect.x, rect.x))
          : 0;
        const overlapHeight = movedRect
          ? Math.max(0, Math.min(movedRect.y + movedRect.height, rect.y + rect.height) - Math.max(movedRect.y, rect.y))
          : 0;
        const overlap = overlapWidth * overlapHeight;
        const centerDistance = Math.hypot(movedCenter.x - (rect.x + rect.width / 2), movedCenter.y - (rect.y + rect.height / 2));
        const fingerInside = x >= rect.x - 16 && x <= rect.x + rect.width + 16
          && y >= rect.y - 16 && y <= rect.y + rect.height + 16;
        return { id, rect, overlap, centerDistance, fingerInside };
      })
      .filter(({ rect, overlap, centerDistance, fingerInside }) => (
        fingerInside
        || overlap > 0
        || centerDistance <= Math.max(rect.width, rect.height) * 1.15
      ))
      .sort((left, right) => right.overlap - left.overlap
        || Number(right.fingerInside) - Number(left.fingerInside)
        || left.centerDistance - right.centerDistance)[0]?.id ?? null;
    setDropTargetId((current) => current === target ? current : target);
    return target;
  }, []);

  const resolveDrop = useCallback((sourceId: string, preferredTargetId: string | null, releaseX: number, releaseY: number, dx: number, dy: number, measuredOrigin: Rect | null) => {
    setDropTargetId(null);
    const source = replay.tiles.find((tile) => tile.id === sourceId);
    if (!source) return;
    const releaseTargetId = [...tileRects.current.entries()]
      .filter(([id]) => id !== sourceId)
      .map(([id, rect]) => ({
        id,
        distance: Math.hypot(releaseX - (rect.x + rect.width / 2), releaseY - (rect.y + rect.height / 2)),
        inside: releaseX >= rect.x - 14 && releaseX <= rect.x + rect.width + 14
          && releaseY >= rect.y - 14 && releaseY <= rect.y + rect.height + 14,
      }))
      .filter((candidate) => candidate.inside)
      .sort((left, right) => left.distance - right.distance)[0]?.id ?? null;
    const directTarget = replay.tiles.find((tile) => tile.id === preferredTargetId)
      ?? replay.tiles.find((tile) => tile.id === releaseTargetId);
    if (directTarget) {
      setOperationChoices(choicesFor(source, directTarget));
      return;
    }

    const origin = measuredOrigin ?? tileRects.current.get(sourceId);
    if (!origin) return;
    const droppedRect: Rect = { ...origin, x: origin.x + dx, y: origin.y + dy };
    const droppedCenter = {
      x: droppedRect.x + droppedRect.width / 2,
      y: droppedRect.y + droppedRect.height / 2,
    };
    const targetEntry = [...tileRects.current.entries()]
      .filter(([id]) => id !== sourceId)
      .map(([id, rect]) => {
        const overlapWidth = Math.max(0, Math.min(droppedRect.x + droppedRect.width, rect.x + rect.width) - Math.max(droppedRect.x, rect.x));
        const overlapHeight = Math.max(0, Math.min(droppedRect.y + droppedRect.height, rect.y + rect.height) - Math.max(droppedRect.y, rect.y));
        const overlap = overlapWidth * overlapHeight;
        const centerDistance = Math.hypot(droppedCenter.x - (rect.x + rect.width / 2), droppedCenter.y - (rect.y + rect.height / 2));
        return { id, rect, overlap, centerDistance };
      })
      .filter(({ rect, overlap, centerDistance }) => (
        overlap > droppedRect.width * droppedRect.height * 0.08
        || centerDistance <= Math.max(rect.width, rect.height) * 0.9
      ))
      .sort((left, right) => right.overlap - left.overlap
        || left.centerDistance - right.centerDistance)[0];
    const target = targetEntry ? replay.tiles.find((tile) => tile.id === targetEntry.id) : null;
    if (!target) return;
    const choices = choicesFor(source, target);
    if (!choices.length) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    setOperationChoices(choices);
  }, [replay.tiles]);

  const handleDrop = useCallback((sourceId: string, targetId: string | null, releaseX: number, releaseY: number, dx: number, dy: number, measuredOrigin: Rect | null) => {
    // Resolve immediately from the bounds used during the gesture. Waiting for
    // another native measurement here introduced a race at the moment of release.
    resolveDrop(sourceId, targetId, releaseX, releaseY, dx, dy, measuredOrigin);
    requestAnimationFrame(() => measureTiles());
  }, [measureTiles, resolveDrop]);

  function applyChoice(choice: OperationChoice) {
    const nextSteps = [...replay.validSteps, {
      leftId: choice.leftId,
      rightId: choice.rightId,
      operation: choice.operation,
    }];
    setStoredDraft({ puzzleKey, steps: nextSteps, resultId: `r${nextSteps.length - 1}` });
    setOperationChoices([]);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  function undo() {
    const nextSteps = replay.validSteps.slice(0, -1);
    const nextReplay = replayNumberDropSteps(game.state.numbers, nextSteps);
    const result = nextReplay.tiles.findLast((tile) => tile.isResult) ?? nextReplay.tiles[0];
    setStoredDraft({ puzzleKey, steps: nextSteps, resultId: result?.id ?? "n0" });
  }

  function reset() {
    setStoredDraft(initialDraft);
  }

  if (finished && ownSubmission && opponentSubmission) {
    return (
      <View style={styles.finishedRoot}>
        {scoreHeader}
        <Text style={styles.finishedEyebrow}>{game.state.totalRounds} ROUND MATCH</Text>
        <Text style={styles.finalScore}>{myScore} <Text style={styles.finalScoreDash}>–</Text> {opponentScore}</Text>
        <Text style={styles.finishedTitle}>{game.winner === -1 ? "Dead heat" : game.winner === account.id ? "You won the match" : `${game.opponent.displayName} won`}</Text>
        <View style={styles.submissionRow}>
          <SubmissionCard label="YOU" {...ownSubmission} winner={game.winner === account.id} />
          <SubmissionCard label={game.opponent.displayName.toUpperCase()} {...opponentSubmission} winner={game.winner === game.opponent.id} />
        </View>
        <View style={styles.bestAnswer}>
          <Text style={styles.bestAnswerLabel}>BEST ROUTE</Text>
          <Text style={styles.bestAnswerValue}>{game.state.bestValue}</Text>
          <Text style={styles.bestAnswerExpression}>{game.state.bestExpression}</Text>
        </View>
      </View>
    );
  }

  const distance = selected ? Math.abs(selected.value - game.state.target) : 0;
  return (
    <View style={styles.root}>
      {scoreHeader}
      <View style={styles.targetArea}>
        <Text style={styles.targetLabel}>GET AS CLOSE AS YOU CAN TO</Text>
        <Text style={styles.target}>{game.state.target}</Text>
        {selected && (
          <View style={styles.previewPill}>
            <Text style={styles.previewPillText}>{distance === 0 ? "EXACT" : `${distance} AWAY`} · {numberDropScore(distance)} PTS</Text>
          </View>
        )}
      </View>

      <View style={styles.workspace}>
        <Text style={styles.instruction}>Drag one number onto another</Text>
        <View style={styles.numberGrid} onLayout={() => requestAnimationFrame(() => measureTiles())}>
          {replay.tiles.map((tile) => (
            <NumberTile
              key={tile.id}
              id={tile.id}
              value={tile.value}
              selected={tile.id === selected?.id}
              dropTarget={tile.id === dropTargetId}
              disabled={!canWork || !hydrated}
              register={register}
              onDragStart={(id) => {
                const origin = tileRects.current.get(id) ?? null;
                measureTiles();
                return origin;
              }}
              onDragMove={targetAtPoint}
              onDrop={handleDrop}
              onPress={() => setStoredDraft({ ...draft, steps: replay.validSteps, resultId: tile.id })}
            />
          ))}
        </View>
        <View style={styles.expressionPanel}>
          <Text style={styles.expressionLabel}>YOUR ANSWER</Text>
          <Text style={styles.expression} numberOfLines={3}>{selected?.expression ?? "Choose a number"}</Text>
        </View>
      </View>

      <View style={styles.controls}>
        <Pressable disabled={!canWork || replay.validSteps.length === 0} style={[styles.toolButton, (!canWork || replay.validSteps.length === 0) && styles.disabled]} onPress={undo}>
          <MaterialCommunityIcons name="undo" size={23} color={colors.text} />
          <Text style={styles.toolText}>Undo</Text>
        </Pressable>
        <Pressable disabled={!canWork || replay.validSteps.length === 0} style={[styles.toolButton, (!canWork || replay.validSteps.length === 0) && styles.disabled]} onPress={reset}>
          <MaterialCommunityIcons name="restart" size={23} color={colors.text} />
          <Text style={styles.toolText}>Reset</Text>
        </Pressable>
        <Pressable disabled={!canSubmit} style={[styles.submitButton, !canSubmit && styles.submitDisabled]} onPress={() => selected && onMove({ kind: "submit", steps: replay.validSteps, resultId: selected.id })}>
          <Text style={styles.submitText}>{sending ? "Submitting…" : ownSubmission ? "Submitted" : game.waitingOn === account.id ? "Lock answer" : "Keep solving"}</Text>
        </Pressable>
      </View>

      {ownSubmission && (
        <Text style={styles.waiting}>
          {ownSubmission.value} locked for {ownSubmission.score} points · keep experimenting while you wait
        </Text>
      )}

      <Modal transparent visible={operationChoices.length > 0} animationType="fade" onRequestClose={() => setOperationChoices([])}>
        <Pressable style={styles.operationBackdrop} onPress={() => setOperationChoices([])}>
          <SafeAreaView style={styles.operationSheet} edges={["bottom"]}>
            <Text style={styles.operationTitle}>Choose the calculation</Text>
            <View style={styles.operationGrid}>
              {operationChoices.map((choice) => (
                <Pressable key={`${choice.operation}-${choice.leftId}-${choice.rightId}`} style={styles.operationChoice} onPress={() => applyChoice(choice)}>
                  <Text style={styles.operationEquation}>{choice.left} {numberDropOperationSymbol(choice.operation)} {choice.right}</Text>
                  <Text style={styles.operationResult}>= {choice.result}</Text>
                </Pressable>
              ))}
            </View>
          </SafeAreaView>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: 8, paddingBottom: 6 },
  roundPill: { borderRadius: 15, backgroundColor: "#19271D", paddingHorizontal: 9, paddingVertical: 5 },
  roundPillText: { color: colors.green, fontSize: 8, fontWeight: "900", letterSpacing: 0.65 },
  targetArea: { alignItems: "center", minHeight: 106, justifyContent: "center" },
  targetLabel: { color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1.5 },
  target: { color: colors.green, fontSize: 62, lineHeight: 67, fontWeight: "900", letterSpacing: -2 },
  previewPill: { backgroundColor: "#19271D", borderRadius: 20, paddingHorizontal: 13, paddingVertical: 5 },
  previewPillText: { color: colors.green, fontSize: 11, fontWeight: "900", letterSpacing: 0.7 },
  workspace: { flex: 1, backgroundColor: colors.surface, borderRadius: 18, marginHorizontal: 5, paddingHorizontal: 14, paddingTop: 16, paddingBottom: 12 },
  instruction: { color: colors.muted, fontSize: 12, textAlign: "center", marginBottom: 14 },
  numberGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", alignContent: "center", gap: 11, minHeight: 190 },
  numberTile: { width: 91, height: 74, borderRadius: 13, backgroundColor: colors.green, shadowColor: "#000", shadowOpacity: 0.22, shadowRadius: 4, shadowOffset: { width: 0, height: 3 }, elevation: 4, zIndex: 1 },
  numberTileSelected: { backgroundColor: colors.text, borderWidth: 3, borderColor: colors.green },
  numberTileDropTarget: { borderWidth: 4, borderColor: "#ABF0FF", shadowColor: "#ABF0FF", shadowOpacity: 0.5, shadowRadius: 9 },
  numberTileDragging: { zIndex: 100, elevation: 20, shadowOpacity: 0.45, shadowRadius: 12 },
  numberTilePressable: { flex: 1, alignItems: "center", justifyContent: "center" },
  numberTileText: { color: colors.background, fontSize: 29, fontWeight: "900", paddingHorizontal: 5 },
  numberTileTextSelected: { color: colors.background },
  expressionPanel: { minHeight: 86, marginTop: 13, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 11, backgroundColor: colors.background, justifyContent: "center" },
  expressionLabel: { color: colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.2, marginBottom: 5 },
  expression: { color: colors.text, fontSize: 17, fontWeight: "700", lineHeight: 23 },
  controls: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 6, paddingTop: 10 },
  toolButton: { width: 66, height: 52, borderRadius: 10, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  toolText: { color: colors.text, fontSize: 10, fontWeight: "700", marginTop: 1 },
  disabled: { opacity: 0.32 },
  submitButton: { flex: 1, height: 52, borderRadius: 12, backgroundColor: colors.green, alignItems: "center", justifyContent: "center" },
  submitDisabled: { backgroundColor: "#29402F" },
  submitText: { color: colors.background, fontSize: 16, fontWeight: "900" },
  waiting: { color: colors.muted, fontSize: 12, textAlign: "center", paddingTop: 7 },
  operationBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.18)", justifyContent: "flex-end" },
  operationSheet: { backgroundColor: "#151515", borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 16, paddingTop: 19, paddingBottom: 8 },
  operationTitle: { color: colors.text, fontSize: 18, fontWeight: "800", textAlign: "center", marginBottom: 15 },
  operationGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9, paddingBottom: 8 },
  operationChoice: { width: "48.5%", minHeight: 74, borderRadius: 12, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  operationEquation: { color: colors.text, fontSize: 16, fontWeight: "700" },
  operationResult: { color: colors.green, fontSize: 20, fontWeight: "900", marginTop: 3 },
  finishedRoot: { flex: 1, paddingHorizontal: 0, paddingTop: 0, alignItems: "center" },
  finishedEyebrow: { color: colors.green, fontSize: 12, fontWeight: "900", letterSpacing: 1.4 },
  finalScore: { color: colors.text, fontSize: 50, lineHeight: 58, fontWeight: "900", marginTop: 4 },
  finalScoreDash: { color: colors.muted, fontWeight: "400" },
  finishedTitle: { color: colors.text, fontSize: 27, fontWeight: "900", marginTop: 6, marginBottom: 24 },
  submissionRow: { flexDirection: "row", gap: 9, alignSelf: "stretch" },
  submissionCard: { flex: 1, minHeight: 180, borderRadius: 14, padding: 13, backgroundColor: colors.surface, borderWidth: 2, borderColor: "transparent" },
  submissionWinner: { borderColor: colors.green },
  submissionLabel: { color: colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  submissionValue: { color: colors.text, fontSize: 38, fontWeight: "900", marginTop: 6 },
  submissionScore: { color: colors.green, fontSize: 12, fontWeight: "800", marginBottom: 13 },
  submissionExpression: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  bestAnswer: { alignSelf: "stretch", marginTop: 12, padding: 15, borderRadius: 13, backgroundColor: "#19271D" },
  bestAnswerLabel: { color: colors.green, fontSize: 9, fontWeight: "900", letterSpacing: 1.1 },
  bestAnswerValue: { color: colors.text, fontSize: 28, fontWeight: "900", marginVertical: 4 },
  bestAnswerExpression: { color: colors.muted, fontSize: 13, lineHeight: 18 },
});
