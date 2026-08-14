import { AntDesign, FontAwesome5 } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { prefix } from "../../util/config";
import { cacheChatMessage, cacheChatPreview, getUnreadMessageCount } from "../../util/chat";
import { cacheGame, getCachedGame, getGame, openTurn, rematch, resignGame, rollbackOptimisticGame, submitMove } from "../../util/games";
import { GameChangedEvent, getRealtimeSocket } from "../../util/realtime";
import { colors } from "../../util/theme";
import type { ChatMessage, GameSession, User } from "../../util/types";
import GameLoader, { getGameDefinition } from "./GameLoader";
import type { GameMovePayload } from "./GameLoader";
import { TurnCountdown, TurnStatus } from "./components/TurnBasedGameHeader";

interface PendingMove {
  move: GameMovePayload;
  expectedVersion: number;
  requestId: string;
}

function newRequestId(gameId: number, userId: number) {
  return `${gameId}-${userId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function GameWrapper({
  gameId,
  account,
  returnToChatId,
}: {
  gameId: number;
  account: User;
  returnToChatId?: number;
}) {
  const [game, setGame] = useState<GameSession | null>(() => getCachedGame(account.id, gameId));
  const gameRef = useRef<GameSession | null>(game);
  const [loading, setLoading] = useState(game === null);
  const [sending, setSending] = useState(false);
  const [rematching, setRematching] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const hasInitialOpponentReplay = Boolean(
    game?.type === "EIGHT_BALL"
    && game.state.recentShots?.some((shot) => (
      shot.playerId === game.opponent.id && shot.startBalls?.length === 16
    )),
  );
  // Keep an ended game in its full presentation layout from the first render;
  // waiting for the child effect allows the result/rematch UI to flash first.
  const [presentationBusy, setPresentationBusy] = useState(hasInitialOpponentReplay);
  const presentationBusyRef = useRef(hasInitialOpponentReplay);
  const pendingResultFeedback = useRef<Haptics.NotificationFeedbackType | null>(null);

  const handlePresentationBusyChange = useCallback((busy: boolean) => {
    presentationBusyRef.current = busy;
    setPresentationBusy(busy);
    if (!busy && pendingResultFeedback.current) {
      const feedback = pendingResultFeedback.current;
      pendingResultFeedback.current = null;
      void Haptics.notificationAsync(feedback);
    }
  }, []);

  const sendResultFeedback = useCallback((winner: number) => {
    const feedback = winner === account.id
      ? Haptics.NotificationFeedbackType.Success
      : Haptics.NotificationFeedbackType.Warning;
    if (presentationBusyRef.current) pendingResultFeedback.current = feedback;
    else void Haptics.notificationAsync(feedback);
  }, [account.id]);

  const loadUnreadMessageCount = useCallback(async (friendId = gameRef.current?.opponent.id) => {
    if (!friendId) return;
    try {
      setUnreadMessageCount(await getUnreadMessageCount(friendId));
    } catch {
      // A transient badge failure should never prevent the game itself loading.
    }
  }, []);

  const applyGame = useCallback((updated: GameSession, notify = false) => {
    const previous = gameRef.current;
    const beginsOpponentReplay = Boolean(
      updated.type === "EIGHT_BALL"
      && (!previous || updated.state.shotNumber > (previous.type === "EIGHT_BALL" ? previous.state.shotNumber : -1))
      && updated.state.lastShot?.playerId === updated.opponent.id,
    );
    if (beginsOpponentReplay) handlePresentationBusyChange(true);
    cacheGame(account.id, updated);
    cacheChatPreview(account.id, updated.opponent, updated);
    gameRef.current = updated;
    setGame(updated);
    setPendingMove(null);
    if (!previous || previous.opponent.id !== updated.opponent.id) {
      void loadUnreadMessageCount(updated.opponent.id);
    }

    const changed = previous && (
      updated.version > previous.version
      || updated.status !== previous.status
      || updated.winner !== previous.winner
    );
    if (!notify || !previous || !changed) return;
    if (previous.status === "STARTED" && updated.status !== "STARTED") {
      sendResultFeedback(updated.winner);
    } else if (updated.waitingOn === account.id) {
      if (presentationBusyRef.current) pendingResultFeedback.current = Haptics.NotificationFeedbackType.Success;
      else void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [account.id, handlePresentationBusyChange, loadUnreadMessageCount, sendResultFeedback]);

  const load = useCallback(async (showSpinner = false, notify = false) => {
    if (!Number.isInteger(gameId) || gameId <= 0) return;
    if (showSpinner) setLoading(true);
    try {
      let updated = await getGame(gameId, account.id);
      const moveTimerSeconds = updated.type === "WORD_DROP" || updated.type === "NUMBER_DROP"
        ? updated.settings.moveTimerSeconds
        : null;
      if (moveTimerSeconds
        && updated.status === "STARTED"
        && updated.waitingOn === account.id
        && !updated.turnDeadline
        && AppState.currentState === "active") {
        updated = await openTurn(gameId, account.id);
      }
      applyGame(updated, notify);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load this game");
    } finally {
      setLoading(false);
    }
  }, [account.id, applyGame, gameId]);
  const handleTimerExpire = useCallback(() => { void load(false, true); }, [load]);

  useFocusEffect(useCallback(() => {
    void load(!gameRef.current);
    if (gameRef.current?.opponent.id) void loadUnreadMessageCount();
  }, [load, loadUnreadMessageCount]));
  useFocusEffect(useCallback(() => {
    let active = true;
    let realtime: Awaited<ReturnType<typeof getRealtimeSocket>> | null = null;
    const reconciliation = setInterval(() => {
      // Live game/message events are authoritative hints. Poll only as an
      // offline fallback instead of downloading full game state eight times a
      // minute while the socket is healthy.
      if (!realtime?.connected) {
        void load();
        void loadUnreadMessageCount();
      }
    }, 30000);
    const onGameChanged = (change: GameChangedEvent) => {
      if (change.rematchOf === gameId) {
        const returnQuery = returnToChatId ? `?fromChat=${returnToChatId}` : "";
        router.replace(`/game/${change.gameId}${returnQuery}`);
      } else if (change.gameId === gameId) {
        void load(false, true);
      }
    };
    const onConnect = () => { void load(); };
    const onChatMessage = (message: ChatMessage) => {
      if (message.senderId === gameRef.current?.opponent.id && message.recipientId === account.id) {
        cacheChatMessage(account.id, message.senderId, message);
        setUnreadMessageCount((current) => current + 1);
      }
    };

    void getRealtimeSocket().then((next) => {
      if (!active) return;
      realtime = next;
      realtime.on("game:changed", onGameChanged);
      realtime.on("chat:message", onChatMessage);
      realtime.on("connect", onConnect);
      if (realtime.connected) {
        onConnect();
        void loadUnreadMessageCount();
      }
    }).catch(() => {
      // Resume, reconciliation, and pull-to-refresh cover a temporary socket outage.
    });

    return () => {
      active = false;
      clearInterval(reconciliation);
      realtime?.off("game:changed", onGameChanged);
      realtime?.off("chat:message", onChatMessage);
      realtime?.off("connect", onConnect);
    };
  }, [account.id, gameId, load, loadUnreadMessageCount, returnToChatId]));

  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") void load();
    });
    return () => listener.remove();
  }, [load]);

  async function play(command: PendingMove) {
    const current = gameRef.current;
    if (!current || sending) return;
    setSending(true);
    setError(null);
    setPendingMove(command);
    cacheGame(account.id, {
      ...current,
      waitingOn: current.opponent.id,
      lastActivity: new Date().toISOString(),
    }, { optimistic: true });
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const updated = await submitMove(current.id, command.move, command.expectedVersion, command.requestId, account.id);
      applyGame(updated);
      if (updated.status === "STARTED") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      else sendResultFeedback(updated.winner);
    } catch (moveError) {
      rollbackOptimisticGame(account.id, current);
      setError(moveError instanceof Error ? moveError.message : "Your move was not saved");
    } finally {
      setSending(false);
    }
  }

  function sendMove(move: GameMovePayload) {
    const current = gameRef.current;
    if (!current || current.status !== "STARTED" || current.waitingOn !== account.id || sending) return;
    void play({
      move,
      expectedVersion: current.version,
      requestId: newRequestId(current.id, account.id),
    });
  }

  async function startRematch() {
    const current = gameRef.current;
    if (!current || rematching) return;
    setRematching(true);
    setError(null);
    try {
      const next = await rematch(current.id, account.id);
      const returnQuery = returnToChatId ? `?fromChat=${returnToChatId}` : "";
      router.replace(`/game/${next.id}${returnQuery}`);
    } catch (rematchError) {
      setError(rematchError instanceof Error ? rematchError.message : "Could not start a rematch");
    } finally {
      setRematching(false);
    }
  }

  function confirmResign() {
    const current = gameRef.current;
    if (!current || current.status !== "STARTED") return;
    Alert.alert("End game", "Are you sure you want to end the game?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "End",
        style: "destructive",
        onPress: async () => {
          setSending(true);
          try {
            applyGame(await resignGame(current.id, account.id));
          } catch (endError) {
            setError(endError instanceof Error ? endError.message : "Could not end the game");
          } finally {
            setSending(false);
          }
        },
      },
    ]);
  }

  const isFinished = game?.status !== "STARTED" && !presentationBusy;
  const isMyTurn = Boolean(game && game.status === "STARTED" && game.waitingOn === account.id);
  const definition = game ? getGameDefinition(game.type) : null;
  const gameLabel = game?.type === "WORD_DROP"
    ? `${definition?.name ?? "Word Drop"} · ${game.state.variant === "MINI" ? "Mini" : game.state.variant === "TEST" ? "Test" : "Regular"}`
    : game?.type === "NUMBER_DROP"
      ? `${definition?.name ?? "Number Drop"} · ${game.state.totalRounds} round${game.state.totalRounds === 1 ? "" : "s"}`
    : definition?.name ?? game?.type ?? "Game";
  const statusText = useMemo(() => {
    if (!game) return "";
    if (presentationBusy) return "Shot in progress";
    if (game.status === "STARTED") return isMyTurn ? "Your turn" : `${game.opponent.displayName}'s turn`;
    if (game.winner === -1) return "Drawn!";
    return game.winner === account.id ? "You won!" : "You lost!";
  }, [account.id, game, isMyTurn, presentationBusy]);

  if (loading && !game) return <View style={styles.center}><ActivityIndicator color={colors.green} size="large" /></View>;
  if (!game) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}><BackButton /><Text style={styles.opponentName}>Game</Text><View style={styles.headerSide} /></View>
        <Text style={styles.error}>{error ?? "Game not found"}</Text>
      </SafeAreaView>
    );
  }

  const turnContent = game.type === "WORD_DROP"
    ? game.status !== "STARTED" || !game.settings.moveTimerSeconds
      ? null
      : isMyTurn && game.turnDeadline
        ? <TurnCountdown deadline={game.turnDeadline} onExpire={handleTimerExpire} />
        : <TurnStatus label={statusText} active={isMyTurn} compact />
    : game.type === "NUMBER_DROP"
      ? game.status !== "STARTED"
        ? null
        : isMyTurn && game.turnDeadline
          ? <TurnCountdown deadline={game.turnDeadline} onExpire={handleTimerExpire} />
          : <TurnStatus label={statusText} active={isMyTurn} compact />
    : (
      <>
        <TurnStatus label={statusText} active={isMyTurn} />
        {isMyTurn && game.status === "STARTED" && game.turnDeadline && (
          <TurnCountdown deadline={game.turnDeadline} onExpire={handleTimerExpire} />
        )}
      </>
    );
  const resultIndicator = (game.type === "WORD_DROP" || game.type === "NUMBER_DROP") && game.status !== "STARTED"
    ? <TurnStatus label={statusText} compact />
    : undefined;

  const openChat = () => {
    cacheChatPreview(account.id, game.opponent, game);
    if (returnToChatId === game.opponent.id) router.back();
    else router.replace(`/chat/${game.opponent.id}`);
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.header}>
        <BackButton />
        <View style={styles.opponent}>
          <View style={styles.opponentAvatar}>
            <Text style={styles.opponentInitial}>{game.opponent.displayName.slice(0, 1).toUpperCase()}</Text>
            {!avatarFailed && <Image source={{ uri: `${prefix}/profile/${game.opponent.id}/avatar` }} style={styles.opponentImage} onError={() => setAvatarFailed(true)} />}
          </View>
          <Text style={styles.opponentName}>{game.opponent.displayName}</Text>
        </View>
        <View style={[styles.headerSide, styles.headerActions]}>
          <Pressable accessibilityLabel={`Open chat with ${game.opponent.displayName}${unreadMessageCount ? `, ${unreadMessageCount} unread message${unreadMessageCount === 1 ? "" : "s"}` : ""}`} style={styles.headerAction} onPress={openChat}>
            <View pointerEvents="none" style={styles.chatIconGraphic}>
              <FontAwesome5 name="comment" solid size={24} color={colors.green} style={styles.chatIconGlyph} />
              {unreadMessageCount > 0 && (
                <View style={styles.unreadIconCountBody}>
                  <Text style={styles.unreadIconCount}>{unreadMessageCount > 9 ? "9+" : unreadMessageCount}</Text>
                </View>
              )}
            </View>
          </Pressable>
          {game.status === "STARTED" && <Pressable style={styles.endButton} onPress={confirmResign}><AntDesign name="close" size={20} color="red" /></Pressable>}
        </View>
      </View>

      {definition?.fullScreen ? (
        <View style={styles.fullContent}>
          <Text style={styles.gameName}>{gameLabel}</Text>
          {game.type !== "WORD_DROP" && game.type !== "NUMBER_DROP" && <View style={styles.turnRow}>{turnContent}</View>}
          {error && (
            <View style={styles.fullErrorRow}>
              <Text style={styles.error} numberOfLines={2}>{error}</Text>
              {pendingMove && <Pressable disabled={sending} onPress={() => play(pendingMove)}><Text style={styles.retry}>Retry</Text></Pressable>}
            </View>
          )}
          <GameLoader
            game={game}
            account={account}
            sending={sending}
            onMove={sendMove}
            onPresentationBusyChange={handlePresentationBusyChange}
            turnIndicator={game.type === "WORD_DROP" || game.type === "NUMBER_DROP" ? turnContent : undefined}
            resultIndicator={resultIndicator}
          />
          {isFinished && (
            <Pressable disabled={rematching} style={styles.rematch} onPress={startRematch}>
              {rematching ? <ActivityIndicator color={colors.background} /> : <Text style={styles.rematchText}>Play again</Text>}
            </Pressable>
          )}
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load()} tintColor={colors.black} colors={[colors.black]} />}
        >
          <Text style={styles.gameName}>{gameLabel}</Text>
          <View style={styles.turnRow}>
            {turnContent}
          </View>

          <GameLoader game={game} account={account} sending={sending} onMove={sendMove} onPresentationBusyChange={handlePresentationBusyChange} />

          {error && (
            <View style={styles.errorRow}>
              <Text style={styles.error}>{error}</Text>
              {pendingMove && <Pressable disabled={sending} onPress={() => play(pendingMove)}><Text style={styles.retry}>Retry move</Text></Pressable>}
            </View>
          )}

          {isFinished && (
            <Pressable disabled={rematching} style={styles.rematch} onPress={startRematch}>
              {rematching ? <ActivityIndicator color={colors.background} /> : <Text style={styles.rematchText}>Play again</Text>}
            </Pressable>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function BackButton() {
  return <Pressable accessibilityLabel="Back" style={styles.headerSide} onPress={() => router.back()}><FontAwesome5 name="arrow-left" size={25} color={colors.green} /></Pressable>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" },
  header: { height: 52, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", marginBottom: 4 },
  headerSide: { flex: 1, minHeight: 44, paddingLeft: 16, justifyContent: "center" },
  headerActions: { paddingLeft: 0, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 3 },
  headerAction: { position: "relative", width: 30, height: 34, borderRadius: 6, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  chatIconGraphic: { width: 24, height: 24, alignItems: "center", justifyContent: "center" },
  chatIconGlyph: { width: 24, height: 24, lineHeight: 24, textAlign: "center" },
  unreadIconCountBody: { position: "absolute", top: 1, left: 0, right: 0, height: 21, alignItems: "center", justifyContent: "center" },
  unreadIconCount: { color: colors.black, fontSize: 11, lineHeight: 13, fontWeight: "900", letterSpacing: -0.65, includeFontPadding: false, textAlign: "center" },
  opponent: { flex: 4, flexDirection: "row", justifyContent: "center", alignItems: "center" },
  opponentAvatar: { width: 25, height: 25, borderRadius: 13, backgroundColor: colors.greenStrong, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  opponentInitial: { color: colors.background, fontSize: 11, fontWeight: "800" },
  opponentImage: { ...StyleSheet.absoluteFillObject, borderRadius: 13 },
  opponentName: { color: colors.text, fontSize: 18, marginLeft: 5, textAlign: "center" },
  endButton: { width: 30, height: 34, borderRadius: 6, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", marginRight: 2 },
  content: { alignItems: "flex-start", paddingHorizontal: 8, paddingBottom: 60 },
  fullContent: { flex: 1, paddingHorizontal: 8 },
  gameName: { alignSelf: "center", color: colors.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" },
  turnRow: { minHeight: 34, marginTop: 2, marginBottom: 9, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 11 },
  errorRow: { alignSelf: "stretch", marginTop: 16, padding: 10, backgroundColor: colors.surface, borderRadius: 6 },
  fullErrorRow: { minHeight: 34, marginBottom: 6, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: "#2A1717", borderRadius: 6, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  error: { color: "#EF4444", textAlign: "center" },
  retry: { color: colors.green, textAlign: "center", marginTop: 8, fontWeight: "700" },
  rematch: { alignSelf: "stretch", height: 54, marginTop: 22, marginHorizontal: 24, borderRadius: 8, backgroundColor: colors.green, alignItems: "center", justifyContent: "center" },
  rematchText: { color: colors.background, fontSize: 18, fontWeight: "700" },
});
