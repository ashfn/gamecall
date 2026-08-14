import { Game } from "@prisma/client";
import { Expo, ExpoPushMessage } from "expo-server-sdk";
import { prisma } from "..";
import { getGameDefinition } from "../game/gameDefinition";
import type { GameType } from "../game/gameTypes";
import { GamePushContext, GamePushEvent, PushNotificationContent } from "./types";
import { publicGameUser } from "../game/gameIdentity";

const expo = new Expo(process.env.EXPO_ACCESS_TOKEN
  ? { accessToken: process.env.EXPO_ACCESS_TOKEN }
  : undefined);

interface PushData extends Record<string, unknown> {
  kind: "game" | "message" | "friend_request";
  gameId?: number;
  userId?: number;
  gameType?: GameType;
  recipientId: number;
}

function cleanName(displayName: string | null | undefined, username: string | null | undefined) {
  return displayName?.trim() || username?.trim() || "Your friend";
}

function shortMessage(text: string) {
  return text.length <= 180 ? text : `${text.slice(0, 177)}...`;
}

async function deliver(recipientId: number, content: PushNotificationContent, data: PushData, groupingKey: string) {
  const storedTokens = await prisma.pushToken.findMany({ where: { userId: recipientId } });
  const tokens = storedTokens.map(({ token }) => token).filter(Expo.isExpoPushToken);
  if (tokens.length === 0) return;

  const messages: ExpoPushMessage[] = tokens.map((token) => ({
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
        if (ticket.status !== "error" || ticket.details?.error !== "DeviceNotRegistered") return [];
        const recipient = chunk[index]?.to;
        return typeof recipient === "string" ? [recipient] : recipient ?? [];
      });
      if (invalidTokens.length > 0) {
        await prisma.pushToken.deleteMany({ where: { token: { in: invalidTokens } } });
      }
      tickets.forEach((ticket) => {
        if (ticket.status === "error" && ticket.details?.error !== "DeviceNotRegistered") {
          console.error("Expo push ticket error", ticket.message, ticket.details);
        }
      });
    } catch (error) {
      console.error("Could not send Expo push notification", error);
    }
  }
}

function defaultGameContent(
  event: GamePushEvent,
  gameName: string,
  actorName: string,
  winner: number,
  recipientId: number,
): PushNotificationContent {
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

export async function notifyGame(
  event: GamePushEvent,
  game: Game,
  actorId: number,
  recipientId: number,
) {
  try {
    const definition = getGameDefinition(game.type);
    if (!definition || actorId === recipientId) return;
    const [actor, recipient] = await Promise.all([publicGameUser(actorId), publicGameUser(recipientId)]);
    if (!actor || !recipient?.accountId) return;

    let state: unknown = null;
    try {
      state = definition.normalizeState(JSON.parse(game.gameStateJson));
    } catch {
      // A generic notification is still useful if an old stored state cannot be normalized.
    }
    const actorName = cleanName(actor.displayName, actor.username);
    const context: GamePushContext = {
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
  } catch (error) {
    console.error("Could not prepare game notification", error);
  }
}

export async function notifyMessage(senderId: number, recipientId: number, text: string) {
  try {
    if (senderId === recipientId) return;
    const sender = await prisma.user.findUnique({
      where: { id: senderId },
      select: { displayName: true, username: true },
    });
    if (!sender) return;
    await deliver(recipientId, {
      title: cleanName(sender.displayName, sender.username),
      body: shortMessage(text),
      channelId: "messages",
    }, { kind: "message", userId: senderId, recipientId }, `chat-${senderId}-${recipientId}`);
  } catch (error) {
    console.error("Could not prepare message notification", error);
  }
}

export async function notifyFriendRequest(senderId: number, recipientId: number) {
  try {
    if (senderId === recipientId) return;
    const sender = await prisma.user.findUnique({
      where: { id: senderId },
      select: { displayName: true, username: true },
    });
    if (!sender) return;
    const senderName = cleanName(sender.displayName, sender.username);
    await deliver(recipientId, {
      title: "New friend request",
      body: `${senderName} wants to play with you.`,
      channelId: "social",
    }, { kind: "friend_request", userId: senderId, recipientId }, `friend-request-${senderId}`);
  } catch (error) {
    console.error("Could not prepare friend request notification", error);
  }
}
