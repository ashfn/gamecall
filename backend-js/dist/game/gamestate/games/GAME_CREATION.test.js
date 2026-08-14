"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const gameParticipants_1 = require("../../gameParticipants");
(0, node_test_1.default)("gives the game receiver the opening turn", () => {
    strict_1.default.deepEqual((0, gameParticipants_1.newGameParticipants)(12, 34), {
        player1: 34,
        player2: 12,
        startedBy: 12,
        waitingOn: 34,
    });
});
