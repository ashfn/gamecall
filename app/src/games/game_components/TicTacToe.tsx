import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { colors } from "../../../util/theme";
import type { TicTacToeCell, TicTacToeGameSession, TicTacToeMark } from "../../../util/types";
import type { GameViewProps } from "../GameLoader";

export default function TicTacToe({ game, account, sending, onMove }: GameViewProps) {
  if (game.type !== "TIC_TAC_TOE") return null;
  return <TicTacToeBoard game={game} account={account} sending={sending} onMove={onMove} />;
}

function TicTacToeBoard({ game, account, sending, onMove }: Omit<GameViewProps, "game"> & { game: TicTacToeGameSession }) {
  const { width } = useWindowDimensions();
  const [potentialCell, setPotentialCell] = useState<number | null>(null);
  const isFinished = game.status !== "STARTED";
  const isMyTurn = !isFinished && game.waitingOn === account.id;
  const myMark: TicTacToeMark = game.state.xPlayer === account.id ? "X" : "O";
  const boardSize = Math.min(width - 16, 430);

  useEffect(() => {
    setPotentialCell(null);
  }, [game.id, game.version, game.status]);

  function chooseCell(cell: number) {
    if (!isMyTurn || sending || game.state.board[cell] !== null) return;
    setPotentialCell(cell);
    void Haptics.selectionAsync();
  }

  return (
    <>
      <View style={[styles.board, { width: boardSize, height: boardSize }]} accessibilityLabel="Tic Tac Toe board">
        {game.state.board.map((cell, index) => (
          <BoardCell
            key={index}
            value={cell}
            index={index}
            winning={game.state.winningLine?.includes(index) ?? false}
            enabled={isMyTurn && !sending && cell === null}
            preview={potentialCell === index ? myMark : null}
            onPress={() => chooseCell(index)}
          />
        ))}
        {sending && <View pointerEvents="none" style={styles.sendingOverlay}><ActivityIndicator size="large" color={colors.green} /></View>}
      </View>

      {potentialCell !== null && !isFinished && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send move"
          disabled={sending}
          style={styles.sendMove}
          onPress={() => onMove({ cell: potentialCell })}
        >
          {sending ? <ActivityIndicator color={colors.background} /> : <Text style={styles.sendMoveText}>Send</Text>}
        </Pressable>
      )}
    </>
  );
}

function BoardCell({
  value,
  index,
  winning,
  enabled,
  preview,
  onPress,
}: {
  value: TicTacToeCell;
  index: number;
  winning: boolean;
  enabled: boolean;
  preview: TicTacToeMark | null;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Square ${index + 1}${value ? `, ${value}` : ", empty"}`}
      disabled={!enabled}
      onPress={onPress}
      style={[
        styles.cell,
        index % 3 !== 2 && styles.cellRight,
        index < 6 && styles.cellBottom,
        winning && styles.winningCell,
      ]}
    >
      {(value === "X" || preview === "X") && <Text style={[styles.markX, preview === "X" && styles.previewMark, winning && styles.winningMark]}>×</Text>}
      {(value === "O" || preview === "O") && <View style={[styles.markO, preview === "O" && styles.previewO, winning && styles.winningO]} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  board: { alignSelf: "center", flexDirection: "row", flexWrap: "wrap", backgroundColor: colors.background },
  cell: { width: "33.3333%", height: "33.3333%", alignItems: "center", justifyContent: "center", borderColor: colors.green },
  cellRight: { borderRightWidth: 4 },
  cellBottom: { borderBottomWidth: 4 },
  winningCell: { backgroundColor: "#171F17" },
  markX: { color: colors.green, fontSize: 118, lineHeight: 120, fontWeight: "200", marginTop: -12 },
  markO: { width: "62%", height: "62%", borderRadius: 999, borderWidth: 6, borderColor: colors.green },
  previewMark: { color: "#565756" },
  previewO: { borderColor: "#565756" },
  winningMark: { color: colors.gold },
  winningO: { borderColor: colors.gold },
  sendingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(10,10,10,0.45)", alignItems: "center", justifyContent: "center" },
  sendMove: { minWidth: 110, height: 45, marginTop: 18, borderRadius: 8, backgroundColor: colors.green, paddingHorizontal: 24, alignItems: "center", justifyContent: "center" },
  sendMoveText: { color: colors.background, fontSize: 18 },
});
