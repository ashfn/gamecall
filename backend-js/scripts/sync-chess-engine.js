#!/usr/bin/env node
/*
 * The chess engine is a local fork of chess.js that the server and the app both
 * play by, so the two copies have to be identical: a client that disagrees with
 * the server about legality shows moves that get rejected, and — in fog of war —
 * a client that disagrees about vision draws the fog in the wrong places.
 *
 *   node scripts/sync-chess-engine.js          copy backend -> app
 *   node scripts/sync-chess-engine.js --check   fail if they have drifted
 */
const fs = require("fs");
const path = require("path");

const source = path.join(__dirname, "..", "src", "game", "gamestate", "games", "chessEngine.ts");
const target = path.join(__dirname, "..", "..", "app", "src", "games", "chessEngine.ts");
const check = process.argv.includes("--check");

const engine = fs.readFileSync(source, "utf8");
const current = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : null;

if (engine === current) {
  console.log("chess engine copies are in sync");
  process.exit(0);
}

if (check) {
  console.error(`chess engine copies have drifted\n  ${source}\n  ${target}\nrun: npm run sync:chess-engine`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, engine);
console.log(`copied chess engine -> ${path.relative(process.cwd(), target)}`);
