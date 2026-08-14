export interface NewGameParticipants {
  player1: number;
  player2: number;
  startedBy: number;
  waitingOn: number;
}

/** Assigns the receiver the opening turn while retaining the challenge sender. */
export function newGameParticipants(senderId: number, receiverId: number): NewGameParticipants {
  return {
    player1: receiverId,
    player2: senderId,
    startedBy: senderId,
    waitingOn: receiverId,
  };
}
