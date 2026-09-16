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
import { groupedPresets } from "@/filters";
import { color, radius, space, themedStyles } from "@/theme/tokens";
import { duration } from "@/theme/motion";

// 필터 탭 — 필름 · 카메라 · 재미 세 그룹 가로줄, 맨 위 "카메라로 찍기" (SPEC §2).
// 프리셋 목록·순서는 src/filters.ts(웹 src/filters.js 사본) groupedPresets() — 하드코딩 없음.
// 프리셋 → (로그인) → 편집기(1단계는 웹뷰). 썸네일 thumbs/fs_{key}.webp.

const GROUP_LABEL: Record<string, string> = { film: copy.filter.groups.film, camera: copy.filter.groups.camera, fun: copy.filter.groups.fun, etc: "기타" };

export default function FilterTab() {
  const { requireLogin } = useAuth();
  const groups = groupedPresets();
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
        {groups.map((g) => (
          <View key={g.key} style={styles.group}>
            <Text size="headline" style={styles.groupTitle}>{`${g.emoji} ${GROUP_LABEL[g.key] ?? g.key}`}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} overScrollMode="never">
              {g.items.map((p) => (
                <Pressable key={p.key} accessibilityRole="button" accessibilityLabel={p.ko} onPress={() => open(p.key)} style={({ pressed }) => [styles.preset, pressed && { opacity: 0.85 }]}>
                  <Image source={{ uri: `${getEnv().apiBase}/thumbs/fs_${p.key}.webp` }} style={styles.presetImg} contentFit="cover" transition={duration.enter} cachePolicy="disk" />
                  <Text size="footnote" numberOfLines={1}>{p.ko}</Text>
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

const styles = themedStyles(() => StyleSheet.create({
  top: { paddingHorizontal: space.screen, marginBottom: space.s5 },
  shoot: { flexDirection: "row", alignItems: "center", gap: space.s3, padding: space.s3 },
  shootIcon: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: color.cameraBg, alignItems: "center", justifyContent: "center" },
  groups: { gap: space.s5, marginBottom: space.s5 },
  group: { gap: space.s3 },
  groupTitle: { paddingHorizontal: space.screen },
  row: { paddingHorizontal: space.screen, gap: space.s3 },
  preset: { width: 96, gap: space.s2 },
  presetImg: { width: 96, height: 128, borderRadius: radius.thumb, backgroundColor: color.mat },
}));
