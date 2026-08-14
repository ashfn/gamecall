"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateGame = exports.getAllGames = exports.getAllActiveGames = void 0;
const client_1 = require("@prisma/client");
const __1 = require("..");
function getAllActiveGames(userId) {
    return __awaiter(this, void 0, void 0, function* () {
        const games = yield __1.prisma.game.findMany({
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
    });
}
exports.getAllActiveGames = getAllActiveGames;
function getAllGames(userId) {
    return __awaiter(this, void 0, void 0, function* () {
        const games = yield __1.prisma.game.findMany({
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
    });
}
exports.getAllGames = getAllGames;
function updateGame(gameId, newState, waitingOn, winner) {
    return __awaiter(this, void 0, void 0, function* () {
        return yield __1.prisma.game.update({
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
    });
}
exports.updateGame = updateGame;
