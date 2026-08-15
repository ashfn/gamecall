import express, { Request, Response } from 'express';
import { createServer } from 'http';
import compression from 'compression';

import { PrismaClient, Role, User } from '@prisma/client'
import { register, login, refreshToken, logout, upgradeLegacyRefreshToken } from './account/account';
import dotenv from "dotenv"
import { authenticateGameToken, authenticateToken, gamePrincipalDetails, userDetails, userFullContext } from './middleware';
import { getAvatarRoute, searchProfilesRoute, setAvatarRoute, setDisplayNameRoute, setUsernameRoute, getProfileRoute } from './profile/profileRoute';
import { acceptFriendRequestRoute, addFriendRequestRoute, denyFriendRequestRoute, getConnectionsRoute, getFriendRequestsRoute, removeFriendRoute } from './friends/friendRoutes';
import { clientError, success } from './status';
import { endGameRoute, finishGameRoute, getActiveGamesRoute, getGameRoute, hideFinishedGamesWithOpponentRoute, hideGameRoute, makeMoveRoute, openTurnRoute, rematchGameRoute, sendGameRoute, updateGameRoute } from './game/gameRoutes';
import { getChatMessagesRoute, getUnreadChatCountRoute, getUnreadChatCountsRoute, sendChatMessageRoute } from './chat/chatRoutes';
import { attachRealtime } from './realtime/realtime';
import { registerPushTokenRoute, unregisterPushTokenRoute } from './notifications/notificationRoutes';
import { getInboxActivityRoute } from './inbox/inboxRoutes';
import { cancelLobbyRoute, createLinkLobbyRoute, getLobbyRoute, joinInviteRoute, listLobbiesRoute, previewInviteRoute, refreshAnonymousRoute, startLobbyRoute } from './game/gameLobbyRoutes';
import { ensureAccountGameUser } from './game/gameIdentity';

dotenv.config()

function configureDatabasePool() {
    const databaseUrl = process.env.DATABASE_URL
    if (!databaseUrl) return

    const configuredLimit = Number(process.env.PRISMA_CONNECTION_LIMIT ?? 4)
    const connectionLimit = Number.isInteger(configuredLimit) && configuredLimit > 0
        ? Math.min(configuredLimit, 20)
        : 4

    try {
        const url = new URL(databaseUrl)
        // Prisma otherwise derives its pool size from the container CPU count, which can
        // exceed the connection allowance on small managed PostgreSQL plans.
        if (!url.searchParams.has("connection_limit")) {
            url.searchParams.set("connection_limit", String(connectionLimit))
        }
        if (!url.searchParams.has("pool_timeout")) {
            url.searchParams.set("pool_timeout", "15")
        }
        process.env.DATABASE_URL = url.toString()
        console.log(`Database pool limited to ${url.searchParams.get("connection_limit")} connections`)
    } catch {
        throw new Error("DATABASE_URL is not a valid PostgreSQL URL")
    }
}

configureDatabasePool()

export const prisma = new PrismaClient()

const app = express();
const server = createServer(app);
attachRealtime(server);

app.use(compression({ threshold: 1024 }));
app.use(express.json({limit: '2mb'}));
app.use((req, res, next) => {
    const requestOrigin = req.header("origin")
    const configuredOrigins = (process.env.WEB_APP_ORIGIN ?? "")
        .split(",")
        .map((origin) => origin.trim().replace(/\/$/, ""))
        .filter(Boolean)
    const localOrigin = requestOrigin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(requestOrigin)
    if (requestOrigin && (localOrigin || configuredOrigins.includes(requestOrigin.replace(/\/$/, "")))) {
        res.setHeader("Access-Control-Allow-Origin", requestOrigin)
        res.setHeader("Vary", "Origin")
        res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Rainfrog-Session-Upgrade")
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
    }
    if (req.method === "OPTIONS") return res.status(204).send()
    return next()
})

const port = process.env.PORT || 3000;
// passworAd1
app.get('/', (_req: Request, res: Response) => {
    res.send(success({ service: "rainfrog-api" }));
});

app.post('/account', (req: Request, res: Response) => {
    register(req.body.username, req.body.email, req.body.password).then((user) => {
        res.send(JSON.stringify(user))
    })
})

app.post('/login', (req: Request, res: Response) => {
    login(req.body.account, req.body.password).then((user) => {
        res.send(JSON.stringify(user))
    })
})

app.post('/refresh', async (req: Request, res: Response) => {
    try {
        const suppliedToken = typeof req.body.refreshToken === "string" ? req.body.refreshToken : ""
        const accessToken = await refreshToken(suppliedToken)
        if(accessToken.status === 1 && req.header("x-rainfrog-session-upgrade") === "1"){
            const upgraded = await upgradeLegacyRefreshToken(suppliedToken)
            if(upgraded) res.setHeader("x-rainfrog-refresh-token", upgraded)
        }
        res.send(JSON.stringify(accessToken))
    } catch (error) {
        console.error("Could not refresh session", error)
        res.status(503).send(clientError("Rainfrog is temporarily unavailable"))
    }
})

