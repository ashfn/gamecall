import { FontAwesome5 } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { apiRequest } from "../util/api";
import { useAccountDetailsStore } from "../util/auth";
import { cacheChatPreview, getUnreadMessageCounts } from "../util/chat";
import { prefix } from "../util/config";
import { cacheGame, getCachedGames, getGame, hideFinishedGamesWithOpponent, listGames, rematch, resignGame, subscribeGameCache } from "../util/games";
import { cancelGameLobby, listGameLobbies } from "../util/gameLobbies";
import { gameDisplayName, gameIconName, gameLobbyDetail } from "../util/gameDisplay";
import {
  cacheInboxActivity,
  getCachedInboxActivities,
  listInboxActivities,
  mergeInboxActivities,
  subscribeInboxActivity,
} from "../util/inbox";
import { getRealtimeSocket, GameChangedEvent } from "../util/realtime";
import { colors } from "../util/theme";
import { timeAgo } from "../util/time";
import { ChatMessage, GameLobby, GameSession, User } from "../util/types";
import { GamePicker } from "../src/components/GamePicker";

interface Connections {
  friends: number[];
  requestsSent: number[];
  requestsReceived: number[];
  friendProfiles?: User[];
}

function latestGameWith(friendId: number, games: GameSession[]) {
  return games
    .filter((game) => game.opponent?.id === friendId)
    .reduce<GameSession | null>((latest, game) => {
      if (!latest) return game;
      return Date.parse(game.lastActivity) > Date.parse(latest.lastActivity) ? game : latest;
    }, null);
}

function interactionTime(interactionAt: string | undefined, game: GameSession | null) {
  const interactionValue = interactionAt ? Date.parse(interactionAt) : -1;
  const gameValue = game ? Date.parse(game.lastActivity) : -1;
  return Math.max(
    Number.isFinite(interactionValue) ? interactionValue : 0,
    Number.isFinite(gameValue) ? gameValue : 0,
  );
}

function gameName(game: GameSession) {
  if (game.type === "WORD_DROP") return `Word Drop${game.state.variant === "MINI" ? " Mini" : game.state.variant === "TEST" ? " Test" : ""}`;
  if (game.type === "EIGHT_BALL") return "8 Ball";
  if (game.type === "NUMBER_DROP") return "Number Drop";
  return game.type === "CHESS" ? "Chess" : "Tic Tac Toe";
}

function friendGameStatus(game: GameSession | null, userId: number, now: number, interactionAt?: string) {
  if (!game) return { label: "Send them a game", active: false };
  const displayTimestamp = interactionAt && Date.parse(interactionAt) > Date.parse(game.lastActivity)
    ? interactionAt
    : game.lastActivity;
  if (game.status === "STARTED") {
    return game.waitingOn === userId
      ? { label: `${gameName(game)} · ${timeAgo(displayTimestamp, now)}`, active: true }
      : { label: `Sent ${gameName(game)} · ${timeAgo(displayTimestamp, now)}`, active: false };
  }
  const result = game.winner === -1 ? "Drawn" : game.winner === userId ? "You won" : "You lost";
  return {
    label: `${result} · Choose another game`,
    active: false,
  };
}

function Avatar({ user, size = 60 }: { user: User; size?: number }) {
  const [failed, setFailed] = useState(false);
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={styles.avatarText}>{user.displayName.slice(0, 1).toUpperCase()}</Text>
      {!user.anonymous && !failed && (
        <Image
          source={{ uri: `${prefix}/profile/${user.id}/avatar` }}
          style={[StyleSheet.absoluteFillObject, { borderRadius: size / 2 }]}
          onError={() => setFailed(true)}
        />
      )}
    </View>
  );
}

