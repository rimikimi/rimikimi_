import React, { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type RefreshControlProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { chrome, color, space } from "@/theme/tokens";

// ============================================================================
// Screen shell + the glass surface (Justin 셸 그대로, 토큰만 SPEC 값).
//   1. every screen DECLARES its scroll model — `fixed` | `scroll`
//   2. the tab bar is FIXED, never scrolls away
//   3. top and bottom safe-area insets are applied here, nowhere else
//   4. glass is a material for chrome only (탭바·상단 바) — never on cards (SPEC §0)
// ============================================================================

export type ScrollModel = "fixed" | "scroll";

export interface ScreenProps {
  scrollModel: ScrollModel;
  children: React.ReactNode;
  /** Pinned chrome drawn above the content. Content scrolls UNDER it. */
  header?: React.ReactNode;
  /** true when this screen sits inside the fixed tab bar */
  hasTabBar?: boolean;
  /** extra bottom room for a fixed action bar (버튼 높이 + 여백) */
  actionBar?: boolean;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
  refreshControl?: React.ReactElement<RefreshControlProps>;
}

export const ACTION_BAR_H = chrome.buttonH + space.s4 * 2;

export function Screen({ scrollModel, children, header, hasTabBar, actionBar, style, contentStyle, refreshControl }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const paddingTop = insets.top + (header ? chrome.headerH + space.s3 : space.s2);
  const paddingBottom =
    insets.bottom +
    (hasTabBar ? chrome.tabBarH + chrome.tabBarBottom + chrome.cameraLift : 0) +
    (actionBar ? ACTION_BAR_H : 0) +
    space.s5;

  const body =
    scrollModel === "fixed" ? (
      <View style={[{ flex: 1, paddingTop, paddingBottom }, contentStyle]}>{children}</View>
    ) : (
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[{ paddingTop, paddingBottom }, contentStyle]}
        keyboardShouldPersistTaps="handled"
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
      >
        {children}
      </ScrollView>
    );

  return (
    <View style={[styles.root, { backgroundColor: color.bg }, style]}>
      {body}
      {header ? (
        <View style={styles.headerHost} pointerEvents="box-none">
          {header}
        </View>
      ) : null}
    </View>
  );
}

function useReduceTransparency(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceTransparencyEnabled?.()
      .then((v) => { if (mounted) setReduce(v); })
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener("reduceTransparencyChanged", (v: boolean) => setReduce(v));
    return () => { mounted = false; sub?.remove?.(); };
  }, []);
  return reduce;
}

/**
 * Glass. Chrome only (top bar, tab bar). Android below API 31 and Reduce Transparency
 * get a near-opaque paper layer instead — rgba of `color.bg`.
 */
export function Glass({ children, style, intensity = 40 }: { children?: React.ReactNode; style?: StyleProp<ViewStyle>; intensity?: number }) {
  const reduceTransparency = useReduceTransparency();
  const androidOld = Platform.OS === "android" && (Number(Platform.Version) || 0) < 31;
  if (androidOld || reduceTransparency) {
    return <View style={[{ backgroundColor: "rgba(251,248,243,0.96)" }, style]}>{children}</View>;
  }
  return (
    <BlurView intensity={intensity} tint="light" experimentalBlurMethod="dimezisBlurView" style={style}>
      {children}
    </BlurView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  headerHost: { position: "absolute", top: 0, left: 0, right: 0 },
});
