import type { ComponentType, ReactNode } from "react";
import { Text, View } from "react-native";
import { colors } from "../../util/theme";
import type { GameSession, User } from "../../util/types";
import TicTacToe from "./game_components/TicTacToe";
import WordDrop from "./game_components/WordDrop";
import EightBall from "./game_components/EightBall";
import NumberDrop from "./game_components/NumberDrop";
import Chess from "./game_components/Chess";

export type GameMovePayload = Readonly<Record<string, unknown>>;

export interface GameViewProps {
  game: GameSession;
  account: User;
  sending: boolean;
  onMove: (move: GameMovePayload) => void;
  onPresentationBusyChange?: (busy: boolean) => void;
  turnIndicator?: ReactNode;
  resultIndicator?: ReactNode;
}

export interface GameDefinition {
  type: GameSession["type"];
  name: string;
  component: ComponentType<GameViewProps>;
  fullScreen?: boolean;
}

const gameDefinitions: Record<GameSession["type"], GameDefinition> = {
  TIC_TAC_TOE: {
    type: "TIC_TAC_TOE",
    name: "Tic Tac Toe",
    component: TicTacToe,
  },
  WORD_DROP: {
    type: "WORD_DROP",
    name: "Word Drop",
    component: WordDrop,
    fullScreen: true,
  },
  EIGHT_BALL: {
    type: "EIGHT_BALL",
    name: "8 Ball",
    component: EightBall,
    fullScreen: true,
  },
  NUMBER_DROP: {
    type: "NUMBER_DROP",
    name: "Number Drop",
    component: NumberDrop,
    fullScreen: true,
  },
  CHESS: {
    type: "CHESS",
    name: "Chess",
    component: Chess,
    fullScreen: true,
  },
};

export function getGameDefinition(type: GameSession["type"]): GameDefinition | null {
  return gameDefinitions[type] ?? null;
}

export default function GameLoader(props: GameViewProps) {
  const definition = getGameDefinition(props.game.type);
  if (!definition) {
    return (
      <View style={{ padding: 24 }}>
        <Text style={{ color: colors.text, textAlign: "center" }}>This game is not installed.</Text>
      </View>
    );
  }

  const GameComponent = definition.component;
  return <GameComponent {...props} />;
}
