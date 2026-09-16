import React from "react";
import { Pressable, StyleSheet, type ViewStyle } from "react-native";
import { Text } from "./Text";
import { color, radius, space } from "@/theme/tokens";

// 칩 — 모서리 999, 회색 채움 / 활성은 호출부가 색을 정한다(카테고리 칩은 하트 4색, 옵션 칩은 강조색).
// 활성 전환은 0ms(NO_ANIMATION) — 색이 바로 바뀐다. 누름 피드백은 채움색 한 단계.
export function Chip({ label, active, activeColor = color.accent, onPress, style, small }: {
  label: string;
  active?: boolean;
  /** 활성 배경색 — 카테고리 칩은 하트 4색 중 하나 */
  activeColor?: string;
  onPress?: () => void;
  style?: ViewStyle;
  small?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        small && styles.small,
        { backgroundColor: active ? activeColor : pressed ? color.fillPress : color.fill },
        style,
      ]}
    >
      <Text size={small ? "caption" : "footnote"} weight={active ? "semibold" : "medium"} style={{ color: active ? color.accentOn : color.ink }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { height: 36, paddingHorizontal: space.s4, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  small: { height: 30, paddingHorizontal: space.s3 },
});
