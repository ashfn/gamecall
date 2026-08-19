import { apiRequest } from "./api";
import { prefix } from "./config";
import { GameSelection, GameSession, GameSettingsByType, GameType } from "./types";

const jsonHeaders = { "Content-Type": "application/json" };

const gameCache = new Map<string, GameSession>();
const optimisticGameKeys = new Set<string>();
const gameCacheListeners = new Map<number, Set<(game: GameSession) => void>>();

function gameCacheKey(viewerId: number, gameId: number) {
  return `${viewerId}:${gameId}`;
}

function emitCachedGame(viewerId: number, game: GameSession) {
  gameCacheListeners.get(viewerId)?.forEach((listener) => listener(game));
}

export function cacheGame(
  viewerId: number,
  game: GameSession,
  options: { optimistic?: boolean; force?: boolean } = {},
): GameSession {
  const key = gameCacheKey(viewerId, game.id);
  const current = gameCache.get(key);
  if (!options.force && current) {
    if (current.version > game.version) return current;
    // A focus refresh can finish while the move request is still in flight.
    // Do not let that older response replace the instant optimistic inbox row.
    if (optimisticGameKeys.has(key) && current.version >= game.version) return current;
  }
  gameCache.set(key, game);
  if (options.optimistic) optimisticGameKeys.add(key);
  else optimisticGameKeys.delete(key);
  emitCachedGame(viewerId, game);
  return game;
}

export function getCachedGames(viewerId: number): GameSession[] {
  const keyPrefix = `${viewerId}:`;
  return [...gameCache.entries()]
    .filter(([key]) => key.startsWith(keyPrefix))
    .map(([, game]) => game);
}

export function subscribeGameCache(viewerId: number, listener: (game: GameSession) => void): () => void {
  const listeners = gameCacheListeners.get(viewerId) ?? new Set<(game: GameSession) => void>();
  listeners.add(listener);
  gameCacheListeners.set(viewerId, listeners);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) gameCacheListeners.delete(viewerId);
  };
}

export function rollbackOptimisticGame(viewerId: number, game: GameSession): GameSession {
  const key = gameCacheKey(viewerId, game.id);
  if (!optimisticGameKeys.has(key)) return gameCache.get(key) ?? game;
  return cacheGame(viewerId, game, { force: true });
}

export function getCachedGame(viewerId: number, gameId: number): GameSession | null {
  return gameCache.get(gameCacheKey(viewerId, gameId)) ?? null;
}

export function removeCachedGame(viewerId: number, gameId: number) {
  gameCache.delete(gameCacheKey(viewerId, gameId));
}

export async function listGames(viewerId?: number, opponentId?: number): Promise<GameSession[]> {
  const query = opponentId ? `?opponentId=${encodeURIComponent(String(opponentId))}` : "";
  const games = await apiRequest<GameSession[]>(`${prefix}/games${query}`);
  return viewerId ? games.map((game) => cacheGame(viewerId, game)) : games;
}

export async function getGame(gameId: number, viewerId?: number): Promise<GameSession> {
  const game = await apiRequest<GameSession>(`${prefix}/games/${gameId}`);
  return viewerId ? cacheGame(viewerId, game) : game;
}

export function openTurn(gameId: number, viewerId?: number): Promise<GameSession> {
  return apiRequest<GameSession>(`${prefix}/games/${gameId}/open-turn`, {
    method: "POST",
    headers: jsonHeaders,
  }).then((updated) => viewerId ? cacheGame(viewerId, updated) : updated);
}

export async function startGame<TType extends GameType>(
  opponentId: number,
  game: TType = "TIC_TAC_TOE" as TType,
  settings?: GameSettingsByType[TType],
  viewerId?: number,
): Promise<GameSession> {
  const started = await apiRequest<GameSession>(`${prefix}/newGame`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ user: opponentId, game, settings }),
  });
  return viewerId ? cacheGame(viewerId, started) : started;
}

export function submitMove(
  gameId: number,
  move: Readonly<Record<string, unknown>>,
  expectedVersion: number,
  requestId: string,
  viewerId?: number,
): Promise<GameSession> {
  return apiRequest<GameSession>(`${prefix}/games/${gameId}/moves`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ move, expectedVersion, requestId }),
  }).then((updated) => viewerId ? cacheGame(viewerId, updated) : updated);
}

export function rematch(gameId: number, viewerId?: number, selection?: GameSelection): Promise<GameSession> {
  return apiRequest<GameSession>(`${prefix}/games/${gameId}/rematch`, {
    method: "POST",
    headers: jsonHeaders,
    body: selection ? JSON.stringify({ game: selection.type, settings: selection.settings }) : undefined,
  }).then((updated) => viewerId ? cacheGame(viewerId, updated) : updated);
}

export function resignGame(gameId: number, viewerId?: number): Promise<GameSession> {
  return apiRequest<GameSession>(`${prefix}/endGame`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ gameId }),
  }).then((updated) => viewerId ? cacheGame(viewerId, updated) : updated);
}

export async function hideFinishedGame(gameId: number, viewerId?: number): Promise<void> {
  await apiRequest<{ gameId: number }>(`${prefix}/games/${gameId}`, { method: "DELETE" });
  if (viewerId) removeCachedGame(viewerId, gameId);
}

export async function hideFinishedGamesWithOpponent(opponentId: number, viewerId?: number): Promise<number[]> {
  const hidden = await apiRequest<{ gameIds: number[] }>(
    `${prefix}/games/opponents/${opponentId}`,
    { method: "DELETE" },
  );
  if (viewerId) hidden.gameIds.forEach((gameId) => removeCachedGame(viewerId, gameId));
  return hidden.gameIds;
}
