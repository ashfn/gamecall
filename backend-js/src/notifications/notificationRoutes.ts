import { User } from "@prisma/client";
import { Expo } from "expo-server-sdk";
import { Request, Response } from "express";
import { prisma } from "..";
import { clientError, success } from "../status";

const platforms = new Set(["ios", "android"]);

export async function registerPushTokenRoute(req: Request, res: Response) {
  const user: User = res.locals.user;
  const token = typeof req.body.token === "string" ? req.body.token.trim() : "";
  const platform = typeof req.body.platform === "string" ? req.body.platform.trim().toLowerCase() : "";
  const deviceName = typeof req.body.deviceName === "string" ? req.body.deviceName.trim().slice(0, 120) : null;
  if (!Expo.isExpoPushToken(token)) return res.send(clientError("Invalid push token"));
  if (!platforms.has(platform)) return res.send(clientError("Invalid device platform"));

  await prisma.pushToken.upsert({
    where: { token },
    create: { token, userId: user.id, platform, deviceName: deviceName || null },
    update: { userId: user.id, platform, deviceName: deviceName || null },
  });
  return res.send(success());
}

export async function unregisterPushTokenRoute(req: Request, res: Response) {
  const user: User = res.locals.user;
  const token = typeof req.body.token === "string" ? req.body.token.trim() : "";
  if (!token) return res.send(clientError("Invalid push token"));
  await prisma.pushToken.deleteMany({ where: { token, userId: user.id } });
  return res.send(success());
}
