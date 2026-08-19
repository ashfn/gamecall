import { useLocalSearchParams } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import GameWrapper from "../../src/games/GameWrapper";
import { useAccountDetailsStore } from "../../util/auth";
import { useAnonymousGameStore } from "../../util/anonymousAuth";
import { useEffect } from "react";
import { colors } from "../../util/theme";

export default function GameScreen() {
  const { gameid, fromChat, guest } = useLocalSearchParams<{ gameid: string; fromChat?: string; guest?: string }>();
  const account = useAccountDetailsStore((state) => state.account);
  const anonymous = useAnonymousGameStore((state) => state.gameUser);
  const anonymousInitialized = useAnonymousGameStore((state) => state.initialized);
  const initializeAnonymous = useAnonymousGameStore((state) => state.initialize);
  const gameId = Number(gameid);
  const returnToChatId = Number(fromChat);
  useEffect(() => { if (!account && !anonymousInitialized) void initializeAnonymous(); }, [account, anonymousInitialized, guest, initializeAnonymous]);
  const identity = account
    ? { ...account, accountId: account.id, id: account.gameUserId ?? account.id }
    : anonymous;

  if (!identity) return <View style={styles.center}><ActivityIndicator color={colors.green} size="large" /></View>;
  if (!Number.isInteger(gameId) || gameId <= 0) return <View style={styles.center}><Text style={styles.error}>Game not found</Text></View>;

  return (
    <GameWrapper
      gameId={gameId}
      account={identity}
      returnToChatId={Number.isInteger(returnToChatId) && returnToChatId > 0 ? returnToChatId : undefined}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" },
  error: { color: colors.red },
});
