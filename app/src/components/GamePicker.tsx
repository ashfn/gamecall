import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { prefix } from "../../util/config";
import { startGame } from "../../util/games";
import { colors } from "../../util/theme";
import { GameSession, GameType, User, WordDropVariant } from "../../util/types";

function WordDropPreview() {
  return (
    <View style={styles.wordPreview}>
      <View style={[styles.previewTile, { left: 24 }]}><Text style={styles.previewLetter}>W</Text><Text style={styles.previewPoints}>4</Text></View>
      <View style={[styles.previewTile, { left: 63 }]}><Text style={styles.previewLetter}>O</Text><Text style={styles.previewPoints}>1</Text></View>
      <View style={[styles.previewTile, { left: 102 }]}><Text style={styles.previewLetter}>R</Text><Text style={styles.previewPoints}>1</Text></View>
      <View style={[styles.previewTile, { left: 141 }]}><Text style={styles.previewLetter}>D</Text><Text style={styles.previewPoints}>2</Text></View>
      <Text style={styles.previewTagline}>BUILD WORDS · DROP TILES</Text>
    </View>
  );
}

function EightBallPreview() {
  const balls = [
    { left: 103, top: 34, color: "#F4D03F" },
    { left: 91, top: 51, color: "#316FD1" },
    { left: 115, top: 51, color: "#D84943" },
    { left: 79, top: 68, color: "#7048A8" },
    { left: 103, top: 68, color: "#111" },
    { left: 127, top: 68, color: "#E67E32" },
  ];
  return (
    <View style={styles.poolPreview}>
      <View style={styles.poolCloth}>
        {[[0, 0], [1, 0], [0, 0.5], [1, 0.5], [0, 1], [1, 1]].map(([x, y], index) => (
          <View key={index} style={[styles.poolPocket, { left: x * 181 - 6, top: y * 108 - 6 }]} />
        ))}
        {balls.map((ball, index) => <View key={index} style={[styles.poolPreviewBall, ball]} />)}
        <View style={styles.poolCueBall} />
        <View style={styles.poolCue} />
      </View>
    </View>
  );
}

function NumberDropPreview() {
  return (
    <View style={styles.numberPreview}>
      <Text style={styles.numberPreviewTarget}>437</Text>
      <View style={styles.numberPreviewTiles}>
        {[100, 75, 25, 8, 7, 3].map((number) => (
          <View key={number} style={styles.numberPreviewTile}><Text style={styles.numberPreviewTileText}>{number}</Text></View>
        ))}
      </View>
      <Text style={styles.numberPreviewTagline}>DRAG · COMBINE · GET CLOSE</Text>
    </View>
  );
}

