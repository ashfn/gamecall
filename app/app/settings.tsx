import { FontAwesome, FontAwesome5, MaterialIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { apiAction } from "../util/api";
import { logout, useAccountDetailsStore } from "../util/auth";
import { prefix } from "../util/config";
import { colors } from "../util/theme";

export default function SettingsScreen() {
  const account = useAccountDetailsStore((state) => state.account);
  const refreshAccount = useAccountDetailsStore((state) => state.refresh);
  const [avatarVersion, setAvatarVersion] = useState(0);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [nameOpen, setNameOpen] = useState(false);
  const [displayName, setDisplayName] = useState(account?.displayName ?? "");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signOut() {
    await logout();
    router.replace("/");
  }

  async function pickImage() {
    if (!account || working) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.65,
      base64: true,
    });
    if (result.canceled || !result.assets[0]?.base64) return;
    setWorking(true);
    setError(null);
    try {
      await apiAction(`${prefix}/profile/${account.id}/avatar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar: result.assets[0].base64 }),
      });
      setAvatarFailed(false);
      setAvatarVersion((value) => value + 1);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Could not update your photo");
    } finally {
      setWorking(false);
    }
  }

  async function saveName() {
    if (!account || working) return;
    setWorking(true);
    setError(null);
    try {
      await apiAction(`${prefix}/profile/${account.id}/displayname`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayname: displayName.trim() }),
      });
      await refreshAccount();
      setNameOpen(false);
    } catch (nameError) {
      setError(nameError instanceof Error ? nameError.message : "Could not update your name");
    } finally {
      setWorking(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <Modal transparent visible={nameOpen} animationType="fade" onRequestClose={() => setNameOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => setNameOpen(false)} />
          <View style={styles.nameModal}>
            <Text style={styles.modalTitle}>Edit name</Text>
            <Text style={styles.modalDescription}>This is how you appear to other users</Text>
            <TextInput style={styles.nameInput} value={displayName} onChangeText={setDisplayName} maxLength={15} autoFocus selectionColor={colors.green} />
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancel} onPress={() => setNameOpen(false)}><Text style={styles.modalCancelText}>Cancel</Text></Pressable>
              <Pressable disabled={working} style={styles.modalSave} onPress={saveName}>{working ? <ActivityIndicator color={colors.background} /> : <Text style={styles.modalSaveText}>Save</Text>}</Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <View style={styles.header}>
        <Pressable style={styles.headerSide} onPress={() => router.back()}><FontAwesome5 name="arrow-left" size={25} color={colors.green} /></Pressable>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={styles.headerSide} />
      </View>

      {account && (
        <View style={styles.body}>
          <Pressable style={styles.avatarWrap} onPress={pickImage}>
            <View style={styles.avatarFallback}><Text style={styles.initial}>{account.displayName.slice(0, 1).toUpperCase()}</Text></View>
            {!avatarFailed && <Image key={avatarVersion} source={{ uri: `${prefix}/profile/${account.id}/avatar?v=${avatarVersion}` }} style={styles.avatarImage} onError={() => setAvatarFailed(true)} />}
            <View style={styles.cameraBadge}><MaterialIcons name="photo-camera" size={24} color={colors.text} /></View>
            {working && <View style={styles.avatarWorking}><ActivityIndicator color={colors.green} /></View>}
          </Pressable>

          <Pressable style={styles.nameButton} onPress={() => {
            setDisplayName(account.displayName);
            setNameOpen(true);
          }}>
            <Text style={styles.name}>{account.displayName}</Text>
            <FontAwesome name="pencil" size={18} color={colors.text} />
          </Pressable>

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable style={styles.logout} onPress={signOut}><Text style={styles.logoutText}>Log out</Text></Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { height: 48, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", marginBottom: 16 },
  headerSide: { flex: 1, paddingLeft: 16 },
  headerTitle: { flex: 1, color: colors.green, textAlign: "center", fontSize: 16, fontWeight: "800" },
  body: { flex: 1, alignItems: "center" },
  avatarWrap: { width: 125, height: 125 },
  avatarFallback: { ...StyleSheet.absoluteFillObject, borderRadius: 63, backgroundColor: colors.greenStrong, alignItems: "center", justifyContent: "center" },
  avatarImage: { ...StyleSheet.absoluteFillObject, borderRadius: 63 },
  initial: { color: colors.background, fontSize: 42, fontWeight: "800" },
  cameraBadge: { position: "absolute", right: -2, bottom: 7, width: 36, height: 36, borderRadius: 18, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" },
  avatarWorking: { ...StyleSheet.absoluteFillObject, borderRadius: 63, backgroundColor: "rgba(10,10,10,0.55)", alignItems: "center", justifyContent: "center" },
  nameButton: { marginTop: 8, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", gap: 8 },
  name: { color: colors.text, fontSize: 24 },
  error: { color: "#EF4444", marginHorizontal: 24, marginTop: 16, textAlign: "center" },
  logout: { alignSelf: "stretch", height: 56, marginHorizontal: 32, marginTop: 40, borderWidth: 1, borderColor: colors.green, borderRadius: 8, backgroundColor: colors.green, alignItems: "center", justifyContent: "center" },
  logoutText: { color: colors.background, fontSize: 20 },
  modalRoot: { flex: 1, alignItems: "center", justifyContent: "center" },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.65)" },
  nameModal: { width: "86%", borderRadius: 12, backgroundColor: colors.surface, padding: 18 },
  modalTitle: { color: colors.green, fontSize: 21, fontWeight: "700" },
  modalDescription: { color: colors.muted, marginTop: 5 },
  nameInput: { height: 52, marginTop: 20, borderWidth: 1, borderColor: colors.green, borderRadius: 8, paddingHorizontal: 10, color: colors.text, fontSize: 20 },
  modalActions: { flexDirection: "row", marginTop: 16, gap: 8 },
  modalCancel: { flex: 0.4, height: 46, borderRadius: 8, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center" },
  modalCancelText: { color: colors.text },
  modalSave: { flex: 0.6, height: 46, borderRadius: 8, backgroundColor: colors.green, alignItems: "center", justifyContent: "center" },
  modalSaveText: { color: colors.background, fontWeight: "700" },
});
