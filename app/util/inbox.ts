import { apiRequest } from "./api";
import { prefix } from "./config";

interface InboxActivityEntry {
  at: string;
  optimisticToken?: string;
}

export interface OptimisticInboxActivity {
  commit: (serverTimestamp: string) => void;
  rollback: () => void;
}

const activityCache = new Map<string, InboxActivityEntry>();
const listeners = new Map<number, Set<(friendId: number, timestamp: string) => void>>();
let optimisticSequence = 0;

function activityKey(viewerId: number, friendId: number) {
  return `${viewerId}:${friendId}`;
}

function timestampValue(timestamp: string) {
  const value = Date.parse(timestamp);
  return Number.isFinite(value) ? value : 0;
}

function emitActivity(viewerId: number, friendId: number, timestamp: string) {
  listeners.get(viewerId)?.forEach((listener) => listener(friendId, timestamp));
}

function replaceActivity(viewerId: number, friendId: number, entry: InboxActivityEntry | undefined) {
  const key = activityKey(viewerId, friendId);
  if (entry) activityCache.set(key, entry);
  else activityCache.delete(key);
  emitActivity(viewerId, friendId, entry?.at ?? "");
}

export function cacheInboxActivity(viewerId: number, friendId: number, timestamp: string): void {
  if (!Number.isInteger(friendId) || friendId <= 0 || !timestampValue(timestamp)) return;
  const key = activityKey(viewerId, friendId);
  const current = activityCache.get(key);
  if (current && timestampValue(current.at) > timestampValue(timestamp)) return;
  replaceActivity(viewerId, friendId, { at: timestamp });
}

export function getCachedInboxActivities(viewerId: number): Record<string, string> {
  const keyPrefix = `${viewerId}:`;
  return Object.fromEntries([...activityCache.entries()]
    .filter(([key]) => key.startsWith(keyPrefix))
    .map(([key, entry]) => [key.slice(keyPrefix.length), entry.at]));
}

export function mergeInboxActivities(viewerId: number, activities: Record<string, string>): Record<string, string> {
  Object.entries(activities).forEach(([friendId, timestamp]) => {
    cacheInboxActivity(viewerId, Number(friendId), timestamp);
  });
  return getCachedInboxActivities(viewerId);
}

export function subscribeInboxActivity(
  viewerId: number,
  listener: (friendId: number, timestamp: string) => void,
): () => void {
  const viewerListeners = listeners.get(viewerId) ?? new Set<(friendId: number, timestamp: string) => void>();
  viewerListeners.add(listener);
  listeners.set(viewerId, viewerListeners);
  return () => {
    viewerListeners.delete(listener);
    if (viewerListeners.size === 0) listeners.delete(viewerId);
  };
}

export function beginOptimisticInboxActivity(
  viewerId: number,
  friendId: number,
  timestamp = new Date().toISOString(),
): OptimisticInboxActivity {
  const key = activityKey(viewerId, friendId);
  const previous = activityCache.get(key);
  const token = `${Date.now()}-${optimisticSequence += 1}`;
  replaceActivity(viewerId, friendId, { at: timestamp, optimisticToken: token });

  return {
    commit(serverTimestamp) {
      const current = activityCache.get(key);
      if (current?.optimisticToken !== token) {
        cacheInboxActivity(viewerId, friendId, serverTimestamp);
        return;
      }
      const committed = timestampValue(serverTimestamp) >= timestampValue(previous?.at ?? "")
        ? serverTimestamp
        : previous?.at ?? serverTimestamp;
      replaceActivity(viewerId, friendId, { at: committed });
    },
    rollback() {
      if (activityCache.get(key)?.optimisticToken !== token) return;
      replaceActivity(viewerId, friendId, previous);
    },
  };
}

export function listInboxActivities(): Promise<Record<string, string>> {
  return apiRequest<Record<string, string>>(`${prefix}/inbox/activity`);
}
