import React, { useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import Animated, { FadeIn, FadeOut, ReduceMotion } from "react-native-reanimated";
import { Screen } from "@/ui/Screen";
import { AppHeader } from "@/ui/AppHeader";
import { Chip } from "@/ui/Chip";
import { Text } from "@/ui/Text";
import { Spinner } from "@/ui/Spinner";
import { ConceptCard, ConceptRail } from "@/ui/ConceptCard";
import { InviteCard } from "@/ui/InviteCard";
import { useStore } from "@/lib/store";
import { byNewest, categoriesOf } from "@/lib/concepts";
import { copy } from "@/lib/copy";
import { color, space } from "@/theme/tokens";
import { transitions } from "@/theme/motion";

// 갤러리 = 홈. 로고 헤더 → 카테고리 칩(필터 칩 없음, 활성 = 하트 4색) → 추천 → 새로 나왔어요 → 카테고리별 줄.
// 칩을 고르면 줄 대신 그 카테고리의 격자(교차 페이드, listSwap).

export default function GalleryTab() {
  const { home, loading, concepts, reload } = useStore();
  const [active, setActive] = useState<string>(copy.home.all);
  const { width } = useWindowDimensions();
  const [refreshing, setRefreshing] = useState(false);

  const chips = useMemo(() => [{ name: copy.home.all, count: concepts.length }, ...(home?.chips ?? [])], [home, concepts.length]);
  const filtered = useMemo(
    () => (active === copy.home.all ? [] : concepts.filter((c) => categoriesOf(c).includes(active)).sort(byNewest)),
    [active, concepts]
  );
  const cols = 2;
  const cardW = Math.floor((width - space.screen * 2 - space.s3 * (cols - 1)) / cols);

  return (
    <Screen
      scrollModel="scroll"
      hasTabBar
      header={<AppHeader />}
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={color.accent} onRefresh={() => { setRefreshing(true); reload(); setTimeout(() => setRefreshing(false), 800); }} />}
    >
      {/* 첫 생성 완료 후 1회 — 홈 상단 초대 카드 */}
      <InviteCard />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} overScrollMode="never">
        {chips.map((c, i) => {
          const on = active === c.name;
          // 활성 칩 색 = 하트 4색 순환("전체" 는 첫 색). 0ms 로 바뀐다.
          const heart = color.hearts[i % color.hearts.length];
          return <Chip key={c.name} label={c.name} active={on} activeColor={heart} onPress={() => setActive(c.name)} />;
        })}
      </ScrollView>

      {loading ? (
        <View style={styles.center}><Spinner size={28} color={color.accent} /></View>
      ) : !home ? (
        <View style={styles.center}><Text tone="muted">{copy.home.loadFail}</Text></View>
      ) : active === copy.home.all ? (
        <Animated.View
          key="rails"
          style={styles.rails}
          entering={FadeIn.duration(transitions.listSwap.duration).reduceMotion(ReduceMotion.Never)}
          exiting={FadeOut.duration(transitions.listSwap.exitDuration).reduceMotion(ReduceMotion.Never)}
        >
          <ConceptRail title={copy.home.featured} items={home.featured} big />
          <ConceptRail title={copy.home.newest} items={home.newest} big />
          {home.rows.map((row) => (
            <ConceptRail
              key={row.name}
              title={row.name}
              items={row.items}
              onMore={row.count > row.items.length ? () => router.push({ pathname: "/category/[name]", params: { name: row.name } }) : undefined}
            />
          ))}
        </Animated.View>
      ) : (
        <Animated.View
          key={active}
          style={styles.grid}
          entering={FadeIn.duration(transitions.listSwap.duration).reduceMotion(ReduceMotion.Never)}
          exiting={FadeOut.duration(transitions.listSwap.exitDuration).reduceMotion(ReduceMotion.Never)}
        >
          {filtered.map((c) => <ConceptCard key={String(c.id)} concept={c} width={cardW} />)}
        </Animated.View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { paddingHorizontal: space.screen, gap: space.s2, paddingBottom: space.s4 },
  rails: { gap: space.s5 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.s3, paddingHorizontal: space.screen },
  center: { paddingVertical: space.s7, alignItems: "center" },
});
