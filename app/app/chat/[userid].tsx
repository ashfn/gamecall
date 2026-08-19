import { FontAwesome5 } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { PieceSymbol, Square } from "../../src/games/chessEngine";
import { chessPosition, visibleSquares } from "../../src/games/chessRules";
import { GamePicker } from "../../src/components/GamePicker";
import { apiRequest } from "../../util/api";
import { useAccountDetailsStore } from "../../util/auth";
import { cacheChat, cacheChatMessage, getCachedChat, listMessages, sendMessage } from "../../util/chat";
import { prefix } from "../../util/config";
import { cacheGame, getGame, listGames } from "../../util/games";
import { beginOptimisticInboxActivity } from "../../util/inbox";
import { cacheProfile } from "../../util/profileCache";
import { getRealtimeSocket, GameChangedEvent } from "../../util/realtime";
import { colors } from "../../util/theme";
import { ChatMessage, ChessGameSession, EightBallGameSession, GameSession, NumberDropGameSession, TicTacToeGameSession, User, WordDropGameSession } from "../../util/types";
import { primaryWordDropWord } from "../../util/wordDrop";
import { buildWordDropCellPath } from "../../src/games/wordDropGeometry";
import { EIGHT_BALL_TABLE_HEIGHT, EIGHT_BALL_TABLE_WIDTH } from "../../src/games/eightBallPhysics";

const POOL_MINI_WIDTH = 36;
const POOL_MINI_HEIGHT = 62;
const POOL_MINI_RAIL = 4;
const POOL_MINI_BALL = 3.4;

