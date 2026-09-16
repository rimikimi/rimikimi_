import React from "react";
import { Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { Text } from "./Text";
import { Spinner } from "./Spinner";
import { chrome, color, radius, space, themedStyles } from "@/theme/tokens";
import { PRESS_SCALE, PRESS_SCALE_WIDE, duration, ease } from "@/theme/motion";

// Button — self-made, no UI kit.
//   · press starts on pressIn (NOT on release) — 110ms, ease-out, scale only
//   · release returns over 140ms
//   · width-aware press scale: full-width bar uses 0.985, otherwise 0.97
//   · loading keeps the label and swaps the ALWAYS-RESERVED leading slot for a spinner
//   · 햅틱은 여기서 울리지 않는다 — 확정 시점(생성 시작·저장 완료)에서 호출부가 울린다(SPEC §1).

type Variant = "primary" | "secondary" | "quiet" | "danger";
type Size = "md" | "sm";

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  loading?: boolean;
  full?: boolean;
  leading?: React.ReactNode;
  style?: ViewStyle;
  accessibilityHint?: string;
}

export function Button({ label, onPress, variant = "primary", size = "md", disabled, loading, full, leading, style, accessibilityHint }: ButtonProps) {
  const scale = useSharedValue(1);
  const target = full ? PRESS_SCALE_WIDE : PRESS_SCALE;
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const bg = variant === "primary" ? color.accent : variant === "secondary" ? color.fill : variant === "danger" ? color.danger : "transparent";
  const fg = variant === "primary" || variant === "danger" ? color.accentOn : variant === "quiet" ? color.accent : color.ink;
  const inactive = disabled || loading;

  return (
    <Animated.View style={[full && styles.full, animated]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !!disabled, busy: !!loading }}
        accessibilityHint={accessibilityHint}
        disabled={inactive}
        onPressIn={() => { scale.value = withTiming(target, { duration: duration.press, easing: ease.out }); }}
        onPressOut={() => { scale.value = withTiming(1, { duration: duration.pressRelease, easing: ease.out }); }}
        onPress={() => { if (!inactive) onPress?.(); }}
        style={[
          styles.base,
          {
            height: size === "sm" ? chrome.buttonSmH : chrome.buttonH,
            paddingHorizontal: size === "sm" ? space.s4 : space.s5,
            backgroundColor: bg,
            borderRadius: radius.btn,
            opacity: disabled ? 0.45 : 1,
          },
          full && styles.full,
          style,
        ]}
      >
        {(leading || loading) && (
          <View style={styles.slot}>{loading ? <Spinner size={20} color={fg} /> : leading}</View>
        )}
        <Text size={size === "sm" ? "footnote" : "headline"} weight="semibold" style={{ color: fg }}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  base: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.s2 },
  full: { alignSelf: "stretch", width: "100%" },
  slot: { width: 20, height: 20, alignItems: "center", justifyContent: "center" },
}));
