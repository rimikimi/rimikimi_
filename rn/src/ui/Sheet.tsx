// 바텀 시트 — SPEC §1: 열림 320 · 닫힘 220 · 드래그 1:1 · 45% 넘게 끌거나 빠르면 닫힘.
import { type ReactNode, useEffect } from "react";
import { BackHandler, Dimensions, Pressable, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { ReduceMotion, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { Text } from "@/ui/Text";
import { color, radius, space, themedStyles } from "@/theme/tokens";
import { ease, transitions } from "@/theme/motion";
import { copy } from "@/lib/copy";

const { height: SCREEN_H } = Dimensions.get("window");
const CLOSE_RATIO = 0.45;
const CLOSE_VELOCITY = 0.11 * 1000; // px/ms → px/s

export function Sheet({ open, title, onClose, children }: { open: boolean; title?: string; onClose: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const y = useSharedValue(SCREEN_H);
  const h = useSharedValue(SCREEN_H * 0.6);

  // 안드로이드 뒤로가기 = 시트 닫기. 이 시트는 Modal 이 아니라 화면 위에 얹힌 View 라
  // 뒤로가기가 **밑의 화면**을 닫아 버렸다(크레딧 시트가 남은 채 컨셉 화면만 사라지고,
  // 탭 루트에선 앱이 꺼졌다 — 2026-09-23 스윕). 열려 있는 동안 뒤로가기를 가로챈다.
  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => { onClose(); return true; });
    return () => sub.remove();
  }, [open, onClose]);

  useEffect(() => {
    y.value = withTiming(open ? 0 : SCREEN_H, {
      duration: open ? transitions.sheetIn.duration : transitions.sheetOut.duration,
      easing: ease.drawer,
      reduceMotion: ReduceMotion.System,
    });
  }, [open, y]);

  const pan = Gesture.Pan()
    .onChange((e) => {
      y.value = Math.max(0, y.value + e.changeY * (y.value <= 0 && e.changeY < 0 ? 0.25 : 1));
    })
    .onEnd((e) => {
      const shouldClose = y.value > h.value * CLOSE_RATIO || e.velocityY > CLOSE_VELOCITY;
      if (shouldClose) {
        y.value = withTiming(SCREEN_H, { duration: transitions.sheetOut.duration, easing: ease.drawer, reduceMotion: ReduceMotion.System });
        runOnJS(onClose)();
      } else {
        y.value = withTiming(0, { duration: transitions.sheetIn.duration, easing: ease.drawer, reduceMotion: ReduceMotion.System });
      }
    });

  const sheet = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const scrim = useAnimatedStyle(() => ({ opacity: Math.max(0, 1 - y.value / Math.max(1, h.value)) * 0.35 }));

  if (!open && y.value >= SCREEN_H) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? "auto" : "none"}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrim]}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityLabel={copy.common.close} onPress={onClose} />
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View
          style={[styles.sheet, { paddingBottom: insets.bottom + space.s5 }, sheet]}
          onLayout={(e) => { h.value = e.nativeEvent.layout.height; }}
        >
          <View style={styles.grabber} />
          {title ? <Text size="headline" style={styles.title}>{title}</Text> : null}
          <View style={{ gap: space.s3 }}>{children}</View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  scrim: { backgroundColor: color.scrim },
  sheet: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    backgroundColor: color.card,
    borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet,
    paddingHorizontal: space.screen, paddingTop: space.s2,
    gap: space.s3,
  },
  grabber: { alignSelf: "center", width: 36, height: 5, borderRadius: 3, backgroundColor: color.fillPress },
  title: { marginTop: space.s2 },
}));
