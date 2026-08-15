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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitGameChanged = exports.emitChatMessage = exports.attachRealtime = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const socket_io_1 = require("socket.io");
const __1 = require("..");
const gameIdentity_1 = require("../game/gameIdentity");
let realtimeServer = null;
function userRoom(userId) {
    return `user:${userId}`;
}
function gameUserRoom(gameUserId) {
    return `game-user:${gameUserId}`;
}
function attachRealtime(server) {
    const io = new socket_io_1.Server(server, {
        cors: { origin: "*" },
        transports: ["websocket", "polling"],
    });
    io.use((socket, next) => __awaiter(this, void 0, void 0, function* () {
        const token = typeof socket.handshake.auth.token === "string" ? socket.handshake.auth.token : "";
        const secret = process.env.JWT_SECRET;
        if (!token || !secret)
            return next(new Error("unauthorized"));
        try {
            const decoded = jsonwebtoken_1.default.verify(token.replace(/^Bearer\s+/i, ""), secret);
            if (decoded.kind === "ANONYMOUS") {
                const gameUserId = Number(decoded.gameUserId);
                if (!Number.isInteger(gameUserId) || gameUserId <= 0)
                    return next(new Error("unauthorized"));
                const exists = yield __1.prisma.gameUser.findFirst({ where: { id: gameUserId, kind: "ANONYMOUS" }, select: { id: true } });
                if (!exists)
                    return next(new Error("unauthorized"));
                socket.data.userId = null;
                socket.data.gameUserId = gameUserId;
                return next();
            }
            if (!Number.isInteger(decoded.id) || Number(decoded.id) <= 0)
                return next(new Error("unauthorized"));
            const userId = Number(decoded.id);
            const gameUser = yield (0, gameIdentity_1.ensureAccountGameUser)(userId);
            socket.data.userId = userId;
            socket.data.gameUserId = gameUser.id;
            return next();
        }
        catch (_a) {
            return next(new Error("unauthorized"));
        }
    }));
    io.on("connection", (socket) => {
        if (socket.data.userId)
            void socket.join(userRoom(socket.data.userId));
        void socket.join(gameUserRoom(socket.data.gameUserId));
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
    void __1.prisma.gameParticipant.findMany({
        where: { gameId: game.id },
        orderBy: { seat: "asc" },
        select: { gameUserId: true },
    }).then((participants) => {
        const playerIds = participants.length > 0
            ? participants.map((participant) => participant.gameUserId)
            : [game.player1, game.player2];
        const payload = {
            gameId: game.id,
            rematchOf: game.rematchOf,
            playerIds,
            version: game.version,
            status: game.status,
            changedAt: game.lastActivity.toISOString(),
        };
        let rooms = realtimeServer === null || realtimeServer === void 0 ? void 0 : realtimeServer.to(gameUserRoom(playerIds[0]));
        for (const playerId of playerIds.slice(1))
            rooms = rooms === null || rooms === void 0 ? void 0 : rooms.to(gameUserRoom(playerId));
        rooms === null || rooms === void 0 ? void 0 : rooms.emit("game:changed", payload);
    }).catch((error) => console.error("Could not emit game update", error));
}
exports.emitGameChanged = emitGameChanged;
