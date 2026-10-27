import React, { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { router, useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withTiming, Easing } from "react-native-reanimated";
import { Screen } from "@/ui/Screen";
import { AppHeader } from "@/ui/AppHeader";
import { Text } from "@/ui/Text";
import { IconStarFill } from "@/ui/icons21";
import { presetByKey } from "@/filters";
import { isKo } from "@/lib/locale";
import { c21, t } from "@/lib/copy21";
import { getEnv } from "@/lib/env";
import { pickPhotos } from "@/lib/photo";
import { openEditorWithShots } from "@/lib/openEditor";
import { isPaidFilter, startFilterTrialIfNeeded } from "@/lib/iap";
import { FEATURED, FILTER_GROUPS, NEW_KEYS, type FilterGroupDef , useFilterCatalogVersion } from "@/lib/filterGroups";
import { color, radius, space, themedStyles } from "@/theme/tokens";

// 필터 탭 — iOS `FilterTabView` 이식(2026-10-26 5탭): 즐겨찾는 필터 · 추천 · 신규 가로 줄 + 필터 앨범(폰카·빈티지·감성·효과).
// 카드 = 앞면 원본(fo_), 탭하면 180° 뒤집혀 뒷면 필터 적용본(ff_) + 적용하기(오너 "뒷면이 필터 적용본이어야지").
// 적용하기 → 앨범에서 사진 고르기 → 그 필터로 편집기. 즐겨찾기 = 카메라 탭과 같은 저장소("filter.favorites"), 카드 오른쪽 위 별.

const FAV_KEY = "filter.favorites";
const filterName = (k: string) => { const p = presetByKey(k); return isKo ? p.ko : p.en; };
const thumb = (id: string) => `${getEnv().apiBase}/thumbs/${id}.webp`;

function useFavs() {
  const [favs, setFavs] = useState<string[]>([]);
  const load = useCallback(() => {
    void AsyncStorage.getItem(FAV_KEY).then((v) => { try { const a = JSON.parse(v || "[]"); if (Array.isArray(a)) setFavs(a); } catch { /* 없음 */ } });
  }, []);
  useFocusEffect(load);
  const toggle = useCallback((k: string) => {
    setFavs((cur) => {
      const next = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k];
      void AsyncStorage.setItem(FAV_KEY, JSON.stringify(next));
      return next;
    });
    void Haptics.selectionAsync();
  }, []);
  return { favs, toggle };
}

async function applyFilter(k: string) {
  if (isPaidFilter(k)) void startFilterTrialIfNeeded();
  const picked = await pickPhotos({ multiple: true, limit: 10 });
  if (!picked.length) return;
  await openEditorWithShots(picked.map((p) => ({ uri: p.uri, width: p.width ?? 0, height: p.height ?? 0, presetKey: k, fxAmount: 1 })));
}

export function FlipCard({ k, width, fav, onFav, caption = true }: { k: string; width: number; fav: boolean; onFav: () => void; caption?: boolean }) {
  const h = Math.round(width / 0.75);
  const flip = useSharedValue(0);
  const [flipped, setFlipped] = useState(false);
  useEffect(() => { flip.value = withTiming(flipped ? 1 : 0, { duration: 450, easing: Easing.out(Easing.cubic) }); }, [flipped, flip]);
  const front = useAnimatedStyle(() => ({
    transform: [{ perspective: 900 }, { rotateY: `${interpolate(flip.value, [0, 1], [0, 180])}deg` }],
    opacity: flip.value < 0.5 ? 1 : 0,
  }));
  const back = useAnimatedStyle(() => ({
    transform: [{ perspective: 900 }, { rotateY: `${interpolate(flip.value, [0, 1], [180, 360])}deg` }],
    opacity: flip.value >= 0.5 ? 1 : 0,
  }));
  const small = !caption;
  return (
    <View style={{ width, height: h }}>
      <Animated.View style={[StyleSheet.absoluteFill, front]} pointerEvents={flipped ? "none" : "auto"}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => { setFlipped(true); void Haptics.selectionAsync(); }} accessibilityLabel={filterName(k)} accessibilityHint={t("누르면 필터 적용본과 적용하기", "Tap to see the filter and Apply")}>
          <Image source={{ uri: thumb(`fo_${k}`) }} placeholder={{ uri: thumb(`ff_${k}`) }} style={[StyleSheet.absoluteFill, { borderRadius: radius.card }]} contentFit="cover" cachePolicy="memory-disk" />
          {caption && (
            <View style={styles.caption} pointerEvents="none">
              <Text size="headline" weight="bold" style={{ color: "#fff" }}>{filterName(k)}</Text>
            </View>
          )}
        </Pressable>
        <Pressable onPress={onFav} hitSlop={8} style={[styles.star, small && styles.starSmall]} accessibilityLabel={fav ? t("즐겨찾기 빼기", "Remove from favorites") : t("즐겨찾기", "Add to favorites")}>
          <IconStarFill size={16} color={fav ? "#FFC83D" : "rgba(255,255,255,0.9)"} />
        </Pressable>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, back]} pointerEvents={flipped ? "auto" : "none"}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setFlipped(false)}>
          <Image source={{ uri: thumb(`ff_${k}`) }} style={[StyleSheet.absoluteFill, { borderRadius: radius.card }]} contentFit="cover" cachePolicy="memory-disk" />
        </Pressable>
        <View style={styles.pill} pointerEvents="none"><Text size="caption" weight="semibold" style={{ color: "#000" }}>{filterName(k)}</Text></View>
        <Pressable onPress={() => void applyFilter(k)} style={[styles.apply, small && styles.applySmall]} accessibilityRole="button">
          <Text size={small ? "footnote" : "body"} weight="semibold" style={{ color: color.bg }}>{t("적용하기", "Apply")}</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

