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
Object.defineProperty(exports, "__esModule", { value: true });
exports.finishGameRoute = exports.updateGameRoute = exports.endGameRoute = exports.rematchGameRoute = exports.makeMoveRoute = exports.openTurnRoute = exports.sendGameRoute = exports.getGameRoute = exports.getActiveGamesRoute = void 0;
const client_1 = require("@prisma/client");
const __1 = require("..");
const friends_1 = require("../friends/friends");
const status_1 = require("../status");
const pushNotifications_1 = require("../notifications/pushNotifications");
const realtime_1 = require("../realtime/realtime");
const gameDefinition_1 = require("./gameDefinition");
const gameParticipants_1 = require("./gameParticipants");
const gameTypes_1 = require("./gameTypes");
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
function canPlayTogether(userId, targetId) {
    return __awaiter(this, void 0, void 0, function* () {
        return (0, friends_1.areUserIdsFriends)(userId, targetId);
    });
}
function settingsForGame(game) {
    var _a, _b;
    try {
        return (_b = (_a = (0, gameDefinition_1.getGameDefinition)(game.type)) === null || _a === void 0 ? void 0 : _a.normalizeSettings(JSON.parse(game.settingsJson))) !== null && _b !== void 0 ? _b : {};
    }
    catch (_c) {
        return {};
    }
}
function nextTurnDeadline(gameType, settings, now = new Date()) {
    var _a, _b, _c;
    const seconds = (_c = (_b = (_a = (0, gameDefinition_1.getGameDefinition)(gameType)) === null || _a === void 0 ? void 0 : _a.turnDurationSeconds) === null || _b === void 0 ? void 0 : _b.call(_a, settings)) !== null && _c !== void 0 ? _c : null;
    return seconds ? new Date(now.getTime() + seconds * 1000) : null;
}
function expireTimedGame(game) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const now = new Date();
        if (game.status !== client_1.GameStatus.STARTED || !game.turnDeadline || game.turnDeadline > now)
            return game;
        const timedOutPlayer = game.waitingOn;
        const opponent = timedOutPlayer === game.player1 ? game.player2 : game.player1;
        const definition = (0, gameDefinition_1.getGameDefinition)(game.type);
        let timeoutResult = null;
        if (definition === null || definition === void 0 ? void 0 : definition.applyTurnTimeout) {
            try {
                timeoutResult = definition.applyTurnTimeout(JSON.parse(game.gameStateJson), timedOutPlayer);
            }
            catch (error) {
                console.error(`Could not apply ${game.type} timeout move`, error);
            }
        }
        const winner = (_a = timeoutResult === null || timeoutResult === void 0 ? void 0 : timeoutResult.winner) !== null && _a !== void 0 ? _a : opponent;
        const finished = winner !== 0;
        const expired = yield __1.prisma.game.updateMany({
            where: {
                id: game.id,
                version: game.version,
                status: client_1.GameStatus.STARTED,
                waitingOn: game.waitingOn,
                turnDeadline: { lte: now },
            },
            data: Object.assign(Object.assign({}, (timeoutResult ? { gameStateJson: JSON.stringify(timeoutResult.state) } : {})), { status: finished ? client_1.GameStatus.ENDED_UNOPENED : client_1.GameStatus.STARTED, winner, waitingOn: (_b = timeoutResult === null || timeoutResult === void 0 ? void 0 : timeoutResult.nextPlayer) !== null && _b !== void 0 ? _b : 0, activeKey: finished ? null : game.activeKey, turnDeadline: null, version: { increment: 1 }, lastActivity: now }),
        });
        const current = yield __1.prisma.game.findUnique({ where: { id: game.id } });
        if (!current)
            return game;
        if (expired.count === 1) {
            (0, realtime_1.emitGameChanged)(current);
            const notificationRecipient = finished ? opponent : current.waitingOn;
            if (notificationRecipient !== timedOutPlayer) {
                void (0, pushNotifications_1.notifyGame)(finished ? "finished" : "turn", current, timedOutPlayer, notificationRecipient);
            }
        }
        return current;
    });
}
function toGameDto(storedGame, viewerId, knownOpponent) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        const game = yield expireTimedGame(storedGame);
        const opponentId = game.player1 === viewerId ? game.player2 : game.player1;
        const opponent = knownOpponent !== null && knownOpponent !== void 0 ? knownOpponent : yield __1.prisma.user.findUnique({ where: { id: opponentId }, select: publicProfile });
        let state;
        try {
            const parsed = JSON.parse(game.gameStateJson);
            const definition = (0, gameDefinition_1.getGameDefinition)(game.type);
            const normalized = (_a = definition === null || definition === void 0 ? void 0 : definition.normalizeState(parsed)) !== null && _a !== void 0 ? _a : parsed;
            state = (_c = (_b = definition === null || definition === void 0 ? void 0 : definition.viewState) === null || _b === void 0 ? void 0 : _b.call(definition, normalized, viewerId)) !== null && _c !== void 0 ? _c : normalized;
        }
        catch (_d) {
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
        };
    });
}
function findGameForPlayer(gameId, userId) {
    return __awaiter(this, void 0, void 0, function* () {
        return __1.prisma.game.findFirst({
            where: {
                id: gameId,
                OR: [{ player1: userId }, { player2: userId }],
            },
        });
    });
}
function getActiveGamesRoute(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const user = res.locals.user;
        const hasOpponentFilter = req.query.opponentId !== undefined;
        const opponentId = hasOpponentFilter ? parseId(req.query.opponentId) : null;
        if (hasOpponentFilter && !opponentId)
            return res.send((0, status_1.clientError)("Invalid opponent id"));
        const games = yield __1.prisma.game.findMany({
            where: {
                OR: opponentId
                    ? [
                        { player1: user.id, player2: opponentId },
                        { player1: opponentId, player2: user.id },
                    ]
                    : [{ player1: user.id }, { player2: user.id }],
                type: { in: gameDefinition_1.supportedGameTypes },
                status: { in: [client_1.GameStatus.STARTED, client_1.GameStatus.ENDED_UNOPENED, client_1.GameStatus.ENDED] },
            },
            orderBy: { lastActivity: "desc" },
            take: opponentId ? 100 : 30,
        });
        const opponentIds = [...new Set(games.map((game) => game.player1 === user.id ? game.player2 : game.player1))];
        const profiles = yield __1.prisma.user.findMany({ where: { id: { in: opponentIds } }, select: publicProfile });
        const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
        return res.send((0, status_1.success)(yield Promise.all(games.map((game) => {
            const gameOpponentId = game.player1 === user.id ? game.player2 : game.player1;
            return toGameDto(game, user.id, profilesById.get(gameOpponentId));
        }))));
    });
}
exports.getActiveGamesRoute = getActiveGamesRoute;
function getGameRoute(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const user = res.locals.user;
        const gameId = parseId(req.params.gameId);
        if (!gameId)
            return res.send((0, status_1.clientError)("Invalid game id"));
        const game = yield findGameForPlayer(gameId, user.id);
        if (!game)
            return res.send((0, status_1.userError)("Game not found"));
        if (!(0, gameDefinition_1.getGameDefinition)(game.type))
            return res.send((0, status_1.userError)("This game is not installed"));
        return res.send((0, status_1.success)(yield toGameDto(game, user.id)));
    });
}
exports.getGameRoute = getGameRoute;
function createGame(userId_1, targetId_1, type_1) {
    return __awaiter(this, arguments, void 0, function* (userId, targetId, type, rawSettings = {}, rematchOf) {
        const definition = (0, gameDefinition_1.getGameDefinition)(type);
        if (!definition)
            throw new Error("This game is not installed");
        const settings = definition.normalizeSettings(rawSettings);
        const key = pairKey(userId, targetId);
        const participants = (0, gameParticipants_1.newGameParticipants)(userId, targetId);
        return __1.prisma.game.create({
            data: Object.assign(Object.assign({}, participants), { winner: 0, status: client_1.GameStatus.STARTED, type, settingsJson: JSON.stringify(settings), turnDeadline: null, gameStateJson: JSON.stringify(definition.createState(participants.player1, participants.player2, settings)), pairKey: key, activeKey: key, rematchOf }),
        });
    });
}
function sendGameRoute(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const user = res.locals.user;
        const targetId = parseId((_a = req.body.user) !== null && _a !== void 0 ? _a : req.body.opponentId);
        if (!targetId)
            return res.send((0, status_1.clientError)("Choose a valid opponent"));
        if (targetId === user.id)
            return res.send((0, status_1.userError)("Choose someone else to play"));
        const definition = (0, gameDefinition_1.getGameDefinition)((_b = req.body.game) !== null && _b !== void 0 ? _b : gameTypes_1.GameType.TIC_TAC_TOE);
        if (!definition)
            return res.send((0, status_1.userError)("That game is not installed"));
        const target = yield __1.prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
        if (!target)
            return res.send((0, status_1.userError)("That user no longer exists"));
        if (!(yield canPlayTogether(user.id, targetId))) {
            return res.send((0, status_1.userError)("Add this person as a friend before starting a game"));
        }
        try {
            const game = yield createGame(user.id, targetId, definition.type, req.body.settings);
            (0, realtime_1.emitGameChanged)(game);
            void (0, pushNotifications_1.notifyGame)("started", game, user.id, targetId);
            return res.send((0, status_1.success)(yield toGameDto(game, user.id)));
        }
        catch (error) {
            if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
                const existing = yield __1.prisma.game.findUnique({ where: { activeKey: pairKey(user.id, targetId) } });
                if (existing)
                    return res.send((0, status_1.userError)("You already have an active game with this friend"));
            }
            console.error(error);
            return res.send((0, status_1.clientError)("Could not start the game. Please try again."));
        }
    });
}
exports.sendGameRoute = sendGameRoute;
function openTurnRoute(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const user = res.locals.user;
        const gameId = parseId(req.params.gameId);
        if (!gameId)
            return res.send((0, status_1.clientError)("Invalid game id"));
        const stored = yield findGameForPlayer(gameId, user.id);
        if (!stored)
            return res.send((0, status_1.userError)("Game not found"));
        const game = yield expireTimedGame(stored);
        if (game.status !== client_1.GameStatus.STARTED || game.waitingOn !== user.id || game.turnDeadline) {
            return res.send((0, status_1.success)(yield toGameDto(game, user.id)));
        }
        const settings = settingsForGame(game);
        const deadline = nextTurnDeadline(game.type, settings);
        if (!deadline)
            return res.send((0, status_1.success)(yield toGameDto(game, user.id)));
        const activated = yield __1.prisma.game.updateMany({
            where: {
                id: game.id,
                version: game.version,
                status: client_1.GameStatus.STARTED,
                waitingOn: user.id,
                turnDeadline: null,
            },
            data: { turnDeadline: deadline },
        });
        const current = yield __1.prisma.game.findUnique({ where: { id: game.id } });
        if (!current)
            return res.send((0, status_1.userError)("Game not found"));
        if (activated.count === 1)
            (0, realtime_1.emitGameChanged)(current);
        return res.send((0, status_1.success)(yield toGameDto(current, user.id)));
    });
}
exports.openTurnRoute = openTurnRoute;
function commitMove(command) {
    return __awaiter(this, void 0, void 0, function* () {
        for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
                return yield __1.prisma.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                    const prior = yield tx.gameMoveReceipt.findUnique({ where: { requestId: command.requestId } });
                    if (prior) {
                        const sameMove = prior.moveJson === command.moveJson
                            || (prior.moveJson === "{}" && prior.cell !== null && prior.cell === command.legacyMoveCode);
                        if (prior.gameId !== command.gameId || prior.playerId !== command.userId || !sameMove) {
                            throw new Error("This move request was already used");
                        }
                        const duplicateGame = yield tx.game.findUnique({ where: { id: command.gameId } });
                        if (!duplicateGame)
                            throw new Error("Game not found");
                        return { game: duplicateGame, changed: false };
                    }
                    const game = yield tx.game.findUnique({ where: { id: command.gameId } });
                    if (!game || (game.player1 !== command.userId && game.player2 !== command.userId)) {
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
                    const updated = yield tx.game.updateMany({
                        where: Object.assign({ id: game.id, version: command.expectedVersion, status: client_1.GameStatus.STARTED, waitingOn: command.userId }, (game.turnDeadline ? { turnDeadline: { gt: now } } : {})),
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
                    yield tx.gameMoveReceipt.create({
                        data: {
                            requestId: command.requestId,
                            gameId: command.gameId,
                            playerId: command.userId,
                            cell: command.legacyMoveCode,
                            moveJson: command.moveJson,
                        },
                    });
                    const saved = yield tx.game.findUnique({ where: { id: game.id } });
                    if (!saved)
                        throw new Error("Game not found");
                    return { game: saved, changed: true };
                }), { isolationLevel: client_1.Prisma.TransactionIsolationLevel.Serializable });
            }
            catch (error) {
                if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && (error.code === "P2034" || error.code === "P2002")) {
                    const receipt = yield __1.prisma.gameMoveReceipt.findUnique({ where: { requestId: command.requestId } });
                    if (receipt) {
                        const game = yield __1.prisma.game.findUnique({ where: { id: command.gameId } });
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
    });
}
function makeMoveRoute(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        const user = res.locals.user;
        const gameId = parseId((_a = req.params.gameId) !== null && _a !== void 0 ? _a : req.body.gameId);
        const move = (_b = req.body.move) !== null && _b !== void 0 ? _b : { cell: req.body.cell };
        let moveJson = "";
        try {
            moveJson = JSON.stringify(move);
        }
        catch (_e) {
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
            const stored = yield findGameForPlayer(gameId, user.id);
            const current = stored ? yield expireTimedGame(stored) : null;
            const definition = current ? (0, gameDefinition_1.getGameDefinition)(current.type) : null;
            if (!current || !definition)
                return res.send((0, status_1.userError)("Game not found"));
            if (current.status !== client_1.GameStatus.STARTED)
                return res.send((0, status_1.userError)("This game has already finished"));
            const legacyMoveCode = (_d = (_c = definition.legacyMoveCode) === null || _c === void 0 ? void 0 : _c.call(definition, move)) !== null && _d !== void 0 ? _d : null;
            const committed = yield commitMove({ gameId, userId: user.id, move, moveJson, legacyMoveCode, expectedVersion, requestId });
            const game = committed.game;
            if (committed.changed) {
                const opponentId = game.player1 === user.id ? game.player2 : game.player1;
                const notificationRecipient = game.status === client_1.GameStatus.STARTED ? game.waitingOn : opponentId;
                // In games such as 8 Ball, a successful shot can leave the turn with
                // the shooter. Never tell the opponent it is their turn in that case.
                if (notificationRecipient !== user.id) {
                    void (0, pushNotifications_1.notifyGame)(game.status === client_1.GameStatus.STARTED ? "turn" : "finished", game, user.id, notificationRecipient);
                }
                (0, realtime_1.emitGameChanged)(game);
            }
            return res.send((0, status_1.success)(yield toGameDto(game, user.id)));
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "The move could not be saved";
            return res.send((0, status_1.userError)(message));
        }
    });
}
exports.makeMoveRoute = makeMoveRoute;
function rematchGameRoute(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const user = res.locals.user;
        const gameId = parseId(req.params.gameId);
        if (!gameId)
            return res.send((0, status_1.clientError)("Invalid game id"));
        const storedOriginal = yield findGameForPlayer(gameId, user.id);
        const original = storedOriginal ? yield expireTimedGame(storedOriginal) : null;
        if (!original)
            return res.send((0, status_1.userError)("Game not found"));
        const originalDefinition = (0, gameDefinition_1.getGameDefinition)(original.type);
        if (!originalDefinition)
            return res.send((0, status_1.userError)("This game is not installed"));
        if (original.status === client_1.GameStatus.STARTED)
            return res.send((0, status_1.userError)("Finish this game before starting a rematch"));
        const targetId = original.player1 === user.id ? original.player2 : original.player1;
        if (!(yield canPlayTogether(user.id, targetId)))
            return res.send((0, status_1.userError)("You must still be friends to rematch"));
        const existing = yield __1.prisma.game.findUnique({ where: { rematchOf: original.id } });
        if (existing)
            return res.send((0, status_1.success)(yield toGameDto(existing, user.id)));
        try {
            let settings = {};
            try {
                settings = JSON.parse(original.settingsJson);
            }
            catch (_a) {
                settings = {};
            }
            const game = yield createGame(user.id, targetId, originalDefinition.type, settings, original.id);
            (0, realtime_1.emitGameChanged)(game);
            void (0, pushNotifications_1.notifyGame)("rematch", game, user.id, targetId);
            return res.send((0, status_1.success)(yield toGameDto(game, user.id)));
        }
        catch (error) {
            if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
                const active = yield __1.prisma.game.findUnique({ where: { activeKey: pairKey(user.id, targetId) } });
                if (active)
                    return res.send((0, status_1.success)(yield toGameDto(active, user.id)));
            }
            console.error(error);
            return res.send((0, status_1.clientError)("Could not start the rematch"));
        }
    });
}
exports.rematchGameRoute = rematchGameRoute;
function endGameRoute(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const user = res.locals.user;
        const gameId = parseId(req.body.gameId);
        if (!gameId)
            return res.send((0, status_1.clientError)("Invalid game id"));
        const game = yield findGameForPlayer(gameId, user.id);
        if (!game || game.status !== client_1.GameStatus.STARTED)
            return res.send((0, status_1.userError)("This game is not in progress"));
        const winner = game.player1 === user.id ? game.player2 : game.player1;
        const updated = yield __1.prisma.game.update({
            where: { id: game.id },
            data: { status: client_1.GameStatus.ENDED, winner, waitingOn: 0, activeKey: null, turnDeadline: null, version: { increment: 1 }, lastActivity: new Date() },
        });
        (0, realtime_1.emitGameChanged)(updated);
        void (0, pushNotifications_1.notifyGame)("finished", updated, user.id, winner);
        return res.send((0, status_1.success)(yield toGameDto(updated, user.id)));
    });
}
exports.endGameRoute = endGameRoute;
// Compatibility endpoints used by older prototype clients.
function updateGameRoute(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const action = Array.isArray(req.body.moves) ? req.body.moves[0] : null;
        req.body.move = { cell: Array.isArray(action) ? Number(action[0]) * 3 + Number(action[1]) : action };
        req.body.expectedVersion = (_a = req.body.expectedVersion) !== null && _a !== void 0 ? _a : 0;
        req.body.requestId = (_b = req.body.requestId) !== null && _b !== void 0 ? _b : `legacy-${res.locals.user.id}-${req.body.gameId}-${req.body.expectedVersion}`;
        return makeMoveRoute(req, res);
    });
}
exports.updateGameRoute = updateGameRoute;
function finishGameRoute(_req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        return res.send((0, status_1.success)());
    });
}
exports.finishGameRoute = finishGameRoute;