app.get('/debug', [authenticateToken, userDetails], (req: Request, res: Response) => {
    const user: User = res.locals.user
    if(user.role==Role.ADMIN){
        res.send("Super secret thing!!")
    }else{
        res.send(JSON.stringify(res.locals.user))
    }
})

app.get('/account', [authenticateToken, userDetails], (req: Request, res: Response) => {
    const user: User = res.locals.user
    ensureAccountGameUser(user.id).then((gameUser) => res.send(JSON.stringify(success({
            id: user.id,
            gameUserId: gameUser.id,
            username: user.username,
            email: user.email,
            displayName: user.displayName,
            accountCreated: user.accountCreated,
        }))))
})

app.post('/profile/:userId/avatar', [authenticateToken, userDetails], setAvatarRoute)
app.get('/profile/:userId/', [authenticateToken], getProfileRoute)
app.get('/profile/:userId/avatar', [], getAvatarRoute)
app.post('/profile/:userId/displayname', [authenticateToken, userDetails], setDisplayNameRoute)
app.post('/profile/:userId/username', [authenticateToken, userDetails], setUsernameRoute)
app.post('/friendRequest/:userId', [authenticateToken, userFullContext], addFriendRequestRoute)
app.get('/friendRequests', [authenticateToken, userDetails], getFriendRequestsRoute)
app.post('/removeFriend/:userId', [authenticateToken, userDetails], removeFriendRoute)
app.get('/connections', [authenticateToken, userDetails], getConnectionsRoute)
app.post('/denyFriendRequest/:userId', [authenticateToken, userDetails], denyFriendRequestRoute)
app.post('/acceptFriendRequest/:userId', [authenticateToken, userDetails], acceptFriendRequestRoute)
app.post('/searchProfiles', [authenticateToken], searchProfilesRoute)
const gameAuth = [authenticateGameToken, gamePrincipalDetails]
app.post('/newGame', gameAuth, sendGameRoute)
app.get('/games/:gameId', gameAuth, getGameRoute)
app.post('/games/:gameId/open-turn', gameAuth, openTurnRoute)
app.post('/games/:gameId/moves', gameAuth, makeMoveRoute)
app.post('/games/:gameId/rematch', gameAuth, rematchGameRoute)
app.delete('/games/opponents/:opponentId', gameAuth, hideFinishedGamesWithOpponentRoute)
app.delete('/games/:gameId', gameAuth, hideGameRoute)
app.post('/endGame', gameAuth, endGameRoute)
app.post('/updateGame', gameAuth, updateGameRoute)
app.post('/finishGame', gameAuth, finishGameRoute)
app.get('/games', gameAuth, getActiveGamesRoute)
app.post('/game-lobbies', gameAuth, createLinkLobbyRoute)
app.get('/game-lobbies', gameAuth, listLobbiesRoute)
app.get('/game-lobbies/:gameId', gameAuth, getLobbyRoute)
app.post('/game-lobbies/:gameId/start', gameAuth, startLobbyRoute)
app.delete('/game-lobbies/:gameId', gameAuth, cancelLobbyRoute)
app.get('/game-invites/:token', previewInviteRoute)
app.post('/game-invites/:token/join', joinInviteRoute)
app.post('/anonymous-games/refresh', refreshAnonymousRoute)
app.get('/inbox/activity', [authenticateToken, userDetails], getInboxActivityRoute)
app.get('/chats/unread-counts', [authenticateToken, userDetails], getUnreadChatCountsRoute)
app.get('/chats/:userId/messages', [authenticateToken, userDetails], getChatMessagesRoute)
app.get('/chats/:userId/unread-count', [authenticateToken, userDetails], getUnreadChatCountRoute)
app.post('/chats/:userId/messages', [authenticateToken, userDetails], sendChatMessageRoute)
app.post('/notifications/devices', [authenticateToken, userDetails], registerPushTokenRoute)
app.delete('/notifications/devices', [authenticateToken, userDetails], unregisterPushTokenRoute)

app.use('/assets', express.static('public'))

app.get('/logout', [authenticateToken, userDetails], (req: Request, res: Response) => {
    const user: User = res.locals.user
    logout(user.id).then((data) => {
        res.send(JSON.stringify(data))
    })
})

app.post('/logout', [authenticateToken, userDetails], (req: Request, res: Response) => {
    const user: User = res.locals.user
    const refreshToken = typeof req.body.refreshToken === "string" ? req.body.refreshToken : undefined
    logout(user.id, refreshToken).then((data) => {
        res.send(JSON.stringify(data))
    })
})

if (require.main === module) {
    server.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });

    const shutDown = (signal: string) => {
        console.log(`${signal} received; closing database connections`)
        server.close(() => {
            void prisma.$disconnect().finally(() => process.exit(0))
        })
        setTimeout(() => process.exit(1), 10_000).unref()
    }
    process.once("SIGTERM", () => shutDown("SIGTERM"))
    process.once("SIGINT", () => shutDown("SIGINT"))
}

export { app, server };
