import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/ui/Text";
import { Logo } from "@/ui/Logo";
import { Spinner } from "@/ui/Spinner";
import { Thumb, photoHeight } from "@/ui/Thumb";
import { CartBar } from "@/ui/CartBar";
import { CoachAnchor, CoachHost } from "@/ui/Coach";
import { IconClockBack, IconGear, IconPencilLine } from "@/ui/icons21";
import { FavoriteBadge } from "@/ui/FavoriteBits";
import { ConceptRail } from "@/ui/ConceptCard";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { useQuota } from "@/lib/quota";
import { Coach, useApp21 } from "@/lib/app21";
import { c21 } from "@/lib/copy21";
import { copy } from "@/lib/copy";
import { conceptThumb, isRestoreConcept, isRetouch } from "@/lib/concepts";
import { PURPOSES, albumName, albumTiles, purposeCover, purposeTitle, type AlbumTile } from "@/lib/home21";
import { chrome, color, radius, space, themedStyles } from "@/theme/tokens";

// ============================================================================
// 만들기 탭(홈) — iOS 2.1 `HomeView.swift` 와 같은 구성(오너 지시 2026-10-09, docs/ux-v3 C안).
// 로고 · 크레딧 · ⚙︎ → "말로 고치기 / 옛날 사진 복원" 카드 → 목적 4칸(4번째 = 드레스룸)
// → 추천 · 새로 나왔어요(NEW) 가로 슬라이드 → "컨셉화보" 제목 + 컨셉 앨범 3열.
// 설명 글은 넣지 않는다(오너: "앱 안에 텍스트가 불필요하게 많으면 복잡해 보임").
// ============================================================================

export default function HomeTab() {
  const { concepts, loading, reload, seasons, favoriteCategories, favoriteConcepts, isFavoriteCategory, home } = useStore();
  const { cart, startHomeCoach, enqueueCoach, labelsVersion } = useApp21();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const { width } = useWindowDimensions();

  const tiles = useMemo(
    () => albumTiles(concepts, seasons, favoriteCategories, favoriteConcepts),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [concepts, seasons, favoriteCategories, favoriteConcepts, labelsVersion],
  );

  useFocusEffect(useCallback(() => {
    startHomeCoach();
    if (cart.length) enqueueCoach(Coach.badge());
  }, [startHomeCoach, enqueueCoach, cart.length]));
  // 목록이 늦게 와도 튜토리얼이 뜨게 — 첫 화면이 다 그려진 뒤 한 번 더.
  useEffect(() => { if (concepts.length) startHomeCoach(); }, [concepts.length, startHomeCoach]);

  const tileW = Math.floor((width - space.screen * 2 - space.s2 * 2) / 3);
  // 추천·새로 나왔어요 가로 슬라이드(iOS HomeView 2026-10-10) — 카드 폭·간격은 iOS CardMetrics(160/390, 10).
  const railW = Math.round((width * 160) / 390);
  // 사진 복원·말로 고치기는 위 카드에 있으니 추천에서 뺀다(오너 2026-10-10, iOS 와 같다)
  const featured = useMemo(() => (home?.featured ?? []).filter((c) => !isRestoreConcept(c) && !isRetouch(c)), [home]);
  const newest = home?.newest ?? [];

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + space.s2, paddingBottom: insets.bottom + chrome.tabBarH + chrome.tabBarBottom + space.s7 + (cart.length ? 60 : 0), gap: space.s4 }}
        showsVerticalScrollIndicator={false}
        overScrollMode="never"
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={color.accent} onRefresh={() => { setRefreshing(true); reload(); setTimeout(() => setRefreshing(false), 800); }} />}
      >
        <HomeHeader />
        <CoachAnchor id="cards"><FeatureCards /></CoachAnchor>
        <CoachAnchor id="purposes"><PurposeGrid /></CoachAnchor>
        {loading && !concepts.length ? (
          <View style={styles.center}><Spinner size={28} color={color.accent} /></View>
        ) : (
          <>
            {/* 예전 리미키미 홈처럼 추천·새로 나왔어요, 그 아래 컨셉화보(앨범)가 쭉 — 4번째 목적 칸을 드레스룸으로 바꾸면서 */}
            <View style={styles.rails}>
              <ConceptRail title={copy.home.featured} items={featured} cardWidth={railW} gap={10} />
              <ConceptRail title={copy.home.newest} items={newest} cardWidth={railW} gap={10} isNew />
            </View>
            <Text size="headline" style={styles.sectionTitle} accessibilityRole="header">{c21.purposeConcept}</Text>
            <View style={styles.albums}>
              {tiles.map((t, i) => {
                const tile = <AlbumGridTile key={t.name} tile={t} width={tileW} fav={isFavoriteCategory(t.name)} />;
                return i === 0 ? <CoachAnchor key={t.name} id="albums">{tile}</CoachAnchor> : tile;
              })}
            </View>
          </>
        )}
      </ScrollView>
      <CartBar compactOnHome hasTabBar />
      <CoachHost keys={["cards", "purposes", "albums", "cameraTab", "cartBadge"]} />
    </View>
  );
}

