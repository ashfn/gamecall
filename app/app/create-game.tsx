import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { GamePicker, GamePickerChoice } from "../src/components/GamePicker";
import { createLinkLobby } from "../util/gameLobbies";
import { colors } from "../util/theme";

export default function CreateGameScreen() {
  const create = async (choice: GamePickerChoice) => {
    const result = await createLinkLobby(choice);
    router.replace(`/lobby/${result.lobby.id}?inviteToken=${encodeURIComponent(result.inviteToken)}`);
  };

  return (
    <View style={styles.screen}>
      <GamePicker
        friend={null}
        visible
        onClose={() => router.back()}
        onChoose={create}
        submitLabel="Create link"
        contextLabel="Create a game link to share"
        allowTestVariant={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
});
