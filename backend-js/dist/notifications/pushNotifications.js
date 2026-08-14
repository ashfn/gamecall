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
exports.notifyFriendRequest = exports.notifyMessage = exports.notifyGame = void 0;
const expo_server_sdk_1 = require("expo-server-sdk");
const __1 = require("..");
const gameDefinition_1 = require("../game/gameDefinition");
const expo = new expo_server_sdk_1.Expo(process.env.EXPO_ACCESS_TOKEN
    ? { accessToken: process.env.EXPO_ACCESS_TOKEN }
    : undefined);
function cleanName(displayName, username) {
    return (displayName === null || displayName === void 0 ? void 0 : displayName.trim()) || (username === null || username === void 0 ? void 0 : username.trim()) || "Your friend";
}
function shortMessage(text) {
    return text.length <= 180 ? text : `${text.slice(0, 177)}...`;
}
function deliver(recipientId, content, data, groupingKey) {
    return __awaiter(this, void 0, void 0, function* () {
        const storedTokens = yield __1.prisma.pushToken.findMany({ where: { userId: recipientId } });
        const tokens = storedTokens.map(({ token }) => token).filter(expo_server_sdk_1.Expo.isExpoPushToken);
        if (tokens.length === 0)
            return;
        const messages = tokens.map((token) => {
            var _a;
            return ({
                to: token,
                title: content.title,
                body: content.body,
                subtitle: content.subtitle,
                data,
                sound: (_a = content.sound) !== null && _a !== void 0 ? _a : "default",
                priority: "high",
                channelId: content.channelId,
                collapseId: groupingKey,
                tag: groupingKey,
                threadId: groupingKey,
            });
        });
        for (const chunk of expo.chunkPushNotifications(messages)) {
            try {
                const tickets = yield expo.sendPushNotificationsAsync(chunk);
                const invalidTokens = tickets.flatMap((ticket, index) => {
                    var _a, _b;
                    if (ticket.status !== "error" || ((_a = ticket.details) === null || _a === void 0 ? void 0 : _a.error) !== "DeviceNotRegistered")
                        return [];
                    const recipient = (_b = chunk[index]) === null || _b === void 0 ? void 0 : _b.to;
                    return typeof recipient === "string" ? [recipient] : recipient !== null && recipient !== void 0 ? recipient : [];
                });
                if (invalidTokens.length > 0) {
                    yield __1.prisma.pushToken.deleteMany({ where: { token: { in: invalidTokens } } });
                }
                tickets.forEach((ticket) => {
                    var _a;
                    if (ticket.status === "error" && ((_a = ticket.details) === null || _a === void 0 ? void 0 : _a.error) !== "DeviceNotRegistered") {
                        console.error("Expo push ticket error", ticket.message, ticket.details);
                    }
                });
            }
            catch (error) {
                console.error("Could not send Expo push notification", error);
            }
        }
    });
}
function defaultGameContent(event, gameName, actorName, winner, recipientId) {
    if (event === "started") {
        return { title: `${actorName} started ${gameName}`, body: "Open the game to see the board.", channelId: "games" };
    }
    if (event === "rematch") {
        return { title: `${actorName} started a rematch`, body: `${gameName} is ready to play.`, channelId: "games" };
    }
    if (event === "turn") {
        return { title: `Your turn in ${gameName}`, body: `${actorName} made a move.`, channelId: "games" };
    }
    if (winner === -1) {
        return { title: `${gameName} ended in a draw`, body: "Open the game to see the final board.", channelId: "games" };
    }
    if (winner === recipientId) {
        return { title: `You won ${gameName}`, body: `Your game with ${actorName} has finished.`, channelId: "games" };
    }
    return { title: `${actorName} won ${gameName}`, body: "Open the game for the result or a rematch.", channelId: "games" };
}
function notifyGame(event, game, actorId, recipientId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        try {
            const definition = (0, gameDefinition_1.getGameDefinition)(game.type);
            if (!definition || actorId === recipientId)
                return;
            const [actor, recipient] = yield Promise.all([
                __1.prisma.user.findUnique({ where: { id: actorId }, select: { displayName: true, username: true } }),
                __1.prisma.user.findUnique({ where: { id: recipientId }, select: { displayName: true, username: true } }),
            ]);
            if (!actor || !recipient)
                return;
            let state = null;
            try {
                state = definition.normalizeState(JSON.parse(game.gameStateJson));
            }
            catch (_c) {
                // A generic notification is still useful if an old stored state cannot be normalized.
            }
            const actorName = cleanName(actor.displayName, actor.username);
            const context = {
                event,
                gameId: game.id,
                actorId,
                actorName,
                recipientId,
                recipientName: cleanName(recipient.displayName, recipient.username),
                winner: game.winner,
                state,
            };
            const base = defaultGameContent(event, definition.displayName, actorName, game.winner, recipientId);
            const content = (_b = (_a = definition.modifyNotification) === null || _a === void 0 ? void 0 : _a.call(definition, base, context)) !== null && _b !== void 0 ? _b : base;
            yield deliver(recipientId, content, {
                kind: "game",
                gameId: game.id,
                userId: actorId,
                gameType: definition.type,
                recipientId,
            }, `game-${game.id}`);
        }
        catch (error) {
            console.error("Could not prepare game notification", error);
        }
    });
}
exports.notifyGame = notifyGame;
function notifyMessage(senderId, recipientId, text) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            if (senderId === recipientId)
                return;
            const sender = yield __1.prisma.user.findUnique({
                where: { id: senderId },
                select: { displayName: true, username: true },
            });
            if (!sender)
                return;
            yield deliver(recipientId, {
                title: cleanName(sender.displayName, sender.username),
                body: shortMessage(text),
                channelId: "messages",
            }, { kind: "message", userId: senderId, recipientId }, `chat-${senderId}-${recipientId}`);
        }
        catch (error) {
            console.error("Could not prepare message notification", error);
        }
    });
}
exports.notifyMessage = notifyMessage;
function notifyFriendRequest(senderId, recipientId) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            if (senderId === recipientId)
                return;
            const sender = yield __1.prisma.user.findUnique({
                where: { id: senderId },
                select: { displayName: true, username: true },
            });
            if (!sender)
                return;
            const senderName = cleanName(sender.displayName, sender.username);
            yield deliver(recipientId, {
                title: "New friend request",
                body: `${senderName} wants to play with you.`,
                channelId: "social",
            }, { kind: "friend_request", userId: senderId, recipientId }, `friend-request-${senderId}`);
        }
        catch (error) {
            console.error("Could not prepare friend request notification", error);
        }
    });
}
exports.notifyFriendRequest = notifyFriendRequest;
