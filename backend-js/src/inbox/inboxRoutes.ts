import { GameStatus, User } from "@prisma/client";
import { Request, Response } from "express";
import { prisma } from "..";
import { getFriends } from "../friends/friends";
import { success } from "../status";

function latestTimestamp(current: Date | undefined, candidate: Date): Date {
  return !current || candidate > current ? candidate : current;
}

export async function getInboxActivityRoute(_req: Request, res: Response) {
  const user: User = res.locals.user;
  const friendships = await getFriends(user.id);
  const friendIds = friendships.map((friendship) => friendship.user1 === user.id ? friendship.user2 : friendship.user1);
  if (friendIds.length === 0) return res.send(success({}));

  const pairKeys = friendIds.map((friendId) => [user.id, friendId]
    .sort((left, right) => left - right)
    .join(":"));
  const [games, messages] = await Promise.all([
    prisma.game.groupBy({
      by: ["pairKey"],
      where: {
        OR: [{ player1: user.id }, { player2: user.id }],
        status: { in: [GameStatus.STARTED, GameStatus.ENDED_UNOPENED, GameStatus.ENDED] },
      },
      _max: { lastActivity: true },
    }),
    prisma.chatMessage.groupBy({
      by: ["pairKey"],
      where: { pairKey: { in: pairKeys } },
      _max: { createdAt: true },
    }),
  ]);

  const latestByFriend = new Map<number, Date>();
  games.forEach((game) => {
    const friendId = game.pairKey.split(":").map(Number).find((id) => id !== user.id);
    if (!friendId || !game._max.lastActivity) return;
    latestByFriend.set(friendId, latestTimestamp(latestByFriend.get(friendId), game._max.lastActivity));
  });
  messages.forEach((message) => {
    const friendId = message.pairKey.split(":").map(Number).find((id) => id !== user.id);
    if (!friendId || !message._max.createdAt) return;
    latestByFriend.set(friendId, latestTimestamp(latestByFriend.get(friendId), message._max.createdAt));
  });

  return res.send(success(Object.fromEntries(
    [...latestByFriend.entries()].map(([friendId, timestamp]) => [String(friendId), timestamp.toISOString()]),
  )));
}
