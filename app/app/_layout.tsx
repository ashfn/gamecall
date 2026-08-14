import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppUpdateGate } from "../src/components/AppUpdateGate";
import { AppNotifications } from "../src/components/AppNotifications";
import { colors } from "../util/theme";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaProvider>
        <AppUpdateGate>
          <AppNotifications>
            <StatusBar style="light" />
            <Stack screenOptions={{ headerShown: false, animation: "slide_from_right", contentStyle: { backgroundColor: colors.background } }}>
              <Stack.Screen name="friends/index" options={{ animation: "slide_from_left" }} />
            </Stack>
          </AppNotifications>
        </AppUpdateGate>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