function FriendRow({
  friend,
  game,
  interactionAt,
  userId,
  now,
  onPress,
  onChatPressIn,
  onChatPress,
  unreadCount,
  canChat,
  swipeAction,
}: {
  friend: User;
  game: GameSession | null;
  interactionAt?: string;
  userId: number;
  now: number;
  onPress: () => void;
  onChatPress: () => void;
  unreadCount: number;
  canChat: boolean;
  onChatPressIn: () => void;
  swipeAction: {
    label: string;
    icon: string;
    destructive?: boolean;
    onPress: () => void;
  } | null;
}) {
  const actionWidth = 84;
  const translateX = useRef(new Animated.Value(0)).current;
  const swipeOpen = useRef(false);
  const swipeStart = useRef(0);
  const settleSwipe = useCallback((open: boolean) => {
    swipeOpen.current = open;
    Animated.spring(translateX, {
      toValue: open ? -actionWidth : 0,
      speed: 28,
      bounciness: 0,
      useNativeDriver: true,
    }).start();
  }, [translateX]);
  const swipeResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_event, gesture) => Boolean(swipeAction)
      && Math.abs(gesture.dx) > 8
      && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.25,
    onPanResponderGrant: () => {
      swipeStart.current = swipeOpen.current ? -actionWidth : 0;
      translateX.stopAnimation();
    },
    onPanResponderMove: (_event, gesture) => {
      translateX.setValue(Math.max(-actionWidth, Math.min(0, swipeStart.current + gesture.dx)));
    },
    onPanResponderRelease: (_event, gesture) => {
      settleSwipe(swipeStart.current + gesture.dx < -actionWidth * 0.42);
    },
    onPanResponderTerminate: () => settleSwipe(swipeOpen.current),
    onPanResponderTerminationRequest: () => false,
  }), [settleSwipe, swipeAction, translateX]);
  const status = friendGameStatus(game, userId, now, interactionAt);
  return (
    <View style={styles.swipeRow} {...(swipeAction ? swipeResponder.panHandlers : {})}>
      {swipeAction && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={swipeAction.label}
          style={({ pressed }) => [
            styles.swipeAction,
            swipeAction.destructive && styles.swipeActionDestructive,
            pressed && styles.swipeActionPressed,
          ]}
          onPress={() => {
            settleSwipe(false);
            swipeAction.onPress();
          }}
        >
          <FontAwesome5 name={swipeAction.icon as never} size={17} color={colors.text} />
          <Text style={styles.swipeActionText}>{swipeAction.label}</Text>
        </Pressable>
      )}
      <Animated.View style={[styles.swipeForeground, { transform: [{ translateX }] }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${friend.displayName}. ${status.label}`}
          onPress={() => {
            if (swipeOpen.current) settleSwipe(false);
            else onPress();
          }}
          style={({ pressed }) => [styles.friendRow, pressed && styles.friendRowPressed]}
        >
          <Avatar user={friend} />
          <View style={styles.friendBody}>
            <Text style={styles.friendName} numberOfLines={1}>{friend.displayName}</Text>
            <Text style={[styles.friendStatus, status.active && styles.friendStatusActive]} numberOfLines={1}>
              {status.label}
            </Text>
          </View>
          {canChat ? <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open chat with ${friend.displayName}${unreadCount ? `, ${unreadCount} unread message${unreadCount === 1 ? "" : "s"}` : ""}`}
            hitSlop={8}
            style={({ pressed }) => [styles.chatButton, pressed && styles.chatButtonPressed]}
            onPressIn={(event) => {
              event.stopPropagation();
              onChatPressIn();
            }}
            onPress={(event) => {
              event.stopPropagation();
              onChatPress();
            }}
          >
            <View pointerEvents="none" style={styles.chatIconGraphic}>
              <FontAwesome5 name="comment" solid size={28} color={colors.green} style={styles.chatIconGlyph} />
              {unreadCount > 0 && (
                <View style={styles.unreadIconCountBody}>
                  <Text style={styles.unreadIconCount}>{unreadCount > 9 ? "9+" : unreadCount}</Text>
                </View>
              )}
            </View>
          </Pressable> : <View style={styles.rowChevron}><FontAwesome5 name="chevron-right" size={14} color={colors.muted} /></View>}
        </Pressable>
      </Animated.View>
    </View>
  );
}

