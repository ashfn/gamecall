import { Game, GameStatus, Prisma, User } from "@prisma/client";
import { Request, Response } from "express";
import { prisma } from "..";
import { areUserIdsFriends } from "../friends/friends";
import { clientError, success, userError } from "../status";
import { notifyGame } from "../notifications/pushNotifications";
import { emitGameChanged } from "../realtime/realtime";
import { getGameDefinition, supportedGameTypes } from "./gameDefinition";
import type { AuthoritativeMoveResult } from "./gameDefinition";
import { newGameParticipants } from "./gameParticipants";
import { GameType } from "./gameTypes";
import { ensureAccountGameUser, publicGameUser, publicGameUsers, PublicGameUser } from "./gameIdentity";

const publicProfile = {
  id: true,
  username: true,
  displayName: true,
} as const;
type PublicProfile = Prisma.UserGetPayload<{ select: typeof publicProfile }>;

function pairKey(a: number, b: number): string {
  return [a, b].sort((left, right) => left - right).join(":");
}

function parseId(value: unknown): number | null {
  const id = typeof value === "number" ? value : Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function canPlayTogether(userId: number, targetId: number): Promise<boolean> {
  return areUserIdsFriends(userId, targetId);
}

function settingsForGame(game: Game): unknown {
  try {
    return getGameDefinition(game.type)?.normalizeSettings(JSON.parse(game.settingsJson)) ?? {};
  } catch {
    return {};
  }
}

function nextTurnDeadline(gameType: unknown, settings: unknown, now = new Date()): Date | null {
  const seconds = getGameDefinition(gameType)?.turnDurationSeconds?.(settings) ?? null;
  return seconds ? new Date(now.getTime() + seconds * 1000) : null;
}

async function expireTimedGame(game: Game): Promise<Game> {
  const now = new Date();
  if (game.status !== GameStatus.STARTED || !game.turnDeadline || game.turnDeadline > now) return game;
  const timedOutPlayer = game.waitingOn;
  const opponent = timedOutPlayer === game.player1 ? game.player2 : game.player1;
  const definition = getGameDefinition(game.type);
  let timeoutResult: AuthoritativeMoveResult | null = null;
  if (definition?.applyTurnTimeout) {
    try {
      timeoutResult = definition.applyTurnTimeout(JSON.parse(game.gameStateJson), timedOutPlayer);
    } catch (error) {
      console.error(`Could not apply ${game.type} timeout move`, error);
    }
  }
  const winner = timeoutResult?.winner ?? opponent;
  const finished = winner !== 0;
  const expired = await prisma.game.updateMany({
    where: {
      id: game.id,
      version: game.version,
      status: GameStatus.STARTED,
      waitingOn: game.waitingOn,
      turnDeadline: { lte: now },
    },
    data: {
      ...(timeoutResult ? { gameStateJson: JSON.stringify(timeoutResult.state) } : {}),
      status: finished ? GameStatus.ENDED_UNOPENED : GameStatus.STARTED,
      winner,
      waitingOn: timeoutResult?.nextPlayer ?? 0,
      activeKey: finished ? null : game.activeKey,
      turnDeadline: null,
      version: { increment: 1 },
      lastActivity: now,
    },
  });
  const current = await prisma.game.findUnique({ where: { id: game.id } });
  if (!current) return game;
  if (expired.count === 1) {
    await prisma.gameParticipant.updateMany({ where: { gameId: current.id }, data: { actionRequired: false } });
    if (!finished && current.waitingOn > 0) {
      await prisma.gameParticipant.updateMany({
        where: { gameId: current.id, gameUserId: current.waitingOn },
        data: { actionRequired: true },
      });
    }
    emitGameChanged(current);
    const notificationRecipient = finished ? opponent : current.waitingOn;
    if (notificationRecipient !== timedOutPlayer) {
      void notifyGame(finished ? "finished" : "turn", current, timedOutPlayer, notificationRecipient);
    }
  }
  return current;
}

async function participantIds(game: Pick<Game, "id" | "player1" | "player2">) {
  const stored = await prisma.gameParticipant.findMany({
    where: { gameId: game.id },
    orderBy: { seat: "asc" },
    select: { gameUserId: true },
  });
  return stored.length > 0 ? stored.map((participant) => participant.gameUserId) : [game.player1, game.player2];
}

export async function toGameDto(storedGame: Game, viewerId: number, knownPlayers?: Map<number, PublicGameUser>) {
  const game = await expireTimedGame(storedGame);
  const ids = await participantIds(game);
  const playerProfiles = knownPlayers ?? await publicGameUsers(ids);
  const players = ids.map((id) => playerProfiles.get(id)).filter((player): player is PublicGameUser => Boolean(player));
  const opponent = players.find((player) => player.id !== viewerId) ?? null;
  let state: unknown;
  try {
    const parsed = JSON.parse(game.gameStateJson);
    const definition = getGameDefinition(game.type);
    const normalized = definition?.normalizeState(parsed) ?? parsed;
    state = definition?.viewState?.(normalized, viewerId) ?? normalized;
  } catch {
    state = null;
  }

  return {
    id: game.id,
    type: game.type,
    status: game.status,
    player1: game.player1,
    player2: game.player2,
    startedBy: game.startedBy,
    winner: game.winner,
    waitingOn: game.waitingOn,
    version: game.version,
    createdAt: game.createdAt,
    lastActivity: game.lastActivity,
    rematchOf: game.rematchOf,
    settings: settingsForGame(game),
    turnDeadline: game.turnDeadline,
    state,
    opponent,
    players,
    viewerGameUserId: viewerId,
    minPlayers: game.minPlayers,
    maxPlayers: game.maxPlayers,
  };
}

export async function findGameForPlayer(gameId: number, gameUserId: number): Promise<Game | null> {
  return prisma.game.findFirst({
    where: {
      id: gameId,
      participants: { some: { gameUserId } },
    },
  });
}

export async function getActiveGamesRoute(req: Request, res: Response) {
  const gameUserId: number = res.locals.gameUserId;
  const hasOpponentFilter = req.query.opponentId !== undefined;
  const opponentAccountId = hasOpponentFilter ? parseId(req.query.opponentId) : null;
  if (hasOpponentFilter && !opponentAccountId) return res.send(clientError("Invalid opponent id"));
  const opponentGameUser = opponentAccountId
    ? await prisma.gameUser.findUnique({ where: { accountId: opponentAccountId }, select: { id: true } })
    : null;
  if (opponentAccountId && !opponentGameUser) return res.send(success([]));
  const games = await prisma.game.findMany({
    where: {
      participants: {
        some: { gameUserId, hiddenAt: null },
      },
      ...(opponentGameUser ? {
        AND: { participants: { some: { gameUserId: opponentGameUser.id } } },
      } : {}),
      type: { in: supportedGameTypes },
      status: { in: [GameStatus.STARTED, GameStatus.ENDED_UNOPENED, GameStatus.ENDED] },
    },
    orderBy: { lastActivity: "desc" },
    take: opponentGameUser ? 100 : 30,
  });
  const memberships = await prisma.gameParticipant.findMany({
    where: { gameId: { in: games.map((game) => game.id) } },
    select: { gameId: true, gameUserId: true },
  });
  const profiles = await publicGameUsers(memberships.map((membership) => membership.gameUserId));
  return res.send(success(await Promise.all(games.map((game) => toGameDto(game, gameUserId, profiles)))));
}

export async function getGameRoute(req: Request, res: Response) {
  const gameUserId: number = res.locals.gameUserId;
  const gameId = parseId(req.params.gameId);
  if (!gameId) return res.send(clientError("Invalid game id"));
  const game = await findGameForPlayer(gameId, gameUserId);
  if (!game) return res.send(userError("Game not found"));
  if (!getGameDefinition(game.type)) return res.send(userError("This game is not installed"));
  await prisma.gameParticipant.update({
    where: { gameId_gameUserId: { gameId, gameUserId } },
    data: { lastViewedVersion: game.version },
  }).catch(() => undefined);
  return res.send(success(await toGameDto(game, gameUserId)));
}

async function createGame(accountUserId: number, senderGameUserId: number, targetGameUserId: number, type: GameType, rawSettings: unknown = {}, rematchOf?: number) {
  const definition = getGameDefinition(type);
  if (!definition) throw new Error("This game is not installed");
  const settings = definition.normalizeSettings(rawSettings);
  const key = pairKey(senderGameUserId, targetGameUserId);
  const participants = newGameParticipants(senderGameUserId, targetGameUserId);
  return prisma.game.create({
    data: {
      // The receiver gets the opening turn; startedBy remains the sender so
      // chat history can render the challenge on the correct side.
      ...participants,
      winner: 0,
      status: GameStatus.STARTED,
      type,
      settingsJson: JSON.stringify(settings),
      turnDeadline: null,
      gameStateJson: JSON.stringify(definition.createState(participants.player1, participants.player2, settings)),
      pairKey: key,
      activeKey: key,
      rematchOf,
      createdByAccountId: accountUserId,
      startedAt: new Date(),
      participants: {
        create: [
          { gameUserId: participants.player1, seat: 0, actionRequired: true },
          { gameUserId: participants.player2, seat: 1, actionRequired: false },
        ],
      },
    },
  });
}

export async function sendGameRoute(req: Request, res: Response) {
  const user: User = res.locals.user;
  if (!user) return res.send(userError("Create a Rainfrog account to start games"));
  const senderGameUserId: number = res.locals.gameUserId;
  const targetId = parseId(req.body.user ?? req.body.opponentId);
  if (!targetId) return res.send(clientError("Choose a valid opponent"));
  if (targetId === user.id) return res.send(userError("Choose someone else to play"));
  const definition = getGameDefinition(req.body.game ?? GameType.TIC_TAC_TOE);
  if (!definition) return res.send(userError("That game is not installed"));

  const target = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
  if (!target) return res.send(userError("That user no longer exists"));
  if (!(await canPlayTogether(user.id, targetId))) {
    return res.send(userError("Add this person as a friend before starting a game"));
  }

  try {
    const targetGameUser = await ensureAccountGameUser(targetId);
    const game = await createGame(user.id, senderGameUserId, targetGameUser.id, definition.type, req.body.settings);
    emitGameChanged(game);
    void notifyGame("started", game, senderGameUserId, targetGameUser.id);
    return res.send(success(await toGameDto(game, senderGameUserId)));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const targetGameUser = await ensureAccountGameUser(targetId);
      const existing = await prisma.game.findUnique({ where: { activeKey: pairKey(senderGameUserId, targetGameUser.id) } });
      if (existing) return res.send(userError("You already have an active game with this friend"));
    }
    console.error(error);
    return res.send(clientError("Could not start the game. Please try again."));
  }
}

