"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOtherUser = exports.getGameType = exports.getGame = exports.GameMoveStatus = void 0;
const gameTypes_1 = require("../gameTypes");
const TIC_TAC_TOE_1 = require("./games/TIC_TAC_TOE");
var GameMoveStatus;
(function (GameMoveStatus) {
    GameMoveStatus[GameMoveStatus["INVALID"] = 0] = "INVALID";
    GameMoveStatus[GameMoveStatus["ACCEPTED"] = 1] = "ACCEPTED";
    GameMoveStatus[GameMoveStatus["ENDED"] = 2] = "ENDED";
})(GameMoveStatus || (exports.GameMoveStatus = GameMoveStatus = {}));
function getGame(gameType) {
    switch (gameType) {
        case gameTypes_1.GameType.TIC_TAC_TOE: {
            return TIC_TAC_TOE_1.TIC_TAC_TOE;
        }
        default: {
            return null;
        }
    }
}
exports.getGame = getGame;
function getGameType(gameName) {
    switch (gameName) {
        case "TIC_TAC_TOE": {
            return gameTypes_1.GameType.TIC_TAC_TOE;
        }
        default: {
            return null;
        }
    }
}
exports.getGameType = getGameType;
function getOtherUser(gameState, currentUser) {
    if (gameState.player1 == currentUser) {
        return gameState.player2;
    }
    else {
        return gameState.player1;
    }
}
exports.getOtherUser = getOtherUser;
