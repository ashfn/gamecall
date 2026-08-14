import { AntDesign, MaterialIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { login, signup } from "../util/auth";
import { validateCredentials } from "../util/accountValidation";
import { colors } from "../util/theme";

export default function RegisterScreen() {
  const [username, setUsername] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [working, setWorking] = useState(false); const [error, setError] = useState<string | null>(null);
  async function submit() {
    const errors = validateCredentials(email, password, username);
    if (errors.length) { setError(errors[0]); return; }
    setWorking(true); setError(null);
    try {
      const result = await signup(username, email, password);
      if (result.status !== 1) { setError(result.error ?? "Could not create your account."); return; }
      const loginResult = await login(username, password);
      if (loginResult.status === 1) router.replace("/"); else router.replace("/login");
    } catch { setError("Unable to reach Rainfrog. Check your connection."); }
    finally { setWorking(false); }
  }
  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <Pressable style={styles.back} onPress={() => router.back()}><AntDesign name="left" size={30} color={colors.green} /></Pressable>
          <Text style={styles.title}>Create account</Text>
          <View style={styles.headerSide} />
        </View>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.field}><Text style={styles.label}>Username</Text><TextInput style={styles.input} value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} autoComplete="username-new" maxLength={10} selectionColor={colors.green} /></View>
          <View style={styles.field}><Text style={styles.label}>Email</Text><TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" selectionColor={colors.green} /></View>
          <View style={styles.field}><Text style={styles.label}>Password</Text><TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" returnKeyType="go" onSubmitEditing={submit} selectionColor={colors.green} /></View>
          <Pressable disabled={working} style={[styles.button, working && styles.disabled]} onPress={submit}>
            <Text style={styles.buttonText}>Create account</Text>
            {working && <ActivityIndicator color={colors.background} />}
          </Pressable>
          {error && <View style={styles.errorRow}><MaterialIcons name="error-outline" size={18} color="#EF4444" /><Text style={styles.error}>{error}</Text></View>}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { height: 62, paddingHorizontal: 24, flexDirection: "row", alignItems: "center" },
  back: { flex: 1, minHeight: 44, justifyContent: "center" },
  headerSide: { flex: 1 },
  title: { flex: 1.6, color: colors.green, fontSize: 24, textAlign: "center", fontWeight: "400" },
  body: { paddingTop: 78, paddingBottom: 50 },
  field: { height: 58, marginHorizontal: 32, marginBottom: 32, borderWidth: 1, borderColor: colors.green, borderRadius: 8, paddingHorizontal: 10, justifyContent: "center" },
  label: { position: "absolute", top: -14, left: "10%", color: colors.green, backgroundColor: colors.background, paddingHorizontal: 5, paddingVertical: 2, fontSize: 16 },
  input: { color: colors.green, fontSize: 24, paddingVertical: 4 },
  button: { height: 56, marginHorizontal: 32, borderRadius: 8, borderWidth: 1, borderColor: colors.green, backgroundColor: colors.green, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" },
  disabled: { backgroundColor: colors.greenStrong },
  buttonText: { color: colors.background, fontSize: 20 },
  errorRow: { marginHorizontal: 32, marginTop: 16, flexDirection: "row", alignItems: "center" },
  error: { flex: 1, marginLeft: 4, color: "#EF4444", fontSize: 14 },
});
