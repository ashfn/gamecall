import * as Notifications from "expo-notifications";
import { router, usePathname } from "expo-router";
import { PropsWithChildren, useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform, StyleSheet, View } from "react-native";
import { useAccountDetailsStore } from "../../util/auth";
import { registerPushNotifications } from "../../util/notifications";
import { InAppNotice, Notice } from "./InAppNotice";

/*
 * `handleNotification` runs only while the app is foregrounded — a notification
 * that arrives in the background is presented by the OS and never reaches this
 * code. So this is exactly, and only, the "banner while you are already using
 * the app" path, and turning it off here leaves background alerts untouched.
 *
 * Foregrounded deliveries are surfaced by `InAppNotice` instead, which we can
 * keep quiet for the screen the player is already looking at. They still land
 * in Notification Centre (`shouldShowList`) so nothing is lost.
 */
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: false,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

type PushData = {
  kind?: unknown;
  gameId?: unknown;
  userId?: unknown;
  recipientId?: unknown;
};

function iconForNotification(data: PushData): string {
  if (data.kind === "message") return "comment";
  if (data.kind === "friend_request") return "user-plus";
  return "dice-five";
}

function routeForNotification(data: PushData): string | null {
  if (data.kind === "game") {
    const gameId = Number(data.gameId);
    return Number.isInteger(gameId) && gameId > 0 ? `/game/${gameId}` : null;
  }
  if (data.kind === "message") {
    const userId = Number(data.userId);
    return Number.isInteger(userId) && userId > 0 ? `/chat/${userId}` : null;
  }
  if (data.kind === "friend_request") {
    const userId = Number(data.userId);
    return Number.isInteger(userId) && userId > 0 ? `/user/${userId}` : "/friends";
  }
  return null;
}

export function AppNotifications({ children }: PropsWithChildren) {
  const account = useAccountDetailsStore((state) => state.account);
  const initialize = useAccountDetailsStore((state) => state.initialize);
  const accountRef = useRef(account);
  const pendingResponse = useRef<Notifications.NotificationResponse | null>(null);
  const handledResponseId = useRef<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);

  useEffect(() => { accountRef.current = account; }, [account]);
  useEffect(() => { pathnameRef.current = pathname; }, [pathname]);
  useEffect(() => { void initialize(); }, [initialize]);

  const dismissNotice = useCallback(() => setNotice(null), []);

  useEffect(() => {
    if (Platform.OS === "web") return undefined;

    const received = (notification: Notifications.Notification) => {
      const { title, body, data } = notification.request.content;
      const recipientId = Number((data as PushData).recipientId);
      // Someone else's notification arriving on a shared device is not ours to show.
      if (Number.isInteger(recipientId) && recipientId !== accountRef.current?.id) return;

      const destination = routeForNotification(data as PushData);
      // Nothing to announce about the screen the player is already on.
      if (destination && pathnameRef.current === destination) return;

      setNotice({
        id: notification.request.identifier,
        title: title ?? "Rainfrog",
        body: body ?? "",
        icon: iconForNotification(data as PushData),
        onPress: destination ? () => router.push(destination) : undefined,
      });
    };

    const subscription = Notifications.addNotificationReceivedListener(received);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") return undefined;

    const openResponse = (response: Notifications.NotificationResponse) => {
      const identifier = response.notification.request.identifier;
      if (handledResponseId.current === identifier) return;
      void Notifications.clearLastNotificationResponseAsync();
      if (!accountRef.current) {
        pendingResponse.current = response;
        return;
      }
      const destination = routeForNotification(response.notification.request.content.data);
      const recipientId = Number(response.notification.request.content.data.recipientId);
      if (Number.isInteger(recipientId) && recipientId !== accountRef.current.id) return;
      if (!destination) return;
      handledResponseId.current = identifier;
      pendingResponse.current = null;
      requestAnimationFrame(() => router.push(destination));
    };

    const responseSubscription = Notifications.addNotificationResponseReceivedListener(openResponse);
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) openResponse(response);
    });
    return () => responseSubscription.remove();
  }, []);

  useEffect(() => {
    if (!account || Platform.OS === "web") return;
    const response = pendingResponse.current;
    if (!response) return;
    const destination = routeForNotification(response.notification.request.content.data);
    const recipientId = Number(response.notification.request.content.data.recipientId);
    if (Number.isInteger(recipientId) && recipientId !== account.id) {
      pendingResponse.current = null;
      return;
    }
    if (!destination) {
      pendingResponse.current = null;
      return;
    }
    handledResponseId.current = response.notification.request.identifier;
    pendingResponse.current = null;
    requestAnimationFrame(() => router.push(destination));
  }, [account]);

  useEffect(() => {
    if (!account || Platform.OS === "web") return undefined;
    let active = true;
    const register = () => {
      if (!active) return;
      void registerPushNotifications().catch((error) => {
        console.warn("Push notification registration failed", error);
      });
    };
    register();
    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") register();
    });
    const tokenSubscription = Notifications.addPushTokenListener(register);
    return () => {
      active = false;
      appStateSubscription.remove();
      tokenSubscription.remove();
    };
  }, [account?.id]);

  return (
    <View style={styles.host}>
      {children}
      <InAppNotice notice={notice} onDismiss={dismissNotice} />
    </View>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1 },
});
