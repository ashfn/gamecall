import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiRequest } from "./api";
import { prefix, webAppUrl } from "./config";
import type { GameLobby, GameSelection, GameStatus } from "./types";

const inviteKey = (gameId: number) => `rainfrog-game-invite:${gameId}`;

export async function createLinkLobby(selection: GameSelection) {
  const created = await apiRequest<{ lobby: GameLobby; inviteToken: string }>(`${prefix}/game-lobbies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ game: selection.type, settings: selection.settings }),
  });
  await AsyncStorage.setItem(inviteKey(created.lobby.id), created.inviteToken);
  return created;
}

export function listGameLobbies() {
  return apiRequest<GameLobby[]>(`${prefix}/game-lobbies`);
}

export function getGameLobby(gameId: number) {
  return apiRequest<{
    lobby: GameLobby | null;
    gameId: number;
    status: GameStatus;
    hasActiveLink: boolean;
  }>(`${prefix}/game-lobbies/${gameId}`);
}

export function startGameLobby(gameId: number) {
  return apiRequest<{ gameId: number; status: string }>(`${prefix}/game-lobbies/${gameId}/start`, {
    method: "POST",
  });
}

export function cancelGameLobby(gameId: number) {
  return apiRequest<{ gameId: number; status: "CANCELLED" }>(`${prefix}/game-lobbies/${gameId}`, {
    method: "DELETE",
  });
}

export async function getStoredInviteToken(gameId: number) {
  return AsyncStorage.getItem(inviteKey(gameId));
}

export function inviteUrl(token: string) {
  return `${webAppUrl}/join/${encodeURIComponent(token)}`;
}
