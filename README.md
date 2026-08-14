# Rainfrog asynchronous games MVP

Rainfrog is an Expo SDK 54 app backed by Express, Prisma, Postgres, and authenticated Socket.IO updates. The MVP supports persistent friend chats with one asynchronous game active per conversation. Tic Tac Toe and Word Drop are currently installed.

Word Drop uses its own 15×15 bonus layout, tile distribution, and scoring. Players receive seven private tiles, the opening word must cross the centre, later words must connect, and two consecutive passes end the game. Word validation uses the MIT-licensed `an-array-of-english-words` package, derived from the Letterpress word list; it is not an official Scrabble dictionary.

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

   Replace `JWT_SECRET` in `.env` before using the API outside local development.

3. In another terminal, configure and start Expo:

   ```sh
   cd app
   cp .env.example .env
   npm install
   npm start
   ```

   Set `EXPO_PUBLIC_API_URL` to the computer's LAN IP when testing on physical phones. The app derives the Expo development host automatically when the variable is omitted.

4. Create two accounts and accept the friendship. Tap the friend row to choose Word Drop or Tic Tac Toe; tap the chat icon on the right to open their conversation at any time. Use two simulators/devices, or log out and switch accounts, to test asynchronous turns and messages.

## Checks

```sh
cd backend-js && npm run typecheck && npm test && npm run build
cd app && npm run ts:check
```

Before deploying, apply the Prisma migration with `npm run db:migrate` and provide a reachable Postgres `DATABASE_URL` and a public HTTPS API URL.
