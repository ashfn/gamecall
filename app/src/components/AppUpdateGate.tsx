import * as Updates from "expo-updates";
import { StatusBar } from "expo-status-bar";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../../util/theme";

type UpdatePhase = "downloading" | "restarting" | null;

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

export function AppUpdateGate({ children }: { children: ReactNode }) {
  const { downloadProgress } = Updates.useUpdates();
  const [phase, setPhase] = useState<UpdatePhase>(null);

  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return;
    let active = true;

    async function installAvailableUpdate() {
      try {
        const update = await Updates.checkForUpdateAsync();
        if (!active || !update.isAvailable) return;

        const shownAt = Date.now();
        setPhase("downloading");
        await Updates.fetchUpdateAsync();
        if (!active) return;

        // Keep very small updates from producing an abrupt flash.
        await wait(Math.max(0, 700 - (Date.now() - shownAt)));
        if (!active) return;
        setPhase("restarting");
        await wait(260);
        if (!active) return;

        await Updates.reloadAsync({
          reloadScreenOptions: {
            backgroundColor: colors.green,
            fade: true,
            spinner: { enabled: true, color: colors.background, size: "small" },
          },
        });
      } catch {
        // Stay usable offline and try again on the next launch.
        if (active) setPhase(null);
      }
    }

    void installAvailableUpdate();
    return () => { active = false; };
  }, []);

  const progress = useMemo(() => {
    if (phase === "restarting") return 1;
    return Math.max(0.04, Math.min(1, downloadProgress ?? 0));
  }, [downloadProgress, phase]);

  return (
    <View style={styles.container}>
      {children}
      {phase && (
        <SafeAreaView style={styles.overlay}>
          <StatusBar style="dark" />
          <View style={styles.brand}>
            <Text style={styles.logo}>Rainfrog</Text>
            <Text style={styles.title}>{phase === "restarting" ? "Ready to play" : "Freshening things up"}</Text>
            <Text style={styles.subtitle}>
              {phase === "restarting" ? "Opening the latest version…" : "Downloading the latest update"}
            </Text>
          </View>
          <View style={styles.progressArea}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
            </View>
            <Text style={styles.progressText}>{Math.round(progress * 100)}%</Text>
          </View>
        </SafeAreaView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10000,
    elevation: 10000,
    backgroundColor: colors.green,
    paddingHorizontal: 28,
  },
  brand: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 26 },
  logo: { color: colors.background, fontSize: 46, lineHeight: 52, fontWeight: "900", letterSpacing: -1.6 },
  title: { marginTop: 22, color: colors.background, fontSize: 19, lineHeight: 25, fontWeight: "800" },
  subtitle: { marginTop: 4, color: "#254229", fontSize: 15, lineHeight: 21, fontWeight: "600" },
  progressArea: { paddingBottom: 28 },
  progressTrack: { height: 5, borderRadius: 3, overflow: "hidden", backgroundColor: "rgba(10,10,10,0.18)" },
  progressFill: { height: "100%", borderRadius: 3, backgroundColor: colors.background },
  progressText: { marginTop: 9, color: "#254229", fontSize: 12, lineHeight: 16, fontWeight: "800", textAlign: "right" },
});