function BlackRefreshSpinner({ visible }: { visible: boolean }) {
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      rotation.stopAnimation();
      rotation.setValue(0);
      return undefined;
    }
    const animation = Animated.loop(Animated.timing(rotation, {
      toValue: 1,
      duration: 650,
      easing: Easing.linear,
      useNativeDriver: true,
    }));
    animation.start();
    return () => animation.stop();
  }, [rotation, visible]);

  if (!visible) return null;
  const rotate = rotation.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  return (
    <View pointerEvents="none" style={styles.refreshSpinnerHost}>
      <Animated.View style={[styles.refreshSpinner, { transform: [{ rotate }] }]} />
    </View>
  );
}

export default function HomeScreen() {
  const account = useAccountDetailsStore((state) => state.account);
  const initialized = useAccountDetailsStore((state) => state.initialized);
  const [friends, setFriends] = useState<User[]>([]);
  const [games, setGames] = useState<GameSession[]>(() => account ? getCachedGames(account.id) : []);
  const [lobbies, setLobbies] = useState<GameLobby[]>([]);
  const [cancellingLobbyIds, setCancellingLobbyIds] = useState<Set<number>>(() => new Set());
  const [interactionByFriend, setInteractionByFriend] = useState<Record<string, string>>(
    () => account ? getCachedInboxActivities(account.id) : {},
  );
  const [requestCount, setRequestCount] = useState(0);
  const [unreadMessageCounts, setUnreadMessageCounts] = useState<Record<string, number>>({});
  const [selectedFriend, setSelectedFriend] = useState<User | null>(null);
  const [selectedSourceGame, setSelectedSourceGame] = useState<GameSession | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const scrollY = useRef(0);
  const touchStartY = useRef<number | null>(null);
  const pullDistance = useRef(0);
  const refreshInFlight = useRef(false);
  const refreshHold = useRef(new Animated.Value(0)).current;
  const [pulling, setPulling] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const load = useCallback(async () => {
    if (!useAccountDetailsStore.getState().account) return;
    try {
      const [connections, nextGames, nextUnreadMessageCounts, nextInboxActivities, nextLobbies] = await Promise.all([
        apiRequest<Connections>(`${prefix}/connections?profiles=1`),
        listGames(useAccountDetailsStore.getState().account?.id),
        getUnreadMessageCounts(),
        listInboxActivities().catch(() => ({})),
        listGameLobbies().catch(() => []),
      ]);
      const profiles = connections.friendProfiles ?? [];
      setFriends(profiles.filter(Boolean));
      setGames(nextGames);
      setInteractionByFriend(mergeInboxActivities(useAccountDetailsStore.getState().account!.id, nextInboxActivities));
      setRequestCount(connections.requestsReceived.length);
      setUnreadMessageCounts(nextUnreadMessageCounts);
      setLobbies(nextLobbies);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not refresh your friends");
    } finally {
      setLoadedOnce(true);
    }
  }, []);

  useEffect(() => {
    if (!account) return undefined;
    setGames(getCachedGames(account.id));
    setInteractionByFriend(getCachedInboxActivities(account.id));
    const unsubscribeGames = subscribeGameCache(account.id, (updated) => {
      setGames((current) => {
        const index = current.findIndex((game) => game.id === updated.id);
        if (index < 0) return [updated, ...current];
        if (current[index] === updated) return current;
        const next = [...current];
        next[index] = updated;
        return next;
      });
      cacheInboxActivity(account.id, updated.opponent.id, updated.lastActivity);
    });
    const unsubscribeActivity = subscribeInboxActivity(account.id, (friendId, timestamp) => {
      setInteractionByFriend((current) => {
        const key = String(friendId);
        if (timestamp) return current[key] === timestamp ? current : { ...current, [key]: timestamp };
        if (!(key in current)) return current;
        const next = { ...current };
        delete next[key];
        return next;
      });
    });
    return () => {
      unsubscribeGames();
      unsubscribeActivity();
    };
  }, [account]);

  const refresh = useCallback(async () => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    setRefreshing(true);
    refreshHold.stopAnimation();
    Animated.timing(refreshHold, {
      toValue: 42,
      duration: 120,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    try {
      await load();
    } finally {
      setRefreshing(false);
      refreshInFlight.current = false;
      Animated.timing(refreshHold, {
        toValue: 0,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  }, [load, refreshHold]);

  const finishPull = useCallback(() => {
    const shouldRefresh = pullDistance.current >= 58 || scrollY.current <= -58;
    touchStartY.current = null;
    pullDistance.current = 0;
    setPulling(false);
    if (shouldRefresh) void refresh();
  }, [refresh]);

  useFocusEffect(useCallback(() => { void load(); }, [load, account?.id]));
  useFocusEffect(useCallback(() => {
    if (!account) return undefined;
    let active = true;
    let realtime: Awaited<ReturnType<typeof getRealtimeSocket>> | null = null;
    const onGameChanged = (change: GameChangedEvent) => {
      const viewerGameUserId = account.gameUserId ?? account.id;
      if (!change.playerIds.includes(viewerGameUserId)) return;
      if (change.status === "LOBBY") {
        void listGameLobbies().then(setLobbies).catch(() => undefined);
        return;
      }
      setLobbies((current) => current.filter((lobby) => lobby.id !== change.gameId));
      if (change.status === "CANCELLED") return;
      const friendId = change.playerIds.find((id) => id !== viewerGameUserId);
      if (!friendId) return;
      cacheInboxActivity(account.id, friendId, change.changedAt);
      // The socket already tells us exactly which game changed. Fetch that
      // game only; reloading friends, requests, unread counts and every other
      // game multiplied both payload and database work for every move.
      void getGame(change.gameId, account.id).catch(() => load());
    };
    const onChatMessage = (message: ChatMessage) => {
      if (message.recipientId !== account.id) return;
      cacheInboxActivity(account.id, message.senderId, message.createdAt);
      setUnreadMessageCounts((current) => ({
        ...current,
        [String(message.senderId)]: (current[String(message.senderId)] ?? 0) + 1,
      }));
    };

    void getRealtimeSocket().then((next) => {
      if (!active) return;
      realtime = next;
      realtime.on("game:changed", onGameChanged);
      realtime.on("chat:message", onChatMessage);
    }).catch(() => {
      // Focus and pull-to-refresh remain available if the live connection is offline.
    });

    return () => {
      active = false;
      realtime?.off("game:changed", onGameChanged);
      realtime?.off("chat:message", onChatMessage);
    };
  }, [account, load]));

  const rows = useMemo(() => {
    const people = new Map(friends.map((friend) => [friend.id, friend]));
    games.forEach((game) => {
      if (game.opponent?.id && !people.has(game.opponent.id)) people.set(game.opponent.id, game.opponent);
    });
    return [...people.values()].map((friend) => ({
      friend,
      game: latestGameWith(friend.id, games),
      interactionAt: interactionByFriend[String(friend.id)],
    })).sort((left, right) => {
    const activityDifference = interactionTime(right.interactionAt, right.game) - interactionTime(left.interactionAt, left.game);
    if (activityDifference !== 0) return activityDifference;
    return left.friend.displayName.localeCompare(right.friend.displayName);
    });
  }, [friends, games, interactionByFriend]);

  const cancelLobby = useCallback((lobby: GameLobby) => {
    Alert.alert(
      "Cancel this game?",
      "The link will stop working and everyone in the lobby will be removed.",
      [
        { text: "Keep game", style: "cancel" },
        {
          text: "Cancel game",
          style: "destructive",
          onPress: () => {
            setLobbies((current) => current.filter((item) => item.id !== lobby.id));
            setCancellingLobbyIds((current) => new Set(current).add(lobby.id));
            void cancelGameLobby(lobby.id).catch((cancelError) => {
              setLobbies((current) => current.some((item) => item.id === lobby.id) ? current : [lobby, ...current]);
              setError(cancelError instanceof Error ? cancelError.message : "Could not cancel this game");
            }).finally(() => {
              setCancellingLobbyIds((current) => {
                const next = new Set(current);
                next.delete(lobby.id);
                return next;
              });
            });
          },
        },
      ],
    );
  }, []);

  const endAnonymousGame = useCallback((game: GameSession) => {
    Alert.alert("End this game?", "This counts as leaving the game and gives the other player the win.", [
      { text: "Keep playing", style: "cancel" },
      {
        text: "End game",
        style: "destructive",
        onPress: () => {
          void resignGame(game.id, account?.id).then((updated) => {
            setGames((current) => current.map((item) => item.id === updated.id ? updated : item));
          }).catch((endError) => {
            setError(endError instanceof Error ? endError.message : "Could not end this game");
          });
        },
      },
    ]);
  }, [account?.id]);

  const removeAnonymousGames = useCallback((opponent: User) => {
    Alert.alert("Remove this player?", "All finished games with this online player will disappear from your activity list.", [
      { text: "Keep", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          let removedGames: GameSession[] = [];
          setGames((current) => {
            removedGames = current.filter((item) => (
              item.opponent.id === opponent.id && item.status !== "STARTED"
            ));
            return current.filter((item) => !removedGames.some((removed) => removed.id === item.id));
          });
          void hideFinishedGamesWithOpponent(opponent.id, account?.id).catch((removeError) => {
            setGames((current) => {
              const presentIds = new Set(current.map((item) => item.id));
              return [...removedGames.filter((item) => !presentIds.has(item.id)), ...current];
            });
            setError(removeError instanceof Error ? removeError.message : "Could not remove this game");
          });
        },
      },
    ]);
  }, [account?.id]);

  if (!initialized) {
    return <View style={styles.center}><ActivityIndicator color={colors.green} size="large" /></View>;
  }

  if (!account) {
    return (
      <SafeAreaView style={styles.welcome}>
        <View style={styles.welcomeBrand}>
          <Text style={styles.welcomeTitle}>Rainfrog</Text>
          <Text style={styles.welcomeSubtitle}>Play games with friends</Text>
        </View>
        <View style={styles.welcomeActions}>
          <Pressable
            style={({ pressed }) => [styles.welcomeButton, styles.welcomeLoginButton, pressed && styles.welcomeButtonPressed]}
            onPress={() => router.push("/login")}
          >
            <Text style={styles.welcomeLoginText}>Log in</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.welcomeButton, styles.welcomeSignupButton, pressed && styles.welcomeButtonPressed]}
            onPress={() => router.push("/register")}
          >
            <Text style={styles.welcomeSignupText}>Sign up</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }
  const viewerId = account.id;

  function openFriend(friend: User, game: GameSession | null) {
    if (game?.status === "STARTED") router.push(`/game/${game.id}`);
    else {
      setSelectedFriend(friend);
      setSelectedSourceGame(friend.anonymous ? game : null);
    }
  }

  function closeGamePicker() {
    setSelectedFriend(null);
    setSelectedSourceGame(null);
  }

  function openStartedGame(started: GameSession) {
    closeGamePicker();
    cacheGame(viewerId, started);
    setGames((current) => [started, ...current.filter((item) => item.id !== started.id)]);
    router.push(`/game/${started.id}`);
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <GamePicker
        friend={selectedFriend}
        visible={selectedFriend !== null}
        onClose={closeGamePicker}
        onChoose={selectedSourceGame ? async (choice) => {
          openStartedGame(await rematch(selectedSourceGame.id, account.id, choice));
        } : undefined}
        onStarted={openStartedGame}
        submitLabel={selectedSourceGame ? "Play" : undefined}
      />
      <View style={styles.header}>
        <Pressable accessibilityLabel="Friend requests" style={styles.headerColumn} onPress={() => router.push("/friends")}>
          <View style={styles.friendIconWrap}>
            <FontAwesome5 name="user-friends" size={22} color={colors.green} />
            {requestCount > 0 && <Text style={styles.badgeText}>{requestCount > 9 ? "9+" : requestCount}</Text>}
          </View>
        </Pressable>
        <Text style={styles.logo}>Rainfrog</Text>
        <Pressable accessibilityLabel="Profile" style={[styles.headerColumn, styles.profileColumn]} onPress={() => router.push("/settings")}>
          <View style={styles.profileAvatar}><Text style={styles.profileInitial}>{account.displayName.slice(0, 1).toUpperCase()}</Text></View>
        </Pressable>
      </View>
      <View style={styles.scrollBackdrop}>
        <ScrollView
          style={styles.friendScroll}
          contentContainerStyle={styles.friendScrollContent}
          scrollEnabled={!refreshing}
          scrollEventThrottle={16}
          onScroll={(event) => {
            scrollY.current = event.nativeEvent.contentOffset.y;
            if (scrollY.current < -8) setPulling(true);
          }}
          onTouchStart={(event) => {
            touchStartY.current = scrollY.current <= 0 ? event.nativeEvent.pageY : null;
            pullDistance.current = 0;
          }}
          onTouchMove={(event) => {
            if (touchStartY.current === null || scrollY.current > 0) return;
            pullDistance.current = Math.max(0, event.nativeEvent.pageY - touchStartY.current);
            if (pullDistance.current > 8) setPulling(true);
          }}
          onTouchEnd={finishPull}
          onScrollEndDrag={finishPull}
        >
          <Animated.View style={[styles.content, { transform: [{ translateY: refreshHold }] }]}>
            {error && <Pressable style={styles.errorRow} onPress={load}><Text style={styles.errorText}>{error} Tap to retry.</Text></Pressable>}
            {!loadedOnce && !error && <ActivityIndicator style={styles.loading} color={colors.green} size="large" />}
            {lobbies.map((lobby) => (
              <Pressable key={`lobby-${lobby.id}`} style={({ pressed }) => [styles.lobbyRow, pressed && styles.friendRowPressed]} onPress={() => router.push(`/lobby/${lobby.id}`)}>
                <View style={styles.lobbyIcon}><FontAwesome5 name={gameIconName(lobby.type)} size={18} color={colors.background} /></View>
                <View style={styles.friendBody}>
                  <Text style={styles.friendName}>{gameDisplayName(lobby.type)}</Text>
                  <Text style={styles.lobbyStatus}>{gameLobbyDetail(lobby)} · {lobby.players.length} of {lobby.maxPlayers} joined · {lobby.players.length >= lobby.minPlayers ? "Ready to start" : "Waiting for players"}</Text>
                </View>
                {lobby.createdByAccountId === account.id ? (
                  <Pressable
                    accessibilityLabel="Cancel pending game"
                    hitSlop={10}
                    disabled={cancellingLobbyIds.has(lobby.id)}
                    style={({ pressed }) => [styles.cancelLobbyButton, pressed && styles.chatButtonPressed]}
                    onPress={(event) => {
                      event.stopPropagation();
                      cancelLobby(lobby);
                    }}
                  >
                    {cancellingLobbyIds.has(lobby.id)
                      ? <ActivityIndicator size="small" color={colors.muted} />
                      : <FontAwesome5 name="times" size={16} color={colors.muted} />}
                  </Pressable>
                ) : <FontAwesome5 name="chevron-right" size={14} color={colors.muted} />}
              </Pressable>
            ))}
            {loadedOnce && rows.length === 0 && lobbies.length === 0 && !error && (
              <Pressable style={styles.emptyState} onPress={() => router.push("/friends")}>
                <Text style={styles.emptyTitle}>No friends yet</Text>
                <Text style={styles.emptyText}>Tap here to find someone to play.</Text>
              </Pressable>
            )}
            {rows.map(({ friend, game, interactionAt }) => (
              <FriendRow
                key={friend.id}
                friend={friend}
                game={game}
                interactionAt={interactionAt}
                userId={account.id}
                now={now}
                unreadCount={unreadMessageCounts[String(friend.id)] ?? 0}
                canChat={!friend.anonymous}
                onChatPressIn={() => {
                  cacheChatPreview(account.id, friend, game);
                  router.prefetch(`/chat/${friend.id}`);
                }}
                swipeAction={friend.anonymous && game?.status === "STARTED" ? {
                  label: "End game",
                  icon: "flag",
                  destructive: true,
                  onPress: () => endAnonymousGame(game),
                } : friend.anonymous && game ? {
                  label: "Remove",
                  icon: "trash-alt",
                  destructive: true,
                  onPress: () => removeAnonymousGames(friend),
                } : null}
                onPress={() => openFriend(friend, game)}
                onChatPress={() => {
                  router.push(`/chat/${friend.id}`);
                  // Accessibility activation may not emit onPressIn. The
                  // navigation action is queued, so this still reaches the
                  // destination cache before the chat screen reads it.
                  cacheChatPreview(account.id, friend, game);
                }}
              />
            ))}
          </Animated.View>
        </ScrollView>
        <BlackRefreshSpinner visible={refreshing || pulling} />
        <Pressable accessibilityLabel="Create a game or group" style={({ pressed }) => [styles.composeButton, pressed && styles.composeButtonPressed]} onPress={() => router.push("/create-game")}>
          <FontAwesome5 name="pen" size={19} color={colors.background} />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" },
  header: { height: 50, paddingHorizontal: 8, flexDirection: "row", alignItems: "center" },
  headerColumn: { flex: 1, minHeight: 44, justifyContent: "center", paddingLeft: 16 },
  profileColumn: { alignItems: "flex-end", paddingLeft: 0, paddingRight: 8 },
  friendIconWrap: { width: 35 },
  badgeText: { position: "absolute", right: -2, top: -9, color: colors.green, fontSize: 11, fontWeight: "800" },
  logo: { flex: 1, color: colors.green, fontSize: 24, lineHeight: 29, fontWeight: "900", letterSpacing: -0.8, textAlign: "center" },
  profileAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.greenStrong, alignItems: "center", justifyContent: "center" },
  profileInitial: { color: colors.background, fontSize: 13, fontWeight: "800" },
  scrollBackdrop: { flex: 1, backgroundColor: colors.green },
  refreshSpinnerHost: { position: "absolute", top: 7, left: 0, right: 0, zIndex: 10, alignItems: "center" },
  refreshSpinner: { width: 20, height: 20, borderRadius: 10, borderWidth: 2.5, borderColor: colors.black, borderTopColor: "transparent" },
  friendScroll: { flex: 1, backgroundColor: colors.green },
  friendScrollContent: { flexGrow: 1 },
  content: { minHeight: "100%", paddingHorizontal: 4, paddingTop: 8, paddingBottom: 160, backgroundColor: colors.background },
  swipeRow: { minHeight: 76, borderRadius: 6, overflow: "hidden", backgroundColor: colors.surface },
  swipeForeground: { minHeight: 76, backgroundColor: colors.background },
  swipeAction: { position: "absolute", top: 0, right: 0, bottom: 0, width: 84, backgroundColor: "#245C45", alignItems: "center", justifyContent: "center", gap: 5 },
  swipeActionDestructive: { backgroundColor: "#702B2B" },
  swipeActionPressed: { opacity: 0.76 },
  swipeActionText: { color: colors.text, fontSize: 11, lineHeight: 13, fontWeight: "800", textAlign: "center" },
  friendRow: { minHeight: 76, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 8, flexDirection: "row", alignItems: "center", backgroundColor: colors.background },
  friendRowPressed: { backgroundColor: "#0F0F0F" },
  lobbyRow: { minHeight: 72, marginHorizontal: 4, marginBottom: 4, borderRadius: 9, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", backgroundColor: colors.surface },
  lobbyIcon: { width: 42, height: 42, borderRadius: 11, backgroundColor: colors.green, alignItems: "center", justifyContent: "center" },
  lobbyStatus: { color: colors.green, fontSize: 13, marginTop: 3 },
  avatar: { backgroundColor: colors.greenStrong, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarText: { color: colors.background, fontSize: 20, fontWeight: "800" },
  friendBody: { flex: 1, paddingLeft: 10 },
  friendName: { color: colors.text, fontSize: 18 },
  friendStatus: { color: colors.muted, fontSize: 14, marginTop: 2 },
  friendStatusActive: { color: "#ABF0FF", fontWeight: "700" },
  chatButton: { position: "relative", width: 46, height: 46, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  chatButtonPressed: { backgroundColor: colors.surface },
  rowChevron: { width: 46, height: 46, alignItems: "center", justifyContent: "center" },
  cancelLobbyButton: { width: 44, height: 44, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  chatIconGraphic: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  chatIconGlyph: { width: 28, height: 28, lineHeight: 28, textAlign: "center" },
  unreadIconCountBody: { position: "absolute", top: 1, left: 0, right: 0, height: 25, alignItems: "center", justifyContent: "center" },
  unreadIconCount: { color: colors.black, fontSize: 11, lineHeight: 13, fontWeight: "900", letterSpacing: -0.65, includeFontPadding: false, textAlign: "center" },
  errorRow: { marginHorizontal: 8, marginBottom: 8, padding: 12, borderRadius: 6, backgroundColor: colors.surface },
  errorText: { color: "#EF4444", fontSize: 13 },
  loading: { marginTop: 50 },
  emptyState: { margin: 20, padding: 20, borderWidth: 1, borderColor: colors.green, borderRadius: 8, alignItems: "center" },
  emptyTitle: { color: colors.green, fontSize: 18 },
  emptyText: { color: colors.muted, fontSize: 14, marginTop: 6 },
  composeButton: { position: "absolute", right: 18, bottom: 22, width: 57, height: 57, borderRadius: 29, backgroundColor: colors.green, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 9, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  composeButtonPressed: { transform: [{ scale: 0.95 }], opacity: 0.88 },
  welcome: { flex: 1, backgroundColor: colors.green, paddingHorizontal: 24 },
  welcomeBrand: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 28 },
  welcomeTitle: { color: colors.background, textAlign: "center", fontSize: 46, lineHeight: 52, fontWeight: "900", letterSpacing: -1.6 },
  welcomeSubtitle: { marginTop: 5, color: "#254229", textAlign: "center", fontSize: 17, lineHeight: 23, fontWeight: "600" },
  welcomeActions: { gap: 12, paddingBottom: 22 },
  welcomeButton: { height: 56, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  welcomeLoginButton: { backgroundColor: colors.background },
  welcomeSignupButton: { borderWidth: 2, borderColor: colors.background, backgroundColor: "rgba(255,255,255,0.12)" },
  welcomeButtonPressed: { opacity: 0.78 },
  welcomeLoginText: { color: colors.white, fontSize: 17, fontWeight: "800" },
  welcomeSignupText: { color: colors.background, fontSize: 17, fontWeight: "800" },
});
