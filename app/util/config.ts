import Constants from "expo-constants";
import { Platform } from "react-native";

const configuredUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "");
const bundledUrl = typeof Constants.expoConfig?.extra?.apiUrl === "string"
  ? Constants.expoConfig.extra.apiUrl.replace(/\/$/, "")
  : undefined;
const hostUri = Constants.expoConfig?.hostUri;
const developmentHost = hostUri?.split(":")[0];

export const realtimePrefix = (__DEV__ ? configuredUrl ?? bundledUrl : bundledUrl ?? configuredUrl)
  ?? (developmentHost
    ? `http://${developmentHost}:3000`
    : Platform.OS === "android"
      ? "http://10.0.2.2:3000"
      : "http://localhost:3000");

const webOrigin = Platform.OS === "web" && !__DEV__ && typeof globalThis.location?.origin === "string"
  ? globalThis.location.origin.replace(/\/$/, "")
  : null;
const isLocalWebExport = Boolean(webOrigin && /^http:\/\/(?:localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(?::\d+)?$/i.test(webOrigin));

/** REST calls from a local production web export use its same-origin proxy. */
export const prefix = isLocalWebExport ? `${webOrigin}/rainfrog-api` : realtimePrefix;

const configuredWebAppUrl = process.env.EXPO_PUBLIC_WEB_APP_URL?.replace(/\/$/, "");
const bundledWebAppUrl = typeof Constants.expoConfig?.extra?.webAppUrl === "string"
  ? Constants.expoConfig.extra.webAppUrl.replace(/\/$/, "")
  : undefined;

/** Public Expo web export base used to build anonymous join links. */
export const webAppUrl = configuredWebAppUrl ?? bundledWebAppUrl ?? "http://localhost:8081";
