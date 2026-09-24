import React from "react";
import { Pressable, StyleSheet } from "react-native";
import { router } from "expo-router";
import Animated, { FadeIn, ReduceMotion } from "react-native-reanimated";
import { Text } from "./Text";
import { IconHeart } from "./icons";
import { useQuota } from "@/lib/quota";
import { useAuth } from "@/lib/auth";
import { color, radius, space, themedStyles } from "@/theme/tokens";
import { transitions } from "@/theme/motion";
import { copy } from "@/lib/copy";

// 크레딧 칩 — 헤더 오른쪽. 누르면 프로필(스토어 자리). 숫자는 tabular + 고정 폭이라 헤더가 안 흔들린다.
export function CreditChip() {
  const { quota } = useQuota();
  const { session } = useAuth();
  const known = !!session && !!quota;
  const label = !known ? "–" : quota!.unlimited ? "∞" : String(quota!.credits + Math.max(0, quota!.limit - quota!.used));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={known ? copy.ui.creditsA11y(label) : copy.profile.credits}
      accessibilityLiveRegion="polite"
      onPress={() => router.push("/(tabs)/profile")}
      hitSlop={10}
      style={({ pressed }) => [styles.chip, { backgroundColor: pressed ? color.fillPress : color.fill }]}
    >
      <IconHeart size={16} color={color.accent} filled />
      <Animated.View
        key={label}
        entering={FadeIn.duration(transitions.creditChange.duration).easing(transitions.creditChange.easing).reduceMotion(ReduceMotion.Never)}
        style={styles.value}
      >
        <Text size="footnote" weight="semibold" tabular>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  chip: { flexDirection: "row", alignItems: "center", gap: space.s1, height: 32, paddingHorizontal: space.s3, borderRadius: radius.pill },
  value: { minWidth: 16, alignItems: "flex-end" },
}));
