import React from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import { Screen } from "@/ui/Screen";
import { AppHeader } from "@/ui/AppHeader";
import { Card } from "@/ui/Card";
import { Text } from "@/ui/Text";
import { Button } from "@/ui/Button";
import { IconCamera } from "@/ui/icons";
import { useAuth } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { copy } from "@/lib/copy";
import { color, radius, space } from "@/theme/tokens";
import { duration } from "@/theme/motion";

// 필터 탭 — 필름 · 카메라 · 재미 세 그룹 가로줄, 맨 위 "카메라로 찍기" (SPEC §2).
// 프리셋 → (로그인) → 사진 고르기 → 편집기. 1단계(2.0)는 편집기·카메라를 웹뷰로 임베드(SPEC §5).
// 프리셋 목록·썸네일(thumbs/fs_{key}.webp)은 웹 src/filters.js 27종 — 키만 여기 둔다.

const GROUPS: { key: "film" | "camera" | "fun"; label: string; presets: { key: string; label: string }[] }[] = [
  { key: "film", label: copy.filter.groups.film, presets: [
    { key: "kodak", label: "코닥" }, { key: "fuji", label: "후지" }, { key: "portra", label: "포트라" }, { key: "cinestill", label: "시네스틸" },
    { key: "bw", label: "흑백" }, { key: "vintage", label: "빈티지" }, { key: "polaroid", label: "폴라로이드" }, { key: "faded", label: "페이디드" },
  ] },
  { key: "camera", label: copy.filter.groups.camera, presets: [
    { key: "ccd", label: "CCD" }, { key: "y2k", label: "Y2K" }, { key: "disposable", label: "일회용" }, { key: "vhs", label: "VHS" },
    { key: "lomo", label: "로모" }, { key: "flash", label: "플래시" }, { key: "night", label: "야간" }, { key: "hdr", label: "HDR" },
  ] },
  { key: "fun", label: copy.filter.groups.fun, presets: [
    { key: "pop", label: "팝" }, { key: "duotone", label: "듀오톤" }, { key: "glitch", label: "글리치" }, { key: "pixel", label: "픽셀" },
    { key: "sketch", label: "스케치" }, { key: "neon", label: "네온" }, { key: "dreamy", label: "드리미" },
  ] },
];

export default function FilterTab() {
  const { requireLogin } = useAuth();
  const open = (preset?: string) => {
    const route = preset ? `/editor?preset=${encodeURIComponent(preset)}` : "/editor";
    requireLogin("filter", () => router.push(route as never), route);
  };
  return (
    <Screen scrollModel="scroll" hasTabBar header={<AppHeader title={copy.filter.title} />}>
      <View style={styles.top}>
        <Card padded={false}>
          <Pressable
            accessibilityRole="button"
            onPress={() => requireLogin("camera", () => router.push("/camera"), "/camera")}
            style={({ pressed }) => [styles.shoot, pressed && { backgroundColor: color.fill }]}
          >
            <View style={styles.shootIcon}><IconCamera size={24} color={color.accentOn} /></View>
            <Text size="headline">{copy.filter.shoot}</Text>
          </Pressable>
        </Card>
      </View>
      <View style={styles.groups}>
        {GROUPS.map((g) => (
          <View key={g.key} style={styles.group}>
            <Text size="headline" style={styles.groupTitle}>{g.label}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} overScrollMode="never">
              {g.presets.map((p) => (
                <Pressable key={p.key} accessibilityRole="button" accessibilityLabel={p.label} onPress={() => open(p.key)} style={({ pressed }) => [styles.preset, pressed && { opacity: 0.85 }]}>
                  <Image source={{ uri: `${getEnv().apiBase}/thumbs/fs_${p.key}.webp` }} style={styles.presetImg} contentFit="cover" transition={duration.enter} cachePolicy="disk" />
                  <Text size="footnote" numberOfLines={1}>{p.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ))}
      </View>
      <View style={styles.top}>
        <Button label={copy.filter.open} variant="secondary" full onPress={() => open()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: space.screen, marginBottom: space.s5 },
  shoot: { flexDirection: "row", alignItems: "center", gap: space.s3, padding: space.s3 },
  shootIcon: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: color.cameraBg, alignItems: "center", justifyContent: "center" },
  groups: { gap: space.s5, marginBottom: space.s5 },
  group: { gap: space.s3 },
  groupTitle: { paddingHorizontal: space.screen },
  row: { paddingHorizontal: space.screen, gap: space.s3 },
  preset: { width: 96, gap: space.s2 },
  presetImg: { width: 96, height: 128, borderRadius: radius.thumb, backgroundColor: color.mat },
});