function messageRequestId(userId: number) {
  return `chat-${userId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function fullTimeLabel(timestampMs: number) {
  return new Date(timestampMs).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

function localDayKey(timestampMs: number) {
  const date = new Date(timestampMs);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dayDividerLabel(timestampMs: number) {
  const date = new Date(timestampMs);
  const dayAndMonth = date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  return `${dayAndMonth} AT ${fullTimeLabel(timestampMs)}`;
}

type ChatTimelineEntry = {
  kind: "message";
  key: string;
  senderId: number;
  timestampMs: number;
  message: ChatMessage;
} | {
  kind: "game";
  key: string;
  senderId: number;
  timestampMs: number;
  game: GameSession;
  event: "started" | "finished";
};

interface ChatTimelineGroup {
  key: string;
  senderId: number;
  dayKey: string;
  dayLabel: string;
  lastTimestampMs: number;
  entries: ChatTimelineEntry[];
}

function groupTimelineEntries(entries: ChatTimelineEntry[]): ChatTimelineGroup[] {
  return entries.reduce<ChatTimelineGroup[]>((groups, entry) => {
    const dayKey = localDayKey(entry.timestampMs);
    const previous = groups[groups.length - 1];
    if (previous?.senderId === entry.senderId
      && previous.dayKey === dayKey
      && entry.timestampMs - previous.lastTimestampMs <= 60000) {
      previous.entries.push(entry);
      previous.lastTimestampMs = entry.timestampMs;
      return groups;
    }
    groups.push({
      key: `group-${entry.key}`,
      senderId: entry.senderId,
      dayKey,
      dayLabel: dayDividerLabel(entry.timestampMs),
      lastTimestampMs: entry.timestampMs,
      entries: [entry],
    });
    return groups;
  }, []);
}

function ChatAvatar({ friend }: { friend: User }) {
  const [failed, setFailed] = useState(false);
  return (
    <View style={styles.avatar}>
      <Text style={styles.avatarInitial}>{friend.displayName.slice(0, 1).toUpperCase()}</Text>
      {!failed && <Image source={{ uri: `${prefix}/profile/${friend.id}/avatar` }} style={styles.avatarImage} onError={() => setFailed(true)} />}
    </View>
  );
}

function MiniTicTacToeBoard({ game }: { game: TicTacToeGameSession }) {
  return (
    <View style={styles.miniBoard}>
      {game.state.board.map((cell, index) => (
        <View
          key={index}
          style={[
            styles.miniCell,
            index % 3 !== 2 && styles.miniCellRight,
            index < 6 && styles.miniCellBottom,
          ]}
        >
          <Text style={styles.miniMark}>{cell === "X" ? "×" : cell === "O" ? "○" : ""}</Text>
        </View>
      ))}
    </View>
  );
}

function MiniWordDropBoard({ game }: { game: WordDropGameSession }) {
  const boardDimension = game.state.boardSize;
  const tileSurfacePath = useMemo(() => {
    const occupied = new Set<string>();
    game.state.board.forEach((tile, index) => {
      if (tile) occupied.add(`${Math.floor(index / boardDimension)}:${index % boardDimension}`);
    });
    return buildWordDropCellPath(occupied, 62, 62 / boardDimension, {
      boardDimension,
      gap: 0,
      cornerRadius: 1.45,
    });
  }, [boardDimension, game.state.board]);
  return (
    <View style={styles.wordMiniBoard}>
      <Svg width="100%" height="100%" viewBox="0 0 62 62">
        {tileSurfacePath ? <Path d={tileSurfacePath} fill="#B7E5BA" fillRule="evenodd" /> : null}
      </Svg>
    </View>
  );
}

function MiniEightBallTable({ game }: { game: EightBallGameSession }) {
  const playWidth = POOL_MINI_WIDTH - POOL_MINI_RAIL * 2;
  const playHeight = POOL_MINI_HEIGHT - POOL_MINI_RAIL * 2;
  return (
    <View style={styles.poolMiniPreview}>
      <View style={styles.poolMiniTable}>
        {[styles.poolPocket0, styles.poolPocket1, styles.poolPocket2, styles.poolPocket3, styles.poolPocket4, styles.poolPocket5]
          .map((position, index) => <View key={index} style={[styles.poolMiniPocket, position]} />)}
        {game.state.balls.filter((ball) => !ball.pocketed).map((ball) => (
          <View
            key={ball.number}
            style={[styles.poolMiniBall, {
              left: POOL_MINI_RAIL + ball.x / EIGHT_BALL_TABLE_WIDTH * playWidth - POOL_MINI_BALL / 2,
              top: POOL_MINI_RAIL + ball.y / EIGHT_BALL_TABLE_HEIGHT * playHeight - POOL_MINI_BALL / 2,
              backgroundColor: ball.number === 0 ? "#F7F4EA" : ball.number === 8 ? "#111" : ball.number <= 7 ? "#E0B546" : "#F3F1E8",
            }]}
          />
        ))}
      </View>
    </View>
  );
}

function MiniNumberDrop({ game }: { game: NumberDropGameSession }) {
  return (
    <View style={styles.numberMiniPreview}>
      <Text style={styles.numberMiniTarget}>{game.state.target}</Text>
      <View style={styles.numberMiniTiles}>
        {game.state.numbers.map((number, index) => (
          <View key={`${number}-${index}`} style={styles.numberMiniTile}><Text style={styles.numberMiniTileText}>{number}</Text></View>
        ))}
      </View>
    </View>
  );
}

function MiniChessBoard({ game }: { game: ChessGameSession }) {
  // Fog games hand over a partial board (and sometimes no enemy king at all),
  // which only the matching engine variant will load.
  const position = useMemo(() => chessPosition(game.state), [game.state]);
  const visible = useMemo(() => visibleSquares(game.state), [game.state]);
  const pieceIcon: Record<PieceSymbol, string> = {
    p: "chess-pawn", n: "chess-knight", b: "chess-bishop",
    r: "chess-rook", q: "chess-queen", k: "chess-king",
  };
  return (
    <View style={styles.chessMiniBoard}>
      {Array.from({ length: 64 }, (_, index) => {
        const file = String.fromCharCode(97 + index % 8);
        const rank = 8 - Math.floor(index / 8);
        const square = `${file}${rank}` as Square;
        const piece = position.get(square);
        const fogged = visible !== null && !visible.has(square);
        return (
          <View
            key={index}
            style={[
              styles.chessMiniCell,
              (Math.floor(index / 8) + index % 8) % 2 === 0 ? styles.chessMiniLight : styles.chessMiniDark,
              fogged && styles.chessMiniFogged,
            ]}
          >
            {piece && <FontAwesome5 name={pieceIcon[piece.type] as never} solid size={5.2} color={piece.color === "w" ? "#F7F3E8" : "#111815"} />}
          </View>
        );
      })}
    </View>
  );
}

function MiniGame({ game }: { game: GameSession }) {
  if (game.type === "TIC_TAC_TOE") return <MiniTicTacToeBoard game={game} />;
  if (game.type === "WORD_DROP") return <MiniWordDropBoard game={game} />;
  if (game.type === "EIGHT_BALL") return <MiniEightBallTable game={game} />;
  if (game.type === "CHESS") return <MiniChessBoard game={game} />;
  return <MiniNumberDrop game={game} />;
}

function gameName(game: GameSession) {
  if (game.type === "WORD_DROP") return `Word Drop${game.state.variant === "MINI" ? " Mini" : game.state.variant === "TEST" ? " Test" : ""}`;
  if (game.type === "EIGHT_BALL") return "8 Ball";
  if (game.type === "NUMBER_DROP") return "Number Drop";
  return game.type === "CHESS" ? "Chess" : "Tic Tac Toe";
}

function gameProgress(game: GameSession) {
  if (game.type === "WORD_DROP") return `${Math.max(0, game.state.turnNumber - 1)} turns`;
  if (game.type === "EIGHT_BALL") return `${game.state.shotNumber} shots`;
  if (game.type === "NUMBER_DROP") return `Round ${game.state.currentRound}/${game.state.totalRounds}`;
  if (game.type === "CHESS") return `${game.state.moves.length} moves`;
  return `${game.state.moveCount} moves`;
}

function WordDropPlaySummary({ game, friend, myId }: { game: WordDropGameSession; friend: User; myId: number }) {
  const play = game.state.lastPlay;
  if (!play) return <Text style={styles.gameDetail}>{gameName(game)} · {gameProgress(game)}</Text>;
  const player = play.playerId === myId ? "You" : friend.displayName;
  if (play.passed) return <Text style={styles.gameDetail}>{player} passed</Text>;
  const word = primaryWordDropWord(play.words);
  return (
    <Text style={styles.gameDetail} numberOfLines={2}>
      {player} played {word} for {play.score} point{play.score === 1 ? "" : "s"}
    </Text>
  );
}

function PinnedGame({
  game,
  friend,
  myId,
  onPress,
}: {
  game: GameSession | null;
  friend: User;
  myId: number;
  onPress: () => void;
}) {
  const myTurn = game?.waitingOn === myId;
  return (
    <Pressable style={({ pressed }) => [styles.gameCard, pressed && styles.gameCardPressed]} onPress={onPress}>
      <View style={styles.gameCopy}>
        <Text style={[styles.gameEyebrow, game && styles.gameTypeEyebrow]}>
          {game ? gameName(game).toUpperCase() : "NO GAME GOING"}
        </Text>
        <Text style={[styles.gameStatus, myTurn && styles.gameStatusActive]}>
          {game ? (myTurn ? "Your move" : `Waiting for ${friend.displayName}`) : "Send a game"}
        </Text>
        {game?.type === "WORD_DROP"
          ? <WordDropPlaySummary game={game} friend={friend} myId={myId} />
          : <Text style={styles.gameDetail}>{game ? `${gameName(game)} · ${gameProgress(game)}` : "Choose a game to start"}</Text>}
      </View>
      {game ? <MiniGame game={game} /> : <View style={styles.emptyGameIcon}><Text style={styles.emptyX}>×</Text><Text style={styles.emptyO}>○</Text></View>}
      <FontAwesome5 name="chevron-right" size={16} color={colors.muted} />
    </Pressable>
  );
}

function GameHistoryBubble({
  game,
  friend,
  myId,
  event,
  grouped,
}: {
  game: GameSession;
  friend: User;
  myId: number;
  event: "started" | "finished";
  grouped: boolean;
}) {
  // Cached games from older app builds may not have startedBy yet. Those
  // games used player1 as the sender, so player1 is the safe compatibility fallback.
  const starterId = game.startedBy ?? game.player1;
  const mine = starterId === myId;
  const starter = mine ? "You" : friend.displayName;
  const endedByPassing = event === "finished"
    && game.type === "WORD_DROP"
    && game.state.consecutivePasses >= 2
    && game.state.lastPlay?.passed;
  const result = game.winner === -1
    ? "Draw"
    : game.winner === myId ? "You won" : `${friend.displayName} won`;
  const title = event === "started"
    ? `${starter} started ${gameName(game)}`
    : endedByPassing ? `${gameName(game)} ended after both players passed` : `${gameName(game)} finished`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}${event === "finished" ? `. ${result}` : ""}`}
      onPress={() => router.push(`/game/${game.id}?fromChat=${friend.id}`)}
      style={({ pressed }) => [
        styles.gameHistoryItem,
        mine ? styles.gameHistoryItemMine : styles.gameHistoryItemTheirs,
        grouped && styles.groupedBubble,
        pressed && styles.gameHistoryItemPressed,
      ]}
    >
      <View style={[styles.gameHistoryIcon, mine && styles.gameHistoryIconMine]}>
        <FontAwesome5
          name={event === "finished" ? "flag-checkered" : "gamepad"}
          size={16}
          color={mine ? colors.green : colors.background}
        />
      </View>
      <View style={styles.gameHistoryCopy}>
        {event === "started" ? (
          <Text style={[styles.gameHistoryTitle, mine && styles.gameHistoryTitleMine]}>
            <Text style={styles.gameHistoryStrong}>{starter}</Text> started {gameName(game)}
          </Text>
        ) : <Text style={[styles.gameHistoryTitle, mine && styles.gameHistoryTitleMine]}>{title}</Text>}
        {event === "finished" && (
          <Text style={[styles.gameHistoryResult, mine && styles.gameHistoryResultMine]}>{result}</Text>
        )}
      </View>
      <FontAwesome5 name="chevron-right" size={12} color={mine ? colors.background : colors.muted} />
    </Pressable>
  );
}

