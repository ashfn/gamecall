import assert from "node:assert/strict";
import test from "node:test";
import { newGameParticipants } from "../../gameParticipants";

test("gives the game receiver the opening turn", () => {
  assert.deepEqual(newGameParticipants(12, 34), {
    player1: 34,
    player2: 12,
    startedBy: 12,
    waitingOn: 34,
  });
});
