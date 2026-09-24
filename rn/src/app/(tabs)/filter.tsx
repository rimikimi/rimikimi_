import React, { useMemo } from "react";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import { Screen } from "@/ui/Screen";
import { AppHeader } from "@/ui/AppHeader";
import { Text } from "@/ui/Text";
import { Thumb, photoHeight } from "@/ui/Thumb";
import { IconCamera, IconChevron } from "@/ui/icons";
import { useAuth } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { copy } from "@/lib/copy";
import { isKo } from "@/lib/locale";
import { groupedPresets, type Preset } from "@/filters";
import { color, radius, space, themedStyles } from "@/theme/tokens";

/**
 * 필터 탭 — "오늘의 필터" 히어로 + 카메라 진입 + 그룹별 3열 격자.
 * iOS 2.0 의 시안 A 를 그대로 옮긴 것(오너 선택 2026-09-22, "안드로이드도 동일하게").
 *
 * 예전엔 똑같이 생긴 가로 줄 세 개가 세로로 쌓여 있어 필터가 작고 위계도 없었다("배열이 구식임").
 * 지금은 ① 큰 전/후 비교샷 한 장으로 필터가 뭘 하는지 바로 보여 주고 ② 나머지는 3열 격자로 훑게 한다.
 * 미리보기는 전부 **3:4**(오너 지시).
 *
 * 프리셋 목록·순서는 `src/filters.ts` 의 `groupedPresets()` — 하드코딩 없음.
 */

const GROUP_LABEL: Record<string, string> = {
  phone: copy.filter.groups.phone,
  film: copy.filter.groups.film,
  camera: copy.filter.groups.camera,
  fun: copy.filter.groups.fun,
  etc: copy.filterTab.etc,
};
/** 프리셋 표시 이름 — 한국어 UI 는 ko, 아니면 en(filters.ts 데이터에 둘 다 있다). */
const presetName = (p: Preset) => (isKo ? p.ko : p.en);

function presetThumb(key: string): string {
  return `${getEnv().apiBase}/thumbs/fs_${key}.webp`;
}

