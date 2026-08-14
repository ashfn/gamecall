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
exports.server = exports.app = exports.prisma = void 0;
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const compression_1 = __importDefault(require("compression"));
const client_1 = require("@prisma/client");
const account_1 = require("./account/account");
const dotenv_1 = __importDefault(require("dotenv"));
const middleware_1 = require("./middleware");
const profileRoute_1 = require("./profile/profileRoute");
const friendRoutes_1 = require("./friends/friendRoutes");
const status_1 = require("./status");
const gameRoutes_1 = require("./game/gameRoutes");
const chatRoutes_1 = require("./chat/chatRoutes");
const realtime_1 = require("./realtime/realtime");
const notificationRoutes_1 = require("./notifications/notificationRoutes");
const inboxRoutes_1 = require("./inbox/inboxRoutes");
dotenv_1.default.config();
function configureDatabasePool() {
    var _a;
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl)
        return;
    const configuredLimit = Number((_a = process.env.PRISMA_CONNECTION_LIMIT) !== null && _a !== void 0 ? _a : 4);
    const connectionLimit = Number.isInteger(configuredLimit) && configuredLimit > 0
        ? Math.min(configuredLimit, 20)
        : 4;
    try {
        const url = new URL(databaseUrl);
        // Prisma otherwise derives its pool size from the container CPU count, which can
        // exceed the connection allowance on small managed PostgreSQL plans.
        if (!url.searchParams.has("connection_limit")) {
            url.searchParams.set("connection_limit", String(connectionLimit));
        }
        if (!url.searchParams.has("pool_timeout")) {
            url.searchParams.set("pool_timeout", "15");
        }
        process.env.DATABASE_URL = url.toString();
        console.log(`Database pool limited to ${url.searchParams.get("connection_limit")} connections`);
    }
    catch (_b) {
        throw new Error("DATABASE_URL is not a valid PostgreSQL URL");
    }
}
configureDatabasePool();
exports.prisma = new client_1.PrismaClient();
const app = (0, express_1.default)();
exports.app = app;
const server = (0, http_1.createServer)(app);
exports.server = server;
(0, realtime_1.attachRealtime)(server);
app.use((0, compression_1.default)({ threshold: 1024 }));
app.use(express_1.default.json({ limit: '2mb' }));
const port = process.env.PORT || 3000;
// passworAd1
app.get('/', (_req, res) => {
    res.send((0, status_1.success)({ service: "rainfrog-api" }));
});
app.post('/account', (req, res) => {
    (0, account_1.register)(req.body.username, req.body.email, req.body.password).then((user) => {
        res.send(JSON.stringify(user));
    });
});
app.post('/login', (req, res) => {
    (0, account_1.login)(req.body.account, req.body.password).then((user) => {
        res.send(JSON.stringify(user));
    });
});
app.post('/refresh', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const suppliedToken = typeof req.body.refreshToken === "string" ? req.body.refreshToken : "";
        const accessToken = yield (0, account_1.refreshToken)(suppliedToken);
        if (accessToken.status === 1 && req.header("x-rainfrog-session-upgrade") === "1") {
            const upgraded = yield (0, account_1.upgradeLegacyRefreshToken)(suppliedToken);
            if (upgraded)
                res.setHeader("x-rainfrog-refresh-token", upgraded);
        }
        res.send(JSON.stringify(accessToken));
    }
    catch (error) {
        console.error("Could not refresh session", error);
        res.status(503).send((0, status_1.clientError)("Rainfrog is temporarily unavailable"));
    }
}));
app.get('/debug', [middleware_1.authenticateToken, middleware_1.userDetails], (req, res) => {
    const user = res.locals.user;
    if (user.role == client_1.Role.ADMIN) {
        res.send("Super secret thing!!");
    }
    else {
        res.send(JSON.stringify(res.locals.user));
    }
});
app.get('/account', [middleware_1.authenticateToken, middleware_1.userDetails], (req, res) => {
    const user = res.locals.user;
    res.send(JSON.stringify((0, status_1.success)({
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        accountCreated: user.accountCreated,
    })));
});
app.post('/profile/:userId/avatar', [middleware_1.authenticateToken, middleware_1.userDetails], profileRoute_1.setAvatarRoute);
app.get('/profile/:userId/', [middleware_1.authenticateToken], profileRoute_1.getProfileRoute);
app.get('/profile/:userId/avatar', [], profileRoute_1.getAvatarRoute);
app.post('/profile/:userId/displayname', [middleware_1.authenticateToken, middleware_1.userDetails], profileRoute_1.setDisplayNameRoute);
app.post('/profile/:userId/username', [middleware_1.authenticateToken, middleware_1.userDetails], profileRoute_1.setUsernameRoute);
app.post('/friendRequest/:userId', [middleware_1.authenticateToken, middleware_1.userFullContext], friendRoutes_1.addFriendRequestRoute);
app.get('/friendRequests', [middleware_1.authenticateToken, middleware_1.userDetails], friendRoutes_1.getFriendRequestsRoute);
app.post('/removeFriend/:userId', [middleware_1.authenticateToken, middleware_1.userDetails], friendRoutes_1.removeFriendRoute);
app.get('/connections', [middleware_1.authenticateToken, middleware_1.userDetails], friendRoutes_1.getConnectionsRoute);
app.post('/denyFriendRequest/:userId', [middleware_1.authenticateToken, middleware_1.userDetails], friendRoutes_1.denyFriendRequestRoute);
app.post('/acceptFriendRequest/:userId', [middleware_1.authenticateToken, middleware_1.userDetails], friendRoutes_1.acceptFriendRequestRoute);
app.post('/searchProfiles', [middleware_1.authenticateToken], profileRoute_1.searchProfilesRoute);
app.post('/newGame', [middleware_1.authenticateToken, middleware_1.userDetails], gameRoutes_1.sendGameRoute);
app.get('/games/:gameId', [middleware_1.authenticateToken, middleware_1.userDetails], gameRoutes_1.getGameRoute);
app.post('/games/:gameId/open-turn', [middleware_1.authenticateToken, middleware_1.userDetails], gameRoutes_1.openTurnRoute);
app.post('/games/:gameId/moves', [middleware_1.authenticateToken, middleware_1.userDetails], gameRoutes_1.makeMoveRoute);
app.post('/games/:gameId/rematch', [middleware_1.authenticateToken, middleware_1.userDetails], gameRoutes_1.rematchGameRoute);
app.post('/endGame', [middleware_1.authenticateToken, middleware_1.userDetails], gameRoutes_1.endGameRoute);
app.post('/updateGame', [middleware_1.authenticateToken, middleware_1.userDetails], gameRoutes_1.updateGameRoute);
app.post('/finishGame', [middleware_1.authenticateToken, middleware_1.userDetails], gameRoutes_1.finishGameRoute);
app.get('/games', [middleware_1.authenticateToken, middleware_1.userDetails], gameRoutes_1.getActiveGamesRoute);
app.get('/inbox/activity', [middleware_1.authenticateToken, middleware_1.userDetails], inboxRoutes_1.getInboxActivityRoute);
app.get('/chats/unread-counts', [middleware_1.authenticateToken, middleware_1.userDetails], chatRoutes_1.getUnreadChatCountsRoute);
app.get('/chats/:userId/messages', [middleware_1.authenticateToken, middleware_1.userDetails], chatRoutes_1.getChatMessagesRoute);
app.get('/chats/:userId/unread-count', [middleware_1.authenticateToken, middleware_1.userDetails], chatRoutes_1.getUnreadChatCountRoute);
app.post('/chats/:userId/messages', [middleware_1.authenticateToken, middleware_1.userDetails], chatRoutes_1.sendChatMessageRoute);
app.post('/notifications/devices', [middleware_1.authenticateToken, middleware_1.userDetails], notificationRoutes_1.registerPushTokenRoute);
app.delete('/notifications/devices', [middleware_1.authenticateToken, middleware_1.userDetails], notificationRoutes_1.unregisterPushTokenRoute);
app.use('/assets', express_1.default.static('public'));
app.get('/logout', [middleware_1.authenticateToken, middleware_1.userDetails], (req, res) => {
    const user = res.locals.user;
    (0, account_1.logout)(user.id).then((data) => {
        res.send(JSON.stringify(data));
    });
});
app.post('/logout', [middleware_1.authenticateToken, middleware_1.userDetails], (req, res) => {
    const user = res.locals.user;
    const refreshToken = typeof req.body.refreshToken === "string" ? req.body.refreshToken : undefined;
    (0, account_1.logout)(user.id, refreshToken).then((data) => {
        res.send(JSON.stringify(data));
    });
});
if (require.main === module) {
    server.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });
    const shutDown = (signal) => {
        console.log(`${signal} received; closing database connections`);
        server.close(() => {
            void exports.prisma.$disconnect().finally(() => process.exit(0));
        });
        setTimeout(() => process.exit(1), 10000).unref();
    };
    process.once("SIGTERM", () => shutDown("SIGTERM"));
    process.once("SIGINT", () => shutDown("SIGINT"));
}
