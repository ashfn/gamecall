"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.refreshAnonymousRoute = exports.cancelLobbyRoute = exports.startLobbyRoute = exports.joinInviteRoute = exports.previewInviteRoute = exports.getLobbyRoute = exports.listLobbiesRoute = exports.createLinkLobbyRoute = void 0;
const client_1 = require("@prisma/client");
const crypto_1 = __importDefault(require("crypto"));
const __1 = require("..");
const status_1 = require("../status");
const realtime_1 = require("../realtime/realtime");
const gameDefinition_1 = require("./gameDefinition");
const gameTypes_1 = require("./gameTypes");
const gameIdentity_1 = require("./gameIdentity");
const WORD_DROP_1 = require("./gamestate/games/WORD_DROP");
const LINK_ID_BYTES = 12;
const LINK_SECRET_BYTES = 32;
const LOBBY_LINK_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
function hashSecret(secret) {
    return crypto_1.default.createHash("sha256").update(secret).digest("hex");
}
function safeHashMatch(stored, supplied) {
    return stored.length === supplied.length
        && crypto_1.default.timingSafeEqual(Buffer.from(stored), Buffer.from(supplied));
}
function parseInviteToken(value) {
    if (typeof value !== "string")
        return null;
    const [id, secret, ...extra] = value.split(".");
    if (extra.length || !/^[a-f0-9]{24}$/i.test(id ?? "") || !/^[a-f0-9]{64}$/i.test(secret ?? ""))
        return null;
    return { id, secret, token: `${id}.${secret}` };
}
async function loadValidInvite(rawToken) {
    const parsed = parseInviteToken(rawToken);
    if (!parsed)
        return null;
    const invite = await __1.prisma.gameInviteLink.findUnique({ where: { id: parsed.id }, include: { game: true } });
    if (!invite || invite.revokedAt || invite.expiresAt <= new Date() || !safeHashMatch(invite.secretHash, hashSecret(parsed.secret)))
        return null;
    return { parsed, invite };
}
async function lobbyDto(game) {
    const participants = await __1.prisma.gameParticipant.findMany({
        where: { gameId: game.id },
        orderBy: { seat: "asc" },
        select: { gameUserId: true, seat: true },
    });
    const profiles = await (0, gameIdentity_1.publicGameUsers)(participants.map((participant) => participant.gameUserId));
    const settings = (() => {
        try {
            return (0, gameDefinition_1.getGameDefinition)(game.type)?.normalizeSettings(JSON.parse(game.settingsJson)) ?? {};
        }
        catch {
            return {};
        }
    })();
    return {
        id: game.id,
        type: game.type,
        status: game.status,
        settings,
        minPlayers: game.minPlayers,
        maxPlayers: game.maxPlayers,
        createdByAccountId: game.createdByAccountId,
        createdAt: game.createdAt,
        lastActivity: game.lastActivity,
        players: participants.map((participant) => profiles.get(participant.gameUserId)).filter(Boolean),
    };
}
async function startLobbyInTransaction(tx, gameId, requireMinimum = true) {
    const game = await tx.game.findUnique({ where: { id: gameId } });
    if (!game || game.status !== client_1.GameStatus.LOBBY)
        throw new Error("This lobby is no longer open");
    const participants = await tx.gameParticipant.findMany({
        where: { gameId },
        orderBy: { seat: "asc" },
    });
    if (requireMinimum && participants.length < game.minPlayers)
        throw new Error(`At least ${game.minPlayers} players are needed`);
    if (participants.length > game.maxPlayers)
        throw new Error("This lobby has too many players");
    const definition = (0, gameDefinition_1.getGameDefinition)(game.type);
    if (!definition)
        throw new Error("This game is not installed");
    const settings = definition.normalizeSettings(JSON.parse(game.settingsJson));
    if (game.type === gameTypes_1.GameType.WORD_DROP && (0, WORD_DROP_1.normalizeWordDropSettings)(settings).variant === "TEST") {
        throw new Error("Test games cannot be shared");
    }
    // The host sent the game, so the first person who joined receives the
    // opening turn. Further joiners follow before play cycles back to the host.
    const seatOrder = participants.map((participant) => participant.gameUserId);
    const playOrder = [...seatOrder.slice(1), seatOrder[0]];
    if (game.type !== gameTypes_1.GameType.WORD_DROP && playOrder.length !== 2) {
        throw new Error(`${definition.displayName} needs exactly two players`);
    }
    const state = game.type === gameTypes_1.GameType.WORD_DROP
        ? (0, WORD_DROP_1.createWordDropStateForPlayers)(playOrder, settings)
        : definition.createState(playOrder[0], playOrder[1], settings);
    const now = new Date();
    await tx.gameParticipant.updateMany({ where: { gameId }, data: { actionRequired: false } });
    await tx.gameParticipant.update({
        where: { gameId_gameUserId: { gameId, gameUserId: playOrder[0] } },
        data: { actionRequired: true },
    });
    return tx.game.update({
        where: { id: gameId },
        data: {
            status: client_1.GameStatus.STARTED,
            player1: playOrder[0],
            player2: playOrder[1],
            waitingOn: playOrder[0],
            gameStateJson: JSON.stringify(state),
            startedAt: now,
            lastActivity: now,
            version: { increment: 1 },
        },
    });
}
async function createLinkLobbyRoute(req, res) {
    const user = res.locals.user;
    if (!user)
        return res.send((0, status_1.userError)("Create a Rainfrog account to start a game"));
    const gameUserId = res.locals.gameUserId;
    const type = req.body.game ?? req.body.type ?? "WORD_DROP";
    const definition = (0, gameDefinition_1.getGameDefinition)(type);
    if (!definition)
        return res.send((0, status_1.userError)("Choose a supported game"));
    let settings;
    try {
        settings = definition.normalizeSettings(req.body.settings);
        if (type === gameTypes_1.GameType.WORD_DROP && (0, WORD_DROP_1.normalizeWordDropSettings)(settings).variant === "TEST") {
            return res.send((0, status_1.userError)("Choose Regular or Mini Word Drop"));
        }
    }
    catch (error) {
        return res.send((0, status_1.clientError)(error instanceof Error ? error.message : "Invalid game settings"));
    }
    const linkId = crypto_1.default.randomBytes(LINK_ID_BYTES).toString("hex");
    const linkSecret = crypto_1.default.randomBytes(LINK_SECRET_BYTES).toString("hex");
    const lobbyKey = `lobby:${crypto_1.default.randomUUID()}`;
    const game = await __1.prisma.game.create({
        data: {
            type,
            status: client_1.GameStatus.LOBBY,
            player1: gameUserId,
            player2: 0,
            startedBy: gameUserId,
            winner: 0,
            waitingOn: 0,
            gameStateJson: "{}",
            settingsJson: JSON.stringify(settings),
            pairKey: lobbyKey,
            activeKey: null,
            createdByAccountId: user.id,
            minPlayers: 2,
            maxPlayers: type === gameTypes_1.GameType.WORD_DROP ? 4 : 2,
            participants: { create: { gameUserId, seat: 0 } },
            inviteLinks: {
                create: {
                    id: linkId,
                    secretHash: hashSecret(linkSecret),
                    createdByAccountId: user.id,
                    expiresAt: new Date(Date.now() + LOBBY_LINK_LIFETIME_MS),
                },
            },
        },
    });
    (0, realtime_1.emitGameChanged)(game);
    return res.send((0, status_1.success)({ lobby: await lobbyDto(game), inviteToken: `${linkId}.${linkSecret}` }));
}
exports.createLinkLobbyRoute = createLinkLobbyRoute;
async function listLobbiesRoute(_req, res) {
    const gameUserId = res.locals.gameUserId;
    const games = await __1.prisma.game.findMany({
        where: { status: client_1.GameStatus.LOBBY, participants: { some: { gameUserId } } },
        orderBy: { lastActivity: "desc" },
        take: 30,
    });
    return res.send((0, status_1.success)(await Promise.all(games.map(lobbyDto))));
}
exports.listLobbiesRoute = listLobbiesRoute;
async function getLobbyRoute(req, res) {
    const gameId = Number(req.params.gameId);
    const gameUserId = res.locals.gameUserId;
    if (!Number.isInteger(gameId) || gameId <= 0)
        return res.send((0, status_1.clientError)("Invalid lobby"));
    const game = await __1.prisma.game.findFirst({
        where: { id: gameId, participants: { some: { gameUserId } } },
    });
    if (!game)
        return res.send((0, status_1.userError)("Lobby not found"));
    if (game.status !== client_1.GameStatus.LOBBY) {
        return res.send((0, status_1.success)({ lobby: null, gameId: game.id, status: game.status, hasActiveLink: false }));
    }
    const invite = await __1.prisma.gameInviteLink.findFirst({
        where: { gameId, revokedAt: null, expiresAt: { gt: new Date() } },
        select: { id: true },
    });
    return res.send((0, status_1.success)({ lobby: await lobbyDto(game), gameId: game.id, status: game.status, hasActiveLink: Boolean(invite) }));
}
exports.getLobbyRoute = getLobbyRoute;
async function previewInviteRoute(req, res) {
    const valid = await loadValidInvite(req.params.token);
    if (!valid)
        return res.send((0, status_1.userError)("This game link is invalid or has expired"));
    if (valid.invite.game.status !== client_1.GameStatus.LOBBY) {
        return res.send((0, status_1.success)({ id: valid.invite.game.id, status: valid.invite.game.status }));
    }
    return res.send((0, status_1.success)(await lobbyDto(valid.invite.game)));
}
exports.previewInviteRoute = previewInviteRoute;
async function joinInviteRoute(req, res) {
    const valid = await loadValidInvite(req.params.token);
    if (!valid)
        return res.send((0, status_1.userError)("This game link is invalid or has expired"));
    if (valid.invite.game.status !== client_1.GameStatus.LOBBY)
        return res.send((0, status_1.userError)("This game has already started"));
    const suppliedSession = typeof req.body.anonymousRefreshToken === "string" ? req.body.anonymousRefreshToken : "";
    let gameUser = suppliedSession ? await (0, gameIdentity_1.resolveAnonymousSession)(suppliedSession) : null;
    let refreshToken = suppliedSession;
    if (!gameUser) {
        try {
            const created = await (0, gameIdentity_1.createAnonymousGameUser)(typeof req.body.displayName === "string" ? req.body.displayName : "");
            gameUser = created.gameUser;
            refreshToken = created.refreshToken;
        }
        catch (error) {
            return res.send((0, status_1.clientError)(error instanceof Error ? error.message : "Choose a valid name"));
        }
    }
    try {
        const outcome = await __1.prisma.$transaction(async (tx) => {
            const game = await tx.game.findUnique({ where: { id: valid.invite.gameId } });
            if (!game || game.status !== client_1.GameStatus.LOBBY)
                throw new Error("This game has already started");
            const existing = await tx.gameParticipant.findUnique({
                where: { gameId_gameUserId: { gameId: game.id, gameUserId: gameUser.id } },
            });
            if (existing)
                return { game, started: false };
            const participants = await tx.gameParticipant.findMany({ where: { gameId: game.id }, select: { seat: true } });
            if (participants.length >= game.maxPlayers)
                throw new Error("This game is full");
            const occupied = new Set(participants.map((participant) => participant.seat));
            let seat = 0;
            while (occupied.has(seat))
                seat += 1;
            await tx.gameParticipant.create({ data: { gameId: game.id, gameUserId: gameUser.id, seat } });
            const joinedCount = participants.length + 1;
            if (joinedCount >= game.maxPlayers) {
                return { game: await startLobbyInTransaction(tx, game.id), started: true };
            }
            return {
                game: await tx.game.update({
                    where: { id: game.id },
                    data: { lastActivity: new Date(), version: { increment: 1 } },
                }),
                started: false,
            };
        }, { isolationLevel: client_1.Prisma.TransactionIsolationLevel.Serializable });
        (0, realtime_1.emitGameChanged)(outcome.game);
        return res.send((0, status_1.success)({
            gameId: outcome.game.id,
            status: outcome.game.status,
            accessToken: (0, gameIdentity_1.createAnonymousAccessToken)(gameUser.id),
            refreshToken,
            gameUser: await (0, gameIdentity_1.publicGameUser)(gameUser.id),
            lobby: outcome.game.status === client_1.GameStatus.LOBBY ? await lobbyDto(outcome.game) : null,
        }));
    }
    catch (error) {
        return res.send((0, status_1.userError)(error instanceof Error ? error.message : "Could not join this game"));
    }
}
exports.joinInviteRoute = joinInviteRoute;
async function startLobbyRoute(req, res) {
    const user = res.locals.user;
    if (!user)
        return res.send((0, status_1.userError)("Only an account can start this game"));
    const gameUserId = res.locals.gameUserId;
    const gameId = Number(req.params.gameId);
    if (!Number.isInteger(gameId) || gameId <= 0)
        return res.send((0, status_1.clientError)("Invalid lobby"));
    const lobby = await __1.prisma.game.findFirst({
        where: { id: gameId, status: client_1.GameStatus.LOBBY, createdByAccountId: user.id, participants: { some: { gameUserId } } },
    });
    if (!lobby)
        return res.send((0, status_1.userError)("Only the lobby creator can start this game"));
    try {
        const game = await __1.prisma.$transaction((tx) => startLobbyInTransaction(tx, gameId), { isolationLevel: client_1.Prisma.TransactionIsolationLevel.Serializable });
        (0, realtime_1.emitGameChanged)(game);
        return res.send((0, status_1.success)({ gameId: game.id, status: game.status }));
    }
    catch (error) {
        return res.send((0, status_1.userError)(error instanceof Error ? error.message : "Could not start this game"));
    }
}
exports.startLobbyRoute = startLobbyRoute;
async function cancelLobbyRoute(req, res) {
    const user = res.locals.user;
    if (!user)
        return res.send((0, status_1.userError)("Only an account can cancel this game"));
    const gameUserId = res.locals.gameUserId;
    const gameId = Number(req.params.gameId);
    if (!Number.isInteger(gameId) || gameId <= 0)
        return res.send((0, status_1.clientError)("Invalid lobby"));
    try {
        const cancelled = await __1.prisma.$transaction(async (tx) => {
            const result = await tx.game.updateMany({
                where: {
                    id: gameId,
                    status: client_1.GameStatus.LOBBY,
                    createdByAccountId: user.id,
                    participants: { some: { gameUserId } },
                },
                data: {
                    status: client_1.GameStatus.CANCELLED,
                    waitingOn: 0,
                    activeKey: null,
                    lastActivity: new Date(),
                    version: { increment: 1 },
                },
            });
            if (result.count !== 1)
                throw new Error("Only the lobby creator can cancel an unstarted game");
            await tx.gameInviteLink.updateMany({
                where: { gameId, revokedAt: null },
                data: { revokedAt: new Date() },
            });
            await tx.gameParticipant.updateMany({
                where: { gameId },
                data: { actionRequired: false },
            });
            const game = await tx.game.findUnique({ where: { id: gameId } });
            if (!game)
                throw new Error("Lobby not found");
            return game;
        });
        (0, realtime_1.emitGameChanged)(cancelled);
        return res.send((0, status_1.success)({ gameId: cancelled.id, status: cancelled.status }));
    }
    catch (error) {
        return res.send((0, status_1.userError)(error instanceof Error ? error.message : "Could not cancel this game"));
    }
}
exports.cancelLobbyRoute = cancelLobbyRoute;
async function refreshAnonymousRoute(req, res) {
    const refreshToken = typeof req.body.refreshToken === "string" ? req.body.refreshToken : "";
    const gameUser = await (0, gameIdentity_1.resolveAnonymousSession)(refreshToken);
    if (!gameUser)
        return res.send((0, status_1.clientError)("Invalid anonymous session"));
    return res.send((0, status_1.success)({
        accessToken: (0, gameIdentity_1.createAnonymousAccessToken)(gameUser.id),
        gameUser: await (0, gameIdentity_1.publicGameUser)(gameUser.id),
    }));
}
exports.refreshAnonymousRoute = refreshAnonymousRoute;
