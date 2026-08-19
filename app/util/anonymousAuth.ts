import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { prefix } from "./config";
import type { ApiResult, User } from "./types";

const ANONYMOUS_ACCESS_TOKEN = "rainfrog-anonymous-access-token";
const ANONYMOUS_REFRESH_TOKEN = "rainfrog-anonymous-refresh-token";
const ANONYMOUS_GAME_USER = "rainfrog-anonymous-game-user";
let refreshInFlight: Promise<string> | null = null;

interface AnonymousState {
  gameUser: User | null;
  initialized: boolean;
  initialize: () => Promise<void>;
  saveJoinedSession: (accessToken: string, refreshToken: string, gameUser: User) => Promise<void>;
  clear: () => Promise<void>;
}

export const useAnonymousGameStore = create<AnonymousState>((set) => ({
  gameUser: null,
  initialized: false,
  initialize: async () => {
    const stored = await AsyncStorage.getItem(ANONYMOUS_GAME_USER);
    let gameUser: User | null = null;
    try { gameUser = stored ? JSON.parse(stored) as User : null; } catch { gameUser = null; }
    set({ gameUser, initialized: true });
  },
  saveJoinedSession: async (accessToken, refreshToken, gameUser) => {
    await Promise.all([
      AsyncStorage.setItem(ANONYMOUS_ACCESS_TOKEN, accessToken),
      AsyncStorage.setItem(ANONYMOUS_REFRESH_TOKEN, refreshToken),
      AsyncStorage.setItem(ANONYMOUS_GAME_USER, JSON.stringify(gameUser)),
    ]);
    set({ gameUser, initialized: true });
  },
  clear: async () => {
    await Promise.all([
      AsyncStorage.removeItem(ANONYMOUS_ACCESS_TOKEN),
      AsyncStorage.removeItem(ANONYMOUS_REFRESH_TOKEN),
      AsyncStorage.removeItem(ANONYMOUS_GAME_USER),
    ]);
    set({ gameUser: null, initialized: true });
  },
}));

export async function getStoredAnonymousRefreshToken() {
  return AsyncStorage.getItem(ANONYMOUS_REFRESH_TOKEN);
}

export async function refreshAnonymousAccessToken(): Promise<string> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const refreshToken = await AsyncStorage.getItem(ANONYMOUS_REFRESH_TOKEN);
    if (!refreshToken) throw new Error("No anonymous game session");
    const response = await fetch(`${prefix}/anonymous-games/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    const result = await response.json() as ApiResult<{ accessToken: string; gameUser: User }>;
    if (result.status !== 1 || !result.data) throw new Error(result.error ?? "This browser game session expired");
    await Promise.all([
      AsyncStorage.setItem(ANONYMOUS_ACCESS_TOKEN, result.data.accessToken),
      AsyncStorage.setItem(ANONYMOUS_GAME_USER, JSON.stringify(result.data.gameUser)),
    ]);
    useAnonymousGameStore.setState({ gameUser: result.data.gameUser, initialized: true });
    return result.data.accessToken;
  })().finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

export async function getAnonymousAccessToken() {
  return AsyncStorage.getItem(ANONYMOUS_ACCESS_TOKEN);
}
