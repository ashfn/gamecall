import { Game, GameStatus, Prisma, User } from "@prisma/client";
import crypto from "crypto";
import { Request, Response } from "express";
import { prisma } from "..";
import { clientError, success, userError } from "../status";
import { emitGameChanged } from "../realtime/realtime";
import { getGameDefinition } from "./gameDefinition";
import { GameType } from "./gameTypes";
import {
  createAnonymousAccessToken,
  createAnonymousGameUser,
  publicGameUser,
  publicGameUsers,
  resolveAnonymousSession,
} from "./gameIdentity";
import { createWordDropStateForPlayers, normalizeWordDropSettings } from "./gamestate/games/WORD_DROP";

const LINK_ID_BYTES = 12;
const LINK_SECRET_BYTES = 32;
const LOBBY_LINK_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

function hashSecret(secret: string) {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

function safeHashMatch(stored: string, supplied: string) {
  return stored.length === supplied.length
    && crypto.timingSafeEqual(Buffer.from(stored), Buffer.from(supplied));
}

function parseInviteToken(value: unknown) {
  if (typeof value !== "string") return null;
  const [id, secret, ...extra] = value.split(".");
  if (extra.length || !/^[a-f0-9]{24}$/i.test(id ?? "") || !/^[a-f0-9]{64}$/i.test(secret ?? "")) return null;
  return { id, secret, token: `${id}.${secret}` };
}

async function loadValidInvite(rawToken: unknown) {
  const parsed = parseInviteToken(rawToken);
  if (!parsed) return null;
  const invite = await prisma.gameInviteLink.findUnique({ where: { id: parsed.id }, include: { game: true } });
  if (!invite || invite.revokedAt || invite.expiresAt <= new Date() || !safeHashMatch(invite.secretHash, hashSecret(parsed.secret))) return null;
  return { parsed, invite };
}

async function lobbyDto(game: Game) {
  const participants = await prisma.gameParticipant.findMany({
    where: { gameId: game.id },
    orderBy: { seat: "asc" },
    select: { gameUserId: true, seat: true },
  });
  const profiles = await publicGameUsers(participants.map((participant) => participant.gameUserId));
  const settings = (() => {
    try { return getGameDefinition(game.type)?.normalizeSettings(JSON.parse(game.settingsJson)) ?? {}; }
    catch { return {}; }
  })();
  return {
    id: game.id,
    type: game.type,
    status: game.status,
    settings,
    minPlayers: game.minPlayers,
    maxPlayers: game.maxPlayers,
    createdByAccountId: game.createdByAccountId,
    createdAt: game.createdAt,
    lastActivity: game.lastActivity,
    players: participants.map((participant) => profiles.get(participant.gameUserId)).filter(Boolean),
  };
}

async function startLobbyInTransaction(tx: Prisma.TransactionClient, gameId: number, requireMinimum = true) {
  const game = await tx.game.findUnique({ where: { id: gameId } });
  if (!game || game.status !== GameStatus.LOBBY) throw new Error("This lobby is no longer open");
  const participants = await tx.gameParticipant.findMany({
    where: { gameId },
    orderBy: { seat: "asc" },
  });
  if (requireMinimum && participants.length < game.minPlayers) throw new Error(`At least ${game.minPlayers} players are needed`);
  if (participants.length > game.maxPlayers) throw new Error("This lobby has too many players");
  const definition = getGameDefinition(game.type);
  if (!definition) throw new Error("This game is not installed");
  const settings = definition.normalizeSettings(JSON.parse(game.settingsJson));
  if (game.type === GameType.WORD_DROP && normalizeWordDropSettings(settings).variant === "TEST") {
    throw new Error("Test games cannot be shared");
  }
  // The host sent the game, so the first person who joined receives the
  // opening turn. Further joiners follow before play cycles back to the host.
  const seatOrder = participants.map((participant) => participant.gameUserId);
  const playOrder = [...seatOrder.slice(1), seatOrder[0]];
  if (game.type !== GameType.WORD_DROP && playOrder.length !== 2) {
    throw new Error(`${definition.displayName} needs exactly two players`);
  }
  const state = game.type === GameType.WORD_DROP
    ? createWordDropStateForPlayers(playOrder, settings)
    : definition.createState(playOrder[0], playOrder[1], settings);
  const now = new Date();
  await tx.gameParticipant.updateMany({ where: { gameId }, data: { actionRequired: false } });
  await tx.gameParticipant.update({
    where: { gameId_gameUserId: { gameId, gameUserId: playOrder[0] } },
    data: { actionRequired: true },
  });
  return tx.game.update({
    where: { id: gameId },
    data: {
      status: GameStatus.STARTED,
      player1: playOrder[0],
      player2: playOrder[1],
      waitingOn: playOrder[0],
      gameStateJson: JSON.stringify(state),
      startedAt: now,
      lastActivity: now,
      version: { increment: 1 },
    },
  });
}

export async function createLinkLobbyRoute(req: Request, res: Response) {
  const user: User = res.locals.user;
  if (!user) return res.send(userError("Create a Rainfrog account to start a game"));
  const gameUserId: number = res.locals.gameUserId;
  const type = req.body.game ?? req.body.type ?? "WORD_DROP";
  const definition = getGameDefinition(type);
  if (!definition) return res.send(userError("Choose a supported game"));
  let settings;
  try {
    settings = definition.normalizeSettings(req.body.settings);
    if (type === GameType.WORD_DROP && normalizeWordDropSettings(settings).variant === "TEST") {
      return res.send(userError("Choose Regular or Mini Word Drop"));
    }
  } catch (error) {
    return res.send(clientError(error instanceof Error ? error.message : "Invalid game settings"));
  }
  const linkId = crypto.randomBytes(LINK_ID_BYTES).toString("hex");
  const linkSecret = crypto.randomBytes(LINK_SECRET_BYTES).toString("hex");
  const lobbyKey = `lobby:${crypto.randomUUID()}`;
  const game = await prisma.game.create({
    data: {
      type,
      status: GameStatus.LOBBY,
      player1: gameUserId,
      player2: 0,
      startedBy: gameUserId,
      winner: 0,
      waitingOn: 0,
      gameStateJson: "{}",
      settingsJson: JSON.stringify(settings),
      pairKey: lobbyKey,
      activeKey: null,
      createdByAccountId: user.id,
      minPlayers: 2,
      maxPlayers: type === GameType.WORD_DROP ? 4 : 2,
      participants: { create: { gameUserId, seat: 0 } },
      inviteLinks: {
        create: {
          id: linkId,
          secretHash: hashSecret(linkSecret),
          createdByAccountId: user.id,
          expiresAt: new Date(Date.now() + LOBBY_LINK_LIFETIME_MS),
        },
      },
    },
  });
  emitGameChanged(game);
  return res.send(success({ lobby: await lobbyDto(game), inviteToken: `${linkId}.${linkSecret}` }));
}

export async function listLobbiesRoute(_req: Request, res: Response) {
  const gameUserId: number = res.locals.gameUserId;
  const games = await prisma.game.findMany({
    where: { status: GameStatus.LOBBY, participants: { some: { gameUserId } } },
    orderBy: { lastActivity: "desc" },
    take: 30,
  });
  return res.send(success(await Promise.all(games.map(lobbyDto))));
}

export async function getLobbyRoute(req: Request, res: Response) {
  const gameId = Number(req.params.gameId);
  const gameUserId: number = res.locals.gameUserId;
  if (!Number.isInteger(gameId) || gameId <= 0) return res.send(clientError("Invalid lobby"));
  const game = await prisma.game.findFirst({
    where: { id: gameId, participants: { some: { gameUserId } } },
  });
  if (!game) return res.send(userError("Lobby not found"));
  if (game.status !== GameStatus.LOBBY) {
    return res.send(success({ lobby: null, gameId: game.id, status: game.status, hasActiveLink: false }));
  }
  const invite = await prisma.gameInviteLink.findFirst({
    where: { gameId, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true },
  });
  return res.send(success({ lobby: await lobbyDto(game), gameId: game.id, status: game.status, hasActiveLink: Boolean(invite) }));
}

export async function previewInviteRoute(req: Request, res: Response) {
  const valid = await loadValidInvite(req.params.token);
  if (!valid) return res.send(userError("This game link is invalid or has expired"));
  if (valid.invite.game.status !== GameStatus.LOBBY) {
    return res.send(success({ id: valid.invite.game.id, status: valid.invite.game.status }));
  }
  return res.send(success(await lobbyDto(valid.invite.game)));
}

export async function joinInviteRoute(req: Request, res: Response) {
  const valid = await loadValidInvite(req.params.token);
  if (!valid) return res.send(userError("This game link is invalid or has expired"));
  if (valid.invite.game.status !== GameStatus.LOBBY) return res.send(userError("This game has already started"));

  const suppliedSession = typeof req.body.anonymousRefreshToken === "string" ? req.body.anonymousRefreshToken : "";
  let gameUser = suppliedSession ? await resolveAnonymousSession(suppliedSession) : null;
  let refreshToken = suppliedSession;
  if (!gameUser) {
    try {
      const created = await createAnonymousGameUser(typeof req.body.displayName === "string" ? req.body.displayName : "");
      gameUser = created.gameUser;
      refreshToken = created.refreshToken;
    } catch (error) {
      return res.send(clientError(error instanceof Error ? error.message : "Choose a valid name"));
    }
  }

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      const game = await tx.game.findUnique({ where: { id: valid.invite.gameId } });
      if (!game || game.status !== GameStatus.LOBBY) throw new Error("This game has already started");
      const existing = await tx.gameParticipant.findUnique({
        where: { gameId_gameUserId: { gameId: game.id, gameUserId: gameUser!.id } },
      });
      if (existing) return { game, started: false };
      const participants = await tx.gameParticipant.findMany({ where: { gameId: game.id }, select: { seat: true } });
      if (participants.length >= game.maxPlayers) throw new Error("This game is full");
      const occupied = new Set(participants.map((participant) => participant.seat));
      let seat = 0;
      while (occupied.has(seat)) seat += 1;
      await tx.gameParticipant.create({ data: { gameId: game.id, gameUserId: gameUser!.id, seat } });
      const joinedCount = participants.length + 1;
      if (joinedCount >= game.maxPlayers) {
        return { game: await startLobbyInTransaction(tx, game.id), started: true };
      }
      return {
        game: await tx.game.update({
          where: { id: game.id },
          data: { lastActivity: new Date(), version: { increment: 1 } },
        }),
        started: false,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    emitGameChanged(outcome.game);
    return res.send(success({
      gameId: outcome.game.id,
      status: outcome.game.status,
      accessToken: createAnonymousAccessToken(gameUser.id),
      refreshToken,
      gameUser: await publicGameUser(gameUser.id),
      lobby: outcome.game.status === GameStatus.LOBBY ? await lobbyDto(outcome.game) : null,
    }));
  } catch (error) {
    return res.send(userError(error instanceof Error ? error.message : "Could not join this game"));
  }
}

export async function startLobbyRoute(req: Request, res: Response) {
  const user: User = res.locals.user;
  if (!user) return res.send(userError("Only an account can start this game"));
  const gameUserId: number = res.locals.gameUserId;
  const gameId = Number(req.params.gameId);
  if (!Number.isInteger(gameId) || gameId <= 0) return res.send(clientError("Invalid lobby"));
  const lobby = await prisma.game.findFirst({
    where: { id: gameId, status: GameStatus.LOBBY, createdByAccountId: user.id, participants: { some: { gameUserId } } },
  });
  if (!lobby) return res.send(userError("Only the lobby creator can start this game"));
  try {
    const game = await prisma.$transaction(
      (tx) => startLobbyInTransaction(tx, gameId),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    emitGameChanged(game);
    return res.send(success({ gameId: game.id, status: game.status }));
  } catch (error) {
    return res.send(userError(error instanceof Error ? error.message : "Could not start this game"));
  }
}

export async function cancelLobbyRoute(req: Request, res: Response) {
  const user: User = res.locals.user;
  if (!user) return res.send(userError("Only an account can cancel this game"));
  const gameUserId: number = res.locals.gameUserId;
  const gameId = Number(req.params.gameId);
  if (!Number.isInteger(gameId) || gameId <= 0) return res.send(clientError("Invalid lobby"));

  try {
    const cancelled = await prisma.$transaction(async (tx) => {
      const result = await tx.game.updateMany({
        where: {
          id: gameId,
          status: GameStatus.LOBBY,
          createdByAccountId: user.id,
          participants: { some: { gameUserId } },
        },
        data: {
          status: GameStatus.CANCELLED,
          waitingOn: 0,
          activeKey: null,
          lastActivity: new Date(),
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) throw new Error("Only the lobby creator can cancel an unstarted game");
      await tx.gameInviteLink.updateMany({
        where: { gameId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.gameParticipant.updateMany({
        where: { gameId },
        data: { actionRequired: false },
      });
      const game = await tx.game.findUnique({ where: { id: gameId } });
      if (!game) throw new Error("Lobby not found");
      return game;
    });
    emitGameChanged(cancelled);
    return res.send(success({ gameId: cancelled.id, status: cancelled.status }));
  } catch (error) {
    return res.send(userError(error instanceof Error ? error.message : "Could not cancel this game"));
  }
}

export async function refreshAnonymousRoute(req: Request, res: Response) {
  const refreshToken = typeof req.body.refreshToken === "string" ? req.body.refreshToken : "";
  const gameUser = await resolveAnonymousSession(refreshToken);
  if (!gameUser) return res.send(clientError("Invalid anonymous session"));
  return res.send(success({
    accessToken: createAnonymousAccessToken(gameUser.id),
    gameUser: await publicGameUser(gameUser.id),
  }));
}