export async function openTurnRoute(req: Request, res: Response) {
  const gameUserId: number = res.locals.gameUserId;
  const gameId = parseId(req.params.gameId);
  if (!gameId) return res.send(clientError("Invalid game id"));
  const stored = await findGameForPlayer(gameId, gameUserId);
  if (!stored) return res.send(userError("Game not found"));
  const game = await expireTimedGame(stored);
  if (game.status !== GameStatus.STARTED || game.waitingOn !== gameUserId || game.turnDeadline) {
    return res.send(success(await toGameDto(game, gameUserId)));
  }
  const settings = settingsForGame(game);
  const deadline = nextTurnDeadline(game.type, settings);
  if (!deadline) return res.send(success(await toGameDto(game, gameUserId)));
  const activated = await prisma.game.updateMany({
    where: {
      id: game.id,
      version: game.version,
      status: GameStatus.STARTED,
      waitingOn: gameUserId,
      turnDeadline: null,
    },
    data: { turnDeadline: deadline },
  });
  const current = await prisma.game.findUnique({ where: { id: game.id } });
  if (!current) return res.send(userError("Game not found"));
  if (activated.count === 1) emitGameChanged(current);
  return res.send(success(await toGameDto(current, gameUserId)));
}

interface MoveCommand {
  gameId: number;
  userId: number;
  move: unknown;
  moveJson: string;
  legacyMoveCode: number | null;
  expectedVersion: number;
  requestId: string;
}

