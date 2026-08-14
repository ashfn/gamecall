import { FontAwesome5 } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { apiAction, apiRequest } from "../../util/api";
import { useAccountDetailsStore } from "../../util/auth";
import { prefix } from "../../util/config";
import { cacheProfile, getCachedProfile, ProfileRelation } from "../../util/profileCache";
import { colors } from "../../util/theme";
import { User } from "../../util/types";

interface Connections {
  friends: number[];
  requestsSent: number[];
  requestsReceived: number[];
}

type Relation = ProfileRelation;

export default function UserScreen() {
  const { userid } = useLocalSearchParams<{ userid: string }>();
  const userId = Number(userid);
  const account = useAccountDetailsStore((state) => state.account);
  const initialProfile = useRef(getCachedProfile(userId)).current;
  const [user, setUser] = useState<User | null>(initialProfile?.user ?? null);
  const [relation, setRelation] = useState<Relation>(initialProfile?.relation ?? null);
  const [working, setWorking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (showSpinner = false) => {
    if (!Number.isInteger(userId)) {
      setError("User not found");
      return;
    }
    if (showSpinner) setRefreshing(true);
    try {
      const [profile, connections] = await Promise.all([
        apiRequest<User>(`${prefix}/profile/${userId}`),
        apiRequest<Connections>(`${prefix}/connections`),
      ]);
      const nextRelation: Relation = (
        userId === account?.id ? null
          : connections.friends.includes(userId) ? "Remove"
            : connections.requestsSent.includes(userId) ? "Requested"
              : connections.requestsReceived.includes(userId) ? "Accept"
                : "Add"
      );
      cacheProfile(profile, nextRelation);
      setUser(profile);
      setRelation(nextRelation);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "User not found");
    } finally {
      setRefreshing(false);
    }
  }, [account?.id, userId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function updateRelation() {
    if (!relation || relation === "Requested" || working) return;
    setWorking(true);
    setError(null);
    const endpoint = relation === "Accept"
      ? `${prefix}/acceptFriendRequest/${userId}`
      : relation === "Remove"
        ? `${prefix}/removeFriend/${userId}`
        : `${prefix}/friendRequest/${userId}`;
    try {
      await apiAction(endpoint, { method: "POST" });
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Could not update friendship");
    } finally {
      setWorking(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.page}>
        <View style={styles.header}>
          <Pressable style={styles.headerSide} onPress={() => router.back()}><FontAwesome5 name="arrow-left" size={25} color={colors.green} /></Pressable>
          <Text style={styles.headerTitle}>{user?.username ?? ""}</Text>
          <View style={styles.headerSide} />
        </View>

        {!user && !error && <ActivityIndicator style={styles.loader} color={colors.green} size="large" />}
        {error && <Text style={styles.error}>{error}</Text>}

        {user && (
          <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.black} colors={[colors.black]} />}>
            <View style={styles.profileRow}>
              <View style={styles.avatar}>
                <Text style={styles.initial}>{user.displayName.slice(0, 1).toUpperCase()}</Text>
                {!avatarFailed && <Image source={{ uri: `${prefix}/profile/${userId}/avatar` }} style={styles.avatarImage} onError={() => setAvatarFailed(true)} />}
              </View>
              <View style={styles.profileBody}>
                <Text style={styles.name}>{user.displayName}</Text>
                <Text style={styles.handle}>@{user.username}</Text>
                {userId !== account?.id && (
                  <View style={styles.actionSlot}>
                    {relation && (
                      <Pressable
                        disabled={relation === "Requested" || working}
                        style={[styles.action, relation === "Requested" && styles.requested, relation === "Remove" && styles.remove]}
                        onPress={updateRelation}
                      >
                        <Text style={styles.actionText}>{relation}</Text>
                        {working && <ActivityIndicator style={styles.actionSpinner} size="small" color={colors.background} />}
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
            </View>
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  page: { flex: 1, padding: 8 },
  header: { height: 48, flexDirection: "row", alignItems: "center", marginBottom: 16 },
  headerSide: { flex: 1, paddingLeft: 16 },
  headerTitle: { flex: 1, color: colors.green, textAlign: "center", fontSize: 16, fontWeight: "800" },
  loader: { marginTop: 32 },
  error: { color: "#EF4444", textAlign: "center", marginTop: 28 },
  profileRow: { flexDirection: "row", marginLeft: 16, marginTop: 16 },
  avatar: { width: 100, height: 100, borderRadius: 50, backgroundColor: colors.greenStrong, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImage: { ...StyleSheet.absoluteFillObject, borderRadius: 50 },
  initial: { color: colors.background, fontSize: 34, fontWeight: "800" },
  profileBody: { flex: 1, paddingLeft: 16 },
  name: { color: colors.text, fontSize: 24 },
  handle: { color: colors.muted, fontSize: 16, marginTop: -2 },
  actionSlot: { height: 46 },
  action: { height: 36, marginTop: 10, borderRadius: 6, backgroundColor: colors.green, alignItems: "center", justifyContent: "center", flexDirection: "row" },
  requested: { backgroundColor: "#27272A" },
  remove: { backgroundColor: "#EF4444" },
  actionText: { color: colors.background, fontSize: 16 },
  actionSpinner: { position: "absolute", right: 14 },
});
