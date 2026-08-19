import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { Platform } from "react-native";
import { create } from "zustand";
import { prefix } from "./config";
import { ApiResult, User } from "./types";

const ACCESS_TOKEN = "rainfrog-access-token";
const REFRESH_TOKEN = "rainfrog-refresh-token";
const CACHED_ACCOUNT = "rainfrog-account";
let refreshInFlight: Promise<void> | null = null;

class SessionExpiredError extends Error {}

interface AuthState {
  account: User | null;
  initialized: boolean;
  initialize: () => Promise<void>;
  refresh: () => Promise<void>;
  clear: () => void;
}

async function tokenGet(key: string) {
  if (Platform.OS === "web") return AsyncStorage.getItem(key);
  return SecureStore.getItemAsync(key);
}

async function tokenSet(key: string, value: string) {
  if (Platform.OS === "web") {
    await AsyncStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function tokenDelete(key: string) {
  if (Platform.OS === "web") {
    await AsyncStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

async function fetchAccount(): Promise<User> {
  const response = await authFetch(`${prefix}/account`, {});
  const result = await response.json() as ApiResult<User>;
  if (result.status !== 1 || !result.data) throw new Error(result.error ?? "Could not load account");
  await AsyncStorage.setItem(CACHED_ACCOUNT, JSON.stringify(result.data));
  return result.data;
}

export const useAccountDetailsStore = create<AuthState>((set) => ({
  account: null,
  initialized: false,
  initialize: async () => {
    const refreshToken = await tokenGet(REFRESH_TOKEN);
    if (!refreshToken) {
      set({ account: null, initialized: true });
      return;
    }
    const cachedJson = await AsyncStorage.getItem(CACHED_ACCOUNT);
    let cachedAccount: User | null = null;
    try { cachedAccount = cachedJson ? JSON.parse(cachedJson) as User : null; } catch { cachedAccount = null; }
    set({ account: cachedAccount, initialized: true });
    try {
      const account = await fetchAccount();
      set({ account, initialized: true });
    } catch {
      // Keep the last verified identity visible during a temporary network outage.
    }
  },
  refresh: async () => {
    const account = await fetchAccount();
    set({ account, initialized: true });
  },
  clear: () => set({ account: null, initialized: true }),
}));

export async function login(usernameOrEmail: string, password: string): Promise<ApiResult<string>> {
  const response = await fetch(`${prefix}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account: usernameOrEmail.trim(), password }),
  });
  const result = await response.json() as ApiResult<string>;
  if (result.status === 1 && result.data) {
    await tokenSet(REFRESH_TOKEN, result.data);
    await refreshAccessToken();
    await useAccountDetailsStore.getState().refresh();
  }
  return result;
}

export async function signup(username: string, email: string, password: string): Promise<ApiResult<void>> {
  const response = await fetch(`${prefix}/account`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: username.trim(), email: email.trim(), password }),
  });
  return response.json();
}

async function performAccessTokenRefresh(): Promise<void> {
  const refreshToken = await tokenGet(REFRESH_TOKEN);
  if (!refreshToken) throw new SessionExpiredError("No session");
  const response = await fetch(`${prefix}/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Rainfrog-Session-Upgrade": "1",
    },
    body: JSON.stringify({ refreshToken }),
  });
  if (!response.ok) throw new Error("Could not refresh your session");
  const result = await response.json() as ApiResult<string>;
  if (result.status !== 1 || !result.data) {
    if (result.error?.toLowerCase().includes("invalid refresh token")) {
      throw new SessionExpiredError("Session expired");
    }
    throw new Error(result.error ?? "Could not refresh your session");
  }
  const upgradedRefreshToken = response.headers.get("x-rainfrog-refresh-token");
  if (upgradedRefreshToken) await tokenSet(REFRESH_TOKEN, upgradedRefreshToken);
  await tokenSet(ACCESS_TOKEN, result.data);
}

export function refreshAccessToken(): Promise<void> {
  if (!refreshInFlight) {
    refreshInFlight = performAccessTokenRefresh().finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

export async function getAccessToken(): Promise<string> {
  let accessToken = await tokenGet(ACCESS_TOKEN);
  if (!accessToken) {
    await refreshAccessToken();
    accessToken = await tokenGet(ACCESS_TOKEN);
  }
  if (!accessToken) throw new Error("No session");
  return accessToken;
}

export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  let accessToken = await tokenGet(ACCESS_TOKEN);
  let anonymous = false;
  if (!accessToken) {
    const anonymousAuth = await import("./anonymousAuth");
    accessToken = await anonymousAuth.getAnonymousAccessToken();
    anonymous = Boolean(accessToken);
    if (!accessToken) {
      await refreshAccessToken();
      accessToken = await tokenGet(ACCESS_TOKEN);
    }
  }

  const makeRequest = (token: string | null) => fetch(url, {
    ...options,
    headers: { ...(options.headers ?? {}), Authorization: token ?? "" },
  });

  let response = await makeRequest(accessToken);
  if (response.status === 499) {
    try {
      if (anonymous) {
        const { refreshAnonymousAccessToken } = await import("./anonymousAuth");
        response = await makeRequest(await refreshAnonymousAccessToken());
      } else {
        await refreshAccessToken();
        response = await makeRequest(await tokenGet(ACCESS_TOKEN));
      }
    } catch (error) {
      // A tunnel outage or a sleeping test backend must not destroy a valid
      // multi-week local session. Only a definitive server rejection logs out.
      if (error instanceof SessionExpiredError) {
        await logout(false);
        router.replace("/");
        throw new Error("Your session expired. Please log in again.");
      }
      throw error;
    }
  }
  return response;
}

export async function logout(notifyServer = true): Promise<void> {
  const refreshToken = await tokenGet(REFRESH_TOKEN);
  if (notifyServer) {
    try {
      const { unregisterPushNotifications } = await import("./notifications");
      await unregisterPushNotifications();
    } catch {
      // Signing out should still work when notification registration is unavailable.
    }
    try {
      await authFetch(`${prefix}/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      // Local logout should always succeed even if the server is unavailable.
    }
  }
  await Promise.all([tokenDelete(ACCESS_TOKEN), tokenDelete(REFRESH_TOKEN), AsyncStorage.removeItem(CACHED_ACCOUNT)]);
  const { disconnectRealtime } = await import("./realtime");
  disconnectRealtime();
  useAccountDetailsStore.getState().clear();
}
