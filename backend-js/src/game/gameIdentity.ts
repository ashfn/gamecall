import { GameUser, GameUserKind, Prisma, User } from "@prisma/client";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { prisma } from "..";

const SESSION_ID_BYTES = 16;
const SESSION_SECRET_BYTES = 32;

export interface PublicGameUser {
  id: number;
  accountId: number | null;
  username: string;
  displayName: string;
  anonymous: boolean;
}

export interface GamePrincipal {
  kind: "ACCOUNT" | "ANONYMOUS";
  gameUserId: number;
  accountUserId: number | null;
}

function anonymousSessionLifetimeMs() {
  const configuredDays = Number(process.env.ANONYMOUS_SESSION_DAYS ?? 180);
  const days = Number.isFinite(configuredDays)
    ? Math.max(7, Math.min(365, Math.floor(configuredDays)))
    : 180;
  return days * 24 * 60 * 60 * 1000;
}

function hashSecret(secret: string) {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

function safeHashMatch(stored: string, supplied: string) {
  return stored.length === supplied.length
    && crypto.timingSafeEqual(Buffer.from(stored), Buffer.from(supplied));
}

function parseSessionToken(value: string) {
  const [id, secret, ...extra] = value.split(".");
  if (extra.length || !/^[a-f0-9]{32}$/i.test(id ?? "") || !/^[a-f0-9]{64}$/i.test(secret ?? "")) return null;
  return { id, secret };
}

export function createAnonymousAccessToken(gameUserId: number) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not configured");
  return jwt.sign(
    { kind: "ANONYMOUS", gameUserId },
    secret,
    { expiresIn: (process.env.JWT_ACCESS_TTL ?? "2h") as jwt.SignOptions["expiresIn"] },
  );
}

export async function ensureAccountGameUser(accountId: number, tx: Prisma.TransactionClient | typeof prisma = prisma) {
  const existing = await tx.gameUser.findUnique({ where: { accountId } });
  if (existing) return existing;
  return tx.gameUser.create({
    data: {
      // Account ids stay identical during the compatibility period. Anonymous
      // GameUser ids are allocated from the high sequence range in migration SQL.
      id: accountId,
      kind: GameUserKind.ACCOUNT,
      accountId,
    },
  });
}

export async function createAnonymousGameUser(displayName: string) {
  const cleanName = displayName.trim().replace(/\s+/g, " ");
  if (cleanName.length < 1 || cleanName.length > 30) throw new Error("Choose a name between 1 and 30 characters");
  const gameUser = await prisma.gameUser.create({
    data: {
      kind: GameUserKind.ANONYMOUS,
      anonymousDisplayName: cleanName,
      avatarSeed: crypto.randomBytes(8).toString("hex"),
    },
  });
  const refreshToken = await createAnonymousSession(gameUser.id);
  return { gameUser, refreshToken };
}

export async function createAnonymousSession(gameUserId: number) {
  const id = crypto.randomBytes(SESSION_ID_BYTES).toString("hex");
  const secret = crypto.randomBytes(SESSION_SECRET_BYTES).toString("hex");
  const now = new Date();
  await prisma.anonymousGameSession.create({
    data: {
      id,
      gameUserId,
      tokenHash: hashSecret(secret),
      expiresAt: new Date(now.getTime() + anonymousSessionLifetimeMs()),
    },
  });
  return `${id}.${secret}`;
}

export async function resolveAnonymousSession(value: string, slide = true): Promise<GameUser | null> {
  const parsed = parseSessionToken(value);
  if (!parsed) return null;
  const now = new Date();
  const session = await prisma.anonymousGameSession.findUnique({
    where: { id: parsed.id },
    include: { gameUser: true },
  });
  if (!session || session.expiresAt <= now || !safeHashMatch(session.tokenHash, hashSecret(parsed.secret))) {
    if (session?.expiresAt && session.expiresAt <= now) {
      await prisma.anonymousGameSession.delete({ where: { id: session.id } }).catch(() => undefined);
    }
    return null;
  }
  if (slide) {
    await prisma.$transaction([
      prisma.anonymousGameSession.update({
        where: { id: session.id },
        data: { lastUsedAt: now, expiresAt: new Date(now.getTime() + anonymousSessionLifetimeMs()) },
      }),
      prisma.gameUser.update({ where: { id: session.gameUserId }, data: { lastSeenAt: now } }),
    ]);
  }
  return session.gameUser;
}

export async function publicGameUsers(gameUserIds: number[]): Promise<Map<number, PublicGameUser>> {
  if (gameUserIds.length === 0) return new Map();
  const gameUsers = await prisma.gameUser.findMany({
    where: { id: { in: [...new Set(gameUserIds)] } },
    include: {
      account: { select: { id: true, username: true, displayName: true } },
    },
  });
  return new Map(gameUsers.map((gameUser) => {
    const displayName = gameUser.account?.displayName?.trim()
      || gameUser.account?.username?.trim()
      || gameUser.anonymousDisplayName?.trim()
      || "Guest";
    return [gameUser.id, {
      id: gameUser.id,
      accountId: gameUser.account?.id ?? null,
      username: gameUser.account?.username ?? `guest-${gameUser.id}`,
      displayName,
      anonymous: gameUser.kind === GameUserKind.ANONYMOUS,
    }];
  }));
}

export async function publicGameUser(gameUserId: number): Promise<PublicGameUser | null> {
  return (await publicGameUsers([gameUserId])).get(gameUserId) ?? null;
}

export function principalFromAccount(user: Pick<User, "id">, gameUserId: number): GamePrincipal {
  return { kind: "ACCOUNT", accountUserId: user.id, gameUserId };
}
