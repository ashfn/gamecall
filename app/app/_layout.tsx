import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppUpdateGate } from "../src/components/AppUpdateGate";
import { AppNotifications } from "../src/components/AppNotifications";
import { colors } from "../util/theme";

export default function RootLayout() {
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    document.documentElement.style.backgroundColor = colors.background;
    document.body.style.backgroundColor = colors.background;
    document.body.style.overscrollBehaviorY = "none";
    const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (viewport && !viewport.content.includes("viewport-fit=cover")) {
      viewport.content = `${viewport.content}, viewport-fit=cover`;
    }
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaProvider style={{ flex: 1, backgroundColor: colors.background }}>
        <AppUpdateGate>
          <AppNotifications>
            <StatusBar style="light" backgroundColor={colors.background} />
            <Stack screenOptions={{ headerShown: false, animation: "slide_from_right", contentStyle: { backgroundColor: colors.background } }}>
              <Stack.Screen name="friends/index" options={{ animation: "slide_from_left" }} />
            </Stack>
          </AppNotifications>
        </AppUpdateGate>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