export default function FilterTab() {
  useFilterCatalogVersion();
  const { width } = useWindowDimensions();
  const { favs, toggle } = useFavs();
  const cardW = Math.round((width - space.screen) * 0.42);
  const albumW = Math.floor((width - space.screen * 2 - space.s2 * 2) / 3);

  const rail = (title: string, keys: string[], isNew?: boolean) => (
    <View style={{ marginBottom: space.s5 }}>
      <View style={styles.railHead}>
        <Text size="title2" weight="bold">{title}</Text>
        {isNew && <View style={styles.newBadge}><Text size="caption" weight="bold" style={{ color: color.accent }}>NEW</Text></View>}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.screen, gap: space.s3 }}>
        {keys.map((k) => <FlipCard key={k} k={k} width={cardW} fav={favs.includes(k)} onFav={() => toggle(k)} />)}
      </ScrollView>
    </View>
  );

  const album = (g: FilterGroupDef) => (
    <Pressable key={g.key} onPress={() => router.push({ pathname: "/filter-group/[key]", params: { key: g.key } })} style={{ width: albumW }}>
      <View style={{ width: albumW, height: Math.round(albumW / 0.75), borderRadius: radius.card, overflow: "hidden" }}>
        <Image source={{ uri: thumb(`ff_${g.keys[0]}`) }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
        <View style={styles.caption} pointerEvents="none">
          <Text size="body" weight="bold" style={{ color: "#fff" }}>{g.title()}</Text>
          <Text size="caption" style={{ color: "rgba(255,255,255,0.85)" }}>{String(g.keys.length)}</Text>
        </View>
      </View>
    </Pressable>
  );

  return (
    <Screen scrollModel="scroll" hasTabBar header={<AppHeader title={c21.tabFilter} right={<View />} />}>
      <View style={{ paddingTop: space.s2 }}>
        {favs.length > 0 && rail(t("즐겨찾는 필터", "Favorites"), favs)}
        {rail(t("추천 필터", "Featured"), FEATURED)}
        {rail(t("신규 필터", "New"), NEW_KEYS, true)}
        <Text size="title2" weight="bold" style={{ paddingHorizontal: space.screen, marginBottom: space.s3 }}>{t("필터 앨범", "Filter albums")}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.s2, paddingHorizontal: space.screen }}>
          {FILTER_GROUPS.map(album)}
        </View>
      </View>
    </Screen>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  railHead: { flexDirection: "row", alignItems: "center", gap: space.s2, paddingHorizontal: space.screen, marginBottom: space.s3 },
  newBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, backgroundColor: "rgba(232,64,64,0.12)" },
  caption: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 10, paddingTop: 28, paddingBottom: 9, borderBottomLeftRadius: radius.card, borderBottomRightRadius: radius.card, backgroundColor: "rgba(0,0,0,0.28)" },
  star: { position: "absolute", top: 8, right: 8, width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.35)" },
  starSmall: { width: 26, height: 26, borderRadius: 13, top: 6, right: 6 },
  pill: { position: "absolute", top: 12, alignSelf: "center", paddingHorizontal: 10, height: 26, borderRadius: 13, justifyContent: "center", backgroundColor: "rgba(255,255,255,0.92)" },
  apply: { position: "absolute", left: 12, right: 12, bottom: 12, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: color.ink },
  applySmall: { left: 8, right: 8, bottom: 8, height: 34, borderRadius: 17 },
}));
