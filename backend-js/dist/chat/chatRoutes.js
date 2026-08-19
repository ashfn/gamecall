"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendChatMessageRoute = exports.getUnreadChatCountsRoute = exports.getUnreadChatCountRoute = exports.getChatMessagesRoute = void 0;
const client_1 = require("@prisma/client");
const __1 = require("..");
const friends_1 = require("../friends/friends");
const status_1 = require("../status");
const realtime_1 = require("../realtime/realtime");
const pushNotifications_1 = require("../notifications/pushNotifications");
const publicMessage = {
    id: true,
    senderId: true,
    recipientId: true,
    text: true,
    createdAt: true,
};
function toPublicMessage(message) {
    return {
        id: message.id,
        senderId: message.senderId,
        recipientId: message.recipientId,
        text: message.text,
        createdAt: message.createdAt,
    };
}
function parseId(value) {
    const id = typeof value === "number" ? value : Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}
function pairKey(a, b) {
    return [a, b].sort((left, right) => left - right).join(":");
}
async function canChat(userId, targetId) {
    return (0, friends_1.areUserIdsFriends)(userId, targetId);
}
async function getChatMessagesRoute(req, res) {
    const user = res.locals.user;
    const targetId = parseId(req.params.userId);
    if (!targetId || targetId === user.id)
        return res.send((0, status_1.clientError)("Choose a valid friend"));
    if (!(await canChat(user.id, targetId)))
        return res.send((0, status_1.userError)("You can only chat with friends"));
    const afterId = req.query.afterId === undefined ? null : parseId(req.query.afterId);
    if (req.query.afterId !== undefined && !afterId)
        return res.send((0, status_1.clientError)("Invalid message cursor"));
    const loaded = await __1.prisma.chatMessage.findMany({
        where: {
            pairKey: pairKey(user.id, targetId),
            ...(afterId ? { id: { gt: afterId } } : {}),
        },
        orderBy: afterId
            ? [{ createdAt: "asc" }, { id: "asc" }]
            : [{ createdAt: "desc" }, { id: "desc" }],
        take: 100,
        select: publicMessage,
    });
    await __1.prisma.chatMessage.updateMany({
        where: { senderId: targetId, recipientId: user.id, readAt: null },
        data: { readAt: new Date() },
    });
    return res.send((0, status_1.success)(afterId ? loaded : loaded.reverse()));
}
exports.getChatMessagesRoute = getChatMessagesRoute;
async function getUnreadChatCountRoute(req, res) {
    const user = res.locals.user;
    const targetId = parseId(req.params.userId);
    if (!targetId || targetId === user.id)
        return res.send((0, status_1.clientError)("Choose a valid friend"));
    if (!(await canChat(user.id, targetId)))
        return res.send((0, status_1.userError)("You can only chat with friends"));
    const count = await __1.prisma.chatMessage.count({
        where: {
            senderId: targetId,
            recipientId: user.id,
            readAt: null,
        },
    });
    return res.send((0, status_1.success)({ count }));
}
exports.getUnreadChatCountRoute = getUnreadChatCountRoute;
async function getUnreadChatCountsRoute(_req, res) {
    const user = res.locals.user;
    const counts = await __1.prisma.chatMessage.groupBy({
        by: ["senderId"],
        where: {
            recipientId: user.id,
            readAt: null,
        },
        _count: { _all: true },
    });
    return res.send((0, status_1.success)(Object.fromEntries(counts.map((item) => [String(item.senderId), item._count._all]))));
}
exports.getUnreadChatCountsRoute = getUnreadChatCountsRoute;
async function sendChatMessageRoute(req, res) {
    const user = res.locals.user;
    const targetId = parseId(req.params.userId);
    const text = typeof req.body.text === "string" ? req.body.text.trim() : "";
    const clientRequestId = typeof req.body.clientRequestId === "string" ? req.body.clientRequestId.trim() : "";
    if (!targetId || targetId === user.id)
        return res.send((0, status_1.clientError)("Choose a valid friend"));
    if (!text || text.length > 1000)
        return res.send((0, status_1.clientError)("Messages must be between 1 and 1000 characters"));
    if (!clientRequestId || clientRequestId.length > 120)
        return res.send((0, status_1.clientError)("Invalid message request"));
    if (!(await canChat(user.id, targetId)))
        return res.send((0, status_1.userError)("You can only chat with friends"));
    const existing = await __1.prisma.chatMessage.findUnique({ where: { clientRequestId } });
    if (existing) {
        if (existing.senderId === user.id && existing.recipientId === targetId && existing.text === text) {
            return res.send((0, status_1.success)(toPublicMessage(existing)));
        }
        return res.send((0, status_1.userError)("This message request was already used"));
    }
    try {
        const message = await __1.prisma.chatMessage.create({
            data: {
                pairKey: pairKey(user.id, targetId),
                senderId: user.id,
                recipientId: targetId,
                text,
                clientRequestId,
            },
        });
        (0, realtime_1.emitChatMessage)(toPublicMessage(message));
        void (0, pushNotifications_1.notifyMessage)(user.id, targetId, message.text);
        return res.send((0, status_1.success)(toPublicMessage(message)));
    }
    catch (error) {
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
            const duplicate = await __1.prisma.chatMessage.findUnique({ where: { clientRequestId } });
            if (duplicate?.senderId === user.id && duplicate.recipientId === targetId && duplicate.text === text) {
                return res.send((0, status_1.success)(toPublicMessage(duplicate)));
            }
        }
        console.error(error);
        return res.send((0, status_1.clientError)("Could not send the message"));
    }
}
exports.sendChatMessageRoute = sendChatMessageRoute;