export default function FilterTab() {
  const { requireLogin } = useAuth();
  const { width } = useWindowDimensions();
  const groups = groupedPresets();

  const open = (preset?: string) => {
    const route = preset ? `/editor?preset=${encodeURIComponent(preset)}` : "/editor";
    requireLogin("filter", () => router.push(route as never), route);
  };

  /** 오늘의 필터 — 날짜로 고르므로 하루 동안 고정이고 매일 바뀐다. */
  const today = useMemo(() => {
    const all: { group: string; preset: Preset }[] = groups.flatMap((g) =>
      g.items.map((p) => ({ group: GROUP_LABEL[g.key] ?? g.key, preset: p })),
    );
    if (!all.length) return null;
    const day = Math.floor(Date.now() / 86_400_000);
    return all[day % all.length];
  }, [groups]);

  // 3열 격자. 타일 폭은 **내림** — 소수점이 남으면 마지막 칸이 다음 줄로 밀린다(격자에서 겪었다).
  const tileW = Math.floor((width - space.screen * 2 - space.s2 * 2) / 3);

  return (
    <Screen scrollModel="scroll" hasTabBar header={<AppHeader title={copy.filter.title} />}>
      {today ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.filterTab.todayA11y(presetName(today.preset))}
          onPress={() => open(today.preset.key)}
          style={styles.hero}
        >
          {/* 세로 3:4 원본을 가로로 넓게 자른다. 가운데로 자르면 얼굴이 잘려서 위에서 18% 지점부터
              보이게 직접 밀어 올린다(iOS 와 같은 처리). */}
          <View style={styles.heroClip}>
            <Image
              source={{ uri: presetThumb(today.preset.key) }}
              style={{ width: "100%", height: photoHeight(width - space.screen * 2), marginTop: -photoHeight(width - space.screen * 2) * 0.18 }}
              contentFit="cover"
              transition={0}
              cachePolicy="memory-disk"
            />
          </View>

          {/* `fs_*` 이미지는 **왼쪽 원본 / 오른쪽 필터** 세로 분할이다 — 그 점을 알약으로 짚어 준다. */}
          <View style={styles.pillsTop}>
            <View style={styles.pillHalf}><Pill text={copy.filterTab.original} /></View>
            <View style={styles.pillHalf}><Pill text={presetName(today.preset)} /></View>
          </View>

          <View style={styles.heroCaption}>
            <View style={styles.heroCaptionText}>
              <Text size="footnote" style={styles.onPhotoDim}>{copy.filterTab.today(today.group)}</Text>
              <Text size="headline" style={styles.onPhoto}>{presetName(today.preset)}</Text>
              <Text size="footnote" style={styles.onPhotoDim}>{copy.filterTab.tapToStart}</Text>
            </View>
            <View style={styles.heroPills}>
              <Pill text={copy.filterTab.upTo10} />
              <Pill text={copy.filterTab.free} />
            </View>
          </View>
        </Pressable>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy.filter.shoot}
        onPress={() => requireLogin("camera", () => router.push("/camera"), "/camera")}
        style={({ pressed }) => [styles.shoot, pressed && { opacity: 0.9 }]}
      >
        <IconCamera size={20} color={color.accentOn} />
        <Text size="headline" style={styles.shootLabel}>{copy.filter.shoot}</Text>
        {/* 문구는 실제 동작과 같아야 한다 — 다르면 심사(2.3.1)에서 걸린다. */}
        <Text size="footnote" style={styles.shootHint}>{copy.filterTab.shootHint}</Text>
        <View style={styles.grow} />
        <IconChevron size={16} color={color.accentOn} />
      </Pressable>

      {groups.map((g) => (
        <View key={g.key} style={styles.group}>
          <View style={styles.groupHead}>
            <Text size="headline">{`${g.emoji} ${GROUP_LABEL[g.key] ?? g.key}`}</Text>
            <Text size="footnote" tone="muted">{String(g.items.length)}</Text>
          </View>
          <View style={styles.grid}>
            {g.items.map((p) => (
              <Pressable
                key={p.key}
                accessibilityRole="button"
                accessibilityLabel={presetName(p)}
                onPress={() => open(p.key)}
                style={{ width: tileW }}
              >
                {/* 미리보기는 무조건 3:4 (오너 지시). */}
                <Thumb uri={presetThumb(p.key)} width={tileW} rounded={radius.card - 2} />
                <Text size="footnote" numberOfLines={1} style={styles.tileLabel}>{presetName(p)}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
    </Screen>
  );
}

function Pill({ text }: { text: string }) {
  return (
    <View style={styles.pill}>
      <Text size="footnote" style={styles.pillText}>{text}</Text>
    </View>
  );
}

const HERO_H = 260;

const styles = themedStyles(() => StyleSheet.create({
  hero: {
    marginHorizontal: space.screen,
    marginTop: space.s2,
    marginBottom: space.s4,
    height: HERO_H,
    borderRadius: radius.card,
    overflow: "hidden",
    backgroundColor: color.mat,
  },
  heroClip: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, overflow: "hidden" },
  pillsTop: { position: "absolute", left: 0, right: 0, top: space.s3, flexDirection: "row", paddingHorizontal: space.s4 },
  pillHalf: { flex: 1, alignItems: "center" },
  heroCaption: {
    position: "absolute",
    left: 0, right: 0, bottom: 0,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: space.s2,
    padding: space.s4,
    backgroundColor: "rgba(0,0,0,0.42)",
  },
  heroCaptionText: { flex: 1, gap: 2 },
  heroPills: { alignItems: "flex-end", gap: 4 },
  onPhoto: { color: "#FFFFFF" },
  onPhotoDim: { color: "rgba(255,255,255,0.85)" },
  pill: {
    paddingHorizontal: 10,
    height: 26,
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.92)",
  },
  pillText: { color: color.ink },

  shoot: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.s2,
    height: 56,
    marginHorizontal: space.screen,
    marginBottom: space.s5,
    paddingHorizontal: space.s4,
    borderRadius: radius.pill,
    backgroundColor: color.ink,
  },
  shootLabel: { color: color.accentOn },
  shootHint: { color: color.accentOn, opacity: 0.7 },
  grow: { flex: 1 },

  group: { marginBottom: space.s5 },
  groupHead: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: space.s2,
    paddingHorizontal: space.screen,
    marginBottom: space.s3 - 2,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.s2, paddingHorizontal: space.screen },
  tileLabel: { marginTop: 6 },
}));
