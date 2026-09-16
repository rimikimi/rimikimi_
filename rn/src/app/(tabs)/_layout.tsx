import React, { useEffect, useState } from "react";
import { Keyboard, Pressable, StyleSheet, View } from "react-native";
import { Tabs, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { Glass } from "@/ui/Screen";
import { Text } from "@/ui/Text";
import { IconCamera, IconFilter, IconGallery, IconGrid, IconUser, type IconProps } from "@/ui/icons";
import { useAuth } from "@/lib/auth";
import { copy } from "@/lib/copy";
import { chrome, color, radius, shadow, space, themedStyles } from "@/theme/tokens";
import { CARD_PRESS_SCALE, PRESS_SCALE, duration, ease } from "@/theme/motion";

// ============================================================================
// FIXED bottom tab bar, self-made (Justin 셸의 글라스 알약 + SPEC §2 5슬롯).
//   갤러리 · 필터 · [⦿카메라 — 가운데, 54 원, 잉크 바탕, 위로 14 띄움] · 내 사진 · 프로필
//   · 높이 62 · 하단 14 · 좌우 12 (SPEC §1)
//   · 활성 전환 0ms — 색과 굵기가 바로 바뀐다
//   · 키보드가 열리면 바가 숨는다
//   · 카메라 버튼은 탭이 아니다 — (로그인) → 카메라 모달을 연다(SPEC §3)
// ============================================================================

type Route = "gallery" | "filter" | "photos" | "profile";
const LEFT: { name: Route; label: string; Icon: React.ComponentType<IconProps> }[] = [
  { name: "gallery", label: copy.tabs.gallery, Icon: IconGallery },
  { name: "filter", label: copy.tabs.filter, Icon: IconFilter },
];
const RIGHT: typeof LEFT = [
  { name: "photos", label: copy.tabs.photos, Icon: IconGrid },
  { name: "profile", label: copy.tabs.profile, Icon: IconUser },
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
  const { requireLogin } = useAuth();
  if (keyboardOpen) return null;
  const current = state.routes[state.index]?.name;

  const item = (def: (typeof LEFT)[number]) => (
    <TabItem
      key={def.name}
      label={def.label}
      Icon={def.Icon}
      focused={current === def.name}
      onPress={() => { if (current !== def.name) navigation.navigate(def.name); }}
    />
  );

  return (
    <View style={[styles.floatWrap, { paddingBottom: insets.bottom + chrome.tabBarBottom }]} pointerEvents="box-none">
      <View style={styles.barBase}>
        <Glass style={styles.bar}>
          <View style={styles.row} accessibilityRole="tablist">
            {LEFT.map(item)}
            {/* 가운데 자리 — 카메라 원이 위로 떠 있으므로 바 안에는 빈 칸만 둔다 */}
            <View style={styles.item} />
            {RIGHT.map(item)}
          </View>
        </Glass>
      </View>
      <CameraButton onPress={() => requireLogin("camera", () => router.push("/camera"), "/camera")} />
    </View>
  );
}

function TabItem({ label, Icon, focused, onPress }: { label: string; Icon: React.ComponentType<IconProps>; focused: boolean; onPress: () => void }) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const tint = focused ? color.accent : color.ink2;
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

function CameraButton({ onPress }: { onPress: () => void }) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={[styles.cameraWrap, style]} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy.tabs.camera}
        onPressIn={() => { scale.value = withTiming(PRESS_SCALE, { duration: duration.press, easing: ease.out }); }}
        onPressOut={() => { scale.value = withTiming(1, { duration: duration.pressRelease, easing: ease.out }); }}
        onPress={onPress}
        style={styles.camera}
      >
        <IconCamera size={28} color={color.accentOn} />
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
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  floatWrap: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: chrome.tabBarSide, alignItems: "center" },
  // 유리 아래 불투명 베이스 — 어두운 사진 그리드 위에서 바가 묻히지 않게.
  barBase: { width: "100%", borderRadius: radius.pill, backgroundColor: color.card, overflow: "hidden", ...shadow.float },
  bar: { width: "100%", borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: color.line, overflow: "hidden" },
  row: { flexDirection: "row", height: chrome.tabBarH, paddingHorizontal: space.s2 },
  item: { flex: 1 },
  pressable: { flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center", gap: 3 },
  cameraWrap: {
    position: "absolute",
    alignSelf: "center",
    // 바 위쪽 가장자리에서 14 위로. floatWrap 의 paddingBottom 은 부모 기준이라 bottom 값으로 계산한다.
    bottom: chrome.tabBarH + chrome.tabBarBottom + chrome.cameraLift - chrome.cameraD / 2,
  },
  camera: {
    width: chrome.cameraD,
    height: chrome.cameraD,
    borderRadius: radius.pill,
    backgroundColor: color.cameraBg,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.camera,
  },
}));
