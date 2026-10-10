import React, { useMemo, useState } from "react";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import type { File } from "expo-file-system";
import { Screen } from "@/ui/Screen";
import { AppHeader } from "@/ui/AppHeader";
import { Text } from "@/ui/Text";
import { Button } from "@/ui/Button";
import { ConceptRail } from "@/ui/ConceptCard";
import { IconDownload, IconFlag, IconShare, IconWand } from "@/ui/icons";
import { FitSheet } from "@/ui/FitSheet";
import { setEditorPayload } from "@/lib/editorPayload";
import { useSaveAdGate } from "@/lib/saveAdGate";
import { useGeneration, type ResultImage } from "@/lib/generation";
import { useStore } from "@/lib/store";
import { conceptTitle, similarConcepts } from "@/lib/concepts";
import { copy } from "@/lib/copy";
import { color, radius, space, themedStyles } from "@/theme/tokens";
import { duration } from "@/theme/motion";

// ============================================================================
// 결과 화면 (SPEC §3): 사진 크게 · "내 사진에 저장됐어요 · 앨범에도 저장" · 앨범 저장 · 다듬기 · 공유
// · 한 장 더 · 비슷한 컨셉. 진행 카드에서 오거나(jobId) 내 사진 그리드에서 온다(gallery:{id} + url).
// ATT 팝업 → 초대 카드(첫 생성 완료 직후 1회)는 2주차.
// ============================================================================

// ⚠️ expo-file-system/expo-media-library/expo-sharing 는 지연 import 한다(nativeMedia.ts 와 같은
// 이유) — 최상단 import 로 두면 네이티브 모듈이 없는 웹 프리뷰(`/dev`)에서 이 화면이 번들에
// 물려 있는 것만으로 전체가 크래시난다(실기기 Android 에는 영향 없음, 순수 웹 프리뷰 문제).
async function toLocalFile(img: ResultImage, name: string): Promise<File> {
  const { File, Paths } = await import("expo-file-system");
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

  const job = findJob(jobId);
  const images: ResultImage[] = useMemo(
    () => (job ? job.images : url ? [{ uri: url }] : []).map((im, i) => (fitted[i] ? { ...im, uri: fitted[i] } : im)),
    [job, url, fitted]
  );

  // 정방향 맞춤 안내는 뺐다(iOS 2.1, 오너 지시 2026-10-09 "정방향 맞추기는 없애자").
  const concept = job ? byId(job.concept.id) ?? job.concept : byId(conceptId) ?? (title ? { id: conceptId ?? "", title } : undefined);
  const img = images[idx];
  const w = width - space.screen * 2;
  const h = Math.round((w * 4) / 3);
  const adGate = useSaveAdGate();
  const similar = useMemo(() => (concept && concepts.length ? similarConcepts(concepts, concept) : []), [concept, concepts]);

  const save = async () => {
    if (!img) return;
    setSaving(true);
    try {
      await adGate(); // 무료 사용자는 광고를 본 뒤 저장
      const MediaLibrary = await import("expo-media-library");
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
      const Sharing = await import("expo-sharing");
      const f = await toLocalFile(img, `rimikimi_${String(concept?.id ?? "photo")}_${idx}.png`);
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(f.uri, { mimeType: "image/png", dialogTitle: copy.result.share });
    } catch { /* 취소/미지원 */ }
  };

  const oneMore = () => {
    if (!concept) return;
    router.push({ pathname: "/concept/[id]", params: { id: String(concept.id) } });
  };

  const report = () => {
    const label = concept ? `${conceptTitle(concept)} (#${concept.id})` : "-";
    const id = jobId || "-";
    const url = `mailto:enquiry@rimikimi.com?subject=${encodeURIComponent(copy.result.reportSubject(id))}&body=${encodeURIComponent(copy.result.reportBody(label, id))}`;
    void Linking.openURL(url).catch(() => undefined);
  };

  return (
    <Screen scrollModel="scroll" header={<AppHeader title={conceptTitle(concept)} back right={
      // 부적절한 결과 신고 — 문구 없이 깃발만(오너 10/1: 안내 문구는 튜토리얼·설정에만). iOS ⋯ 메뉴와 같은 수신함·제목.
      <Pressable accessibilityRole="button" accessibilityLabel={copy.result.report} hitSlop={12} onPress={report} style={styles.flag}>
        <IconFlag size={20} color={color.ink3} />
      </Pressable>
    } />} contentStyle={styles.content}>
      {img ? (
        // 결과 전체를 보여준다 — 잘라서 채우지 않는다(iOS 2.1, 오너 지시 2026-10-09 "결과물 전체를 보여줘야 함").
        <Image source={{ uri: img.uri }} style={{ width: w, height: h, borderRadius: radius.card }} contentFit="contain" transition={duration.enter} />
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

      {/* iOS 2.1 배치: 앨범 저장(주) → 다듬기 · 공유 → 한 장 더 */}
      <Button label={copy.result.saveAlbum} full loading={saving} disabled={!img} leading={<IconDownload size={20} color={color.accentOn} />} onPress={() => { void save(); }} />
      <View style={styles.actions}>
        <View style={{ flex: 1 }}>
        <Button
          full
          label={copy.result.edit}
          variant="secondary"
          disabled={!img}
          leading={<IconWand size={20} color={color.ink} />}
          onPress={() => {
            if (!img) return;
            // 지금 보고 있는 사진을 편집기에 바로 실어 보낸다(사진 선택 화면 생략, iOS openEditor).
            if (img.uri.startsWith("data:")) { setEditorPayload({ mode: "edit", src: img.uri }); router.push("/editor"); }
            else router.push({ pathname: "/editor", params: { img: img.uri } });
          }}
          style={styles.action}
        />
        </View>
        <View style={{ flex: 1 }}>
          <Button full label={copy.result.share} variant="secondary" disabled={!img} leading={<IconShare size={20} color={color.ink} />} onPress={() => { void share(); }} style={styles.action} />
        </View>
      </View>
      {concept ? <Button label={copy.result.oneMore} variant="secondary" full onPress={oneMore} /> : null}

      {similar.length ? (
        <View style={styles.similar}>
          <ConceptRail title={copy.result.similar} items={similar} />
        </View>
      ) : null}
      <FitSheet open={fitOpen} uri={img?.uri ?? null} onClose={() => setFitOpen(false)} onFitted={(p) => setFitted((f) => ({ ...f, [idx]: p.uri }))} />
    </Screen>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  flag: { width: 40, height: 40, alignItems: "center", justifyContent: "center", marginRight: -space.s2 },
  content: { paddingHorizontal: space.screen, gap: space.s4 },
  empty: { borderRadius: radius.card, backgroundColor: color.mat, alignItems: "center", justifyContent: "center" },
  thumb: { width: 60, height: 80, borderRadius: radius.thumb, backgroundColor: color.mat, opacity: 0.6 },
  thumbOn: { opacity: 1, borderWidth: 2, borderColor: color.accent },
  actions: { flexDirection: "row", gap: space.s2 },
  action: { flex: 1, paddingHorizontal: space.s2 },
  similar: { marginHorizontal: -space.screen, marginTop: space.s2 },
}));
