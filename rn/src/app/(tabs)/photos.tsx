import React, { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, RefreshControl, StyleSheet, View, useWindowDimensions } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { Screen } from "@/ui/Screen";
import { AppHeader } from "@/ui/AppHeader";
import { Text } from "@/ui/Text";
import { Button } from "@/ui/Button";
import { Spinner } from "@/ui/Spinner";
import { ProgressCards } from "@/ui/ProgressCard";
import { useAuth } from "@/lib/auth";
import { useGeneration } from "@/lib/generation";
import { deleteGalleryItem, fetchGallery, type GalleryItem } from "@/lib/api";
import { copy } from "@/lib/copy";
import { useStore } from "@/lib/store";
import { conceptTitle } from "@/lib/concepts";
import { color, radius, space, themedStyles } from "@/theme/tokens";
import { duration } from "@/theme/motion";
import { c21 } from "@/lib/copy21";
import { devFakeGallery } from "@/lib/myAlbums";

// 내 사진 — 서버 갤러리(/api/gallery, Bearer) + 맨 위 진행 카드(SPEC §2).
// 2.1(iOS MyPhotosView 63895f8): 앨범 없이 결과 전부를 최신순 3열 한 격자로. 탭 = 결과 화면. 남은 시간 표시 없음.

export default function PhotosTab() {
  const { session, requireLogin } = useAuth();
  // ⚠️ DEV 전용 캡처 경로 — `/(tabs)/photos?fake=1` 이면 로그인 없이 가짜 앨범(iOS dev/myphotos?fake=1).
  const { fake } = useLocalSearchParams<{ fake?: string }>();
  const devFake = __DEV__ && fake === "1";
  const token = session?.access_token;
  const { jobs } = useGeneration();
  const { byId } = useStore();
  const [items, setItems] = useState<GalleryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const { width } = useWindowDimensions();

  const load = useCallback(async () => {
    if (devFake) { setItems(devFakeGallery()); return; }
    if (!token) { setItems(null); return; }
    try {
      setError(null);
      setItems(await fetchGallery(token));
    } catch {
      setError(c21.mineLoadFailed);
    }
  }, [token, devFake]);

  useEffect(() => { void load(); }, [load]);
  // 탭에 돌아올 때, 그리고 진행 중이던 작업이 끝났을 때 다시 읽는다.
  const doneCount = jobs.filter((j) => j.status === "done").length;
  useFocusEffect(useCallback(() => { void load(); }, [load, doneCount]));

  const cols = 3;
  const w = Math.floor((width - space.screen * 2 - 2 * (cols - 1)) / cols);
  const flat = items ? [...items].sort((x, y) => Date.parse(y.createdAt || "") - Date.parse(x.createdAt || "")) : [];

  const onDelete = (it: GalleryItem) => {
    Alert.alert(copy.photos.deleteConfirm, undefined, [
      { text: copy.photos.cancel, style: "cancel" },
      { text: copy.photos.delete, style: "destructive", onPress: async () => {
        if (!token) return;
        await deleteGalleryItem(token, it.id);
        setItems((prev) => (prev || []).filter((x) => x.id !== it.id));
      } },
    ]);
  };



  return (
    <Screen
      scrollModel="scroll"
      hasTabBar
      header={<AppHeader title={c21.tabMyPhotos} right={<View />} />}
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={color.accent} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      {/* 로그인한 사람의 카드만. 로그아웃 상태에서 앞사람 카드가 보이던 것(2026-09-23 스윕) */}
      {session ? <ProgressCards /> : null}
      {!session && !devFake ? (
        <View style={styles.empty}>
          <Text tone="muted" center>{c21.mineLoginPrompt}</Text>
          <Button label={c21.signIn} variant="secondary" onPress={() => requireLogin("make", () => undefined)} />
        </View>
      ) : error ? (
        <View style={styles.empty}>
          <Text tone="muted" center>{error}</Text>
          <Button label={copy.common.retry} variant="secondary" onPress={() => { void load(); }} />
        </View>
      ) : items === null ? (
        <View style={styles.empty}><Spinner size={28} color={color.accent} /></View>
      ) : items.length === 0 && !jobs.length ? (
        <View style={styles.empty}>
          <Text tone="muted" center>{c21.mineEmpty}</Text>
          <Button label={c21.mineEmptyCta} variant="secondary" onPress={() => router.push("/(tabs)/gallery")} />
        </View>
      ) : (
        <View style={styles.grid}>
          {/* 2.1(iOS 63895f8, 오너 지시): 앨범으로 묶지 않는다 — 결과 전부를 최신순 3열 한 격자로,
              누르면 그 결과 화면으로 바로. 길게 누르면 지우기(안드로이드 2.0 동작 유지). */}
          {flat.map((it) => {
            const title = conceptTitle(byId(it.conceptId ?? undefined)) || it.conceptTitle || "";
            return (
              <Pressable
                key={it.id}
                accessibilityRole="button"
                accessibilityLabel={title || c21.tabMyPhotos}
                onPress={() => router.push({ pathname: "/result/[jobId]", params: { jobId: `gallery:${it.id}`, url: it.url ?? "", conceptId: String(it.conceptId ?? ""), title } })}
                onLongPress={() => onDelete(it)}
                style={({ pressed }) => [pressed && { opacity: 0.85 }]}
              >
                <Image source={{ uri: it.url ?? undefined }} style={[styles.thumb, { width: w, height: Math.round((w * 4) / 3) }]} contentFit="cover" transition={duration.enter} />
              </Pressable>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  empty: { paddingVertical: space.s7, paddingHorizontal: space.s5, alignItems: "center", gap: space.s4 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 2, paddingHorizontal: space.screen },
  thumb: { borderRadius: radius.thumb, backgroundColor: color.mat },
}));
