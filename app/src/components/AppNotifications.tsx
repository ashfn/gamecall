import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { PropsWithChildren, useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import { useAccountDetailsStore } from "../../util/auth";
import { registerPushNotifications } from "../../util/notifications";

if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
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

  useEffect(() => { accountRef.current = account; }, [account]);
  useEffect(() => { void initialize(); }, [initialize]);

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

  return children;
}
