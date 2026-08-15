/* eslint-disable no-console */
const { PrismaClient } = require("@prisma/client");

const apiBase = process.env.RAINFROG_SMOKE_API ?? "http://localhost:3000";
const prisma = new PrismaClient();
const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const username = `ls${Date.now().toString(36).slice(-7)}`;
const email = `${username}@example.test`;
const password = "SmokeTest9!";
let accountId = null;
let gameUserId = null;
let guestGameUserId = null;
let gameId = null;
let twoPlayerGameId = null;
let cancelledGameId = null;
let requestId = null;

async function request(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, options);
  const result = await response.json();
  if (result.status !== 1) throw new Error(`${path}: ${result.error ?? `HTTP ${response.status}`}`);
  return result.data;
}

async function run() {
  await request("/account", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, email, password }),
  });
  const account = await prisma.user.findUniqueOrThrow({ where: { username }, include: { gameUser: true } });
  accountId = account.id;
  gameUserId = account.gameUser.id;

  const refreshToken = await request("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account: username, password }),
  });
  const accessToken = await request("/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  const auth = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };

  const created = await request("/game-lobbies", {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ game: "WORD_DROP", settings: { variant: "MINI", moveTimerSeconds: null } }),
  });
  gameId = created.lobby.id;
  if (created.lobby.players.length !== 1) throw new Error("Host was not added to the lobby");

  const preview = await request(`/game-invites/${encodeURIComponent(created.inviteToken)}`);
  if (preview.id !== gameId || preview.status !== "LOBBY") throw new Error("Public invite preview is incorrect");

  const joined = await request(`/game-invites/${encodeURIComponent(created.inviteToken)}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ displayName: "Browser tester" }),
  });
  guestGameUserId = joined.gameUser.id;
  if (joined.lobby.players.length !== 2) throw new Error("Guest was not added to the lobby");

  await request(`/game-lobbies/${gameId}/start`, { method: "POST", headers: auth });
  const guestAuth = { Authorization: `Bearer ${joined.accessToken}`, "Content-Type": "application/json" };
  const startedPreview = await request(`/game-invites/${encodeURIComponent(created.inviteToken)}`);
  if (startedPreview.id !== gameId || startedPreview.status !== "STARTED") {
    throw new Error("Started invite did not resolve to its game");
  }
  const transitionedLobby = await request(`/game-lobbies/${gameId}`, { headers: guestAuth });
  if (transitionedLobby.gameId !== gameId || transitionedLobby.status !== "STARTED" || transitionedLobby.lobby !== null) {
    throw new Error("Guest lobby did not expose its started-game transition");
  }
  const guestGame = await request(`/games/${gameId}`, { headers: guestAuth });
  if (guestGame.waitingOn !== guestGameUserId) throw new Error("The link recipient did not receive the first turn");
  if (guestGame.players.length !== 2 || guestGame.state.rack.length !== 7) throw new Error("Guest game view is incomplete");

  requestId = `link-smoke-${suffix}`;
  const afterPass = await request(`/games/${gameId}/moves`, {
    method: "POST",
    headers: guestAuth,
    body: JSON.stringify({ move: { kind: "pass" }, expectedVersion: guestGame.version, requestId }),
  });
  if (afterPass.waitingOn !== gameUserId) throw new Error("Guest move did not pass the turn to the host");
  const hostGame = await request(`/games/${gameId}`, { headers: auth });
  if (hostGame.version !== afterPass.version || hostGame.state.lastPlay?.playerId !== guestGameUserId) {
    throw new Error("Host did not receive the guest's authoritative move");
  }

  const twoPlayerLobby = await request("/game-lobbies", {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ game: "TIC_TAC_TOE", settings: {} }),
  });
  twoPlayerGameId = twoPlayerLobby.lobby.id;
  if (twoPlayerLobby.lobby.maxPlayers !== 2) throw new Error("Two-player lobby has the wrong capacity");
  const joinedTwoPlayer = await request(`/game-invites/${encodeURIComponent(twoPlayerLobby.inviteToken)}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ anonymousRefreshToken: joined.refreshToken }),
  });
  if (joinedTwoPlayer.status !== "STARTED" || joinedTwoPlayer.lobby !== null) {
    throw new Error("Two-player link game did not auto-start");
  }
  const guestTwoPlayerGame = await request(`/games/${twoPlayerGameId}`, { headers: guestAuth });
  if (guestTwoPlayerGame.type !== "TIC_TAC_TOE" || guestTwoPlayerGame.state.kind !== "tic-tac-toe"
    || guestTwoPlayerGame.waitingOn !== guestGameUserId) {
    throw new Error("Generic linked game was not initialized correctly");
  }

  const pending = await request("/game-lobbies", {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ game: "EIGHT_BALL", settings: {} }),
  });
  cancelledGameId = pending.lobby.id;
  const cancelled = await request(`/game-lobbies/${cancelledGameId}`, { method: "DELETE", headers: auth });
  if (cancelled.status !== "CANCELLED") throw new Error("Pending lobby was not cancelled");
  const remainingLobbies = await request("/game-lobbies", { headers: auth });
  if (remainingLobbies.some((lobby) => lobby.id === cancelledGameId)) throw new Error("Cancelled lobby remained in the inbox");
  const revokedPreviewResponse = await fetch(`${apiBase}/game-invites/${encodeURIComponent(pending.inviteToken)}`);
  const revokedPreview = await revokedPreviewResponse.json();
  if (revokedPreview.status === 1) throw new Error("Cancelled lobby invite still works");

  console.log(JSON.stringify({ ok: true, gameId, twoPlayerGameId, cancelledGameId, hostGameUserId: gameUserId, guestGameUserId }));
}

async function cleanup() {
  if (requestId) await prisma.gameMoveReceipt.deleteMany({ where: { requestId } });
  if (cancelledGameId) await prisma.game.deleteMany({ where: { id: cancelledGameId } });
  if (twoPlayerGameId) await prisma.game.deleteMany({ where: { id: twoPlayerGameId } });
  if (gameId) await prisma.game.deleteMany({ where: { id: gameId } });
  if (guestGameUserId) await prisma.gameUser.deleteMany({ where: { id: guestGameUserId } });
  if (accountId) await prisma.user.deleteMany({ where: { id: accountId } });
  if (gameUserId) await prisma.gameUser.deleteMany({ where: { id: gameUserId } });
  await prisma.$disconnect();
}

run().finally(cleanup).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
