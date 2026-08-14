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
function canChat(userId, targetId) {
    return __awaiter(this, void 0, void 0, function* () {
        return (0, friends_1.areUserIdsFriends)(userId, targetId);
    });
}
function getChatMessagesRoute(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const user = res.locals.user;
        const targetId = parseId(req.params.userId);
        if (!targetId || targetId === user.id)
            return res.send((0, status_1.clientError)("Choose a valid friend"));
        if (!(yield canChat(user.id, targetId)))
            return res.send((0, status_1.userError)("You can only chat with friends"));
        const afterId = req.query.afterId === undefined ? null : parseId(req.query.afterId);
        if (req.query.afterId !== undefined && !afterId)
            return res.send((0, status_1.clientError)("Invalid message cursor"));
        const loaded = yield __1.prisma.chatMessage.findMany({
            where: Object.assign({ pairKey: pairKey(user.id, targetId) }, (afterId ? { id: { gt: afterId } } : {})),
            orderBy: afterId
                ? [{ createdAt: "asc" }, { id: "asc" }]
                : [{ createdAt: "desc" }, { id: "desc" }],
            take: 100,
            select: publicMessage,
        });
        yield __1.prisma.chatMessage.updateMany({
            where: { senderId: targetId, recipientId: user.id, readAt: null },
            data: { readAt: new Date() },
        });
        return res.send((0, status_1.success)(afterId ? loaded : loaded.reverse()));
    });
}
exports.getChatMessagesRoute = getChatMessagesRoute;
function getUnreadChatCountRoute(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const user = res.locals.user;
        const targetId = parseId(req.params.userId);
        if (!targetId || targetId === user.id)
            return res.send((0, status_1.clientError)("Choose a valid friend"));
        if (!(yield canChat(user.id, targetId)))
            return res.send((0, status_1.userError)("You can only chat with friends"));
        const count = yield __1.prisma.chatMessage.count({
            where: {
                senderId: targetId,
                recipientId: user.id,
                readAt: null,
            },
        });
        return res.send((0, status_1.success)({ count }));
    });
}
exports.getUnreadChatCountRoute = getUnreadChatCountRoute;
function getUnreadChatCountsRoute(_req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const user = res.locals.user;
        const counts = yield __1.prisma.chatMessage.groupBy({
            by: ["senderId"],
            where: {
                recipientId: user.id,
                readAt: null,
            },
            _count: { _all: true },
        });
        return res.send((0, status_1.success)(Object.fromEntries(counts.map((item) => [String(item.senderId), item._count._all]))));
    });
}
exports.getUnreadChatCountsRoute = getUnreadChatCountsRoute;
function sendChatMessageRoute(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
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
        if (!(yield canChat(user.id, targetId)))
            return res.send((0, status_1.userError)("You can only chat with friends"));
        const existing = yield __1.prisma.chatMessage.findUnique({ where: { clientRequestId } });
        if (existing) {
            if (existing.senderId === user.id && existing.recipientId === targetId && existing.text === text) {
                return res.send((0, status_1.success)(toPublicMessage(existing)));
            }
            return res.send((0, status_1.userError)("This message request was already used"));
        }
        try {
            const message = yield __1.prisma.chatMessage.create({
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
                const duplicate = yield __1.prisma.chatMessage.findUnique({ where: { clientRequestId } });
                if ((duplicate === null || duplicate === void 0 ? void 0 : duplicate.senderId) === user.id && duplicate.recipientId === targetId && duplicate.text === text) {
                    return res.send((0, status_1.success)(toPublicMessage(duplicate)));
                }
            }
            console.error(error);
            return res.send((0, status_1.clientError)("Could not send the message"));
        }
    });
}
exports.sendChatMessageRoute = sendChatMessageRoute;
