// 세그먼티드 컨트롤 — 알약이 미끄러진다(스프링, 연타 시 현재 위치에서 재조준). 절대 페이드하지 않는다.
import { useCallback, useState } from "react";
import { LayoutChangeEvent, Pressable, StyleSheet, View, ViewStyle } from "react-native";
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { Text } from "@/ui/Text";
import { color, radius, space } from "@/theme/tokens";
import { transitions } from "@/theme/motion";

export interface SegmentedOption<T extends string> { value: T; label: string }

export function Segmented<T extends string>({ options, value, onChange, style }: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (v: T) => void;
  style?: ViewStyle;
}) {
  const [w, setW] = useState(0);
  const x = useSharedValue(0);
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const cell = w > 0 ? (w - PAD * 2) / options.length : 0;

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const next = e.nativeEvent.layout.width;
    setW(next);
    // 최초 측정에서는 애니메이션 없이 제자리에 놓는다.
    x.value = ((next - PAD * 2) / options.length) * index;
  }, [index, options.length, x]);

  const pill = useAnimatedStyle(() => ({ width: cell, transform: [{ translateX: x.value }] }));

  return (
    <View style={[styles.track, style]} onLayout={onLayout}>
      {cell > 0 ? <Animated.View style={[styles.pill, pill]} pointerEvents="none" /> : null}
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
            style={styles.cell}
            onPress={() => {
              if (on) return;
              x.value = withSpring(cell * i, { ...transitions.segmentSlide, reduceMotion: ReduceMotion.System });
              onChange(o.value);
            }}
          >
            <Text size="footnote" weight={on ? "semibold" : "regular"} tone={on ? "default" : "muted"}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const PAD = 3;
const styles = StyleSheet.create({
  track: { flexDirection: "row", backgroundColor: color.fill, borderRadius: radius.btn, padding: PAD },
  pill: { position: "absolute", top: PAD, bottom: PAD, left: PAD, borderRadius: radius.btn - 2, backgroundColor: color.card },
  cell: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: space.s2 + 1, minHeight: 36 - PAD * 2 },
});
