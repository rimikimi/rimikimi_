import React from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { Text } from "./Text";
import { Thumb } from "./Thumb";
import { Button } from "./Button";
import { IconClose } from "./icons";
import { CoachAnchor } from "./Coach";
import { CART_MAX, useApp21 } from "@/lib/app21";
import { conceptThumb } from "@/lib/concepts";
import { c21 } from "@/lib/copy21";
import { chrome, color, radius, space, themedStyles } from "@/theme/tokens";

// ============================================================================
// 담은 사진 줄 — 썸네일(순서 번호·빼기) + "N장 만들기". 홈에서는 작은 배지로 접혀 있다가 누르면
// 펼친다(iOS PurposeView.swift `CartBar` 와 같다). 탭바 위에 떠 있다(`hasTabBar`).
// ============================================================================

export function CartBar({ compactOnHome = false, hasTabBar = false }: { compactOnHome?: boolean; hasTabBar?: boolean }) {
  const { cart, cartExpanded, setCartExpanded, removeFromCart, generateCart } = useApp21();
  const insets = useSafeAreaInsets();
  if (!cart.length) return null;
  const bottom = insets.bottom + (hasTabBar ? chrome.tabBarH + chrome.tabBarBottom + space.s2 : space.s2);

  if (compactOnHome && !cartExpanded) {
    return (
      <View style={[styles.badgeWrap, { bottom }]} pointerEvents="box-none">
        <CoachAnchor id="cartBadge">
          <Pressable accessibilityRole="button" accessibilityLabel={c21.a11yCart} onPress={() => setCartExpanded(true)} style={styles.badge}>
            <View style={styles.stack}>
              {cart.slice(0, 3).map((c, i) => (
                <View key={String(c.id)} style={[styles.stackItem, { marginLeft: i === 0 ? 0 : -10 }]}>
                  <Thumb uri={conceptThumb(c)} width={22} height={28} rounded={5} />
                </View>
              ))}
            </View>
            <View style={styles.count}><Text size="footnote" weight="bold" style={{ color: "#FFFFFF" }}>{String(cart.length)}</Text></View>
          </Pressable>
        </CoachAnchor>
      </View>
    );
  }

  return (
    <Animated.View entering={FadeInDown.duration(220)} exiting={FadeOutDown.duration(180)} style={[styles.barWrap, { bottom }]}>
      <View style={styles.bar}>
        {compactOnHome ? (
          <Pressable accessibilityRole="button" onPress={() => setCartExpanded(false)} style={styles.grabArea} hitSlop={8}>
            <View style={styles.grab} />
          </Pressable>
        ) : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbs}>
          {cart.map((c, i) => (
            <View key={String(c.id)} style={styles.thumbBox}>
              <Thumb uri={conceptThumb(c)} width={52} height={68} rounded={9} />
              <View style={styles.num}><Text size="caption" weight="bold" style={{ color: "#FFFFFF", fontSize: 10 }}>{String(i + 1)}</Text></View>
              <Pressable accessibilityRole="button" accessibilityLabel={c21.a11yRemoveFromCart} hitSlop={8} onPress={() => removeFromCart(i)} style={styles.remove}>
                <IconClose size={16} color={color.bg} />
              </Pressable>
            </View>
          ))}
        </ScrollView>
        <View style={styles.row}>
          <Text size="footnote" weight="bold" tone="muted" tabular>{c21.cartCount(cart.length, CART_MAX)}</Text>
          <CoachAnchor id="cartMake" style={{ flex: 1 }}>
            <Button label={c21.cartMake(cart.length)} full onPress={() => generateCart()} />
          </CoachAnchor>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  badgeWrap: { position: "absolute", right: space.screen, alignItems: "flex-end" },
  badge: {
    flexDirection: "row", alignItems: "center", gap: space.s2, height: 44,
    paddingLeft: space.s2, paddingRight: space.s3, borderRadius: radius.pill, backgroundColor: color.ink,
    shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  stack: { flexDirection: "row" },
  stackItem: { borderRadius: 6, borderWidth: 2, borderColor: color.ink, overflow: "hidden" },
  count: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: color.accent, alignItems: "center", justifyContent: "center" },
  barWrap: { position: "absolute", left: space.s2, right: space.s2 },
  bar: {
    backgroundColor: color.card, borderRadius: radius.sheet, paddingHorizontal: space.s4, paddingTop: space.s2, paddingBottom: space.s3, gap: space.s2,
    borderWidth: StyleSheet.hairlineWidth, borderColor: color.line,
    shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 10,
  },
  grabArea: { alignSelf: "center", paddingVertical: 4 },
  grab: { width: 36, height: 4, borderRadius: 2, backgroundColor: color.ink3 },
  thumbs: { gap: space.s2, paddingTop: 8, paddingRight: 8, paddingLeft: 2 },
  thumbBox: { width: 52, height: 68 },
  num: { position: "absolute", top: 4, left: 4, paddingHorizontal: 5, borderRadius: 8, backgroundColor: color.accent },
  remove: { position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: color.ink, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: space.s3 },
}));