export function GamePicker({
  friend,
  visible,
  onClose,
  onStarted,
}: {
  friend: User | null;
  visible: boolean;
  onClose: () => void;
  onStarted: (game: GameSession) => void;
}) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<GameType>("WORD_DROP");
  const [wordDropVariant, setWordDropVariant] = useState<WordDropVariant>("REGULAR");
  const [moveTimerSeconds, setMoveTimerSeconds] = useState<null | 120 | 300>(null);
  const [numberDropRounds, setNumberDropRounds] = useState<1 | 3 | 5>(3);
  const [step, setStep] = useState<"game" | "settings">("game");

  useEffect(() => {
    if (visible) {
      setError(null);
      setStep("game");
    }
  }, [visible]);

  function advanceOrSend() {
    if (step === "game" && (selected === "WORD_DROP" || selected === "NUMBER_DROP")) {
      setStep("settings");
      return;
    }
    void sendGame();
  }

  function backOrClose() {
    if (step === "settings") setStep("game");
    else onClose();
  }

  async function sendGame() {
    if (!friend || working) return;
    setWorking(true);
    setError(null);
    try {
      if (selected === "WORD_DROP") {
        onStarted(await startGame(friend.id, "WORD_DROP", { variant: wordDropVariant, moveTimerSeconds }));
      } else if (selected === "EIGHT_BALL") {
        onStarted(await startGame(friend.id, "EIGHT_BALL", {}));
      } else if (selected === "NUMBER_DROP") {
        onStarted(await startGame(friend.id, "NUMBER_DROP", { rounds: numberDropRounds, moveTimerSeconds }));
      } else {
        onStarted(await startGame(friend.id, "TIC_TAC_TOE", {}));
      }
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "Could not start the game");
    } finally {
      setWorking(false);
    }
  }

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={backOrClose}>
      <View style={styles.modalRoot}>
        <Pressable accessibilityLabel="Close game picker" style={styles.modalBackdrop} onPress={onClose} />
        <SafeAreaView style={styles.sheet} edges={["bottom"]}>
          <Text style={styles.sheetTitle}>{step === "settings" ? `${selected === "NUMBER_DROP" ? "Number Drop" : "Word Drop"} options` : "Choose game"}</Text>
          {step === "game" ? (
            <ScrollView style={styles.choicesScroll} contentContainerStyle={styles.choices} showsVerticalScrollIndicator={false}>
              <Pressable accessibilityRole="button" accessibilityLabel="Choose Word Drop" style={[styles.gameChoice, selected === "WORD_DROP" && styles.selectedGame]} onPress={() => setSelected("WORD_DROP")}>
                <WordDropPreview />
                <View style={styles.gameChoiceCopy}>
                  <Text style={styles.gameName}>Word Drop</Text>
                  <Text style={styles.gameDescription}>Build words one turn at a time</Text>
                </View>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Choose Tic Tac Toe" style={[styles.gameChoice, selected === "TIC_TAC_TOE" && styles.selectedGame]} onPress={() => setSelected("TIC_TAC_TOE")}>
                <Image source={{ uri: `${prefix}/assets/TIC_TAC_TOE/banner.png` }} style={styles.ticTacToeBanner} resizeMode="cover" />
                <View style={styles.gameChoiceCopy}>
                  <Text style={styles.gameName}>Tic Tac Toe</Text>
                  <Text style={styles.gameDescription}>Quick three-in-a-row</Text>
                </View>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Choose 8 Ball" style={[styles.gameChoice, selected === "EIGHT_BALL" && styles.selectedGame]} onPress={() => setSelected("EIGHT_BALL")}>
                <EightBallPreview />
                <View style={styles.gameChoiceCopy}>
                  <Text style={styles.gameName}>8 Ball</Text>
                  <Text style={styles.gameDescription}>Line up a shot and clear the table</Text>
                </View>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Choose Number Drop" style={[styles.gameChoice, selected === "NUMBER_DROP" && styles.selectedGame]} onPress={() => setSelected("NUMBER_DROP")}>
                <NumberDropPreview />
                <View style={styles.gameChoiceCopy}>
                  <Text style={styles.gameName}>Number Drop</Text>
                  <Text style={styles.gameDescription}>Combine numbers and chase the target</Text>
                </View>
              </Pressable>
            </ScrollView>
          ) : (
            <View style={styles.settingsSection}>
              <Text style={styles.settingsLabel}>{selected === "NUMBER_DROP" ? "ROUND TIMER" : "MOVE TIMER"}</Text>
              <View style={styles.timerChoices}>
                {([
                  { label: "No timer", value: null },
                  { label: "2 min", value: 120 },
                  { label: "5 min", value: 300 },
                ] as const).map((option) => {
                  const selectedTimer = moveTimerSeconds === option.value;
                  return (
                    <Pressable
                      key={option.label}
                      accessibilityRole="button"
                      accessibilityState={{ selected: selectedTimer }}
                      style={[styles.timerChoice, selectedTimer && styles.variantChoiceSelected]}
                      onPress={() => setMoveTimerSeconds(option.value)}
                    >
                      <Text style={[styles.timerChoiceText, selectedTimer && styles.variantNameSelected]}>{option.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {selected === "WORD_DROP" ? (
                <>
                  <Text style={styles.settingsLabel}>GAME SIZE</Text>
                  <View style={styles.variantChoices}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: wordDropVariant === "REGULAR" }}
                  style={[styles.variantChoice, wordDropVariant === "REGULAR" && styles.variantChoiceSelected]}
                  onPress={() => setWordDropVariant("REGULAR")}
                >
                  <Text style={[styles.variantName, wordDropVariant === "REGULAR" && styles.variantNameSelected]}>Regular</Text>
                  <Text style={styles.variantDetail}>15×15 · 100 tiles</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: wordDropVariant === "MINI" }}
                  style={[styles.variantChoice, wordDropVariant === "MINI" && styles.variantChoiceSelected]}
                  onPress={() => setWordDropVariant("MINI")}
                >
                  <Text style={[styles.variantName, wordDropVariant === "MINI" && styles.variantNameSelected]}>Mini</Text>
                  <Text style={styles.variantDetail}>11×11 · 50 tiles</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: wordDropVariant === "TEST" }}
                  style={[styles.variantChoice, wordDropVariant === "TEST" && styles.variantChoiceSelected]}
                  onPress={() => setWordDropVariant("TEST")}
                >
                  <Text style={[styles.variantName, wordDropVariant === "TEST" && styles.variantNameSelected]}>Test</Text>
                  <Text style={styles.variantDetail}>11×11 · 6 in bag</Text>
                </Pressable>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.settingsLabel}>ROUNDS</Text>
                  <View style={styles.variantChoices}>
                    {([1, 3, 5] as const).map((rounds) => {
                      const selectedRounds = numberDropRounds === rounds;
                      return (
                        <Pressable
                          key={rounds}
                          accessibilityRole="button"
                          accessibilityState={{ selected: selectedRounds }}
                          style={[styles.roundChoice, selectedRounds && styles.variantChoiceSelected]}
                          onPress={() => setNumberDropRounds(rounds)}
                        >
                          <Text style={[styles.roundChoiceNumber, selectedRounds && styles.variantNameSelected]}>{rounds}</Text>
                          <Text style={styles.variantDetail}>{rounds === 1 ? "round" : "rounds"}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              )}
            </View>
          )}
          <Text style={styles.playingWith}>Play with {friend?.displayName}</Text>
          {error && <Text style={styles.error}>{error}</Text>}
          <View style={styles.actions}>
            <Pressable style={styles.cancelButton} onPress={backOrClose}><Text style={styles.cancelText}>{step === "settings" ? "Back" : "Cancel"}</Text></Pressable>
            <Pressable disabled={working} style={[styles.sendButton, working && styles.disabled]} onPress={advanceOrSend}>
              {working
                ? <ActivityIndicator color={colors.background} />
                : <Text style={styles.sendText}>{step === "game" && (selected === "WORD_DROP" || selected === "NUMBER_DROP") ? "Next" : "Send"}</Text>}
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.18)" },
  sheet: { height: "75%", backgroundColor: "#0F0F0F", borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingTop: 8 },
  sheetTitle: { color: colors.green, textAlign: "center", fontSize: 20, fontWeight: "800", paddingVertical: 4 },
  choices: { marginHorizontal: 12, marginTop: 10, gap: 9 },
  choicesScroll: { flex: 1 },
  gameChoice: { height: 124, borderRadius: 8, overflow: "hidden", backgroundColor: colors.surface, borderWidth: 2, borderColor: "transparent", flexDirection: "row" },
  selectedGame: { borderColor: colors.greenStrong },
  wordPreview: { width: 205, height: "100%", backgroundColor: "#F1F0EB", overflow: "hidden", justifyContent: "flex-end", paddingBottom: 12 },
  previewTile: { position: "absolute", top: 25, width: 36, height: 40, borderRadius: 4, backgroundColor: "#2E6598", alignItems: "center", justifyContent: "center" },
  previewLetter: { color: colors.white, fontSize: 23, fontWeight: "800" },
  previewPoints: { position: "absolute", right: 3, top: 2, color: "#E8F2FA", fontSize: 7 },
  previewTagline: { color: "#2E6598", fontSize: 9, fontWeight: "900", letterSpacing: 0.8, textAlign: "center" },
  ticTacToeBanner: { width: 205, height: "100%" },
  poolPreview: { width: 205, height: "100%", backgroundColor: "#2D1B13", padding: 10 },
  poolCloth: { flex: 1, borderRadius: 7, backgroundColor: "#176B4D", borderWidth: 4, borderColor: "#6E4A32", overflow: "hidden" },
  poolPocket: { position: "absolute", width: 12, height: 12, borderRadius: 6, backgroundColor: "#050505" },
  poolPreviewBall: { position: "absolute", width: 13, height: 13, borderRadius: 7, borderWidth: 1, borderColor: "rgba(255,255,255,0.45)" },
  poolCueBall: { position: "absolute", left: 91, top: 83, width: 13, height: 13, borderRadius: 7, backgroundColor: "#F6F3EA" },
  poolCue: { position: "absolute", left: 97, top: 91, width: 3, height: 58, backgroundColor: "#D8B77D", transform: [{ rotate: "8deg" }] },
  numberPreview: { width: 205, height: "100%", backgroundColor: "#142219", alignItems: "center", justifyContent: "center", paddingHorizontal: 15 },
  numberPreviewTarget: { color: colors.green, fontSize: 32, lineHeight: 36, fontWeight: "900" },
  numberPreviewTiles: { flexDirection: "row", gap: 3, marginTop: 5 },
  numberPreviewTile: { minWidth: 25, height: 25, paddingHorizontal: 3, borderRadius: 4, backgroundColor: colors.green, alignItems: "center", justifyContent: "center" },
  numberPreviewTileText: { color: colors.background, fontSize: 9, fontWeight: "900" },
  numberPreviewTagline: { color: colors.green, fontSize: 7, fontWeight: "900", letterSpacing: 0.7, marginTop: 7 },
  gameChoiceCopy: { flex: 1, paddingHorizontal: 10, justifyContent: "center" },
  gameName: { color: colors.text, fontSize: 15, fontWeight: "800" },
  gameDescription: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 4 },
  playingWith: { color: colors.text, fontSize: 14, textAlign: "center", marginTop: 12 },
  settingsSection: { marginHorizontal: 12, marginTop: 12 },
  settingsLabel: { color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1.1, marginBottom: 6 },
  timerChoices: { flexDirection: "row", gap: 8, marginBottom: 16 },
  timerChoice: { flex: 1, minHeight: 46, borderRadius: 9, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  timerChoiceText: { color: colors.text, fontSize: 13, fontWeight: "700" },
  variantChoices: { flexDirection: "row", gap: 8 },
  variantChoice: { flex: 1, minHeight: 57, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  roundChoice: { flex: 1, minHeight: 67, borderRadius: 9, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  roundChoiceNumber: { color: colors.text, fontSize: 24, lineHeight: 27, fontWeight: "900" },
  variantChoiceSelected: { borderColor: colors.green, backgroundColor: colors.surfaceRaised },
  variantName: { color: colors.text, fontSize: 14, fontWeight: "700" },
  variantNameSelected: { color: colors.green },
  variantDetail: { color: colors.muted, fontSize: 10, marginTop: 3 },
  error: { color: "#EF4444", marginHorizontal: 18, marginTop: 12, textAlign: "center" },
  actions: { marginTop: "auto", marginHorizontal: 16, marginBottom: 12, flexDirection: "row", gap: 8 },
  cancelButton: { flex: 0.3, height: 54, borderRadius: 8, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  cancelText: { color: colors.text, fontWeight: "700" },
  sendButton: { flex: 0.7, height: 54, borderRadius: 8, backgroundColor: colors.greenStrong, alignItems: "center", justifyContent: "center" },
  sendText: { color: colors.background, fontWeight: "800" },
  disabled: { opacity: 0.6 },
});
