import React from "react";
import { Pressable, StyleSheet, type ViewStyle } from "react-native";
import { Text } from "./Text";
import { color, radius, space, themedStyles } from "@/theme/tokens";

// 칩 — 모서리 999, 회색 채움 / 활성: 기본은 연한 강조 틴트 + 강조색 글자(iOS 옵션 칩과 같음, 빨간 면 아님),
// 카테고리 칩은 호출부가 하트 4색을 넘기면 그 색 채움 + 흰 글자.
// 활성 전환은 0ms(NO_ANIMATION) — 색이 바로 바뀐다. 누름 피드백은 채움색 한 단계.
export function Chip({ label, active, activeColor, onPress, style, small }: {
  label: string;
  active?: boolean;
  /** 활성 배경색 — 카테고리 칩은 하트 4색 중 하나. 생략하면 강조 틴트 + 강조색 글자. */
  activeColor?: string;
  onPress?: () => void;
  style?: ViewStyle;
  small?: boolean;
}) {
  const activeBg = activeColor ?? color.accentWeak;
  const activeFg = activeColor ? color.accentOn : color.accent;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        small && styles.small,
        { backgroundColor: active ? activeBg : pressed ? color.fillPress : color.fill },
        style,
      ]}
    >
      <Text size={small ? "caption" : "footnote"} weight={active ? "semibold" : "medium"} style={{ color: active ? activeFg : color.ink }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  chip: { height: 36, paddingHorizontal: space.s4, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  small: { height: 30, paddingHorizontal: space.s3 },
}));
