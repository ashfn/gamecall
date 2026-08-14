import { Game } from "@prisma/client";
import { Server as HttpServer } from "http";
import jwt, { JwtPayload } from "jsonwebtoken";
import { Server } from "socket.io";
import { prisma } from "..";
import { ensureAccountGameUser } from "../game/gameIdentity";

interface GameChangedPayload {
  gameId: number;
  rematchOf: number | null;
  playerIds: number[];
  version: number;
  status: Game["status"];
  changedAt: string;
}

interface ChatMessagePayload {
  id: number;
  senderId: number;
  recipientId: number;
  text: string;
  createdAt: Date;
}

interface ServerToClientEvents {
  "chat:message": (message: ChatMessagePayload) => void;
  "game:changed": (change: GameChangedPayload) => void;
}

interface SocketData {
  userId: number | null;
  gameUserId: number;
}

let realtimeServer: Server<Record<string, never>, ServerToClientEvents, Record<string, never>, SocketData> | null = null;

function userRoom(userId: number) {
  return `user:${userId}`;
}

function gameUserRoom(gameUserId: number) {
  return `game-user:${gameUserId}`;
}

export function attachRealtime(server: HttpServer) {
  const io = new Server<Record<string, never>, ServerToClientEvents, Record<string, never>, SocketData>(server, {
    cors: { origin: "*" },
    transports: ["websocket", "polling"],
  });

  io.use(async (socket, next) => {
    const token = typeof socket.handshake.auth.token === "string" ? socket.handshake.auth.token : "";
    const secret = process.env.JWT_SECRET;
    if (!token || !secret) return next(new Error("unauthorized"));

    try {
      const decoded = jwt.verify(token.replace(/^Bearer\s+/i, ""), secret) as JwtPayload;
      if (decoded.kind === "ANONYMOUS") {
        const gameUserId = Number(decoded.gameUserId);
        if (!Number.isInteger(gameUserId) || gameUserId <= 0) return next(new Error("unauthorized"));
        const exists = await prisma.gameUser.findFirst({ where: { id: gameUserId, kind: "ANONYMOUS" }, select: { id: true } });
        if (!exists) return next(new Error("unauthorized"));
        socket.data.userId = null;
        socket.data.gameUserId = gameUserId;
        return next();
      }
      if (!Number.isInteger(decoded.id) || Number(decoded.id) <= 0) return next(new Error("unauthorized"));
      const userId = Number(decoded.id);
      const gameUser = await ensureAccountGameUser(userId);
      socket.data.userId = userId;
      socket.data.gameUserId = gameUser.id;
      return next();
    } catch {
      return next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    if (socket.data.userId) void socket.join(userRoom(socket.data.userId));
    void socket.join(gameUserRoom(socket.data.gameUserId));
  });

  realtimeServer = io;
  return io;
}

export function emitChatMessage(message: ChatMessagePayload) {
  realtimeServer?.to(userRoom(message.recipientId)).emit("chat:message", message);
}

export function emitGameChanged(game: Pick<Game, "id" | "rematchOf" | "player1" | "player2" | "version" | "status" | "lastActivity">) {
  void prisma.gameParticipant.findMany({
    where: { gameId: game.id },
    orderBy: { seat: "asc" },
    select: { gameUserId: true },
  }).then((participants) => {
    const playerIds = participants.length > 0
      ? participants.map((participant) => participant.gameUserId)
      : [game.player1, game.player2];
    const payload: GameChangedPayload = {
      gameId: game.id,
      rematchOf: game.rematchOf,
      playerIds,
      version: game.version,
      status: game.status,
      changedAt: game.lastActivity.toISOString(),
    };
    let rooms = realtimeServer?.to(gameUserRoom(playerIds[0]));
    for (const playerId of playerIds.slice(1)) rooms = rooms?.to(gameUserRoom(playerId));
    rooms?.emit("game:changed", payload);
  }).catch((error) => console.error("Could not emit game update", error));
}
