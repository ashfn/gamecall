"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.newGameParticipants = void 0;
/** Assigns the receiver the opening turn while retaining the challenge sender. */
function newGameParticipants(senderId, receiverId) {
    return {
        player1: receiverId,
        player2: senderId,
        startedBy: senderId,
        waitingOn: receiverId,
    };
}
exports.newGameParticipants = newGameParticipants;
