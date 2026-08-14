import { useLocalSearchParams } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import GameWrapper from "../../src/games/GameWrapper";
import { useAccountDetailsStore } from "../../util/auth";
import { colors } from "../../util/theme";

export default function GameScreen() {
  const { gameid, fromChat } = useLocalSearchParams<{ gameid: string; fromChat?: string }>();
  const account = useAccountDetailsStore((state) => state.account);
  const gameId = Number(gameid);
  const returnToChatId = Number(fromChat);

  if (!account) return <View style={styles.center}><ActivityIndicator color={colors.green} size="large" /></View>;
  if (!Number.isInteger(gameId) || gameId <= 0) return <View style={styles.center}><Text style={styles.error}>Game not found</Text></View>;

  return (
    <GameWrapper
      gameId={gameId}
      account={account}
      returnToChatId={Number.isInteger(returnToChatId) && returnToChatId > 0 ? returnToChatId : undefined}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" },
  error: { color: colors.red },
});