/** 로고 + 크레딧 칩 + ⚙︎ 설정(예전 프로필 탭). */
function HomeHeader() {
  const { session } = useAuth();
  const { quota } = useQuota();
  const signedIn = !!session;
  const label = !signedIn ? c21.signIn
    : !quota ? "🎟 –"
      : quota.unlimited ? c21.chipUnlimited
        : quota.credits > 0 ? `🎟 ${quota.credits}` : c21.chipFree(Math.max(0, quota.limit - quota.used));
  return (
    <View style={styles.header}>
      <Logo height={24} />
      <View style={{ flex: 1 }} />
      <Pressable accessibilityRole="button" accessibilityLabel={c21.creditsLabel} onPress={() => router.push("/settings")} style={styles.chip}>
        {signedIn && !quota ? <View style={styles.chipSkeleton} /> : <Text size="footnote" weight="medium">{label}</Text>}
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={c21.settingsTitle} onPress={() => router.push("/settings")} style={styles.gear}>
        <IconGear size={20} color={color.ink} />
      </Pressable>
    </View>
  );
}

/** 대표 기능 2개 — 지금 있는 컨셉(말로 고치기 = mode retouch, 복원 = 408)을 그대로 연다. */
function FeatureCards() {
  const { concepts } = useStore();
  const retouch = concepts.find((c) => isRetouch(c));
  const restore = concepts.find((c) => String(c.id) === "408") ?? concepts.find((c) => isRestoreConcept(c));
  const card = (title: string, Icon: typeof IconPencilLine, bg: string, id?: string | number) => (
    <Pressable
      accessibilityRole="button"
      disabled={id == null}
      onPress={() => { if (id != null) router.push({ pathname: "/concept/[id]", params: { id: String(id) } }); }}
      style={({ pressed }) => [styles.feature, { backgroundColor: bg, opacity: id == null ? 0.5 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] }]}
    >
      <Icon size={20} color={color.ink} />
      <Text size="body" weight="semibold">{title}</Text>
    </Pressable>
  );
  return (
    <View style={styles.features}>
      {card(c21.featureRetouch, IconPencilLine, color.accentWeak, retouch?.id)}
      {card(c21.featureRestore, IconClockBack, color.fill, restore?.id)}
    </View>
  );
}

