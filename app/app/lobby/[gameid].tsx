import { FontAwesome5 } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, Share, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAccountDetailsStore } from "../../util/auth";
import { gameDisplayName, gameLobbyDetail } from "../../util/gameDisplay";
import { cancelGameLobby, getGameLobby, getStoredInviteToken, inviteUrl, startGameLobby } from "../../util/gameLobbies";
import { GameChangedEvent, getRealtimeSocket } from "../../util/realtime";
import { colors } from "../../util/theme";
import type { GameLobby } from "../../util/types";

export default function LobbyScreen() {
  const params = useLocalSearchParams<{ gameid: string; inviteToken?: string }>();
  const gameId = Number(params.gameid);
  const account = useAccountDetailsStore((state) => state.account);
  const [lobby, setLobby] = useState<GameLobby | null>(null);
  const [inviteToken, setInviteToken] = useState(params.inviteToken ?? null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!Number.isInteger(gameId) || gameId <= 0) return;
    try {
      const result = await getGameLobby(gameId);
      if (result.status === "STARTED" || result.status === "ENDED" || result.status === "ENDED_UNOPENED") {
        router.replace(`/game/${gameId}`);
        return;
      }
      if (result.status === "CANCELLED") {
        setLobby(null);
        setError("This game was cancelled");
        return;
      }
      if (!result.lobby) throw new Error("Lobby not found");
      setLobby(result.lobby);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load this lobby");
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => {
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
  }, []);
  useEffect(() => {
    if (inviteToken) return;
    void getStoredInviteToken(gameId).then(setInviteToken);
  }, [gameId, inviteToken]);
  useEffect(() => {
    let active = true;
    let socket: Awaited<ReturnType<typeof getRealtimeSocket>> | null = null;
    const changed = (event: GameChangedEvent) => {
      if (event.gameId !== gameId) return;
      if (event.status === "STARTED") router.replace(`/game/${gameId}`);
      else if (event.status === "CANCELLED") {
        setLobby(null);
        setError("This game was cancelled");
        if (account) router.replace("/");
      } else void load();
    };
    void getRealtimeSocket().then((next) => {
      if (!active) return;
      socket = next;
      socket.on("game:changed", changed);
    }).catch(() => undefined);
    const poll = setInterval(() => void load(), 5000);
    return () => {
      active = false;
      clearInterval(poll);
      socket?.off("game:changed", changed);
    };
  }, [account, gameId, load]);

  const share = async () => {
    if (!inviteToken) return;
    const url = inviteUrl(inviteToken);
    await Share.share({ message: `Join my ${lobby ? gameDisplayName(lobby.type) : "game"} on Rainfrog: ${url}`, url });
  };

  const copy = async () => {
    if (!inviteToken) return;
    await Clipboard.setStringAsync(inviteUrl(inviteToken));
    setCopied(true);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 1800);
  };

  const start = async () => {
    if (starting) return;
    setStarting(true);
    setError(null);
    try {
      await startGameLobby(gameId);
      router.replace(`/game/${gameId}`);
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "Could not start this game");
    } finally {
      setStarting(false);
    }
  };

  const cancel = () => {
    if (cancelling) return;
    Alert.alert(
      "Cancel this game?",
      "The invite link will stop working for everyone.",
      [
        { text: "Keep game", style: "cancel" },
        {
          text: "Cancel game",
          style: "destructive",
          onPress: () => {
            setCancelling(true);
            setError(null);
            void cancelGameLobby(gameId).then(() => router.replace("/")).catch((cancelError) => {
              setError(cancelError instanceof Error ? cancelError.message : "Could not cancel this game");
            }).finally(() => setCancelling(false));
          },
        },
      ],
    );
  };

  const host = Boolean(account && lobby?.createdByAccountId === account.id);
  if (loading && !lobby) return <View style={styles.center}><ActivityIndicator color={colors.green} size="large" /></View>;

  return (
    <SafeAreaView style={styles.screen} edges={["top", "right", "bottom", "left"]}>
      <View style={styles.header}>
        <Pressable style={styles.headerButton} onPress={() => account ? router.replace("/") : router.back()}>
          <FontAwesome5 name="arrow-left" size={24} color={colors.green} />
        </Pressable>
        <Text style={styles.headerTitle}>{lobby ? `${gameDisplayName(lobby.type)} lobby` : "Game lobby"}</Text>
        {host ? (
          <Pressable
            accessibilityLabel="Cancel game"
            disabled={cancelling || starting}
            hitSlop={8}
            style={({ pressed }) => [styles.headerCancel, pressed && styles.pressed, (cancelling || starting) && styles.disabled]}
            onPress={cancel}
          >
            {cancelling ? <ActivityIndicator size="small" color={colors.red} /> : <Text style={styles.headerCancelText}>Cancel</Text>}
          </Pressable>
        ) : <View style={styles.headerButton} />}
      </View>
      {lobby ? (
        <View style={styles.body}>
          <Text style={styles.variant}>{gameLobbyDetail(lobby).toUpperCase()}</Text>
          <Text style={styles.count}>{lobby.players.length} <Text style={styles.countMuted}>of {lobby.maxPlayers} joined</Text></Text>
          <Text style={styles.status}>{lobby.players.length < lobby.minPlayers ? "Waiting for another player" : host ? `Ready to start with ${lobby.players.length}` : "Waiting for the host to start"}</Text>
          <View style={styles.players}>
            {lobby.players.map((player, index) => (
              <View key={player.id} style={styles.player}>
                <View style={styles.avatar}><Text style={styles.avatarText}>{player.displayName.slice(0, 1).toUpperCase()}</Text></View>
                <View style={styles.playerCopy}>
                  <Text style={styles.playerName}>{player.displayName}</Text>
                  <Text style={styles.playerDetail}>{index === 0 ? "Host" : player.anonymous ? "Playing on web" : "Joined"}</Text>
                </View>
              </View>
            ))}
            {Array.from({ length: Math.max(0, lobby.maxPlayers - lobby.players.length) }, (_, index) => (
              <View key={`open-${index}`} style={styles.openSeat}><FontAwesome5 name="plus" size={14} color={colors.muted} /><Text style={styles.openText}>Open seat</Text></View>
            ))}
          </View>
          {error && <Text style={styles.error}>{error}</Text>}
        </View>
      ) : <Text style={styles.error}>{error ?? "Lobby not found"}</Text>}
      <View style={styles.actions}>
        {host && inviteToken && (
          <View style={styles.linkActions}>
            <Pressable
              accessibilityLabel={copied ? "Link copied" : "Copy game link"}
              accessibilityRole="button"
              style={({ pressed }) => [styles.copyButton, copied && styles.copyButtonCopied, pressed && styles.pressed]}
              onPress={copy}
            >
              <FontAwesome5 name={copied ? "check" : "copy"} size={18} color={copied ? colors.background : colors.green} />
            </Pressable>
            <Pressable
              accessibilityLabel="Share game link"
              accessibilityRole="button"
              style={({ pressed }) => [styles.shareButton, pressed && styles.pressed]}
              onPress={share}
            >
              <FontAwesome5 name="share-alt" size={17} color={colors.green} />
              <Text style={styles.shareButtonText}>Share link</Text>
            </Pressable>
          </View>
        )}
        {host && <Pressable disabled={!lobby || lobby.players.length < lobby.minPlayers || starting} style={[styles.primary, (!lobby || lobby.players.length < lobby.minPlayers || starting) && styles.disabled]} onPress={start}>{starting ? <ActivityIndicator color={colors.background} /> : <Text style={styles.primaryText}>{lobby && lobby.players.length >= lobby.maxPlayers ? "Start game" : `Start with ${lobby?.players.length ?? 1}`}</Text>}</Pressable>}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 16 },
  center: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" },
  header: { height: 54, flexDirection: "row", alignItems: "center", justifyContent: "space-between", position: "relative" },
  headerButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { position: "absolute", left: 56, right: 56, color: colors.text, fontSize: 18, fontWeight: "800", textAlign: "center" },
  headerCancel: { minWidth: 56, height: 44, paddingHorizontal: 4, alignItems: "flex-end", justifyContent: "center" },
  headerCancelText: { color: colors.red, fontSize: 14, fontWeight: "800" },
  body: { flex: 1, paddingTop: 40, alignItems: "center" },
  variant: { color: colors.green, fontSize: 12, letterSpacing: 1.6, fontWeight: "900" },
  count: { color: colors.text, fontSize: 42, fontWeight: "900", marginTop: 10 },
  countMuted: { color: colors.muted, fontSize: 24 },
  status: { color: colors.muted, fontSize: 15, marginTop: 4 },
  players: { width: "100%", maxWidth: 480, marginTop: 32, gap: 7 },
  player: { height: 62, borderRadius: 11, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", paddingHorizontal: 11 },
  avatar: { width: 39, height: 39, borderRadius: 20, backgroundColor: colors.greenStrong, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.background, fontSize: 15, fontWeight: "900" },
  playerCopy: { marginLeft: 11 },
  playerName: { color: colors.text, fontSize: 16, fontWeight: "700" },
  playerDetail: { color: colors.muted, fontSize: 11, marginTop: 2 },
  openSeat: { height: 48, borderRadius: 11, borderWidth: 1, borderColor: colors.surface, flexDirection: "row", gap: 8, alignItems: "center", paddingHorizontal: 16 },
  openText: { color: colors.muted, fontSize: 13 },
  actions: { gap: 9, paddingBottom: 10 },
  linkActions: { height: 52, flexDirection: "row", gap: 9 },
  copyButton: { width: 52, height: 52, borderRadius: 13, borderWidth: 1, borderColor: colors.green, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  copyButtonCopied: { backgroundColor: colors.green },
  shareButton: { flex: 1, height: 52, borderRadius: 13, borderWidth: 1, borderColor: colors.green, backgroundColor: colors.surface, flexDirection: "row", gap: 9, alignItems: "center", justifyContent: "center" },
  shareButtonText: { color: colors.green, fontSize: 16, fontWeight: "800" },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  primary: { height: 56, borderRadius: 14, backgroundColor: colors.green, alignItems: "center", justifyContent: "center" },
  primaryText: { color: colors.background, fontSize: 17, fontWeight: "900" },
  disabled: { opacity: 0.35 },
  error: { color: colors.red, fontSize: 13, marginTop: 18, textAlign: "center" },
});
