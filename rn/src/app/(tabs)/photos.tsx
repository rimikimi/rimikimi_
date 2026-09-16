import React, { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, RefreshControl, StyleSheet, View, useWindowDimensions } from "react-native";
import { router, useFocusEffect } from "expo-router";
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
import { color, radius, space, themedStyles } from "@/theme/tokens";
import { duration } from "@/theme/motion";

// 내 사진 — 서버 갤러리 그리드(/api/gallery, Bearer) + 맨 위 진행 카드(SPEC §2).

export default function PhotosTab() {
  const { session, requireLogin } = useAuth();
  const token = session?.access_token;
  const { jobs } = useGeneration();
  const [items, setItems] = useState<GalleryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const { width } = useWindowDimensions();

  const load = useCallback(async () => {
    if (!token) { setItems(null); return; }
    try {
      setError(null);
      setItems(await fetchGallery(token));
    } catch (e) {
      setError((e as Error)?.message || copy.photos.loadFail);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);
  // 탭에 돌아올 때, 그리고 진행 중이던 작업이 끝났을 때 다시 읽는다.
  const doneCount = jobs.filter((j) => j.status === "done").length;
  useFocusEffect(useCallback(() => { void load(); }, [load, doneCount]));

  const cols = 3;
  const w = Math.floor((width - space.screen * 2 - space.s1 * (cols - 1)) / cols);

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
      header={<AppHeader title={copy.photos.title} />}
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={color.accent} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      <ProgressCards />
      {!session ? (
        <View style={styles.empty}>
          <Text tone="muted" center>{copy.photos.loginRequired}</Text>
          <Button label={copy.profile.login} variant="secondary" onPress={() => requireLogin("make", () => undefined)} />
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
          <Text tone="muted" center>{copy.photos.empty}</Text>
          <Button label={copy.photos.emptyCta} variant="secondary" onPress={() => router.push("/(tabs)/gallery")} />
        </View>
      ) : (
        <>
          <Text size="caption" tone="subtle" weight="medium" style={styles.notice}>{copy.photos.notice}</Text>
          <View style={styles.grid}>
            {items.map((it) => (
              <Pressable
                key={it.id}
                accessibilityRole="button"
                accessibilityLabel={it.conceptTitle || "사진"}
                onPress={() => router.push({ pathname: "/result/[jobId]", params: { jobId: `gallery:${it.id}`, url: it.url ?? "", conceptId: String(it.conceptId ?? ""), title: it.conceptTitle ?? "" } })}
                onLongPress={() => onDelete(it)}
                style={({ pressed }) => [{ width: w, height: Math.round((w * 4) / 3) }, pressed && { opacity: 0.85 }]}
              >
                <Image source={{ uri: it.url ?? undefined }} style={[styles.thumb, { width: w, height: Math.round((w * 4) / 3) }]} contentFit="cover" transition={duration.enter} />
              </Pressable>
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  empty: { paddingVertical: space.s7, paddingHorizontal: space.s5, alignItems: "center", gap: space.s4 },
  notice: { paddingHorizontal: space.screen, marginBottom: space.s3 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.s1, paddingHorizontal: space.screen },
  thumb: { borderRadius: radius.thumb - 4, backgroundColor: color.mat },
}));
