import React, { useEffect, useState } from "react";
import { BackHandler, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { Text } from "./Text";
import { Button } from "./Button";
import { Spinner } from "./Spinner";
import { IconCheck, IconClose, IconHeart } from "./icons";
import { useApp21 } from "@/lib/app21";
import { c21 } from "@/lib/copy21";
import { color, radius, space, themedStyles } from "@/theme/tokens";

// ============================================================================
// 게스트 첫 1장 — 만드는 중 → 미리보기 2장 중 1장 고르기 → "받기"(여기서 처음 로그인) → 앨범 저장.
// iOS `GuestFlowView.swift`(시제품 C안 4·5·6 화면, 오너 결정 2026-10-09)와 같다.
// 루트 레이아웃이 화면 전체를 덮어 그린다 — 로그인 시트는 그 위에(루트에서 이 뒤에 그린다).
// ============================================================================

export function GuestFlowOverlay() {
  const { guestFlow, closeGuest, guestReceive } = useApp21();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [picked, setPicked] = useState<number | null>(null);
  useEffect(() => { if (!guestFlow) setPicked(null); }, [guestFlow]);
  useEffect(() => {
    if (!guestFlow) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => { closeGuest(); return true; });
    return () => sub.remove();
  }, [guestFlow, closeGuest]);
  if (!guestFlow) return null;
  const f = guestFlow;
  const n = Math.max(1, f.images.length);
  const imgW = Math.floor((width - space.screen * 2 - space.s3 * (n - 1)) / n);

  return (
    <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(180)} style={[StyleSheet.absoluteFill, styles.root, { paddingTop: insets.top + space.s3, paddingBottom: insets.bottom + space.s3 }]}>
      <View style={styles.top}>
        <Pressable accessibilityRole="button" accessibilityLabel={c21.close} onPress={closeGuest} style={styles.close}>
          <IconClose size={16} color={color.ink} />
        </Pressable>
      </View>
      {f.error ? (
        <View style={styles.center}><Text tone="muted" center>{f.error}</Text></View>
      ) : !f.images.length ? (
        <View style={styles.center}>
          <View style={styles.hearts}>
            {color.hearts.map((h) => <IconHeart key={h} size={28} color={h} filled />)}
          </View>
          <Text size="headline">{f.title}</Text>
          <Text size="callout" tone="muted">{c21.guestMaking}</Text>
          <Spinner size={22} color={color.ink2} />
        </View>
      ) : (
        <View style={{ flex: 1, gap: space.s4 }}>
          <Text size="title2" style={styles.pad}>{c21.guestPick}</Text>
          <View style={[styles.row, styles.pad]}>
            {f.images.map((uri, i) => (
              <Pressable key={i} accessibilityRole="button" onPress={() => { setPicked(i); Haptics.selectionAsync().catch(() => {}); }}>
                <Image source={{ uri }} style={{ width: imgW, height: Math.round((imgW * 4) / 3), borderRadius: radius.card }} contentFit="cover" />
                {picked === i ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.pickRing]} /> : null}
              </Pressable>
            ))}
          </View>
          <View style={[styles.pad, { flexDirection: "row" }]}>
            <View style={styles.identity}>
              <IconCheck size={16} color="#2E7D4F" />
              <Text size="footnote" weight="semibold" style={{ color: "#2E7D4F" }}>{c21.guestIdentity}</Text>
            </View>
          </View>
          <View style={{ flex: 1 }} />
          <View style={[styles.pad, { gap: space.s2 }]}>
            <Button label={c21.guestReceive} full disabled={picked == null} onPress={() => { if (picked != null) guestReceive(f.images[picked]); }} />
            <Button label={c21.guestAgain} variant="quiet" full onPress={closeGuest} />
          </View>
        </View>
      )}
    </Animated.View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  root: { backgroundColor: color.bg, gap: space.s4 },
  top: { flexDirection: "row", paddingHorizontal: space.screen },
  close: { width: 40, height: 40, borderRadius: 20, backgroundColor: color.card, alignItems: "center", justifyContent: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.s3, paddingHorizontal: space.screen },
  hearts: { flexDirection: "row", gap: 6 },
  pad: { paddingHorizontal: space.screen },
  row: { flexDirection: "row", gap: space.s3 },
  pickRing: { borderRadius: radius.card, borderWidth: 3, borderColor: color.accent },
  identity: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: "#E8F5EC" },
}));
