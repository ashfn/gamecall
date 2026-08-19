import { FontAwesome5 } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getStoredAnonymousRefreshToken, useAnonymousGameStore } from "../../util/anonymousAuth";
import { prefix } from "../../util/config";
import { gameDisplayName, gameIconName, gameLobbyDetail } from "../../util/gameDisplay";
import { colors } from "../../util/theme";
import type { ApiResult, GameLobby, User } from "../../util/types";

interface JoinResult {
  gameId: number;
  status: string;
  accessToken: string;
  refreshToken: string;
  gameUser: User;
  lobby: GameLobby | null;
}

type InvitePreview = GameLobby | { id: number; status: Exclude<GameLobby["status"], "LOBBY"> | "STARTED" | "ENDED" | "ENDED_UNOPENED" | "CANCELLED" };

export default function JoinGameScreen() {
  const params = useLocalSearchParams<{ token: string | string[] }>();
  const token = Array.isArray(params.token) ? params.token[0] : params.token;
  const anonymous = useAnonymousGameStore((state) => state.gameUser);
  const initialize = useAnonymousGameStore((state) => state.initialize);
  const saveJoinedSession = useAnonymousGameStore((state) => state.saveJoinedSession);
  const [lobby, setLobby] = useState<GameLobby | null>(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void initialize(); }, [initialize]);
  useEffect(() => { if (anonymous) setName(anonymous.displayName); }, [anonymous]);
  useEffect(() => {
    if (!token) return;
    let active = true;
    const loadPreview = async () => {
      try {
        const response = await fetch(`${prefix}/game-invites/${encodeURIComponent(token)}`, {
          headers: { Accept: "application/json" },
        });
        const body = await response.text();
        let result: ApiResult<InvitePreview>;
        try {
          result = JSON.parse(body.trim()) as ApiResult<InvitePreview>;
        } catch {
          throw new Error(response.ok ? "Rainfrog returned an unreadable response" : `Rainfrog is unavailable (${response.status})`);
        }
        if (result.status !== 1 || !result.data) throw new Error(result.error ?? "This link is unavailable");
        if (result.data.status !== "LOBBY") {
          if (result.data.status === "CANCELLED") throw new Error("This game was cancelled");
          const storedSession = await getStoredAnonymousRefreshToken();
          if (!storedSession) throw new Error("This game has already started");
          router.replace(`/game/${result.data.id}?guest=1`);
          return;
        }
        if (active) setLobby(result.data);
      } catch (previewError) {
        if (active) setError(previewError instanceof Error ? previewError.message : "Could not open this game");
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadPreview();
    return () => { active = false; };
  }, [token]);

  const join = async () => {
    if (!token || joining) return;
    setJoining(true);
    setError(null);
    try {
      const anonymousRefreshToken = await getStoredAnonymousRefreshToken();
      const response = await fetch(`${prefix}/game-invites/${encodeURIComponent(token)}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: name, anonymousRefreshToken }),
      });
      const body = await response.text();
      let result: ApiResult<JoinResult>;
      try {
        result = JSON.parse(body.trim()) as ApiResult<JoinResult>;
      } catch {
        throw new Error(response.ok ? "Rainfrog returned an unreadable response" : `Could not join (${response.status})`);
      }
      if (result.status !== 1 || !result.data) throw new Error(result.error ?? "Could not join this game");
      await saveJoinedSession(result.data.accessToken, result.data.refreshToken, result.data.gameUser);
      router.replace(result.data.status === "STARTED" ? `/game/${result.data.gameId}?guest=1` : `/lobby/${result.data.gameId}`);
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "Could not join this game");
    } finally {
      setJoining(false);
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.green} size="large" /></View>;
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.brand}><Text style={styles.logo}>Rainfrog</Text><Text style={styles.tagline}>Play games with friends</Text></View>
      {lobby ? (
        <View style={styles.card}>
          <View style={styles.icon}><FontAwesome5 name={gameIconName(lobby.type)} size={24} color={colors.background} /></View>
          <Text style={styles.inviteTitle}>Join {gameDisplayName(lobby.type)}</Text>
          <Text style={styles.inviteDetail}>{gameLobbyDetail(lobby)}</Text>
          <Text style={styles.seats}>{lobby.players.length} joined · {lobby.maxPlayers - lobby.players.length} seats open</Text>
          <View style={styles.people}>{lobby.players.map((player) => <View key={player.id} style={styles.person}><View style={styles.avatar}><Text style={styles.avatarText}>{player.displayName.slice(0, 1).toUpperCase()}</Text></View><Text style={styles.personName}>{player.displayName}</Text></View>)}</View>
          {!anonymous && <TextInput value={name} onChangeText={setName} maxLength={30} placeholder="Your name" placeholderTextColor={colors.muted} autoCapitalize="words" style={styles.input} />}
          {anonymous && <Text style={styles.returning}>Joining as {anonymous.displayName}</Text>}
          {error && <Text style={styles.error}>{error}</Text>}
          <Pressable disabled={joining || (!anonymous && name.trim().length < 1)} style={[styles.join, (joining || (!anonymous && name.trim().length < 1)) && styles.disabled]} onPress={join}>{joining ? <ActivityIndicator color={colors.background} /> : <Text style={styles.joinText}>Join game</Text>}</Pressable>
        </View>
      ) : <View style={styles.card}><Text style={styles.error}>{error ?? "This game link is unavailable"}</Text></View>}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 20, justifyContent: "center" },
  center: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" },
  brand: { alignItems: "center", marginBottom: 30 },
  logo: { color: colors.green, fontSize: 34, fontWeight: "900", letterSpacing: -1.1 },
  tagline: { color: colors.muted, fontSize: 13, marginTop: 2 },
  card: { width: "100%", maxWidth: 440, alignSelf: "center", backgroundColor: colors.surface, borderRadius: 18, padding: 22, alignItems: "center" },
  icon: { width: 50, height: 50, borderRadius: 14, backgroundColor: colors.green, alignItems: "center", justifyContent: "center" },
  inviteTitle: { color: colors.text, fontSize: 25, fontWeight: "900", marginTop: 15 },
  inviteDetail: { color: colors.green, fontSize: 13, fontWeight: "800", marginTop: 4 },
  seats: { color: colors.muted, fontSize: 13, marginTop: 10 },
  people: { width: "100%", marginTop: 20, gap: 7 },
  person: { flexDirection: "row", alignItems: "center" },
  avatar: { width: 29, height: 29, borderRadius: 15, backgroundColor: colors.greenStrong, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.background, fontSize: 11, fontWeight: "900" },
  personName: { color: colors.text, fontSize: 14, marginLeft: 9 },
  input: { width: "100%", height: 52, borderRadius: 11, backgroundColor: colors.background, color: colors.text, fontSize: 16, paddingHorizontal: 15, marginTop: 24, borderWidth: 1, borderColor: colors.green },
  returning: { color: colors.muted, fontSize: 13, marginTop: 24 },
  join: { width: "100%", height: 54, borderRadius: 13, backgroundColor: colors.green, alignItems: "center", justifyContent: "center", marginTop: 14 },
  joinText: { color: colors.background, fontSize: 17, fontWeight: "900" },
  disabled: { opacity: 0.35 },
  error: { color: colors.red, fontSize: 13, textAlign: "center", marginTop: 14 },
});
