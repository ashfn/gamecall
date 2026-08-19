"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getInboxActivityRoute = void 0;
const client_1 = require("@prisma/client");
const __1 = require("..");
const friends_1 = require("../friends/friends");
const status_1 = require("../status");
function latestTimestamp(current, candidate) {
    return !current || candidate > current ? candidate : current;
}
async function getInboxActivityRoute(_req, res) {
    const user = res.locals.user;
    const friendships = await (0, friends_1.getFriends)(user.id);
    const friendIds = friendships.map((friendship) => friendship.user1 === user.id ? friendship.user2 : friendship.user1);
    if (friendIds.length === 0)
        return res.send((0, status_1.success)({}));
    const pairKeys = friendIds.map((friendId) => [user.id, friendId]
        .sort((left, right) => left - right)
        .join(":"));
    const [games, messages] = await Promise.all([
        __1.prisma.game.groupBy({
            by: ["pairKey"],
            where: {
                OR: [{ player1: user.id }, { player2: user.id }],
                status: { in: [client_1.GameStatus.STARTED, client_1.GameStatus.ENDED_UNOPENED, client_1.GameStatus.ENDED] },
            },
            _max: { lastActivity: true },
        }),
        __1.prisma.chatMessage.groupBy({
            by: ["pairKey"],
            where: { pairKey: { in: pairKeys } },
            _max: { createdAt: true },
        }),
    ]);
    const latestByFriend = new Map();
    games.forEach((game) => {
        const friendId = game.pairKey.split(":").map(Number).find((id) => id !== user.id);
        if (!friendId || !game._max.lastActivity)
            return;
        latestByFriend.set(friendId, latestTimestamp(latestByFriend.get(friendId), game._max.lastActivity));
    });
    messages.forEach((message) => {
        const friendId = message.pairKey.split(":").map(Number).find((id) => id !== user.id);
        if (!friendId || !message._max.createdAt)
            return;
        latestByFriend.set(friendId, latestTimestamp(latestByFriend.get(friendId), message._max.createdAt));
    });
    return res.send((0, status_1.success)(Object.fromEntries([...latestByFriend.entries()].map(([friendId, timestamp]) => [String(friendId), timestamp.toISOString()]))));
}
exports.getInboxActivityRoute = getInboxActivityRoute;
