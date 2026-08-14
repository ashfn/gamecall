import { Prisma, User } from "@prisma/client";
import { Request, Response } from "express";
import { prisma } from "..";
import { areUserIdsFriends } from "../friends/friends";
import { clientError, success, userError } from "../status";
import { emitChatMessage } from "../realtime/realtime";
import { notifyMessage } from "../notifications/pushNotifications";

const publicMessage = {
  id: true,
  senderId: true,
  recipientId: true,
  text: true,
  createdAt: true,
} as const;

function toPublicMessage(message: { id: number; senderId: number; recipientId: number; text: string; createdAt: Date }) {
  return {
    id: message.id,
    senderId: message.senderId,
    recipientId: message.recipientId,
    text: message.text,
    createdAt: message.createdAt,
  };
}

function parseId(value: unknown): number | null {
  const id = typeof value === "number" ? value : Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function pairKey(a: number, b: number) {
  return [a, b].sort((left, right) => left - right).join(":");
}

async function canChat(userId: number, targetId: number) {
  return areUserIdsFriends(userId, targetId);
}

export async function getChatMessagesRoute(req: Request, res: Response) {
  const user: User = res.locals.user;
  const targetId = parseId(req.params.userId);
  if (!targetId || targetId === user.id) return res.send(clientError("Choose a valid friend"));
  if (!(await canChat(user.id, targetId))) return res.send(userError("You can only chat with friends"));

  const afterId = req.query.afterId === undefined ? null : parseId(req.query.afterId);
  if (req.query.afterId !== undefined && !afterId) return res.send(clientError("Invalid message cursor"));
  const loaded = await prisma.chatMessage.findMany({
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

  await prisma.chatMessage.updateMany({
    where: { senderId: targetId, recipientId: user.id, readAt: null },
    data: { readAt: new Date() },
  });

  return res.send(success(afterId ? loaded : loaded.reverse()));
}

export async function getUnreadChatCountRoute(req: Request, res: Response) {
  const user: User = res.locals.user;
  const targetId = parseId(req.params.userId);
  if (!targetId || targetId === user.id) return res.send(clientError("Choose a valid friend"));
  if (!(await canChat(user.id, targetId))) return res.send(userError("You can only chat with friends"));

  const count = await prisma.chatMessage.count({
    where: {
      senderId: targetId,
      recipientId: user.id,
      readAt: null,
    },
  });
  return res.send(success({ count }));
}

export async function getUnreadChatCountsRoute(_req: Request, res: Response) {
  const user: User = res.locals.user;
  const counts = await prisma.chatMessage.groupBy({
    by: ["senderId"],
    where: {
      recipientId: user.id,
      readAt: null,
    },
    _count: { _all: true },
  });
  return res.send(success(Object.fromEntries(
    counts.map((item) => [String(item.senderId), item._count._all]),
  )));
}

export async function sendChatMessageRoute(req: Request, res: Response) {
  const user: User = res.locals.user;
  const targetId = parseId(req.params.userId);
  const text = typeof req.body.text === "string" ? req.body.text.trim() : "";
  const clientRequestId = typeof req.body.clientRequestId === "string" ? req.body.clientRequestId.trim() : "";

  if (!targetId || targetId === user.id) return res.send(clientError("Choose a valid friend"));
  if (!text || text.length > 1000) return res.send(clientError("Messages must be between 1 and 1000 characters"));
  if (!clientRequestId || clientRequestId.length > 120) return res.send(clientError("Invalid message request"));
  if (!(await canChat(user.id, targetId))) return res.send(userError("You can only chat with friends"));

  const existing = await prisma.chatMessage.findUnique({ where: { clientRequestId } });
  if (existing) {
    if (existing.senderId === user.id && existing.recipientId === targetId && existing.text === text) {
      return res.send(success(toPublicMessage(existing)));
    }
    return res.send(userError("This message request was already used"));
  }

  try {
    const message = await prisma.chatMessage.create({
      data: {
        pairKey: pairKey(user.id, targetId),
        senderId: user.id,
        recipientId: targetId,
        text,
        clientRequestId,
      },
    });
    emitChatMessage(toPublicMessage(message));
    void notifyMessage(user.id, targetId, message.text);
    return res.send(success(toPublicMessage(message)));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const duplicate = await prisma.chatMessage.findUnique({ where: { clientRequestId } });
      if (duplicate?.senderId === user.id && duplicate.recipientId === targetId && duplicate.text === text) {
        return res.send(success(toPublicMessage(duplicate)));
      }
    }
    console.error(error);
    return res.send(clientError("Could not send the message"));
  }
}
