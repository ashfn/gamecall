"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateGame = exports.getAllGames = exports.getAllActiveGames = void 0;
const client_1 = require("@prisma/client");
const __1 = require("..");
async function getAllActiveGames(userId) {
    const games = await __1.prisma.game.findMany({
        where: {
            AND: [
                {
                    OR: [
                        {
                            player1: userId
                        },
                        {
                            player2: userId
                        }
                    ]
                },
                {
                    OR: [
                        { status: client_1.GameStatus.STARTED },
                        { status: client_1.GameStatus.ENDED_UNOPENED }
                    ]
                }
            ]
        }
    });
    return games;
}
exports.getAllActiveGames = getAllActiveGames;
async function getAllGames(userId) {
    const games = await __1.prisma.game.findMany({
        where: {
            OR: [
                {
                    player1: userId
                },
                {
                    player2: userId
                }
            ]
        }
    });
    return games;
}
exports.getAllGames = getAllGames;
async function updateGame(gameId, newState, waitingOn, winner) {
    return await __1.prisma.game.update({
        where: {
            id: gameId
        },
        data: {
            gameStateJson: JSON.stringify(newState),
            waitingOn: waitingOn,
            lastActivity: new Date(),
            status: winner == 0 ? client_1.GameStatus.STARTED : client_1.GameStatus.ENDED_UNOPENED,
            winner: winner == null ? 0 : winner
        }
    });
}
exports.updateGame = updateGame;
