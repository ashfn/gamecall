import type { User } from "./types";

export type ProfileRelation = "Add" | "Requested" | "Accept" | "Remove" | null;

interface CachedProfile {
  user: User;
  relation: ProfileRelation;
}

const profiles = new Map<number, CachedProfile>();

export function cacheProfile(user: User, relation: ProfileRelation): CachedProfile {
  const cached = { user, relation };
  profiles.set(user.id, cached);
  return cached;
}

export function getCachedProfile(userId: number): CachedProfile | null {
  return profiles.get(userId) ?? null;
}