interface CommittedMove {
  game: Game;
  changed: boolean;
}

async function commitMove(command: MoveCommand): Promise<CommittedMove> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const prior = await tx.gameMoveReceipt.findUnique({ where: { requestId: command.requestId } });
        if (prior) {
          const sameMove = prior.moveJson === command.moveJson
            || (prior.moveJson === "{}" && prior.cell !== null && prior.cell === command.legacyMoveCode);
          if (prior.gameId !== command.gameId || prior.playerId !== command.userId || !sameMove) {
            throw new Error("This move request was already used");
          }
          const duplicateGame = await tx.game.findUnique({ where: { id: command.gameId } });
          if (!duplicateGame) throw new Error("Game not found");
          return { game: duplicateGame, changed: false };
        }

        const game = await tx.game.findUnique({ where: { id: command.gameId } });
        const membership = await tx.gameParticipant.findUnique({
          where: { gameId_gameUserId: { gameId: command.gameId, gameUserId: command.userId } },
          select: { gameUserId: true },
        });
        if (!game || !membership) {
          throw new Error("Game not found");
        }
        const definition = getGameDefinition(game.type);
        if (!definition) throw new Error("This game is not installed");
        if (game.status !== GameStatus.STARTED) throw new Error("This game has already finished");
        if (game.waitingOn !== command.userId) throw new Error("It is not your turn");
        if (game.version !== command.expectedVersion) throw new Error("The game changed. Refresh and try again.");

        const now = new Date();
        if (game.turnDeadline && game.turnDeadline <= now) throw new Error("Your move timer expired");
        const result = definition.applyMove(JSON.parse(game.gameStateJson), command.userId, command.move);
        const finished = result.winner !== 0;
        const updated = await tx.game.updateMany({
          where: {
            id: game.id,
            version: command.expectedVersion,
            status: GameStatus.STARTED,
            waitingOn: command.userId,
            ...(game.turnDeadline ? { turnDeadline: { gt: now } } : {}),
          },
          data: {
            gameStateJson: JSON.stringify(result.state),
            winner: result.winner,
            waitingOn: result.nextPlayer,
            status: finished ? GameStatus.ENDED_UNOPENED : GameStatus.STARTED,
            activeKey: finished ? null : game.activeKey,
            turnDeadline: null,
            version: { increment: 1 },
            lastActivity: now,
          },
        });
        if (updated.count !== 1) throw new Error("The game changed. Refresh and try again.");

        await tx.gameParticipant.updateMany({ where: { gameId: game.id }, data: { actionRequired: false } });
        if (!finished && result.nextPlayer > 0) {
          await tx.gameParticipant.updateMany({
            where: { gameId: game.id, gameUserId: result.nextPlayer },
            data: { actionRequired: true },
          });
        }

        await tx.gameMoveReceipt.create({
          data: {
            requestId: command.requestId,
            gameId: command.gameId,
            playerId: command.userId,
            cell: command.legacyMoveCode,
            moveJson: command.moveJson,
          },
        });
        const saved = await tx.game.findUnique({ where: { id: game.id } });
        if (!saved) throw new Error("Game not found");
        return { game: saved, changed: true };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2034" || error.code === "P2002")) {
        const receipt = await prisma.gameMoveReceipt.findUnique({ where: { requestId: command.requestId } });
        if (receipt) {
          const game = await prisma.game.findUnique({ where: { id: command.gameId } });
          if (game) return { game, changed: false };
        }
        if (attempt < 2) continue;
      }
      throw error;
    }
  }
  throw new Error("The move could not be saved");
}

