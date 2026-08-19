"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.principalFromAccount = exports.publicGameUser = exports.publicGameUsers = exports.resolveAnonymousSession = exports.createAnonymousSession = exports.createAnonymousGameUser = exports.ensureAccountGameUser = exports.createAnonymousAccessToken = void 0;
const client_1 = require("@prisma/client");
const crypto_1 = __importDefault(require("crypto"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const __1 = require("..");
const SESSION_ID_BYTES = 16;
const SESSION_SECRET_BYTES = 32;
function anonymousSessionLifetimeMs() {
    const configuredDays = Number(process.env.ANONYMOUS_SESSION_DAYS ?? 180);
    const days = Number.isFinite(configuredDays)
        ? Math.max(7, Math.min(365, Math.floor(configuredDays)))
        : 180;
    return days * 24 * 60 * 60 * 1000;
}
function hashSecret(secret) {
    return crypto_1.default.createHash("sha256").update(secret).digest("hex");
}
function safeHashMatch(stored, supplied) {
    return stored.length === supplied.length
        && crypto_1.default.timingSafeEqual(Buffer.from(stored), Buffer.from(supplied));
}
function parseSessionToken(value) {
    const [id, secret, ...extra] = value.split(".");
    if (extra.length || !/^[a-f0-9]{32}$/i.test(id ?? "") || !/^[a-f0-9]{64}$/i.test(secret ?? ""))
        return null;
    return { id, secret };
}
function createAnonymousAccessToken(gameUserId) {
    const secret = process.env.JWT_SECRET;
    if (!secret)
        throw new Error("JWT_SECRET is not configured");
    return jsonwebtoken_1.default.sign({ kind: "ANONYMOUS", gameUserId }, secret, { expiresIn: (process.env.JWT_ACCESS_TTL ?? "2h") });
}
exports.createAnonymousAccessToken = createAnonymousAccessToken;
async function ensureAccountGameUser(accountId, tx = __1.prisma) {
    const existing = await tx.gameUser.findUnique({ where: { accountId } });
    if (existing)
        return existing;
    return tx.gameUser.create({
        data: {
            // Account ids stay identical during the compatibility period. Anonymous
            // GameUser ids are allocated from the high sequence range in migration SQL.
            id: accountId,
            kind: client_1.GameUserKind.ACCOUNT,
            accountId,
        },
    });
}
exports.ensureAccountGameUser = ensureAccountGameUser;
async function createAnonymousGameUser(displayName) {
    const cleanName = displayName.trim().replace(/\s+/g, " ");
    if (cleanName.length < 1 || cleanName.length > 30)
        throw new Error("Choose a name between 1 and 30 characters");
    const gameUser = await __1.prisma.gameUser.create({
        data: {
            kind: client_1.GameUserKind.ANONYMOUS,
            anonymousDisplayName: cleanName,
            avatarSeed: crypto_1.default.randomBytes(8).toString("hex"),
        },
    });
    const refreshToken = await createAnonymousSession(gameUser.id);
    return { gameUser, refreshToken };
}
exports.createAnonymousGameUser = createAnonymousGameUser;
async function createAnonymousSession(gameUserId) {
    const id = crypto_1.default.randomBytes(SESSION_ID_BYTES).toString("hex");
    const secret = crypto_1.default.randomBytes(SESSION_SECRET_BYTES).toString("hex");
    const now = new Date();
    await __1.prisma.anonymousGameSession.create({
        data: {
            id,
            gameUserId,
            tokenHash: hashSecret(secret),
            expiresAt: new Date(now.getTime() + anonymousSessionLifetimeMs()),
        },
    });
    return `${id}.${secret}`;
}
exports.createAnonymousSession = createAnonymousSession;
async function resolveAnonymousSession(value, slide = true) {
    const parsed = parseSessionToken(value);
    if (!parsed)
        return null;
    const now = new Date();
    const session = await __1.prisma.anonymousGameSession.findUnique({
        where: { id: parsed.id },
        include: { gameUser: true },
    });
    if (!session || session.expiresAt <= now || !safeHashMatch(session.tokenHash, hashSecret(parsed.secret))) {
        if (session?.expiresAt && session.expiresAt <= now) {
            await __1.prisma.anonymousGameSession.delete({ where: { id: session.id } }).catch(() => undefined);
        }
        return null;
    }
    if (slide) {
        await __1.prisma.$transaction([
            __1.prisma.anonymousGameSession.update({
                where: { id: session.id },
                data: { lastUsedAt: now, expiresAt: new Date(now.getTime() + anonymousSessionLifetimeMs()) },
            }),
            __1.prisma.gameUser.update({ where: { id: session.gameUserId }, data: { lastSeenAt: now } }),
        ]);
    }
    return session.gameUser;
}
exports.resolveAnonymousSession = resolveAnonymousSession;
async function publicGameUsers(gameUserIds) {
    if (gameUserIds.length === 0)
        return new Map();
    const gameUsers = await __1.prisma.gameUser.findMany({
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
                anonymous: gameUser.kind === client_1.GameUserKind.ANONYMOUS,
            }];
    }));
}
exports.publicGameUsers = publicGameUsers;
async function publicGameUser(gameUserId) {
    return (await publicGameUsers([gameUserId])).get(gameUserId) ?? null;
}
exports.publicGameUser = publicGameUser;
function principalFromAccount(user, gameUserId) {
    return { kind: "ACCOUNT", accountUserId: user.id, gameUserId };
}
exports.principalFromAccount = principalFromAccount;
