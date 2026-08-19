"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifyFriendRequest = exports.notifyMessage = exports.notifyGame = void 0;
const expo_server_sdk_1 = require("expo-server-sdk");
const __1 = require("..");
const gameDefinition_1 = require("../game/gameDefinition");
const gameIdentity_1 = require("../game/gameIdentity");
const expo = new expo_server_sdk_1.Expo(process.env.EXPO_ACCESS_TOKEN
    ? { accessToken: process.env.EXPO_ACCESS_TOKEN }
    : undefined);
function cleanName(displayName, username) {
    return displayName?.trim() || username?.trim() || "Your friend";
}
function shortMessage(text) {
    return text.length <= 180 ? text : `${text.slice(0, 177)}...`;
}
async function deliver(recipientId, content, data, groupingKey) {
    const storedTokens = await __1.prisma.pushToken.findMany({ where: { userId: recipientId } });
    const tokens = storedTokens.map(({ token }) => token).filter(expo_server_sdk_1.Expo.isExpoPushToken);
    if (tokens.length === 0)
        return;
    const messages = tokens.map((token) => ({
        to: token,
        title: content.title,
        body: content.body,
        subtitle: content.subtitle,
        data,
        sound: content.sound ?? "default",
        priority: "high",
        channelId: content.channelId,
        collapseId: groupingKey,
        tag: groupingKey,
        threadId: groupingKey,
    }));
    for (const chunk of expo.chunkPushNotifications(messages)) {
        try {
            const tickets = await expo.sendPushNotificationsAsync(chunk);
            const invalidTokens = tickets.flatMap((ticket, index) => {
                if (ticket.status !== "error" || ticket.details?.error !== "DeviceNotRegistered")
                    return [];
                const recipient = chunk[index]?.to;
                return typeof recipient === "string" ? [recipient] : recipient ?? [];
            });
            if (invalidTokens.length > 0) {
                await __1.prisma.pushToken.deleteMany({ where: { token: { in: invalidTokens } } });
            }
            tickets.forEach((ticket) => {
                if (ticket.status === "error" && ticket.details?.error !== "DeviceNotRegistered") {
                    console.error("Expo push ticket error", ticket.message, ticket.details);
                }
            });
        }
        catch (error) {
            console.error("Could not send Expo push notification", error);
        }
    }
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
async function notifyGame(event, game, actorId, recipientId) {
    try {
        const definition = (0, gameDefinition_1.getGameDefinition)(game.type);
        if (!definition || actorId === recipientId)
            return;
        const [actor, recipient] = await Promise.all([(0, gameIdentity_1.publicGameUser)(actorId), (0, gameIdentity_1.publicGameUser)(recipientId)]);
        if (!actor || !recipient?.accountId)
            return;
        let state = null;
        try {
            state = definition.normalizeState(JSON.parse(game.gameStateJson));
        }
        catch {
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
        const content = definition.modifyNotification?.(base, context) ?? base;
        await deliver(recipient.accountId, content, {
            kind: "game",
            gameId: game.id,
            userId: actor.accountId ?? actorId,
            gameType: definition.type,
            recipientId: recipient.accountId,
        }, `game-${game.id}`);
    }
    catch (error) {
        console.error("Could not prepare game notification", error);
    }
}
exports.notifyGame = notifyGame;
async function notifyMessage(senderId, recipientId, text) {
    try {
        if (senderId === recipientId)
            return;
        const sender = await __1.prisma.user.findUnique({
            where: { id: senderId },
            select: { displayName: true, username: true },
        });
        if (!sender)
            return;
        await deliver(recipientId, {
            title: cleanName(sender.displayName, sender.username),
            body: shortMessage(text),
            channelId: "messages",
        }, { kind: "message", userId: senderId, recipientId }, `chat-${senderId}-${recipientId}`);
    }
    catch (error) {
        console.error("Could not prepare message notification", error);
    }
}
exports.notifyMessage = notifyMessage;
async function notifyFriendRequest(senderId, recipientId) {
    try {
        if (senderId === recipientId)
            return;
        const sender = await __1.prisma.user.findUnique({
            where: { id: senderId },
            select: { displayName: true, username: true },
        });
        if (!sender)
            return;
        const senderName = cleanName(sender.displayName, sender.username);
        await deliver(recipientId, {
            title: "New friend request",
            body: `${senderName} wants to play with you.`,
            channelId: "social",
        }, { kind: "friend_request", userId: senderId, recipientId }, `friend-request-${senderId}`);
    }
    catch (error) {
        console.error("Could not prepare friend request notification", error);
    }
}
exports.notifyFriendRequest = notifyFriendRequest;
