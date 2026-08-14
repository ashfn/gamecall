import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SetStateAction } from "react";
import type { GameType } from "./types";

const STORAGE_VERSION = 1;
const STORAGE_PREFIX = "rainfrog-local-game-state";

export interface LocalGameStateScope {
  userId: number;
  gameId: number;
  gameType: GameType;
  slot: string;
}

interface StoredLocalGameState<T> {
  version: number;
  updatedAt: number;
  value: T;
}

const memoryCache = new Map<string, unknown>();
const writeQueues = new Map<string, Promise<void>>();

export function localGameStateKey(scope: LocalGameStateScope): string {
  return `${STORAGE_PREFIX}:${scope.userId}:${scope.gameType}:${scope.gameId}:${scope.slot}`;
}

export async function loadLocalGameState<T>(scope: LocalGameStateScope): Promise<T | null> {
  const key = localGameStateKey(scope);
  if (memoryCache.has(key)) return memoryCache.get(key) as T;
  try {
    const json = await AsyncStorage.getItem(key);
    if (!json) return null;
    const stored = JSON.parse(json) as StoredLocalGameState<T>;
    if (stored.version !== STORAGE_VERSION || stored.value === undefined) return null;
    memoryCache.set(key, stored.value);
    return stored.value;
  } catch {
    return null;
  }
}

export function saveLocalGameState<T>(scope: LocalGameStateScope, value: T): Promise<void> {
  const key = localGameStateKey(scope);
  memoryCache.set(key, value);
  const stored: StoredLocalGameState<T> = { version: STORAGE_VERSION, updatedAt: Date.now(), value };
  const previous = writeQueues.get(key) ?? Promise.resolve();
  const write = previous
    .catch(() => undefined)
    // Skip stale queued snapshots when several drag/drop changes happen before
    // AsyncStorage catches up. The newest value remains cached synchronously.
    .then(() => memoryCache.get(key) === value
      ? AsyncStorage.setItem(key, JSON.stringify(stored))
      : undefined)
    .finally(() => {
      if (writeQueues.get(key) === write) writeQueues.delete(key);
    });
  writeQueues.set(key, write);
  return write;
}

export async function clearLocalGameState(scope: LocalGameStateScope): Promise<void> {
  const key = localGameStateKey(scope);
  memoryCache.delete(key);
  const previous = writeQueues.get(key) ?? Promise.resolve();
  const removal = previous
    .catch(() => undefined)
    .then(() => AsyncStorage.removeItem(key))
    .finally(() => {
      if (writeQueues.get(key) === removal) writeQueues.delete(key);
    });
  writeQueues.set(key, removal);
  await removal;
}

export function useLocalGameState<T>(scope: LocalGameStateScope, initialValue: T) {
  const key = useMemo(() => localGameStateKey(scope), [scope.gameId, scope.gameType, scope.slot, scope.userId]);
  const cached = memoryCache.get(key) as T | undefined;
  const [value, setValue] = useState<T>(() => cached ?? initialValue);
  const [hydrated, setHydrated] = useState(cached !== undefined);
  const revision = useRef(0);
  const activeKey = useRef(key);

  useEffect(() => {
    activeKey.current = key;
    const loadRevision = revision.current;
    let active = true;
    if (memoryCache.has(key)) {
      setValue(memoryCache.get(key) as T);
      setHydrated(true);
      return () => { active = false; };
    }
    setHydrated(false);
    void loadLocalGameState<T>(scope).then((stored) => {
      if (!active || activeKey.current !== key || revision.current !== loadRevision) return;
      if (stored !== null) setValue(stored);
      setHydrated(true);
    });
    return () => { active = false; };
  }, [key, scope.gameId, scope.gameType, scope.slot, scope.userId]);

  const updateValue = useCallback((update: SetStateAction<T>) => {
    revision.current += 1;
    setHydrated(true);
    setValue((current) => {
      const next = typeof update === "function"
        ? (update as (previous: T) => T)(current)
        : update;
      if (Object.is(next, current)) return current;
      void saveLocalGameState(scope, next);
      return next;
    });
  }, [scope.gameId, scope.gameType, scope.slot, scope.userId]);

  return [value, updateValue, hydrated] as const;
}
