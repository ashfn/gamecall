export const GameType = {
  TIC_TAC_TOE: "TIC_TAC_TOE",
  WORD_DROP: "WORD_DROP",
  EIGHT_BALL: "EIGHT_BALL",
  NUMBER_DROP: "NUMBER_DROP",
  CHESS: "CHESS",
} as const;

export type GameType = (typeof GameType)[keyof typeof GameType];