export async function makeMoveRoute(req: Request, res: Response) {
  const gameUserId: number = res.locals.gameUserId;
  const gameId = parseId(req.params.gameId ?? req.body.gameId);
  const move = req.body.move ?? { cell: req.body.cell };
  let moveJson = "";
  try {
    moveJson = JSON.stringify(move);
  } catch {
    return res.send(clientError("Invalid move request"));
  }
  const expectedVersion = Number(req.body.expectedVersion);
  const requestId = typeof req.body.requestId === "string" ? req.body.requestId.trim() : "";
  if (!gameId || !moveJson || moveJson.length > 10000) return res.send(clientError("Invalid move request"));
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) return res.send(clientError("Refresh the game and try again"));
  if (!requestId || requestId.length > 100) return res.send(clientError("Invalid move request"));

  try {
    const stored = await findGameForPlayer(gameId, gameUserId);
    const current = stored ? await expireTimedGame(stored) : null;
    const definition = current ? getGameDefinition(current.type) : null;
    if (!current || !definition) return res.send(userError("Game not found"));
    if (current.status !== GameStatus.STARTED) return res.send(userError("This game has already finished"));
    const legacyMoveCode = definition.legacyMoveCode?.(move) ?? null;
    const committed = await commitMove({ gameId, userId: gameUserId, move, moveJson, legacyMoveCode, expectedVersion, requestId });
    const game = committed.game;
    if (committed.changed) {
      const ids = await participantIds(game);
      const notificationRecipient = game.status === GameStatus.STARTED
        ? game.waitingOn
        : ids.find((id) => id !== gameUserId) ?? 0;
      // In games such as 8 Ball, a successful shot can leave the turn with
      // the shooter. Never tell the opponent it is their turn in that case.
      if (notificationRecipient > 0 && notificationRecipient !== gameUserId) {
        void notifyGame(
          game.status === GameStatus.STARTED ? "turn" : "finished",
          game,
          gameUserId,
          notificationRecipient,
        );
      }
      emitGameChanged(game);
    }
    return res.send(success(await toGameDto(game, gameUserId)));
  } catch (error) {
    const message = error instanceof Error ? error.message : "The move could not be saved";
    return res.send(userError(message));
  }
}