/** 목적 4칸. */
function PurposeGrid() {
  const { concepts } = useStore();
  const { width } = useWindowDimensions();
  const w = Math.floor((width - space.screen * 2 - space.s3) / 2);
  return (
    <View style={styles.purposes}>
      {PURPOSES.map((p) => {
        // 네 번째 칸은 컨셉화보 대신 드레스룸 — 누르면 드레스룸 컨셉 바로(iOS 와 같다, 오너 2026-10-10)
        const dress = p === "concept" ? concepts.find((c) => c.mode === "dressroom") : undefined;
        const cover = dress ?? purposeCover(concepts, p);
        return (
          <Pressable
            key={p}
            accessibilityRole="button"
            onPress={() => dress
              ? router.push({ pathname: "/concept/[id]", params: { id: String(dress.id) } })
              : router.push({ pathname: "/purpose/[key]", params: { key: p } })}
            style={({ pressed }) => [styles.purpose, { width: w, transform: [{ scale: pressed ? 0.97 : 1 }] }]}
          >
            {cover ? <Thumb uri={conceptThumb(cover)} width={38} height={48} rounded={8} /> : <View style={styles.purposeEmpty} />}
            <Text size="body" weight="semibold" numberOfLines={1} style={{ flexShrink: 1 }}>{dress ? c21.purposeDressroom : purposeTitle(p)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * 홈의 "앨범" 타일 — 표지 1장 + 이름 + 장수. 탭 → 그 카테고리의 빽빽한 그리드.
 * ⚠️ 미리보기는 **무조건 3:4**(오너 지시 2026-09-22).
 */
function AlbumGridTile({ tile, width, fav }: { tile: AlbumTile; width: number; fav: boolean }) {
  const [failed, setFailed] = useState(false);
  const uri = failed ? tile.coverFallback : tile.cover;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={albumName(tile.name)}
      onPress={() => router.push({ pathname: "/category/[name]", params: { name: tile.name } })}
      style={({ pressed }) => [{ width, gap: space.s1, transform: [{ scale: pressed ? 0.97 : 1 }] }]}
    >
      <View style={{ width, height: photoHeight(width), borderRadius: radius.card, overflow: "hidden", backgroundColor: color.mat }}>
        {uri ? (
          <Image
            source={{ uri }}
            style={{ width, height: photoHeight(width) }}
            contentFit="cover"
            transition={0}
            cachePolicy="memory-disk"
            onError={() => setFailed(true)}
          />
        ) : null}
        {fav ? <View style={styles.favBadge}><FavoriteBadge size={20} /></View> : null}
      </View>
      <Text size="footnote" weight="semibold" numberOfLines={1}>{albumName(tile.name)}</Text>
      <Text size="footnote" tone="subtle">{c21.albumCount(tile.count)}</Text>
    </Pressable>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  header: { flexDirection: "row", alignItems: "center", gap: space.s3, paddingHorizontal: space.screen, paddingTop: space.s2 },
  chip: { height: 30, paddingHorizontal: space.s3, borderRadius: radius.pill, backgroundColor: color.fill, alignItems: "center", justifyContent: "center" },
  chipSkeleton: { width: 28, height: 12, borderRadius: 6, backgroundColor: color.fillPress },
  gear: { width: 36, height: 36, borderRadius: 18, backgroundColor: color.card, borderWidth: 1, borderColor: color.line, alignItems: "center", justifyContent: "center" },
  features: { flexDirection: "row", gap: space.s3, paddingHorizontal: space.screen },
  feature: { flex: 1, padding: space.s4, gap: space.s2, borderRadius: radius.card },
  purposes: { flexDirection: "row", flexWrap: "wrap", gap: space.s3, paddingHorizontal: space.screen },
  purpose: {
    flexDirection: "row", alignItems: "center", gap: space.s3, padding: space.s3,
    backgroundColor: color.card, borderRadius: radius.card, borderWidth: 1, borderColor: color.line,
  },
  purposeEmpty: { width: 38, height: 48, borderRadius: 8, backgroundColor: color.mat },
  rails: { gap: space.s4 },
  sectionTitle: { paddingHorizontal: space.screen, marginTop: space.s1 },
  albums: { flexDirection: "row", flexWrap: "wrap", columnGap: space.s2, rowGap: space.s4, paddingHorizontal: space.screen },
  favBadge: { position: "absolute", top: space.s2, right: space.s2 },
  center: { paddingVertical: space.s7, alignItems: "center" },
}));
