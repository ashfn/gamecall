import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { apiAction } from "./api";
import { prefix } from "./config";

const STORED_PUSH_TOKEN = "rainfrog-expo-push-token";

async function configureAndroidChannels() {
  if (Platform.OS !== "android") return;
  await Promise.all([
    Notifications.setNotificationChannelAsync("games", {
      name: "Games",
      description: "Game invitations, turns, and results",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
      vibrationPattern: [0, 180, 100, 180],
      lightColor: "#96E396",
    }),
    Notifications.setNotificationChannelAsync("messages", {
      name: "Messages",
      description: "Messages from friends",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
      vibrationPattern: [0, 180, 100, 180],
      lightColor: "#96E396",
    }),
    Notifications.setNotificationChannelAsync("social", {
      name: "Friend requests",
      description: "New friend requests",
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: "default",
      lightColor: "#96E396",
    }),
  ]);
}

function expoProjectId() {
  const configured = Constants.expoConfig?.extra?.eas?.projectId;
  return Constants.easConfig?.projectId ?? (typeof configured === "string" ? configured : undefined);
}

export async function registerPushNotifications() {
  if (Platform.OS === "web") return null;
  await configureAndroidChannels();

  const existing = await Notifications.getPermissionsAsync();
  const permission = existing.granted ? existing : await Notifications.requestPermissionsAsync();
  if (!permission.granted) return null;

  const projectId = expoProjectId();
  if (!projectId) throw new Error("Missing Expo project ID for push notifications");
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await apiAction(`${prefix}/notifications/devices`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token,
      platform: Platform.OS,
      deviceName: Device.deviceName,
    }),
  });
  await AsyncStorage.setItem(STORED_PUSH_TOKEN, token);
  return token;
}

export async function unregisterPushNotifications() {
  if (Platform.OS === "web") return;
  const token = await AsyncStorage.getItem(STORED_PUSH_TOKEN);
  if (!token) return;
  await apiAction(`${prefix}/notifications/devices`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  await AsyncStorage.removeItem(STORED_PUSH_TOKEN);
}
