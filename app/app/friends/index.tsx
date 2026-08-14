import { FontAwesome, FontAwesome5 } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { apiAction, apiRequest } from "../../util/api";
import { useAccountDetailsStore } from "../../util/auth";
import { prefix } from "../../util/config";
import { cacheProfile } from "../../util/profileCache";
import { colors } from "../../util/theme";
import { User } from "../../util/types";

interface FriendRequest {
  requestOriginId: number;
  requestOrigin: Pick<User, "username" | "displayName">;
}

interface Connections {
  friends: number[];
  requestsSent: number[];
  requestsReceived: number[];
}

type Relation = "Add" | "Requested" | "Accept" | "Remove";

function Avatar({ userId, name, size = 60 }: { userId: number; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={styles.avatarText}>{name.slice(0, 1).toUpperCase()}</Text>
      {!failed && (
        <Image
          source={{ uri: `${prefix}/profile/${userId}/avatar` }}
          style={[StyleSheet.absoluteFillObject, { borderRadius: size / 2 }]}
          onError={() => setFailed(true)}
        />
      )}
    </View>
  );
}

export default function FriendsScreen() {
  const account = useAccountDetailsStore((state) => state.account);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [results, setResults] = useState<User[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [connections, setConnections] = useState<Connections>({ friends: [], requestsSent: [], requestsReceived: [] });
  const [searching, setSearching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [workingKey, setWorkingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const searchRequestId = useRef(0);

  const load = useCallback(async () => {
    try {
      const [nextRequests, nextConnections] = await Promise.all([
        apiRequest<FriendRequest[]>(`${prefix}/friendRequests`),
        apiRequest<Connections>(`${prefix}/connections`),
      ]);
      setRequests(nextRequests);
      setConnections(nextConnections);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load friend requests");
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const search = useCallback(async (value: string, requestId: number) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setSearching(true);
    setError(null);
    try {
      const people = await apiRequest<User[]>(`${prefix}/searchProfiles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ search: trimmed }),
      });
      if (searchRequestId.current !== requestId) return;
      setResults(people.filter((user) => user.id !== account?.id));
      setHasSearched(true);
    } catch (searchError) {
      if (searchRequestId.current !== requestId) return;
      setError(searchError instanceof Error ? searchError.message : "Search failed");
      setHasSearched(true);
    } finally {
      if (searchRequestId.current === requestId) setSearching(false);
    }
  }, [account?.id]);

  useEffect(() => {
    const requestId = ++searchRequestId.current;
    setHasSearched(false);
    if (!searchOpen || !query.trim()) {
      setSearching(false);
      setResults([]);
      return undefined;
    }
    const timer = setTimeout(() => { void search(query, requestId); }, 250);
    return () => clearTimeout(timer);
  }, [query, search, searchOpen]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function act(key: string, url: string) {
    if (workingKey) return;
    setWorkingKey(key);
    setError(null);
    try {
      await apiAction(url, { method: "POST" });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await load();
      if (query.trim()) {
        const requestId = ++searchRequestId.current;
        await search(query, requestId);
      }
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Could not update this request");
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setWorkingKey(null);
    }
  }

  function relation(userId: number): Relation {
    if (connections.friends.includes(userId)) return "Remove";
    if (connections.requestsSent.includes(userId)) return "Requested";
    if (connections.requestsReceived.includes(userId)) return "Accept";
    return "Add";
  }

  function closeSearch() {
    setSearchOpen(false);
    setQuery("");
    setResults([]);
    setHasSearched(false);
    setSearching(false);
    searchRequestId.current += 1;
    setError(null);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <View style={styles.page}>
        <View style={styles.header}>
          <Pressable style={styles.headerSide} onPress={() => router.back()}><FontAwesome5 name="arrow-left" size={25} color={colors.green} /></Pressable>
          <Text style={styles.headerTitle}>Friends</Text>
          <View style={styles.headerSide} />
        </View>

        <View style={styles.searchRow}>
          <View style={[styles.searchBar, searchOpen && styles.searchBarOpen]}>
            <FontAwesome name="search" size={20} color={colors.text} />
            <View style={styles.searchInputWrap}>
              <TextInput
                style={styles.searchInput}
                value={query}
                onFocus={() => {
                  setSearchOpen(true);
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                onChangeText={(value) => {
                  setQuery(value);
                }}
                returnKeyType="search"
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={20}
              />
              {!query && (
                <View pointerEvents="none" style={styles.searchPlaceholderWrap}>
                  <Text style={styles.searchPlaceholder}>Search</Text>
                </View>
              )}
            </View>
            {searching && <ActivityIndicator size="small" color={colors.green} />}
          </View>
          {searchOpen && <Pressable style={styles.cancelSearch} onPress={closeSearch}><Text style={styles.cancelSearchText}>Cancel</Text></Pressable>}
        </View>

        {error && <Pressable style={styles.errorRow} onPress={load}><Text style={styles.errorText}>{error}</Text></Pressable>}

        {searchOpen ? (
          <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
            {results.map((user) => {
              const status = relation(user.id);
              const actionKey = `${status}-${user.id}`;
              const disabled = status === "Requested" || workingKey !== null;
              const endpoint = status === "Accept"
                ? `${prefix}/acceptFriendRequest/${user.id}`
                : status === "Remove"
                  ? `${prefix}/removeFriend/${user.id}`
                  : `${prefix}/friendRequest/${user.id}`;
              return (
                <Pressable
                  key={user.id}
                  style={styles.searchResult}
                  onPress={() => {
                    cacheProfile(user, status);
                    router.push(`/user/${user.id}`);
                  }}
                >
                  <Avatar userId={user.id} name={user.displayName} />
                  <View style={styles.personBody}>
                    <Text style={styles.name}>{user.displayName}</Text>
                    <Text style={styles.handle}>@{user.username}</Text>
                  </View>
                  <Pressable
                    disabled={disabled}
                    style={[styles.relationButton, status === "Requested" && styles.requestedButton, status === "Remove" && styles.removeButton]}
                    onPress={(event) => {
                      event.stopPropagation();
                      void act(actionKey, endpoint);
                    }}
                  >
                    {workingKey === actionKey ? <ActivityIndicator color={colors.background} /> : <Text style={styles.relationText}>{status}</Text>}
                  </Pressable>
                </Pressable>
              );
            })}
            {!searching && hasSearched && query.trim().length > 0 && results.length === 0 && <Text style={styles.noResults}>No people found</Text>}
          </ScrollView>
        ) : (
          <ScrollView
            style={styles.scroll}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.black} colors={[colors.black]} />}
          >
            {requests.map((request) => {
              const acceptKey = `accept-${request.requestOriginId}`;
              const deleteKey = `delete-${request.requestOriginId}`;
              return (
                <Pressable
                  key={request.requestOriginId}
                  style={styles.requestCard}
                  onPress={() => {
                    cacheProfile({ id: request.requestOriginId, ...request.requestOrigin }, "Accept");
                    router.push(`/user/${request.requestOriginId}`);
                  }}
                >
                  <Avatar userId={request.requestOriginId} name={request.requestOrigin.displayName} size={80} />
                  <View style={styles.requestBody}>
                    <Text style={styles.requestName}>{request.requestOrigin.displayName}</Text>
                    <Text style={styles.handle}>@{request.requestOrigin.username}</Text>
                    <View style={styles.requestActions}>
                      <Pressable
                        disabled={workingKey !== null}
                        style={styles.deleteButton}
                        onPress={(event) => {
                          event.stopPropagation();
                          void act(deleteKey, `${prefix}/denyFriendRequest/${request.requestOriginId}`);
                        }}
                      >
                        {workingKey === deleteKey ? <ActivityIndicator color={colors.text} /> : <Text style={styles.deleteText}>Delete</Text>}
                      </Pressable>
                      <Pressable
                        disabled={workingKey !== null}
                        style={styles.acceptButton}
                        onPress={(event) => {
                          event.stopPropagation();
                          void act(acceptKey, `${prefix}/acceptFriendRequest/${request.requestOriginId}`);
                        }}
                      >
                        {workingKey === acceptKey ? <ActivityIndicator color={colors.background} /> : <Text style={styles.acceptText}>Accept</Text>}
                      </Pressable>
                    </View>
                  </View>
                </Pressable>
              );
            })}
            {requests.length === 0 && <Text style={styles.noResults}>No friend requests</Text>}
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  page: { flex: 1, padding: 8 },
  header: { height: 48, flexDirection: "row", alignItems: "center", marginBottom: 8 },
  headerSide: { flex: 1, paddingLeft: 16 },
  headerTitle: { flex: 1, color: colors.green, textAlign: "center", fontSize: 16, fontWeight: "800" },
  searchRow: { flexDirection: "row", marginBottom: 8 },
  searchBar: { flex: 1, minHeight: 44, borderRadius: 8, backgroundColor: colors.surface, paddingHorizontal: 16, flexDirection: "row", alignItems: "center" },
  searchBarOpen: { flex: 0.8 },
  searchInputWrap: { flex: 1, alignSelf: "stretch", position: "relative", marginHorizontal: 8 },
  searchInput: { flex: 1, color: colors.text, fontSize: 20, paddingVertical: 8 },
  searchPlaceholderWrap: { ...StyleSheet.absoluteFillObject, justifyContent: "center" },
  searchPlaceholder: { color: colors.text, fontSize: 20, lineHeight: 24, includeFontPadding: false },
  cancelSearch: { flex: 0.2, alignItems: "center", justifyContent: "center" },
  cancelSearchText: { color: colors.green },
  scroll: { flex: 1 },
  errorRow: { padding: 10, marginBottom: 8, backgroundColor: colors.surface, borderRadius: 6 },
  errorText: { color: "#EF4444" },
  avatar: { backgroundColor: colors.greenStrong, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarText: { color: colors.background, fontSize: 20, fontWeight: "800" },
  searchResult: { minHeight: 72, marginBottom: 8, flexDirection: "row", alignItems: "center", borderRadius: 8 },
  personBody: { flex: 1, paddingHorizontal: 10 },
  name: { color: colors.text, fontSize: 20 },
  handle: { color: colors.muted, fontSize: 12, marginTop: 1 },
  relationButton: { minWidth: 92, minHeight: 40, borderRadius: 6, backgroundColor: colors.green, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  requestedButton: { backgroundColor: "#27272A" },
  removeButton: { backgroundColor: "#EF4444" },
  relationText: { color: colors.background, fontSize: 16 },
  requestCard: { minHeight: 96, flexDirection: "row", alignItems: "center", marginBottom: 12 },
  requestBody: { flex: 1, paddingLeft: 10 },
  requestName: { color: colors.text, fontSize: 20 },
  requestActions: { flexDirection: "row", marginTop: 9 },
  deleteButton: { flex: 0.4, height: 40, marginRight: 8, borderRadius: 6, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  deleteText: { color: colors.text, fontSize: 16 },
  acceptButton: { flex: 0.6, height: 40, borderRadius: 6, backgroundColor: colors.green, alignItems: "center", justifyContent: "center" },
  acceptText: { color: colors.background, fontSize: 16 },
  noResults: { color: colors.muted, textAlign: "center", marginTop: 28 },
});
