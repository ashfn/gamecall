import { FontAwesome5 } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../../util/theme";

export interface Notice {
  /** Distinct per delivery, so the same text arriving twice still re-animates. */
  id: string;
  title: string;
  body: string;
  icon: string;
  onPress?: () => void;
}

const VISIBLE_MS = 3600;

/**
 * The in-app stand-in for a push banner. While the app is foregrounded the OS
 * banner is suppressed (see AppNotifications), so this is what tells you that
 * something happened somewhere other than the screen you are looking at.
 */
export function InAppNotice({ notice, onDismiss }: { notice: Notice | null; onDismiss: () => void }) {
  const insets = useSafeAreaInsets();
  const slide = useRef(new Animated.Value(0)).current;
  const dismissRef = useRef(onDismiss);

  useEffect(() => { dismissRef.current = onDismiss; }, [onDismiss]);

  useEffect(() => {
    if (!notice) return undefined;
    slide.setValue(0);
    Animated.spring(slide, {
      toValue: 1,
      damping: 16,
      stiffness: 180,
      mass: 0.8,
      useNativeDriver: true,
    }).start();

    const timer = setTimeout(() => {
      Animated.timing(slide, {
        toValue: 0,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) dismissRef.current();
      });
    }, VISIBLE_MS);

    return () => clearTimeout(timer);
  }, [notice, slide]);

  if (!notice) return null;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.host,
        {
          paddingTop: insets.top + 6,
          opacity: slide,
          transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }],
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${notice.title}. ${notice.body}`}
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        onPress={() => {
          notice.onPress?.();
          dismissRef.current();
        }}
      >
        <View style={styles.icon}>
          <FontAwesome5 name={notice.icon as never} solid size={13} color={colors.green} />
        </View>
        <View style={styles.copy}>
          <Text numberOfLines={1} style={styles.title}>{notice.title}</Text>
          {notice.body.length > 0 && <Text numberOfLines={2} style={styles.body}>{notice.body}</Text>}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: { position: "absolute", left: 0, right: 0, top: 0, paddingHorizontal: 10, zIndex: 999, elevation: 999 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
  },
  cardPressed: { borderColor: colors.green, transform: [{ scale: 0.995 }] },
  icon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  copy: { flex: 1 },
  title: { color: colors.text, fontSize: 13, fontWeight: "800" },
  body: { color: colors.muted, fontSize: 12, marginTop: 1 },
});
