import { FontAwesome5 } from "@expo/vector-icons";
import { memo, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { prefix } from "../../../util/config";
import { colors } from "../../../util/theme";
import type { User } from "../../../util/types";

export interface TurnBasedPlayerScore {
  user: User;
  label: string;
  score: number;
  active: boolean;
}

export interface TurnBasedGameHeaderProps {
  player: TurnBasedPlayerScore;
  opponent: TurnBasedPlayerScore;
  turnIndicator?: ReactNode;
  centerAccessory?: ReactNode;
  resultIndicator?: ReactNode;
}

export function TurnCountdown({ deadline, onExpire }: { deadline: string; onExpire: () => void }) {
  const [remainingSeconds, setRemainingSeconds] = useState(() => (
    Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 1000))
  ));
  const expirationRequested = useRef(false);

  useEffect(() => {
    expirationRequested.current = false;
    const update = () => {
      const remaining = Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 1000));
      setRemainingSeconds(remaining);
      if (remaining === 0 && !expirationRequested.current) {
        expirationRequested.current = true;
        onExpire();
      }
    };
    update();
    const interval = setInterval(update, 250);
    return () => clearInterval(interval);
  }, [deadline, onExpire]);

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  return (
    <View style={[styles.countdown, remainingSeconds <= 10 && styles.countdownUrgent]}>
      <FontAwesome5 name="clock" size={13} color={remainingSeconds <= 10 ? colors.red : colors.green} />
      <Text style={[styles.countdownValue, remainingSeconds <= 10 && styles.countdownTextUrgent]}>
        {minutes}:{String(seconds).padStart(2, "0")}
      </Text>
    </View>
  );
}

export function TurnStatus({ label, active = false, compact = false }: { label: string; active?: boolean; compact?: boolean }) {
  return (
    <Text
      numberOfLines={compact ? 1 : undefined}
      adjustsFontSizeToFit={compact}
      minimumFontScale={compact ? 0.72 : undefined}
      style={[styles.status, compact && styles.statusCompact, active && styles.statusActive]}
    >
      {label}
    </Text>
  );
}

const TurnBasedGameHeader = memo(function TurnBasedGameHeader({
  player,
  opponent,
  turnIndicator,
  centerAccessory,
  resultIndicator,
}: TurnBasedGameHeaderProps) {
  const hasTurnIndicator = turnIndicator !== null && turnIndicator !== undefined && turnIndicator !== false;
  return (
    <View style={styles.header}>
      <PlayerScoreCard {...player} />
      <View style={[styles.centerColumn, !hasTurnIndicator && styles.centerColumnAccessoryOnly]}>
        {hasTurnIndicator && <View style={styles.turnIndicatorSlot}>{turnIndicator}</View>}
        <View style={styles.centerAccessory}>{centerAccessory}</View>
      </View>
      <PlayerScoreCard {...opponent} reverse />
      {resultIndicator && <View style={styles.resultIndicator}>{resultIndicator}</View>}
    </View>
  );
});

const PlayerScoreCard = memo(function PlayerScoreCard({
  user,
  label,
  score,
  active,
  reverse = false,
}: TurnBasedPlayerScore & { reverse?: boolean }) {
  const [avatarFailed, setAvatarFailed] = useState(false);
  return (
    <View style={[styles.playerScore, active && styles.playerScoreActive, reverse && styles.playerScoreReverse]}>
      <View style={styles.scoreAvatar}>
        <Text style={styles.scoreInitial}>{user.displayName.slice(0, 1).toUpperCase()}</Text>
        {!avatarFailed && (
          <Image
            source={{ uri: `${prefix}/profile/${user.id}/avatar` }}
            style={styles.scoreAvatarImage}
            onError={() => setAvatarFailed(true)}
          />
        )}
      </View>
      <View style={[styles.scoreCopy, reverse && styles.scoreCopyReverse]}>
        <Text style={styles.scoreValue}>{score}</Text>
        <Text style={styles.scoreName} numberOfLines={1}>{label}</Text>
      </View>
    </View>
  );
});

export default TurnBasedGameHeader;

const styles = StyleSheet.create({
  header: {
    width: "100%",
    height: 89,
    marginTop: 4,
    marginBottom: 2,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  playerScore: {
    width: 116,
    height: 54,
    borderRadius: 8,
    backgroundColor: colors.surface,
    paddingHorizontal: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderWidth: 1,
    borderColor: "transparent",
  },
  playerScoreReverse: { flexDirection: "row-reverse" },
  playerScoreActive: { borderColor: colors.green },
  scoreAvatar: {
    width: 31,
    height: 31,
    borderRadius: 16,
    backgroundColor: colors.greenStrong,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  scoreInitial: { color: colors.background, fontSize: 13, fontWeight: "900" },
  scoreAvatarImage: { ...StyleSheet.absoluteFillObject, borderRadius: 16 },
  scoreCopy: { flex: 1 },
  scoreCopyReverse: { alignItems: "flex-end" },
  scoreName: { color: colors.muted, fontSize: 8, fontWeight: "800", maxWidth: 66 },
  scoreValue: { color: colors.text, fontSize: 20, fontWeight: "800", lineHeight: 22 },
  centerColumn: { width: 110, alignItems: "center" },
  centerColumnAccessoryOnly: { height: 54, justifyContent: "center" },
  turnIndicatorSlot: { width: "100%", height: 32, alignItems: "center", justifyContent: "center" },
  centerAccessory: { width: "100%", alignItems: "center", justifyContent: "center" },
  resultIndicator: { position: "absolute", top: 62, left: 0, right: 0, height: 22, alignItems: "center", justifyContent: "center" },
  countdown: {
    minWidth: 78,
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.greenStrong,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  countdownUrgent: { borderColor: colors.red, backgroundColor: "#2A1717" },
  countdownValue: { color: colors.text, fontSize: 21, lineHeight: 23, fontWeight: "900", fontVariant: ["tabular-nums"] },
  countdownTextUrgent: { color: colors.red },
  status: { color: colors.muted, fontSize: 15 },
  statusCompact: { maxWidth: 104, textAlign: "center", fontSize: 13, lineHeight: 17 },
  statusActive: { color: "#ABF0FF", fontWeight: "700" },
});
