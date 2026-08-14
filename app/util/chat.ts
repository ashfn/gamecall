import { apiRequest } from "./api";
import { prefix } from "./config";
import { cacheInboxActivity } from "./inbox";
import { ChatMessage, GameSession, User } from "./types";

const jsonHeaders = { "Content-Type": "application/json" };

export interface CachedChat {
  friend: User;
  games: GameSession[];
  messages: ChatMessage[];
  messagesLoaded: boolean;
}

const chatCache = new Map<string, CachedChat>();

function chatKey(viewerId: number, friendId: number) {
  return `${viewerId}:${friendId}`;
}

export function cacheChatPreview(viewerId: number, friend: User, game: GameSession | null): CachedChat {
  const key = chatKey(viewerId, friend.id);
  const current = chatCache.get(key);
  const games = game
    ? [game, ...(current?.games ?? []).filter((item) => item.id !== game.id)]
      .sort((left, right) => Date.parse(right.lastActivity) - Date.parse(left.lastActivity))
    : current?.games ?? [];
  const cached = {
    friend,
    games,
    messages: current?.messages ?? [],
    messagesLoaded: current?.messagesLoaded ?? false,
  };
  chatCache.set(key, cached);
  return cached;
}

export function cacheChat(
  viewerId: number,
  friend: User,
  games: GameSession[],
  messages: ChatMessage[],
): CachedChat {
  const cached = { friend, games, messages, messagesLoaded: true };
  chatCache.set(chatKey(viewerId, friend.id), cached);
  const latestMessage = messages[messages.length - 1];
  if (latestMessage) cacheInboxActivity(viewerId, friend.id, latestMessage.createdAt);
  return cached;
}

export function getCachedChat(viewerId: number, friendId: number): CachedChat | null {
  return chatCache.get(chatKey(viewerId, friendId)) ?? null;
}

export function cacheChatMessage(viewerId: number, friendId: number, message: ChatMessage): void {
  cacheInboxActivity(viewerId, friendId, message.createdAt);
  const key = chatKey(viewerId, friendId);
  const current = chatCache.get(key);
  if (!current || current.messages.some((item) => item.id === message.id)) return;
  chatCache.set(key, { ...current, messages: [...current.messages, message] });
}

export function listMessages(friendId: number, afterId?: number): Promise<ChatMessage[]> {
  const query = afterId ? `?afterId=${encodeURIComponent(String(afterId))}` : "";
  return apiRequest<ChatMessage[]>(`${prefix}/chats/${friendId}/messages${query}`);
}

export async function getUnreadMessageCount(friendId: number): Promise<number> {
  const result = await apiRequest<{ count: number }>(`${prefix}/chats/${friendId}/unread-count`);
  return result.count;
}

export function getUnreadMessageCounts(): Promise<Record<string, number>> {
  return apiRequest<Record<string, number>>(`${prefix}/chats/unread-counts`);
}

export function sendMessage(
  friendId: number,
  text: string,
  clientRequestId: string,
): Promise<ChatMessage> {
  return apiRequest<ChatMessage>(`${prefix}/chats/${friendId}/messages`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ text, clientRequestId }),
  });
}
