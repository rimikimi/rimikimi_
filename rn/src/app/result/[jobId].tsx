import React, { useEffect, useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import * as Haptics from "expo-haptics";
import { File, Paths } from "expo-file-system";
import { Screen } from "@/ui/Screen";
import { AppHeader } from "@/ui/AppHeader";
import { Text } from "@/ui/Text";
import { Button } from "@/ui/Button";
import { ConceptRail } from "@/ui/ConceptCard";
import { IconDownload, IconShare, IconWand } from "@/ui/icons";
import { FitSheet } from "@/ui/FitSheet";
import { needsFit } from "@/lib/fit";
import { useGeneration, type ResultImage } from "@/lib/generation";
import { useStore } from "@/lib/store";
import { similarConcepts } from "@/lib/concepts";
import { copy } from "@/lib/copy";
import { color, radius, space } from "@/theme/tokens";
import { duration } from "@/theme/motion";

// ============================================================================
// 결과 화면 (SPEC §3): 사진 크게 · "내 사진에 저장됐어요 · 앨범에도 저장" · 앨범 저장 · 다듬기 · 공유
// · 한 장 더 · 비슷한 컨셉. 진행 카드에서 오거나(jobId) 내 사진 그리드에서 온다(gallery:{id} + url).
// ATT 팝업 → 초대 카드(첫 생성 완료 직후 1회)는 2주차.
// ============================================================================

async function toLocalFile(img: ResultImage, name: string): Promise<File> {
  const f = new File(Paths.cache, name);
  if (f.exists) f.delete();
  if (img.uri.startsWith("data:")) {
    const m = img.uri.match(/^data:([^;]+);base64,(.+)$/);
    if (!m) throw new Error("bad data url");
    f.write(Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0)));
    return f;
  }
  const out = await File.downloadFileAsync(img.uri, f);
  return out;
}

export default function Result() {
  const { jobId, url, conceptId, title } = useLocalSearchParams<{ jobId: string; url?: string; conceptId?: string; title?: string }>();
  const { job: findJob } = useGeneration();
  const { byId, concepts } = useStore();
  const { width } = useWindowDimensions();
  const [saving, setSaving] = useState(false);
  const [idx, setIdx] = useState(0);
  // 정방향 맞춤 — 잘라 맞춘 결과로 표시 이미지를 바꾼다(원본은 서버 갤러리에 그대로).
  const [fitted, setFitted] = useState<Record<number, string>>({});
  const [fitOpen, setFitOpen] = useState(false);
  const [fitAsked, setFitAsked] = useState(false);

  const job = findJob(jobId);
  const images: ResultImage[] = useMemo(
    () => (job ? job.images : url ? [{ uri: url }] : []).map((im, i) => (fitted[i] ? { ...im, uri: fitted[i] } : im)),
    [job, url, fitted]
  );

  // 3:4 가 아니면(복원 컨셉 등) 한 번 제안한다.
  useEffect(() => {
    const first = images[0];
    if (!first || fitAsked || first.uri.startsWith("data:")) return;
    setFitAsked(true);
    needsFit(first.uri).then((yes) => { if (yes) setFitOpen(true); });
  }, [images, fitAsked]);
  const concept = job ? byId(job.concept.id) ?? job.concept : byId(conceptId) ?? (title ? { id: conceptId ?? "", title } : undefined);
  const img = images[idx];
  const w = width - space.screen * 2;
  const h = Math.round((w * 4) / 3);
  const similar = useMemo(() => (concept && concepts.length ? similarConcepts(concepts, concept) : []), [concept, concepts]);

  const save = async () => {
    if (!img) return;
    setSaving(true);
    try {
      const perm = await MediaLibrary.requestPermissionsAsync(true);
      if (!perm.granted) throw new Error("no permission");
      const f = await toLocalFile(img, `rimikimi_${String(concept?.id ?? "photo")}_${idx}.png`);
      await MediaLibrary.saveToLibraryAsync(f.uri);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      Alert.alert(copy.result.saved);
    } catch {
      Alert.alert(copy.result.saveFail);
    } finally {
      setSaving(false);
    }
  };

  const share = async () => {
    if (!img) return;
    try {
      const f = await toLocalFile(img, `rimikimi_${String(concept?.id ?? "photo")}_${idx}.png`);
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(f.uri, { mimeType: "image/png", dialogTitle: copy.result.share });
    } catch { /* 취소/미지원 */ }
  };

  const oneMore = () => {
    if (!concept) return;
    router.push({ pathname: "/concept/[id]", params: { id: String(concept.id) } });
  };

  return (
    <Screen scrollModel="scroll" header={<AppHeader title={concept?.title ?? ""} back right={<View />} />} contentStyle={styles.content}>
      {img ? (
        <Image source={{ uri: img.uri }} style={{ width: w, height: h, borderRadius: radius.card, backgroundColor: color.mat }} contentFit="cover" transition={duration.enter} />
      ) : (
        <View style={[styles.empty, { width: w, height: h }]}><Text tone="muted">{copy.progress.fail}</Text></View>
      )}
      {images.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.s2 }} overScrollMode="never">
          {images.map((im, i) => (
            <Image
              key={i}
              source={{ uri: im.uri }}
              style={[styles.thumb, i === idx && styles.thumbOn]}
              contentFit="cover"
              onTouchEnd={() => setIdx(i)}
            />
          ))}
        </ScrollView>
      ) : null}

      <Text size="footnote" tone="muted" center>{copy.result.savedNote}</Text>

      <View style={styles.actions}>
        <Button label={copy.result.saveAlbum} variant="secondary" loading={saving} leading={<IconDownload size={20} color={color.ink} />} onPress={() => { void save(); }} style={styles.action} />
        <Button label={copy.result.edit} variant="secondary" leading={<IconWand size={20} color={color.ink} />} onPress={() => router.push("/editor")} style={styles.action} />
        <Button label={copy.result.share} variant="secondary" leading={<IconShare size={20} color={color.ink} />} onPress={() => { void share(); }} style={styles.action} />
      </View>
      <Button label={copy.result.oneMore} full onPress={oneMore} />

      {similar.length ? (
        <View style={styles.similar}>
          <ConceptRail title={copy.result.similar} items={similar} />
        </View>
      ) : null}
      <FitSheet open={fitOpen} uri={img?.uri ?? null} onClose={() => setFitOpen(false)} onFitted={(p) => setFitted((f) => ({ ...f, [idx]: p.uri }))} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.screen, gap: space.s4 },
  empty: { borderRadius: radius.card, backgroundColor: color.mat, alignItems: "center", justifyContent: "center" },
  thumb: { width: 60, height: 80, borderRadius: radius.thumb, backgroundColor: color.mat, opacity: 0.6 },
  thumbOn: { opacity: 1, borderWidth: 2, borderColor: color.accent },
  actions: { flexDirection: "row", gap: space.s2 },
  action: { flex: 1, paddingHorizontal: space.s2 },
  similar: { marginHorizontal: -space.screen, marginTop: space.s2 },
});