export async function rematchGameRoute(req: Request, res: Response) {
  const user: User | undefined = res.locals.user;
  const gameUserId: number = res.locals.gameUserId;
  const gameId = parseId(req.params.gameId);
  if (!gameId) return res.send(clientError("Invalid game id"));
  const storedOriginal = await findGameForPlayer(gameId, gameUserId);
  const original = storedOriginal ? await expireTimedGame(storedOriginal) : null;
  if (!original) return res.send(userError("Game not found"));
  const originalDefinition = getGameDefinition(original.type);
  if (!originalDefinition) return res.send(userError("This game is not installed"));
  const requestedDefinition = req.body?.game === undefined
    ? originalDefinition
    : getGameDefinition(req.body.game);
  if (!requestedDefinition) return res.send(userError("That game is not installed"));
  if (original.status === GameStatus.STARTED) return res.send(userError("Finish this game before starting a rematch"));
  const ids = await participantIds(original);
  if (ids.length !== 2) return res.send(userError("Start a new lobby to play this group again"));
  const targetGameUserId = ids.find((id) => id !== gameUserId)!;
  const [viewerProfile, targetProfile] = await Promise.all([
    publicGameUser(gameUserId),
    publicGameUser(targetGameUserId),
  ]);
  if (!viewerProfile || !targetProfile) return res.send(userError("Player not found"));
  if (!viewerProfile.accountId && !targetProfile.accountId) {
    return res.send(userError("A Rainfrog account is required to restart this game"));
  }
  if (viewerProfile.accountId && targetProfile.accountId
    && !(await canPlayTogether(viewerProfile.accountId, targetProfile.accountId))) {
    return res.send(userError("You must still be friends to play again"));
  }
  const creatorAccountId = user?.id
    ?? viewerProfile.accountId
    ?? targetProfile.accountId
    ?? original.createdByAccountId;
  if (!creatorAccountId) return res.send(userError("A Rainfrog account is required to restart this game"));

  const existing = await prisma.game.findUnique({ where: { rematchOf: original.id } });
  if (existing) return res.send(success(await toGameDto(existing, gameUserId)));
  try {
    let settings: unknown = req.body?.settings;
    if (req.body?.game === undefined) {
      try {
        settings = JSON.parse(original.settingsJson);
      } catch {
        settings = {};
      }
    }
    const game = await createGame(
      creatorAccountId,
      gameUserId,
      targetGameUserId,
      requestedDefinition.type,
      settings,
      original.id,
    );
    emitGameChanged(game);
    void notifyGame(
      requestedDefinition.type === originalDefinition.type ? "rematch" : "started",
      game,
      gameUserId,
      targetGameUserId,
    );
    return res.send(success(await toGameDto(game, gameUserId)));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const active = await prisma.game.findUnique({ where: { activeKey: pairKey(gameUserId, targetGameUserId) } });
      if (active) return res.send(success(await toGameDto(active, gameUserId)));
    }
    console.error(error);
    return res.send(clientError("Could not start the rematch"));
  }
}

