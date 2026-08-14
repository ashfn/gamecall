import { io, Socket } from "socket.io-client";
import { getAccessToken, refreshAccessToken } from "./auth";
import { prefix } from "./config";
import { ChatMessage, GameStatus } from "./types";

export interface GameChangedEvent {
  gameId: number;
  rematchOf: number | null;
  playerIds: number[];
  version: number;
  status: GameStatus;
  changedAt: string;
}

interface ServerToClientEvents {
  "chat:message": (message: ChatMessage) => void;
  "game:changed": (change: GameChangedEvent) => void;
}

let socket: Socket<ServerToClientEvents> | null = null;
let socketPromise: Promise<Socket<ServerToClientEvents>> | null = null;

async function buildSocket() {
  const nextSocket: Socket<ServerToClientEvents> = io(prefix, {
    auth: { token: await getAccessToken() },
    autoConnect: false,
    reconnection: true,
    reconnectionDelay: 250,
    reconnectionDelayMax: 2000,
    timeout: 5000,
    transports: ["websocket", "polling"],
  });

  let refreshingSession = false;
  nextSocket.on("connect_error", async (error) => {
    if (error.message !== "unauthorized" || refreshingSession) return;
    refreshingSession = true;
    try {
      await refreshAccessToken();
      nextSocket.auth = { token: await getAccessToken() };
      nextSocket.connect();
    } catch {
      // Authenticated HTTP calls will take the user back to login if the session expired.
    } finally {
      refreshingSession = false;
    }
  });

  nextSocket.connect();
  socket = nextSocket;
  return nextSocket;
}

export async function getRealtimeSocket() {
  if (socket) {
    if (!socket.connected && !socket.active) socket.connect();
    return socket;
  }
  if (!socketPromise) {
    socketPromise = buildSocket().finally(() => { socketPromise = null; });
  }
  return socketPromise;
}

export function disconnectRealtime() {
  socket?.disconnect();
  socket = null;
  socketPromise = null;
}
