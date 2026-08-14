import Constants from "expo-constants";
import { Platform } from "react-native";

const configuredUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "");
const bundledUrl = typeof Constants.expoConfig?.extra?.apiUrl === "string"
  ? Constants.expoConfig.extra.apiUrl.replace(/\/$/, "")
  : undefined;
const hostUri = Constants.expoConfig?.hostUri;
const developmentHost = hostUri?.split(":")[0];

export const prefix = (__DEV__ ? configuredUrl ?? bundledUrl : bundledUrl ?? configuredUrl)
  ?? (developmentHost
    ? `http://${developmentHost}:3000`
    : Platform.OS === "android"
      ? "http://10.0.2.2:3000"
      : "http://localhost:3000");
