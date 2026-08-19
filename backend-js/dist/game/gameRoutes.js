"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.finishGameRoute = exports.updateGameRoute = exports.hideFinishedGamesWithOpponentRoute = exports.hideGameRoute = exports.endGameRoute = exports.rematchGameRoute = exports.makeMoveRoute = exports.openTurnRoute = exports.sendGameRoute = exports.getGameRoute = exports.getActiveGamesRoute = exports.findGameForPlayer = exports.toGameDto = void 0;
const client_1 = require("@prisma/client");
const __1 = require("..");
const friends_1 = require("../friends/friends");
const status_1 = require("../status");
const pushNotifications_1 = require("../notifications/pushNotifications");
const realtime_1 = require("../realtime/realtime");
const gameDefinition_1 = require("./gameDefinition");
const gameParticipants_1 = require("./gameParticipants");
const gameTypes_1 = require("./gameTypes");
const gameIdentity_1 = require("./gameIdentity");
const publicProfile = {
    id: true,
    username: true,
    displayName: true,
};
function pairKey(a, b) {
    return [a, b].sort((left, right) => left - right).join(":");
}
function parseId(value) {
    const id = typeof value === "number" ? value : Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}
async function canPlayTogether(userId, targetId) {
    return (0, friends_1.areUserIdsFriends)(userId, targetId);
}
function settingsForGame(game) {
    try {
        return (0, gameDefinition_1.getGameDefinition)(game.type)?.normalizeSettings(JSON.parse(game.settingsJson)) ?? {};
    }
    catch {
        return {};
    }
}
function nextTurnDeadline(gameType, settings, now = new Date()) {
    const seconds = (0, gameDefinition_1.getGameDefinition)(gameType)?.turnDurationSeconds?.(settings) ?? null;
    return seconds ? new Date(now.getTime() + seconds * 1000) : null;
}
async function expireTimedGame(game) {
    const now = new Date();
    if (game.status !== client_1.GameStatus.STARTED || !game.turnDeadline || game.turnDeadline > now)
        return game;
    const timedOutPlayer = game.waitingOn;
    const opponent = timedOutPlayer === game.player1 ? game.player2 : game.player1;
    const definition = (0, gameDefinition_1.getGameDefinition)(game.type);
    let timeoutResult = null;
    if (definition?.applyTurnTimeout) {
        try {
            timeoutResult = definition.applyTurnTimeout(JSON.parse(game.gameStateJson), timedOutPlayer);
        }
        catch (error) {
            console.error(`Could not apply ${game.type} timeout move`, error);
        }
    }
    const winner = timeoutResult?.winner ?? opponent;
    const finished = winner !== 0;
    const expired = await __1.prisma.game.updateMany({
        where: {
            id: game.id,
            version: game.version,
            status: client_1.GameStatus.STARTED,
            waitingOn: game.waitingOn,
            turnDeadline: { lte: now },
        },
        data: {
            ...(timeoutResult ? { gameStateJson: JSON.stringify(timeoutResult.state) } : {}),
            status: finished ? client_1.GameStatus.ENDED_UNOPENED : client_1.GameStatus.STARTED,
            winner,
            waitingOn: timeoutResult?.nextPlayer ?? 0,
            activeKey: finished ? null : game.activeKey,
            turnDeadline: null,
            version: { increment: 1 },
            lastActivity: now,
        },
    });
    const current = await __1.prisma.game.findUnique({ where: { id: game.id } });
    if (!current)
        return game;
    if (expired.count === 1) {
        await __1.prisma.gameParticipant.updateMany({ where: { gameId: current.id }, data: { actionRequired: false } });
        if (!finished && current.waitingOn > 0) {
            await __1.prisma.gameParticipant.updateMany({
                where: { gameId: current.id, gameUserId: current.waitingOn },
                data: { actionRequired: true },
            });
        }
        (0, realtime_1.emitGameChanged)(current);
        const notificationRecipient = finished ? opponent : current.waitingOn;
        if (notificationRecipient !== timedOutPlayer) {
            void (0, pushNotifications_1.notifyGame)(finished ? "finished" : "turn", current, timedOutPlayer, notificationRecipient);
        }
    }
    return current;
}
async function participantIds(game) {
    const stored = await __1.prisma.gameParticipant.findMany({
        where: { gameId: game.id },
        orderBy: { seat: "asc" },
        select: { gameUserId: true },
    });
    return stored.length > 0 ? stored.map((participant) => participant.gameUserId) : [game.player1, game.player2];
}
async function toGameDto(storedGame, viewerId, knownPlayers) {
    const game = await expireTimedGame(storedGame);
    const ids = await participantIds(game);
    const playerProfiles = knownPlayers ?? await (0, gameIdentity_1.publicGameUsers)(ids);
    const players = ids.map((id) => playerProfiles.get(id)).filter((player) => Boolean(player));
    const opponent = players.find((player) => player.id !== viewerId) ?? null;
    let state;
    try {
        const parsed = JSON.parse(game.gameStateJson);
        const definition = (0, gameDefinition_1.getGameDefinition)(game.type);
        const normalized = definition?.normalizeState(parsed) ?? parsed;
        state = definition?.viewState?.(normalized, viewerId) ?? normalized;
    }
    catch {
        state = null;
    }
    return {
        id: game.id,
        type: game.type,
        status: game.status,
        player1: game.player1,
        player2: game.player2,
        startedBy: game.startedBy,
        winner: game.winner,
        waitingOn: game.waitingOn,
        version: game.version,
        createdAt: game.createdAt,
        lastActivity: game.lastActivity,
        rematchOf: game.rematchOf,
        settings: settingsForGame(game),
        turnDeadline: game.turnDeadline,
        state,
        opponent,
        players,
        viewerGameUserId: viewerId,
        minPlayers: game.minPlayers,
        maxPlayers: game.maxPlayers,
    };
}
exports.toGameDto = toGameDto;
async function findGameForPlayer(gameId, gameUserId) {
    return __1.prisma.game.findFirst({
        where: {
            id: gameId,
            participants: { some: { gameUserId } },
        },
    });
}
exports.findGameForPlayer = findGameForPlayer;
async function getActiveGamesRoute(req, res) {
    const gameUserId = res.locals.gameUserId;
    const hasOpponentFilter = req.query.opponentId !== undefined;
    const opponentAccountId = hasOpponentFilter ? parseId(req.query.opponentId) : null;
    if (hasOpponentFilter && !opponentAccountId)
        return res.send((0, status_1.clientError)("Invalid opponent id"));
    const opponentGameUser = opponentAccountId
        ? await __1.prisma.gameUser.findUnique({ where: { accountId: opponentAccountId }, select: { id: true } })
        : null;
    if (opponentAccountId && !opponentGameUser)
        return res.send((0, status_1.success)([]));
    const games = await __1.prisma.game.findMany({
        where: {
            participants: {
                some: { gameUserId, hiddenAt: null },
            },
            ...(opponentGameUser ? {
                AND: { participants: { some: { gameUserId: opponentGameUser.id } } },
            } : {}),
            type: { in: gameDefinition_1.supportedGameTypes },
            status: { in: [client_1.GameStatus.STARTED, client_1.GameStatus.ENDED_UNOPENED, client_1.GameStatus.ENDED] },
        },
        orderBy: { lastActivity: "desc" },
        take: opponentGameUser ? 100 : 30,
    });
    const memberships = await __1.prisma.gameParticipant.findMany({
        where: { gameId: { in: games.map((game) => game.id) } },
        select: { gameId: true, gameUserId: true },
    });
    const profiles = await (0, gameIdentity_1.publicGameUsers)(memberships.map((membership) => membership.gameUserId));
    return res.send((0, status_1.success)(await Promise.all(games.map((game) => toGameDto(game, gameUserId, profiles)))));
}
exports.getActiveGamesRoute = getActiveGamesRoute;
async function getGameRoute(req, res) {
    const gameUserId = res.locals.gameUserId;
    const gameId = parseId(req.params.gameId);
    if (!gameId)
        return res.send((0, status_1.clientError)("Invalid game id"));
    const game = await findGameForPlayer(gameId, gameUserId);
    if (!game)
        return res.send((0, status_1.userError)("Game not found"));
    if (!(0, gameDefinition_1.getGameDefinition)(game.type))
        return res.send((0, status_1.userError)("This game is not installed"));
    await __1.prisma.gameParticipant.update({
        where: { gameId_gameUserId: { gameId, gameUserId } },
        data: { lastViewedVersion: game.version },
    }).catch(() => undefined);
    return res.send((0, status_1.success)(await toGameDto(game, gameUserId)));
}
exports.getGameRoute = getGameRoute;
async function createGame(accountUserId, senderGameUserId, targetGameUserId, type, rawSettings = {}, rematchOf) {
    const definition = (0, gameDefinition_1.getGameDefinition)(type);
    if (!definition)
        throw new Error("This game is not installed");
    const settings = definition.normalizeSettings(rawSettings);
    const key = pairKey(senderGameUserId, targetGameUserId);
    const participants = (0, gameParticipants_1.newGameParticipants)(senderGameUserId, targetGameUserId);
    return __1.prisma.game.create({
        data: {
            // The receiver gets the opening turn; startedBy remains the sender so
            // chat history can render the challenge on the correct side.
            ...participants,
            winner: 0,
            status: client_1.GameStatus.STARTED,
            type,
            settingsJson: JSON.stringify(settings),
            turnDeadline: null,
            gameStateJson: JSON.stringify(definition.createState(participants.player1, participants.player2, settings)),
            pairKey: key,
            activeKey: key,
            rematchOf,
            createdByAccountId: accountUserId,
            startedAt: new Date(),
            participants: {
                create: [
                    { gameUserId: participants.player1, seat: 0, actionRequired: true },
                    { gameUserId: participants.player2, seat: 1, actionRequired: false },
                ],
            },
        },
    });
}
async function sendGameRoute(req, res) {
    const user = res.locals.user;
    if (!user)
        return res.send((0, status_1.userError)("Create a Rainfrog account to start games"));
    const senderGameUserId = res.locals.gameUserId;
    const targetId = parseId(req.body.user ?? req.body.opponentId);
    if (!targetId)
        return res.send((0, status_1.clientError)("Choose a valid opponent"));
    if (targetId === user.id)
        return res.send((0, status_1.userError)("Choose someone else to play"));
    const definition = (0, gameDefinition_1.getGameDefinition)(req.body.game ?? gameTypes_1.GameType.TIC_TAC_TOE);
    if (!definition)
        return res.send((0, status_1.userError)("That game is not installed"));
    const target = await __1.prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
    if (!target)
        return res.send((0, status_1.userError)("That user no longer exists"));
    if (!(await canPlayTogether(user.id, targetId))) {
        return res.send((0, status_1.userError)("Add this person as a friend before starting a game"));
    }
    try {
        const targetGameUser = await (0, gameIdentity_1.ensureAccountGameUser)(targetId);
        const game = await createGame(user.id, senderGameUserId, targetGameUser.id, definition.type, req.body.settings);
        (0, realtime_1.emitGameChanged)(game);
        void (0, pushNotifications_1.notifyGame)("started", game, senderGameUserId, targetGameUser.id);
        return res.send((0, status_1.success)(await toGameDto(game, senderGameUserId)));
    }
    catch (error) {
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
            const targetGameUser = await (0, gameIdentity_1.ensureAccountGameUser)(targetId);
            const existing = await __1.prisma.game.findUnique({ where: { activeKey: pairKey(senderGameUserId, targetGameUser.id) } });
            if (existing)
                return res.send((0, status_1.userError)("You already have an active game with this friend"));
        }
        console.error(error);
        return res.send((0, status_1.clientError)("Could not start the game. Please try again."));
    }
}
exports.sendGameRoute = sendGameRoute;
async function openTurnRoute(req, res) {
    const gameUserId = res.locals.gameUserId;
    const gameId = parseId(req.params.gameId);
    if (!gameId)
        return res.send((0, status_1.clientError)("Invalid game id"));
    const stored = await findGameForPlayer(gameId, gameUserId);
    if (!stored)
        return res.send((0, status_1.userError)("Game not found"));
    const game = await expireTimedGame(stored);
    if (game.status !== client_1.GameStatus.STARTED || game.waitingOn !== gameUserId || game.turnDeadline) {
        return res.send((0, status_1.success)(await toGameDto(game, gameUserId)));
    }
    const settings = settingsForGame(game);
    const deadline = nextTurnDeadline(game.type, settings);
    if (!deadline)
        return res.send((0, status_1.success)(await toGameDto(game, gameUserId)));
    const activated = await __1.prisma.game.updateMany({
        where: {
            id: game.id,
            version: game.version,
            status: client_1.GameStatus.STARTED,
            waitingOn: gameUserId,
            turnDeadline: null,
        },
        data: { turnDeadline: deadline },
    });
    const current = await __1.prisma.game.findUnique({ where: { id: game.id } });
    if (!current)
        return res.send((0, status_1.userError)("Game not found"));
    if (activated.count === 1)
        (0, realtime_1.emitGameChanged)(current);
    return res.send((0, status_1.success)(await toGameDto(current, gameUserId)));
}
exports.openTurnRoute = openTurnRoute;
async function commitMove(command) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            return await __1.prisma.$transaction(async (tx) => {
                const prior = await tx.gameMoveReceipt.findUnique({ where: { requestId: command.requestId } });
                if (prior) {
                    const sameMove = prior.moveJson === command.moveJson
                        || (prior.moveJson === "{}" && prior.cell !== null && prior.cell === command.legacyMoveCode);
                    if (prior.gameId !== command.gameId || prior.playerId !== command.userId || !sameMove) {
                        throw new Error("This move request was already used");
                    }
                    const duplicateGame = await tx.game.findUnique({ where: { id: command.gameId } });
                    if (!duplicateGame)
                        throw new Error("Game not found");
                    return { game: duplicateGame, changed: false };
                }
                const game = await tx.game.findUnique({ where: { id: command.gameId } });
                const membership = await tx.gameParticipant.findUnique({
                    where: { gameId_gameUserId: { gameId: command.gameId, gameUserId: command.userId } },
                    select: { gameUserId: true },
                });
                if (!game || !membership) {
                    throw new Error("Game not found");
                }
                const definition = (0, gameDefinition_1.getGameDefinition)(game.type);
                if (!definition)
                    throw new Error("This game is not installed");
                if (game.status !== client_1.GameStatus.STARTED)
                    throw new Error("This game has already finished");
                if (game.waitingOn !== command.userId)
                    throw new Error("It is not your turn");
                if (game.version !== command.expectedVersion)
                    throw new Error("The game changed. Refresh and try again.");
                const now = new Date();
                if (game.turnDeadline && game.turnDeadline <= now)
                    throw new Error("Your move timer expired");
                const result = definition.applyMove(JSON.parse(game.gameStateJson), command.userId, command.move);
                const finished = result.winner !== 0;
                const updated = await tx.game.updateMany({
                    where: {
                        id: game.id,
                        version: command.expectedVersion,
                        status: client_1.GameStatus.STARTED,
                        waitingOn: command.userId,
                        ...(game.turnDeadline ? { turnDeadline: { gt: now } } : {}),
                    },
                    data: {
                        gameStateJson: JSON.stringify(result.state),
                        winner: result.winner,
                        waitingOn: result.nextPlayer,
                        status: finished ? client_1.GameStatus.ENDED_UNOPENED : client_1.GameStatus.STARTED,
                        activeKey: finished ? null : game.activeKey,
                        turnDeadline: null,
                        version: { increment: 1 },
                        lastActivity: now,
                    },
                });
                if (updated.count !== 1)
                    throw new Error("The game changed. Refresh and try again.");
                await tx.gameParticipant.updateMany({ where: { gameId: game.id }, data: { actionRequired: false } });
                if (!finished && result.nextPlayer > 0) {
                    await tx.gameParticipant.updateMany({
                        where: { gameId: game.id, gameUserId: result.nextPlayer },
                        data: { actionRequired: true },
                    });
                }
                await tx.gameMoveReceipt.create({
                    data: {
                        requestId: command.requestId,
                        gameId: command.gameId,
                        playerId: command.userId,
                        cell: command.legacyMoveCode,
                        moveJson: command.moveJson,
                    },
                });
                const saved = await tx.game.findUnique({ where: { id: game.id } });
                if (!saved)
                    throw new Error("Game not found");
                return { game: saved, changed: true };
            }, { isolationLevel: client_1.Prisma.TransactionIsolationLevel.Serializable });
        }
        catch (error) {
            if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && (error.code === "P2034" || error.code === "P2002")) {
                const receipt = await __1.prisma.gameMoveReceipt.findUnique({ where: { requestId: command.requestId } });
                if (receipt) {
                    const game = await __1.prisma.game.findUnique({ where: { id: command.gameId } });
                    if (game)
                        return { game, changed: false };
                }
                if (attempt < 2)
                    continue;
            }
            throw error;
        }
    }
    throw new Error("The move could not be saved");
}
async function makeMoveRoute(req, res) {
    const gameUserId = res.locals.gameUserId;
    const gameId = parseId(req.params.gameId ?? req.body.gameId);
    const move = req.body.move ?? { cell: req.body.cell };
    let moveJson = "";
    try {
        moveJson = JSON.stringify(move);
    }
    catch {
        return res.send((0, status_1.clientError)("Invalid move request"));
    }
    const expectedVersion = Number(req.body.expectedVersion);
    const requestId = typeof req.body.requestId === "string" ? req.body.requestId.trim() : "";
    if (!gameId || !moveJson || moveJson.length > 10000)
        return res.send((0, status_1.clientError)("Invalid move request"));
    if (!Number.isInteger(expectedVersion) || expectedVersion < 0)
        return res.send((0, status_1.clientError)("Refresh the game and try again"));
    if (!requestId || requestId.length > 100)
        return res.send((0, status_1.clientError)("Invalid move request"));
    try {
        const stored = await findGameForPlayer(gameId, gameUserId);
        const current = stored ? await expireTimedGame(stored) : null;
        const definition = current ? (0, gameDefinition_1.getGameDefinition)(current.type) : null;
        if (!current || !definition)
            return res.send((0, status_1.userError)("Game not found"));
        if (current.status !== client_1.GameStatus.STARTED)
            return res.send((0, status_1.userError)("This game has already finished"));
        const legacyMoveCode = definition.legacyMoveCode?.(move) ?? null;
        const committed = await commitMove({ gameId, userId: gameUserId, move, moveJson, legacyMoveCode, expectedVersion, requestId });
        const game = committed.game;
        if (committed.changed) {
            const ids = await participantIds(game);
            const notificationRecipient = game.status === client_1.GameStatus.STARTED
                ? game.waitingOn
                : ids.find((id) => id !== gameUserId) ?? 0;
            // In games such as 8 Ball, a successful shot can leave the turn with
            // the shooter. Never tell the opponent it is their turn in that case.
            if (notificationRecipient > 0 && notificationRecipient !== gameUserId) {
                void (0, pushNotifications_1.notifyGame)(game.status === client_1.GameStatus.STARTED ? "turn" : "finished", game, gameUserId, notificationRecipient);
            }
            (0, realtime_1.emitGameChanged)(game);
        }
        return res.send((0, status_1.success)(await toGameDto(game, gameUserId)));
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "The move could not be saved";
        return res.send((0, status_1.userError)(message));
    }
}
exports.makeMoveRoute = makeMoveRoute;
async function rematchGameRoute(req, res) {
    const user = res.locals.user;
    const gameUserId = res.locals.gameUserId;
    const gameId = parseId(req.params.gameId);
    if (!gameId)
        return res.send((0, status_1.clientError)("Invalid game id"));
    const storedOriginal = await findGameForPlayer(gameId, gameUserId);
    const original = storedOriginal ? await expireTimedGame(storedOriginal) : null;
    if (!original)
        return res.send((0, status_1.userError)("Game not found"));
    const originalDefinition = (0, gameDefinition_1.getGameDefinition)(original.type);
    if (!originalDefinition)
        return res.send((0, status_1.userError)("This game is not installed"));
    const requestedDefinition = req.body?.game === undefined
        ? originalDefinition
        : (0, gameDefinition_1.getGameDefinition)(req.body.game);
    if (!requestedDefinition)
        return res.send((0, status_1.userError)("That game is not installed"));
    if (original.status === client_1.GameStatus.STARTED)
        return res.send((0, status_1.userError)("Finish this game before starting a rematch"));
    const ids = await participantIds(original);
    if (ids.length !== 2)
        return res.send((0, status_1.userError)("Start a new lobby to play this group again"));
    const targetGameUserId = ids.find((id) => id !== gameUserId);
    const [viewerProfile, targetProfile] = await Promise.all([
        (0, gameIdentity_1.publicGameUser)(gameUserId),
        (0, gameIdentity_1.publicGameUser)(targetGameUserId),
    ]);
    if (!viewerProfile || !targetProfile)
        return res.send((0, status_1.userError)("Player not found"));
    if (!viewerProfile.accountId && !targetProfile.accountId) {
        return res.send((0, status_1.userError)("A Rainfrog account is required to restart this game"));
    }
    if (viewerProfile.accountId && targetProfile.accountId
        && !(await canPlayTogether(viewerProfile.accountId, targetProfile.accountId))) {
        return res.send((0, status_1.userError)("You must still be friends to play again"));
    }
    const creatorAccountId = user?.id
        ?? viewerProfile.accountId
        ?? targetProfile.accountId
        ?? original.createdByAccountId;
    if (!creatorAccountId)
        return res.send((0, status_1.userError)("A Rainfrog account is required to restart this game"));
    const existing = await __1.prisma.game.findUnique({ where: { rematchOf: original.id } });
    if (existing)
        return res.send((0, status_1.success)(await toGameDto(existing, gameUserId)));
    try {
        let settings = req.body?.settings;
        if (req.body?.game === undefined) {
            try {
                settings = JSON.parse(original.settingsJson);
            }
            catch {
                settings = {};
            }
        }
        const game = await createGame(creatorAccountId, gameUserId, targetGameUserId, requestedDefinition.type, settings, original.id);
        (0, realtime_1.emitGameChanged)(game);
        void (0, pushNotifications_1.notifyGame)(requestedDefinition.type === originalDefinition.type ? "rematch" : "started", game, gameUserId, targetGameUserId);
        return res.send((0, status_1.success)(await toGameDto(game, gameUserId)));
    }
    catch (error) {
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
            const active = await __1.prisma.game.findUnique({ where: { activeKey: pairKey(gameUserId, targetGameUserId) } });
            if (active)
                return res.send((0, status_1.success)(await toGameDto(active, gameUserId)));
        }
        console.error(error);
        return res.send((0, status_1.clientError)("Could not start the rematch"));
    }
}
exports.rematchGameRoute = rematchGameRoute;
async function endGameRoute(req, res) {
    const gameUserId = res.locals.gameUserId;
    const gameId = parseId(req.body.gameId);
    if (!gameId)
        return res.send((0, status_1.clientError)("Invalid game id"));
    const game = await findGameForPlayer(gameId, gameUserId);
    if (!game || game.status !== client_1.GameStatus.STARTED)
        return res.send((0, status_1.userError)("This game is not in progress"));
    const ids = await participantIds(game);
    if (ids.length !== 2)
        return res.send((0, status_1.userError)("Leaving multiplayer games is not supported yet"));
    const winner = ids.find((id) => id !== gameUserId);
    const updated = await __1.prisma.game.update({
        where: { id: game.id },
        data: { status: client_1.GameStatus.ENDED, winner, waitingOn: 0, activeKey: null, turnDeadline: null, version: { increment: 1 }, lastActivity: new Date() },
    });
    (0, realtime_1.emitGameChanged)(updated);
    await __1.prisma.gameParticipant.updateMany({ where: { gameId: game.id }, data: { actionRequired: false } });
    void (0, pushNotifications_1.notifyGame)("finished", updated, gameUserId, winner);
    return res.send((0, status_1.success)(await toGameDto(updated, gameUserId)));
}
exports.endGameRoute = endGameRoute;
async function hideGameRoute(req, res) {
    const gameUserId = res.locals.gameUserId;
    const gameId = parseId(req.params.gameId);
    if (!gameId)
        return res.send((0, status_1.clientError)("Invalid game id"));
    const game = await findGameForPlayer(gameId, gameUserId);
    if (!game)
        return res.send((0, status_1.userError)("Game not found"));
    if (game.status === client_1.GameStatus.STARTED)
        return res.send((0, status_1.userError)("End this game before removing it"));
    await __1.prisma.gameParticipant.update({
        where: { gameId_gameUserId: { gameId, gameUserId } },
        data: { hiddenAt: new Date(), actionRequired: false },
    });
    return res.send((0, status_1.success)({ gameId }));
}
exports.hideGameRoute = hideGameRoute;
async function hideFinishedGamesWithOpponentRoute(req, res) {
    const gameUserId = res.locals.gameUserId;
    const opponentGameUserId = parseId(req.params.opponentId);
    if (!opponentGameUserId || opponentGameUserId === gameUserId) {
        return res.send((0, status_1.clientError)("Invalid opponent id"));
    }
    const anonymousOpponent = await __1.prisma.gameUser.findFirst({
        where: { id: opponentGameUserId, accountId: null },
        select: { id: true },
    });
    if (!anonymousOpponent)
        return res.send((0, status_1.userError)("Online player not found"));
    const memberships = await __1.prisma.gameParticipant.findMany({
        where: {
            gameUserId,
            hiddenAt: null,
            game: {
                status: { in: [client_1.GameStatus.ENDED, client_1.GameStatus.ENDED_UNOPENED, client_1.GameStatus.CANCELLED] },
                participants: { some: { gameUserId: opponentGameUserId } },
            },
        },
        select: { gameId: true },
    });
    const gameIds = memberships.map((membership) => membership.gameId);
    if (gameIds.length > 0) {
        await __1.prisma.gameParticipant.updateMany({
            where: { gameUserId, gameId: { in: gameIds } },
            data: { hiddenAt: new Date(), actionRequired: false },
        });
    }
    return res.send((0, status_1.success)({ gameIds }));
}
exports.hideFinishedGamesWithOpponentRoute = hideFinishedGamesWithOpponentRoute;
// Compatibility endpoints used by older prototype clients.
async function updateGameRoute(req, res) {
    const action = Array.isArray(req.body.moves) ? req.body.moves[0] : null;
    req.body.move = { cell: Array.isArray(action) ? Number(action[0]) * 3 + Number(action[1]) : action };
    req.body.expectedVersion = req.body.expectedVersion ?? 0;
    req.body.requestId = req.body.requestId ?? `legacy-${res.locals.gameUserId}-${req.body.gameId}-${req.body.expectedVersion}`;
    return makeMoveRoute(req, res);
}
exports.updateGameRoute = updateGameRoute;
async function finishGameRoute(_req, res) {
    return res.send((0, status_1.success)());
}
exports.finishGameRoute = finishGameRoute;