export async function endGameRoute(req: Request, res: Response) {
  const gameUserId: number = res.locals.gameUserId;
  const gameId = parseId(req.body.gameId);
  if (!gameId) return res.send(clientError("Invalid game id"));
  const game = await findGameForPlayer(gameId, gameUserId);
  if (!game || game.status !== GameStatus.STARTED) return res.send(userError("This game is not in progress"));
  const ids = await participantIds(game);
  if (ids.length !== 2) return res.send(userError("Leaving multiplayer games is not supported yet"));
  const winner = ids.find((id) => id !== gameUserId)!;
  const updated = await prisma.game.update({
    where: { id: game.id },
    data: { status: GameStatus.ENDED, winner, waitingOn: 0, activeKey: null, turnDeadline: null, version: { increment: 1 }, lastActivity: new Date() },
  });
  emitGameChanged(updated);
  await prisma.gameParticipant.updateMany({ where: { gameId: game.id }, data: { actionRequired: false } });
  void notifyGame("finished", updated, gameUserId, winner);
  return res.send(success(await toGameDto(updated, gameUserId)));
}

export async function hideGameRoute(req: Request, res: Response) {
  const gameUserId: number = res.locals.gameUserId;
  const gameId = parseId(req.params.gameId);
  if (!gameId) return res.send(clientError("Invalid game id"));
  const game = await findGameForPlayer(gameId, gameUserId);
  if (!game) return res.send(userError("Game not found"));
  if (game.status === GameStatus.STARTED) return res.send(userError("End this game before removing it"));

  await prisma.gameParticipant.update({
    where: { gameId_gameUserId: { gameId, gameUserId } },
    data: { hiddenAt: new Date(), actionRequired: false },
  });
  return res.send(success({ gameId }));
}

export async function hideFinishedGamesWithOpponentRoute(req: Request, res: Response) {
  const gameUserId: number = res.locals.gameUserId;
  const opponentGameUserId = parseId(req.params.opponentId);
  if (!opponentGameUserId || opponentGameUserId === gameUserId) {
    return res.send(clientError("Invalid opponent id"));
  }

  const anonymousOpponent = await prisma.gameUser.findFirst({
    where: { id: opponentGameUserId, accountId: null },
    select: { id: true },
  });
  if (!anonymousOpponent) return res.send(userError("Online player not found"));

  const memberships = await prisma.gameParticipant.findMany({
    where: {
      gameUserId,
      hiddenAt: null,
      game: {
        status: { in: [GameStatus.ENDED, GameStatus.ENDED_UNOPENED, GameStatus.CANCELLED] },
        participants: { some: { gameUserId: opponentGameUserId } },
      },
    },
    select: { gameId: true },
  });
  const gameIds = memberships.map((membership) => membership.gameId);
  if (gameIds.length > 0) {
    await prisma.gameParticipant.updateMany({
      where: { gameUserId, gameId: { in: gameIds } },
      data: { hiddenAt: new Date(), actionRequired: false },
    });
  }
  return res.send(success({ gameIds }));
}

// Compatibility endpoints used by older prototype clients.
export async function updateGameRoute(req: Request, res: Response) {
  const action = Array.isArray(req.body.moves) ? req.body.moves[0] : null;
  req.body.move = { cell: Array.isArray(action) ? Number(action[0]) * 3 + Number(action[1]) : action };
  req.body.expectedVersion = req.body.expectedVersion ?? 0;
  req.body.requestId = req.body.requestId ?? `legacy-${res.locals.gameUserId}-${req.body.gameId}-${req.body.expectedVersion}`;
  return makeMoveRoute(req, res);
}

export async function finishGameRoute(_req: Request, res: Response) {
  return res.send(success());
}
