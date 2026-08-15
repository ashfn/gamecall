"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
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
    var _a;
    const configuredDays = Number((_a = process.env.ANONYMOUS_SESSION_DAYS) !== null && _a !== void 0 ? _a : 180);
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
    if (extra.length || !/^[a-f0-9]{32}$/i.test(id !== null && id !== void 0 ? id : "") || !/^[a-f0-9]{64}$/i.test(secret !== null && secret !== void 0 ? secret : ""))
        return null;
    return { id, secret };
}
function createAnonymousAccessToken(gameUserId) {
    var _a;
    const secret = process.env.JWT_SECRET;
    if (!secret)
        throw new Error("JWT_SECRET is not configured");
    return jsonwebtoken_1.default.sign({ kind: "ANONYMOUS", gameUserId }, secret, { expiresIn: ((_a = process.env.JWT_ACCESS_TTL) !== null && _a !== void 0 ? _a : "2h") });
}
exports.createAnonymousAccessToken = createAnonymousAccessToken;
function ensureAccountGameUser(accountId_1) {
    return __awaiter(this, arguments, void 0, function* (accountId, tx = __1.prisma) {
        const existing = yield tx.gameUser.findUnique({ where: { accountId } });
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
    });
}
exports.ensureAccountGameUser = ensureAccountGameUser;
function createAnonymousGameUser(displayName) {
    return __awaiter(this, void 0, void 0, function* () {
        const cleanName = displayName.trim().replace(/\s+/g, " ");
        if (cleanName.length < 1 || cleanName.length > 30)
            throw new Error("Choose a name between 1 and 30 characters");
        const gameUser = yield __1.prisma.gameUser.create({
            data: {
                kind: client_1.GameUserKind.ANONYMOUS,
                anonymousDisplayName: cleanName,
                avatarSeed: crypto_1.default.randomBytes(8).toString("hex"),
            },
        });
        const refreshToken = yield createAnonymousSession(gameUser.id);
        return { gameUser, refreshToken };
    });
}
exports.createAnonymousGameUser = createAnonymousGameUser;
function createAnonymousSession(gameUserId) {
    return __awaiter(this, void 0, void 0, function* () {
        const id = crypto_1.default.randomBytes(SESSION_ID_BYTES).toString("hex");
        const secret = crypto_1.default.randomBytes(SESSION_SECRET_BYTES).toString("hex");
        const now = new Date();
        yield __1.prisma.anonymousGameSession.create({
            data: {
                id,
                gameUserId,
                tokenHash: hashSecret(secret),
                expiresAt: new Date(now.getTime() + anonymousSessionLifetimeMs()),
            },
        });
        return `${id}.${secret}`;
    });
}
exports.createAnonymousSession = createAnonymousSession;
function resolveAnonymousSession(value_1) {
    return __awaiter(this, arguments, void 0, function* (value, slide = true) {
        const parsed = parseSessionToken(value);
        if (!parsed)
            return null;
        const now = new Date();
        const session = yield __1.prisma.anonymousGameSession.findUnique({
            where: { id: parsed.id },
            include: { gameUser: true },
        });
        if (!session || session.expiresAt <= now || !safeHashMatch(session.tokenHash, hashSecret(parsed.secret))) {
            if ((session === null || session === void 0 ? void 0 : session.expiresAt) && session.expiresAt <= now) {
                yield __1.prisma.anonymousGameSession.delete({ where: { id: session.id } }).catch(() => undefined);
            }
            return null;
        }
        if (slide) {
            yield __1.prisma.$transaction([
                __1.prisma.anonymousGameSession.update({
                    where: { id: session.id },
                    data: { lastUsedAt: now, expiresAt: new Date(now.getTime() + anonymousSessionLifetimeMs()) },
                }),
                __1.prisma.gameUser.update({ where: { id: session.gameUserId }, data: { lastSeenAt: now } }),
            ]);
        }
        return session.gameUser;
    });
}
exports.resolveAnonymousSession = resolveAnonymousSession;
function publicGameUsers(gameUserIds) {
    return __awaiter(this, void 0, void 0, function* () {
        if (gameUserIds.length === 0)
            return new Map();
        const gameUsers = yield __1.prisma.gameUser.findMany({
            where: { id: { in: [...new Set(gameUserIds)] } },
            include: {
                account: { select: { id: true, username: true, displayName: true } },
            },
        });
        return new Map(gameUsers.map((gameUser) => {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j;
            const displayName = ((_b = (_a = gameUser.account) === null || _a === void 0 ? void 0 : _a.displayName) === null || _b === void 0 ? void 0 : _b.trim())
                || ((_d = (_c = gameUser.account) === null || _c === void 0 ? void 0 : _c.username) === null || _d === void 0 ? void 0 : _d.trim())
                || ((_e = gameUser.anonymousDisplayName) === null || _e === void 0 ? void 0 : _e.trim())
                || "Guest";
            return [gameUser.id, {
                    id: gameUser.id,
                    accountId: (_g = (_f = gameUser.account) === null || _f === void 0 ? void 0 : _f.id) !== null && _g !== void 0 ? _g : null,
                    username: (_j = (_h = gameUser.account) === null || _h === void 0 ? void 0 : _h.username) !== null && _j !== void 0 ? _j : `guest-${gameUser.id}`,
                    displayName,
                    anonymous: gameUser.kind === client_1.GameUserKind.ANONYMOUS,
                }];
        }));
    });
}
exports.publicGameUsers = publicGameUsers;
function publicGameUser(gameUserId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        return (_a = (yield publicGameUsers([gameUserId])).get(gameUserId)) !== null && _a !== void 0 ? _a : null;
    });
}
exports.publicGameUser = publicGameUser;
function principalFromAccount(user, gameUserId) {
    return { kind: "ACCOUNT", accountUserId: user.id, gameUserId };
}
exports.principalFromAccount = principalFromAccount;
