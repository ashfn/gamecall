# Rainfrog asynchronous games MVP

Rainfrog is an Expo SDK 54 app backed by Express, Prisma, Postgres, and authenticated Socket.IO updates. It supports persistent friend chats, asynchronous games, and link-invited browser players who can play without creating an account.

Word Drop uses its own bonus layouts, tile distributions, and scoring. Players receive seven private tiles, the opening word must cross the centre, and later words must connect. Word validation uses the 172,820-word ENABLE1 list.

Chess runs on a local fork of chess.js that plays three variants from one engine: standard, Chess960, and Fog of War. The fork lives at `backend-js/src/game/gamestate/games/chessEngine.ts` and is mirrored byte-for-byte into `app/src/games/chessEngine.ts`, so the client and the server never disagree about legality — run `npm run sync:chess-engine` after editing it, and `npm run check:chess-engine` to prove the two copies match.

Fog of War is information-tight rather than merely hidden on screen. A player's request returns a FEN with every unseen square already emptied, a visibility mask, and a move history redacted down to the moves they witnessed, so intercepting the traffic tells an opponent no more than watching the board does — the same guarantee Word Drop gets by never shipping the opponent's rack. The vision rule is chosen so a fogged position is *informationally complete*: the moves a client generates from its own view are exactly the moves the server will accept, so nothing hidden has to be sent for the client to know what it may play.

## Run locally

1. Start Postgres:

   ```sh
   docker compose up -d postgres
   ```

2. Configure and start the API:

   ```sh
   cd backend-js
   cp .env.example .env
   npm install
   npm run db:migrate
   npm run dev
   ```

   Replace `JWT_SECRET` in `.env` before using the API outside local development. Set `WEB_APP_ORIGIN` to the URL used to serve the Expo web app.

3. In another terminal, configure and start Expo:

   ```sh
   cd app
   cp .env.example .env
   npm install
   npm start
   ```

   Set `EXPO_PUBLIC_API_URL` to the computer's LAN IP when testing on physical phones. Set `EXPO_PUBLIC_WEB_APP_URL` to the URL that other players will open, such as `http://192.168.1.10:8081` for devices on the same Wi-Fi.

4. Serve the browser build with SPA fallback routing:

   ```sh
   cd app
   npx expo export --platform web
   npm run web:serve
   ```

5. From the signed-in phone app, tap the compose button, choose a game, and share/open its link in a browser. The browser identity is stored locally and can return to the game later.

## Checks

```sh
cd backend-js && npm run typecheck && npm test && npm run check:chess-engine && npm run build
cd app && npm run ts:check
```

Before deploying, apply the Prisma migration with `npm run db:migrate` and provide a reachable Postgres `DATABASE_URL` and a public HTTPS API URL.