export default function ChatScreen() {
  const { userid } = useLocalSearchParams<{ userid: string }>();
  const friendId = Number(userid);
  const account = useAccountDetailsStore((state) => state.account);
  const scrollRef = useRef<ScrollView>(null);
  const scrollFrame = useRef<number | null>(null);
  const messageInputFocused = useRef(false);
  const initialChat = useRef(account ? getCachedChat(account.id, friendId) : null).current;
  const [friend, setFriend] = useState<User | null>(initialChat?.friend ?? null);
  const [games, setGames] = useState<GameSession[]>(initialChat?.games ?? []);
  const [messages, setMessages] = useState<ChatMessage[]>(initialChat?.messages ?? []);
  const [messagesLoaded, setMessagesLoaded] = useState(initialChat?.messagesLoaded ?? false);
  const messagesRef = useRef<ChatMessage[]>(initialChat?.messages ?? []);
  const messagesLoadedRef = useRef(initialChat?.messagesLoaded ?? false);
  const [draft, setDraft] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loading, setLoading] = useState(initialChat === null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timestampDrag = useRef(new Animated.Value(0)).current;

  const closeTimestamps = useCallback(() => {
    Animated.spring(timestampDrag, {
      toValue: 0,
      speed: 28,
      bounciness: 0,
      useNativeDriver: true,
    }).start();
  }, [timestampDrag]);

  const timestampPanResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_event, gesture) => (
      gesture.dx < -6 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.2
    ),
    onPanResponderGrant: () => timestampDrag.stopAnimation(),
    onPanResponderMove: (_event, gesture) => {
      timestampDrag.setValue(Math.max(-72, Math.min(0, gesture.dx)));
    },
    onPanResponderRelease: closeTimestamps,
    onPanResponderTerminate: closeTimestamps,
  }), [closeTimestamps, timestampDrag]);

  const timestampOpacity = timestampDrag.interpolate({
    inputRange: [-58, -12, 0],
    outputRange: [1, 0.2, 0],
    extrapolate: "clamp",
  });

  const scrollToLatest = useCallback(() => {
    if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current);
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = null;
      scrollRef.current?.scrollToEnd({ animated: false });
    });
  }, []);

  useEffect(() => {
    const keyboardShowing = Keyboard.addListener("keyboardWillShow", scrollToLatest);
    return () => {
      keyboardShowing.remove();
      if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current);
    };
  }, [scrollToLatest]);

  const load = useCallback(async (showSpinner = false) => {
    if (!account || !Number.isInteger(friendId) || friendId <= 0) return;
    if (showSpinner) setLoading(true);
    try {
      const lastMessageId = messagesLoadedRef.current
        ? messagesRef.current[messagesRef.current.length - 1]?.id
        : undefined;
      const [profile, nextGames, nextMessages] = await Promise.all([
        apiRequest<User>(`${prefix}/profile/${friendId}`),
        listGames(account.id, friendId),
        listMessages(friendId, lastMessageId),
      ]);
      const currentMessages = messagesRef.current;
      const mergedMessages = lastMessageId
        ? [...currentMessages, ...nextMessages.filter((message) => !currentMessages.some((item) => item.id === message.id))]
          .sort((left, right) => left.id - right.id)
        : nextMessages;
      setFriend(profile);
      setGames(nextGames);
      messagesRef.current = mergedMessages;
      messagesLoadedRef.current = true;
      setMessages(mergedMessages);
      setMessagesLoaded(true);
      cacheChat(account.id, profile, nextGames, mergedMessages);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load this chat");
    } finally {
      setLoading(false);
    }
  }, [account, friendId]);

  useFocusEffect(useCallback(() => {
    void load(initialChat === null);
    if (!account) return undefined;

    let active = true;
    let realtime: Awaited<ReturnType<typeof getRealtimeSocket>> | null = null;
    const interval = setInterval(() => {
      if (!realtime?.connected) void load();
    }, 30000);
    const onMessage = (message: ChatMessage) => {
      const belongsToChat = (
        (message.senderId === account.id && message.recipientId === friendId)
        || (message.senderId === friendId && message.recipientId === account.id)
      );
      if (!belongsToChat) return;
      cacheChatMessage(account.id, friendId, message);
      setMessages((current) => {
        const nextMessages = current.some((item) => item.id === message.id) ? current : [...current, message];
        messagesRef.current = nextMessages;
        return nextMessages;
      });
    };
    const onGameChanged = (change: GameChangedEvent) => {
      if (!change.playerIds.includes(account.id) || !change.playerIds.includes(friendId)) return;
      void getGame(change.gameId, account.id).then((updated) => {
        setGames((current) => {
          const index = current.findIndex((game) => game.id === updated.id);
          if (index < 0) return [updated, ...current];
          const next = [...current];
          next[index] = updated;
          return next;
        });
      }).catch(() => {
        if (!realtime?.connected) void load();
      });
    };

    void getRealtimeSocket().then((next) => {
      if (!active) return;
      realtime = next;
      realtime.on("chat:message", onMessage);
      realtime.on("game:changed", onGameChanged);
    }).catch(() => {
      // The 30-second reconciliation poll covers temporary socket outages.
    });

    return () => {
      active = false;
      clearInterval(interval);
      realtime?.off("chat:message", onMessage);
      realtime?.off("game:changed", onGameChanged);
    };
  }, [account, friendId, initialChat, load]));

  const activeGame = useMemo(
    () => games.find((game) => game.opponent.id === friendId && game.status === "STARTED") ?? null,
    [friendId, games],
  );

  const timelineItems = useMemo<ChatTimelineGroup[]>(() => {
    const entries: Array<{
      kind: "message";
      timestampMs: number;
      message: ChatMessage;
    } | {
      kind: "game";
      timestampMs: number;
      game: GameSession;
      event: "started" | "finished";
    }> = [
      ...messages.map((message) => ({
        kind: "message" as const,
        timestampMs: new Date(message.createdAt).getTime(),
        message,
      })),
      ...games
        .filter((game) => game.opponent.id === friendId)
        .flatMap((game) => {
          const gameEvents: Array<{
            kind: "game";
            timestampMs: number;
            game: GameSession;
            event: "started" | "finished";
          }> = [{
            kind: "game",
            timestampMs: new Date(game.createdAt).getTime(),
            game,
            event: "started",
          }];
          if (game.status === "ENDED" || game.status === "ENDED_UNOPENED") {
            gameEvents.push({
              kind: "game",
              timestampMs: new Date(game.lastActivity).getTime(),
              game,
              event: "finished",
            });
          }
          return gameEvents;
        }),
    ];

    entries.sort((left, right) => {
      const timeDifference = left.timestampMs - right.timestampMs;
      if (timeDifference !== 0) return timeDifference;
      if (left.kind !== right.kind) return left.kind === "game" ? -1 : 1;
      if (left.kind === "game" && right.kind === "game" && left.event !== right.event) {
        return left.event === "started" ? -1 : 1;
      }
      const leftId = left.kind === "game" ? left.game.id : left.message.id;
      const rightId = right.kind === "game" ? right.game.id : right.message.id;
      return leftId - rightId;
    });

    return groupTimelineEntries(entries.map((entry) => {
      if (entry.kind === "game") return {
        kind: "game",
        key: `game-${entry.game.id}-${entry.event}`,
        senderId: entry.game.startedBy ?? entry.game.player1,
        timestampMs: entry.timestampMs,
        game: entry.game,
        event: entry.event,
      } as const;
      return {
        kind: "message",
        key: `message-${entry.message.id}`,
        senderId: entry.message.senderId,
        timestampMs: entry.timestampMs,
        message: entry.message,
      } as const;
    }));
  }, [friendId, games, messages]);

  async function submitMessage() {
    const text = draft.trim();
    if (!account || !text || sending) return;
    const inboxActivity = beginOptimisticInboxActivity(account.id, friendId);
    setSending(true);
    setError(null);
    try {
      const message = await sendMessage(friendId, text, messageRequestId(account.id));
      inboxActivity.commit(message.createdAt);
      cacheChatMessage(account.id, friendId, message);
      setMessages((current) => {
        const nextMessages = current.some((item) => item.id === message.id) ? current : [...current, message];
        messagesRef.current = nextMessages;
        return nextMessages;
      });
      setDraft("");
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (sendError) {
      inboxActivity.rollback();
      setError(sendError instanceof Error ? sendError.message : "Could not send your message");
    } finally {
      setSending(false);
    }
  }

  if (loading && !friend) {
    return <View style={styles.center}><ActivityIndicator color={colors.green} size="large" /></View>;
  }

  if (!friend || !account) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}><BackButton /><Text style={styles.headerName}>Chat</Text><View style={styles.headerSide} /></View>
        <Text style={styles.pageError}>{error ?? "Chat not found"}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right", "bottom"]}>
      <GamePicker
        friend={friend}
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onStarted={(game) => {
          setPickerOpen(false);
          cacheGame(account.id, game);
          setGames((current) => [game, ...current]);
          router.push(`/game/${game.id}?fromChat=${friend.id}`);
        }}
      />

      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <BackButton />
          <Pressable
            style={styles.headerPerson}
            onPress={() => {
              cacheProfile(friend, "Remove");
              router.push(`/user/${friend.id}`);
            }}
          >
            <ChatAvatar friend={friend} />
            <Text style={styles.headerName}>{friend.displayName}</Text>
          </Pressable>
          <View style={styles.headerSide} />
        </View>

        <PinnedGame
          game={activeGame}
          friend={friend}
          myId={account.id}
          onPress={() => activeGame ? router.push(`/game/${activeGame.id}?fromChat=${friend.id}`) : setPickerOpen(true)}
        />

        <View style={styles.messagesArea} {...timestampPanResponder.panHandlers}>
          <ScrollView
            ref={scrollRef}
            style={styles.messages}
            contentContainerStyle={styles.messageContent}
            keyboardShouldPersistTaps="handled"
            onLayout={() => {
              if (messageInputFocused.current) scrollToLatest();
            }}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
          >
          {!messagesLoaded && (
            <View style={styles.emptyChat}>
              <Text style={styles.emptyChatText}>Loading messages…</Text>
            </View>
          )}
          {messagesLoaded && timelineItems.length === 0 && (
            <View style={styles.emptyChat}>
              <FontAwesome5 name="comment" size={24} color={colors.green} />
              <Text style={styles.emptyChatTitle}>Start the conversation</Text>
              <Text style={styles.emptyChatText}>Messages and game turns stay here with {friend.displayName}.</Text>
            </View>
          )}
          {timelineItems.map((item, groupIndex) => {
            const mine = item.senderId === account.id;
            const startsNewDay = groupIndex === 0 || timelineItems[groupIndex - 1].dayKey !== item.dayKey;
            return (
              <View key={item.key} style={styles.timelineGroup}>
                {startsNewDay && (
                  <View style={styles.dayDivider}>
                    <Text style={styles.dayDividerText}>{item.dayLabel}</Text>
                  </View>
                )}
                {item.entries.map((entry, index) => {
                  const grouped = index < item.entries.length - 1;
                  return (
                    <View key={entry.key} style={styles.timelineEntry}>
                      <Animated.View
                        style={[
                          styles.timelineEntryContent,
                          mine && styles.timelineEntryContentMine,
                          { transform: [{ translateX: timestampDrag }] },
                        ]}
                      >
                        {entry.kind === "game" ? (
                          <GameHistoryBubble
                            game={entry.game}
                            friend={friend}
                            myId={account.id}
                            event={entry.event}
                            grouped={grouped}
                          />
                        ) : (
                          <View
                            style={[
                              styles.bubble,
                              mine ? styles.bubbleMine : styles.bubbleTheirs,
                              grouped && styles.groupedBubble,
                            ]}
                          >
                            <Text style={[styles.messageText, mine && styles.messageTextMine]}>{entry.message.text}</Text>
                          </View>
                        )}
                      </Animated.View>
                      <Animated.View pointerEvents="none" style={[styles.revealedTimestamp, { opacity: timestampOpacity }]}>
                        <Text style={styles.revealedTimestampText}>{fullTimeLabel(entry.timestampMs)}</Text>
                      </Animated.View>
                    </View>
                  );
                })}
              </View>
            );
          })}
          </ScrollView>
        </View>

        {error && <Pressable style={styles.errorBar} onPress={() => load()}><Text style={styles.errorText}>{error}</Text></Pressable>}

        <View style={styles.composer}>
          <TextInput
            style={styles.messageInput}
            value={draft}
            onChangeText={setDraft}
            onFocus={() => {
              messageInputFocused.current = true;
              if (Keyboard.isVisible()) scrollToLatest();
            }}
            onBlur={() => { messageInputFocused.current = false; }}
            placeholder="Message"
            placeholderTextColor={colors.muted}
            multiline
            maxLength={1000}
          />
          <Pressable
            disabled={!draft.trim() || sending}
            style={[styles.sendButton, (!draft.trim() || sending) && styles.sendButtonDisabled]}
            onPress={submitMessage}
          >
            {sending ? <ActivityIndicator size="small" color={colors.background} /> : <FontAwesome5 name="arrow-up" size={17} color={colors.background} />}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function BackButton() {
  return <Pressable style={styles.headerSide} onPress={() => router.back()}><FontAwesome5 name="arrow-left" size={25} color={colors.green} /></Pressable>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  keyboard: { flex: 1 },
  center: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" },
  header: { height: 54, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  headerSide: { flex: 1, minHeight: 44, paddingLeft: 12, justifyContent: "center" },
  headerPerson: { flex: 4, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  headerName: { color: colors.text, fontSize: 17, fontWeight: "700", marginLeft: 8, textAlign: "center" },
  avatar: { width: 31, height: 31, borderRadius: 16, backgroundColor: colors.greenStrong, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  avatarInitial: { color: colors.background, fontWeight: "800" },
  avatarImage: { ...StyleSheet.absoluteFillObject, borderRadius: 16 },
  gameCard: { marginHorizontal: 8, marginTop: 8, minHeight: 88, borderRadius: 8, backgroundColor: colors.surface, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border },
  gameCardPressed: { backgroundColor: colors.surfaceRaised },
  gameCopy: { flex: 1 },
  gameEyebrow: { color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1.1 },
  gameTypeEyebrow: { color: colors.green },
  gameStatus: { color: colors.text, fontSize: 18, marginTop: 3 },
  gameStatusActive: { color: "#ABF0FF", fontWeight: "700" },
  gameDetail: { color: colors.muted, fontSize: 12, marginTop: 4 },
  miniBoard: { width: 62, height: 62, marginRight: 12, flexDirection: "row", flexWrap: "wrap" },
  miniCell: { width: "33.3333%", height: "33.3333%", alignItems: "center", justifyContent: "center", borderColor: colors.green },
  miniCellRight: { borderRightWidth: 1 },
  miniCellBottom: { borderBottomWidth: 1 },
  miniMark: { color: colors.green, fontSize: 17, lineHeight: 18 },
  wordMiniBoard: { width: 62, height: 62, marginRight: 12, overflow: "visible" },
  poolMiniPreview: { width: 62, height: 62, marginRight: 12, alignItems: "center", justifyContent: "center" },
  poolMiniTable: { position: "relative", width: POOL_MINI_WIDTH, height: POOL_MINI_HEIGHT, borderRadius: 6, borderWidth: POOL_MINI_RAIL, borderColor: "#5C3B29", backgroundColor: "#176B4D", overflow: "hidden" },
  poolMiniPocket: { position: "absolute", width: 6, height: 6, borderRadius: 3, backgroundColor: "#050505", zIndex: 2 },
  poolPocket0: { left: -2, top: -2 },
  poolPocket1: { right: -2, top: -2 },
  poolPocket2: { left: -2, top: POOL_MINI_HEIGHT / 2 - POOL_MINI_RAIL - 3 },
  poolPocket3: { right: -2, top: POOL_MINI_HEIGHT / 2 - POOL_MINI_RAIL - 3 },
  poolPocket4: { left: -2, bottom: -2 },
  poolPocket5: { right: -2, bottom: -2 },
  poolMiniBall: { position: "absolute", width: POOL_MINI_BALL, height: POOL_MINI_BALL, borderRadius: POOL_MINI_BALL / 2, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(0,0,0,0.5)" },
  numberMiniPreview: { width: 62, height: 62, marginRight: 12, borderRadius: 9, backgroundColor: "#142219", alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  numberMiniTarget: { color: colors.green, fontSize: 21, lineHeight: 23, fontWeight: "900" },
  numberMiniTiles: { flexDirection: "row", gap: 1.5, marginTop: 4 },
  numberMiniTile: { flex: 1, height: 10, borderRadius: 2, backgroundColor: colors.green, alignItems: "center", justifyContent: "center" },
  numberMiniTileText: { color: colors.background, fontSize: 4.8, fontWeight: "900" },
  chessMiniBoard: { width: 62, height: 62, marginRight: 12, borderRadius: 4, overflow: "hidden", flexDirection: "row", flexWrap: "wrap" },
  chessMiniCell: { width: 7.75, height: 7.75, alignItems: "center", justifyContent: "center" },
  chessMiniLight: { backgroundColor: "#B7E5BA" },
  chessMiniDark: { backgroundColor: "#477457" },
  chessMiniFogged: { backgroundColor: "#C9D6E1" },
  emptyGameIcon: { width: 62, height: 62, marginRight: 12, alignItems: "center", justifyContent: "center" },
  emptyX: { position: "absolute", left: 8, top: 1, color: colors.green, fontSize: 36, fontWeight: "200" },
  emptyO: { position: "absolute", right: 6, bottom: 0, color: colors.text, fontSize: 31, fontWeight: "200" },
  messagesArea: { flex: 1, overflow: "hidden" },
  messages: { flex: 1 },
  messageContent: { paddingHorizontal: 10, paddingTop: 16, paddingBottom: 12 },
  emptyChat: { alignItems: "center", paddingHorizontal: 40, paddingTop: 38 },
  emptyChatTitle: { color: colors.text, fontSize: 16, marginTop: 12 },
  emptyChatText: { color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 5 },
  timelineGroup: { width: "100%", marginBottom: 7 },
  timelineEntry: { position: "relative", width: "100%" },
  timelineEntryContent: { width: "100%", alignItems: "flex-start" },
  timelineEntryContentMine: { alignItems: "flex-end" },
  dayDivider: { width: "100%", alignItems: "center", paddingVertical: 8, marginBottom: 6 },
  dayDividerText: { color: colors.muted, fontSize: 10, fontWeight: "700", letterSpacing: 0.35 },
  revealedTimestamp: { position: "absolute", right: 2, top: 0, bottom: 0, width: 52, alignItems: "flex-end", justifyContent: "center" },
  revealedTimestampText: { color: colors.muted, fontSize: 10, fontVariant: ["tabular-nums"] },
  bubble: { maxWidth: "78%", borderRadius: 11, paddingHorizontal: 13, paddingVertical: 9 },
  groupedBubble: { marginBottom: 2 },
  bubbleMine: { backgroundColor: colors.green },
  bubbleTheirs: { backgroundColor: colors.surface },
  messageText: { color: colors.text, fontSize: 16, lineHeight: 21 },
  messageTextMine: { color: colors.background },
  gameHistoryItem: { width: "78%", minWidth: 230, minHeight: 56, paddingHorizontal: 11, paddingVertical: 9, borderRadius: 11, flexDirection: "row", alignItems: "center" },
  gameHistoryItemTheirs: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  gameHistoryItemMine: { backgroundColor: colors.green },
  gameHistoryItemPressed: { opacity: 0.82 },
  gameHistoryIcon: { width: 32, height: 32, borderRadius: 9, backgroundColor: colors.green, alignItems: "center", justifyContent: "center", marginRight: 10 },
  gameHistoryIconMine: { backgroundColor: colors.background },
  gameHistoryCopy: { flex: 1 },
  gameHistoryTitle: { color: colors.text, fontSize: 14, lineHeight: 18 },
  gameHistoryTitleMine: { color: colors.background },
  gameHistoryStrong: { fontWeight: "800" },
  gameHistoryResult: { color: colors.muted, fontSize: 11, marginTop: 2 },
  gameHistoryResultMine: { color: "rgba(0,0,0,0.62)" },
  errorBar: { paddingHorizontal: 12, paddingVertical: 7, backgroundColor: "#2A1717" },
  errorText: { color: "#EF4444", fontSize: 12, textAlign: "center" },
  composer: { minHeight: 62, paddingHorizontal: 10, paddingVertical: 8, flexDirection: "row", alignItems: "flex-end", gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  messageInput: { flex: 1, minHeight: 44, maxHeight: 120, borderRadius: 22, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 16, paddingTop: 11, paddingBottom: 10, fontSize: 16 },
  sendButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.green, alignItems: "center", justifyContent: "center" },
  sendButtonDisabled: { opacity: 0.35 },
  pageError: { color: "#EF4444", textAlign: "center", marginTop: 40 },
});
