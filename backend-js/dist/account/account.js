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
exports.logout = exports.login = exports.register = exports.refreshToken = exports.upgradeLegacyRefreshToken = void 0;
const client_1 = require("@prisma/client");
const __1 = require("..");
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = __importDefault(require("crypto"));
const language_1 = require("../language");
const status_1 = require("../status");
const validation_1 = require("./validation");
const gameIdentity_1 = require("../game/gameIdentity");
function createJwt(user) {
    var _a;
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        console.error("No JWT secret provided so cancelling JWT creation");
        return null;
    }
    return jsonwebtoken_1.default.sign({
        "id": user.id
    }, secret, { expiresIn: ((_a = process.env.JWT_ACCESS_TTL) !== null && _a !== void 0 ? _a : "2h") });
}
const REFRESH_SESSION_ID_BYTES = 16;
const REFRESH_SESSION_SECRET_BYTES = 32;
function refreshSessionLifetimeMs() {
    var _a;
    const configuredDays = Number((_a = process.env.REFRESH_SESSION_DAYS) !== null && _a !== void 0 ? _a : 56);
    const days = Number.isFinite(configuredDays)
        ? Math.max(7, Math.min(180, Math.floor(configuredDays)))
        : 56;
    return days * 24 * 60 * 60 * 1000;
}
function refreshSecretHash(secret) {
    return crypto_1.default.createHash("sha256").update(secret).digest("hex");
}
function parseRefreshSessionToken(value) {
    const [id, secret, ...extra] = value.split(".");
    if (extra.length || !/^[a-f0-9]{32}$/i.test(id !== null && id !== void 0 ? id : "") || !/^[a-f0-9]{64}$/i.test(secret !== null && secret !== void 0 ? secret : ""))
        return null;
    return { id, secret };
}
function createRefreshSession(account) {
    return __awaiter(this, void 0, void 0, function* () {
        const id = crypto_1.default.randomBytes(REFRESH_SESSION_ID_BYTES).toString("hex");
        const secret = crypto_1.default.randomBytes(REFRESH_SESSION_SECRET_BYTES).toString("hex");
        const now = new Date();
        yield __1.prisma.$transaction([
            __1.prisma.refreshSession.deleteMany({
                where: { userId: account.id, expiresAt: { lte: now } },
            }),
            __1.prisma.refreshSession.create({
                data: {
                    id,
                    userId: account.id,
                    tokenHash: refreshSecretHash(secret),
                    expiresAt: new Date(now.getTime() + refreshSessionLifetimeMs()),
                },
            }),
        ]);
        return `${id}.${secret}`;
    });
}
function upgradeLegacyRefreshToken(value) {
    return __awaiter(this, void 0, void 0, function* () {
        if (parseRefreshSessionToken(value) || !value.includes("G"))
            return null;
        const parts = value.split("G");
        if (parts.length !== 2 || !parts[0] || !parts[1])
            return null;
        const userId = Number(parts[1]);
        if (!Number.isInteger(userId) || userId <= 0)
            return null;
        const user = yield __1.prisma.user.findUnique({ where: { id: userId } });
        if (!user || !(yield bcrypt_1.default.compare(parts[0], user.refreshToken)))
            return null;
        return createRefreshSession(user);
    });
}
exports.upgradeLegacyRefreshToken = upgradeLegacyRefreshToken;
function refreshToken(refreshToken) {
    return __awaiter(this, void 0, void 0, function* () {
        if (refreshToken == undefined || refreshToken == null) {
            return (0, status_1.clientError)("Invalid refresh token");
        }
        const sessionToken = parseRefreshSessionToken(refreshToken);
        if (sessionToken) {
            const now = new Date();
            const session = yield __1.prisma.refreshSession.findUnique({
                where: { id: sessionToken.id },
                include: { user: { select: { id: true } } },
            });
            const suppliedHash = refreshSecretHash(sessionToken.secret);
            const validHash = (session === null || session === void 0 ? void 0 : session.tokenHash.length) === suppliedHash.length
                && crypto_1.default.timingSafeEqual(Buffer.from(session.tokenHash), Buffer.from(suppliedHash));
            if (!session || session.expiresAt <= now || !validHash) {
                if ((session === null || session === void 0 ? void 0 : session.expiresAt) && session.expiresAt <= now) {
                    yield __1.prisma.refreshSession.delete({ where: { id: session.id } }).catch(() => undefined);
                }
                return (0, status_1.clientError)("Invalid refresh token");
            }
            yield __1.prisma.$transaction([
                __1.prisma.refreshSession.update({
                    where: { id: session.id },
                    data: {
                        lastUsedAt: now,
                        // Active installations remain signed in; an abandoned
                        // device naturally expires after the configured window.
                        expiresAt: new Date(now.getTime() + refreshSessionLifetimeMs()),
                    },
                }),
                __1.prisma.user.update({ where: { id: session.userId }, data: { lastOnline: now } }),
            ]);
            return (0, status_1.success)(createJwt(session.user));
        }
        // Compatibility path for refresh tokens issued by the prototype. A fresh
        // login upgrades the device to an independent multi-device session.
        if (!refreshToken.includes("G"))
            return (0, status_1.clientError)("Invalid refresh token");
        const parts = refreshToken.split("G");
        if (parts.length != 2 || parts[0] == null || parts[1] == "") {
            return (0, status_1.clientError)("Invalid refresh token");
        }
        const token = refreshToken.split("G")[0];
        const userId = parseInt(refreshToken.split("G")[1]);
        const user = yield __1.prisma.user.findFirst({
            where: {
                id: userId
            }
        });
        if (user == null) {
            return (0, status_1.clientError)("Invalid refresh token");
        }
        const match = yield bcrypt_1.default.compare(token, user.refreshToken);
        if (!match) {
            return (0, status_1.clientError)("Invalid refresh token");
        }
        yield __1.prisma.user.update({
            where: {
                id: user.id
            },
            data: {
                lastOnline: new Date()
            }
        });
        console.log(`Refreshed token for ${user.id}`);
        const accessToken = createJwt(user);
        return (0, status_1.success)(accessToken);
    });
}
exports.refreshToken = refreshToken;
function register(username, email, password) {
    return __awaiter(this, void 0, void 0, function* () {
        if (username == null || email == null || password == null) {
            return (0, status_1.clientError)("Missing parameters");
        }
        const isValidUsername = (0, validation_1.validUsername)(username);
        const isValidEmail = (0, validation_1.validEmail)(email);
        const isValidPassword = (0, validation_1.validPassword)(password);
        if (!isValidUsername) {
            return (0, status_1.userError)(language_1.ENGLISH.USERNAME_REQUREMENTS);
        }
        if (!isValidEmail) {
            return (0, status_1.userError)(language_1.ENGLISH.INVALID_EMAIL);
        }
        if (!isValidPassword) {
            return (0, status_1.userError)(language_1.ENGLISH.PASSWORD_REQUIREMENTS);
        }
        const checkIdentical = yield __1.prisma.user.findFirst({
            where: {
                OR: [
                    { username: {
                            equals: username,
                            mode: "insensitive"
                        } },
                    { email: {
                            equals: email,
                            mode: "insensitive"
                        } },
                ]
            }
        });
        const hashedPassword = yield bcrypt_1.default.hash(password, 10);
        if (checkIdentical != null) {
            if (checkIdentical.email.toUpperCase() == email.toUpperCase()) {
                return (0, status_1.userError)(language_1.ENGLISH.EMAIL_TAKEN);
            }
            if (checkIdentical.username.toUpperCase() == username.toUpperCase()) {
                return (0, status_1.userError)(language_1.ENGLISH.USERNAME_TAKEN);
            }
        }
        yield __1.prisma.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
            const user = yield tx.user.create({
                data: {
                    username: username,
                    email: email,
                    password: hashedPassword,
                    displayName: username,
                    role: client_1.Role.USER,
                    // Avatars are optional in the MVP; the app renders an initial by default.
                }
            });
            yield (0, gameIdentity_1.ensureAccountGameUser)(user.id, tx);
        }));
        return (0, status_1.success)();
    });
}
exports.register = register;
function login(usernameOrEmail, password) {
    return __awaiter(this, void 0, void 0, function* () {
        if (usernameOrEmail == null || password == null) {
            return (0, status_1.clientError)("Missing parameters");
        }
        const account = yield __1.prisma.user.findFirst({
            where: {
                OR: [
                    { username: {
                            equals: usernameOrEmail,
                            mode: "insensitive"
                        } },
                    { email: {
                            equals: usernameOrEmail,
                            mode: "insensitive"
                        } },
                ]
            }
        });
        if (account == null) {
            if (usernameOrEmail.includes("@")) {
                return (0, status_1.userError)(language_1.ENGLISH.NO_ACCOUNT_WITH_EMAIL);
            }
            else {
                return (0, status_1.userError)(language_1.ENGLISH.NO_ACCOUNT_WITH_USERNAME);
            }
        }
        const match = yield bcrypt_1.default.compare(password, account.password);
        if (!match) {
            return (0, status_1.userError)(language_1.ENGLISH.INCORRECT_PASSWORD);
        }
        yield (0, gameIdentity_1.ensureAccountGameUser)(account.id);
        const refreshToken = yield createRefreshSession(account);
        return (0, status_1.success)(refreshToken);
    });
}
exports.login = login;
function logout(userId, refreshToken) {
    return __awaiter(this, void 0, void 0, function* () {
        const sessionToken = refreshToken ? parseRefreshSessionToken(refreshToken) : null;
        if (sessionToken) {
            yield __1.prisma.refreshSession.deleteMany({ where: { id: sessionToken.id, userId } });
        }
        else {
            // Legacy clients did not send their refresh token on logout.
            yield __1.prisma.user.update({ where: { id: userId }, data: { refreshToken: "none" } });
        }
        return (0, status_1.success)();
    });
}
exports.logout = logout;
