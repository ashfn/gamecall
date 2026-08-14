"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitGameChanged = exports.emitChatMessage = exports.attachRealtime = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const socket_io_1 = require("socket.io");
let realtimeServer = null;
function userRoom(userId) {
    return `user:${userId}`;
}
function attachRealtime(server) {
    const io = new socket_io_1.Server(server, {
        cors: { origin: "*" },
        transports: ["websocket", "polling"],
    });
    io.use((socket, next) => {
        const token = typeof socket.handshake.auth.token === "string" ? socket.handshake.auth.token : "";
        const secret = process.env.JWT_SECRET;
        if (!token || !secret)
            return next(new Error("unauthorized"));
        try {
            const decoded = jsonwebtoken_1.default.verify(token.replace(/^Bearer\s+/i, ""), secret);
            if (!Number.isInteger(decoded.id) || Number(decoded.id) <= 0)
                return next(new Error("unauthorized"));
            socket.data.userId = Number(decoded.id);
            return next();
        }
        catch (_a) {
            return next(new Error("unauthorized"));
        }
    });
    io.on("connection", (socket) => {
        void socket.join(userRoom(socket.data.userId));
    });
    realtimeServer = io;
    return io;
}
exports.attachRealtime = attachRealtime;
function emitChatMessage(message) {
    realtimeServer === null || realtimeServer === void 0 ? void 0 : realtimeServer.to(userRoom(message.recipientId)).emit("chat:message", message);
}
exports.emitChatMessage = emitChatMessage;
function emitGameChanged(game) {
    const payload = {
        gameId: game.id,
        rematchOf: game.rematchOf,
        playerIds: [game.player1, game.player2],
        version: game.version,
        status: game.status,
        changedAt: game.lastActivity.toISOString(),
    };
    realtimeServer === null || realtimeServer === void 0 ? void 0 : realtimeServer.to(userRoom(game.player1)).to(userRoom(game.player2)).emit("game:changed", payload);
}
exports.emitGameChanged = emitGameChanged;
