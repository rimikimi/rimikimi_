import React, { useEffect, useState } from "react";
import { Keyboard, Pressable, StyleSheet, View } from "react-native";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { Glass } from "@/ui/Screen";
import { Text } from "@/ui/Text";
import { IconCamera, IconGallery, IconSparkle, type IconProps } from "@/ui/icons";
import { c21 } from "@/lib/copy21";
import { chrome, color, radius, shadow, space, themedStyles } from "@/theme/tokens";
import { CARD_PRESS_SCALE, duration, ease } from "@/theme/motion";

// ============================================================================
// FIXED bottom tab bar, self-made (Justin 셸의 글라스 알약 + SPEC §2 5슬롯).
//   갤러리 · 필터 · [⦿카메라 — 가운데, 54 원, 잉크 바탕, 위로 14 띄움] · 내 사진 · 프로필
//   · 높이 62 · 하단 14 · 좌우 12 (SPEC §1)
//   · 활성 전환 0ms — 색과 굵기가 바로 바뀐다
//   · 키보드가 열리면 바가 숨는다
//   · 카메라 버튼은 탭이 아니다 — (로그인) → 카메라 모달을 연다(SPEC §3)
// ============================================================================

// 2.1 개편(iOS RootTabView, 오너 지시 2026-10-09): 탭 3개 — 만들기 · 카메라·필터 · 내 사진.
// 프로필은 홈 ⚙︎(설정)로. 가운데 떠 있는 카메라 원도 없앴다 — 카메라는 "카메라·필터" 탭 안에 있다.
// (라우트 이름은 예전 그대로 둔다 — 푸시·딥링크·dev 프리뷰가 이 이름을 본다.)
type Route = "gallery" | "filter" | "photos";
const TABS: { name: Route; label: () => string; Icon: React.ComponentType<IconProps> }[] = [
  { name: "gallery", label: () => c21.tabMake, Icon: IconSparkle },
  { name: "filter", label: () => c21.tabCameraFilter, Icon: IconCamera },
  { name: "photos", label: () => c21.tabMyPhotos, Icon: IconGallery },
];

interface TabBarProps {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: { navigate: (name: string) => void };
}

function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () => setOpen(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return open;
}

function TabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const keyboardOpen = useKeyboardOpen();
  if (keyboardOpen) return null;
  const current = state.routes[state.index]?.name;
  // 카메라 탭은 화면 전체가 검은 뷰파인더라 바도 어둡게(기본 카메라 앱처럼).
  const dark = current === "filter";

  const item = (def: (typeof TABS)[number]) => (
    <TabItem
      key={def.name}
      dark={dark}
      label={def.label()}
      Icon={def.Icon}
      focused={current === def.name}
      onPress={() => { if (current !== def.name) navigation.navigate(def.name); }}
    />
  );

  return (
    <View style={[styles.floatWrap, { paddingBottom: insets.bottom + chrome.tabBarBottom }]} pointerEvents="box-none">
      <View style={[styles.barBase, dark && styles.barBaseDark]}>
        {dark ? (
          <View style={[styles.bar, styles.barDark]}>
            <View style={styles.row} accessibilityRole="tablist">{TABS.map(item)}</View>
          </View>
        ) : (
          <Glass style={styles.bar}>
            <View style={styles.row} accessibilityRole="tablist">{TABS.map(item)}</View>
          </Glass>
        )}
      </View>
    </View>
  );
}

function TabItem({ label, Icon, focused, onPress, dark }: { label: string; Icon: React.ComponentType<IconProps>; focused: boolean; onPress: () => void; dark?: boolean }) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const tint = focused ? color.accent : dark ? "rgba(255,255,255,0.72)" : color.ink2;
  return (
    <Animated.View style={[styles.item, style]}>
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={label}
        onPressIn={() => { scale.value = withTiming(CARD_PRESS_SCALE, { duration: duration.press, easing: ease.out }); }}
        onPressOut={() => { scale.value = withTiming(1, { duration: duration.pressRelease, easing: ease.out }); }}
        onPress={onPress}
        style={styles.pressable}
      >
        {/* 0ms — the active state swaps immediately */}
        <Icon size={24} color={tint} />
        <Text size="caption" weight={focused ? "semibold" : "medium"} style={{ color: tint }}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...(props as unknown as TabBarProps)} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: color.bg }, animation: "none" }}
    >
      <Tabs.Screen name="gallery" />
      <Tabs.Screen name="filter" />
      <Tabs.Screen name="photos" />
    </Tabs>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  floatWrap: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: chrome.tabBarSide, alignItems: "center" },
  // 유리 아래 불투명 베이스 — 어두운 사진 그리드 위에서 바가 묻히지 않게.
  barBase: { width: "100%", borderRadius: radius.pill, backgroundColor: color.card, overflow: "hidden", ...shadow.float },
  barBaseDark: { backgroundColor: "#1C1C1E" },
  barDark: { borderColor: "rgba(255,255,255,0.12)" },
  bar: { width: "100%", borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: color.line, overflow: "hidden" },
  row: { flexDirection: "row", height: chrome.tabBarH, paddingHorizontal: space.s2 },
  item: { flex: 1 },
  pressable: { flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center", gap: 3 },
}));
