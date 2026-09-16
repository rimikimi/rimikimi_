import React, { useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Screen } from "@/ui/Screen";
import { AppHeader } from "@/ui/AppHeader";
import { Text } from "@/ui/Text";
import { Button } from "@/ui/Button";
import { Chip } from "@/ui/Chip";
import { Segmented } from "@/ui/Segmented";
import { Card } from "@/ui/Card";
import { GarmentRow, PhotoRow } from "@/ui/PhotoSlot";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { useGeneration } from "@/lib/generation";
import { FOURCUT_COUNTS, GARMENT_MAX, isArtOnly, isCoupleConcept, isDressroom, isFourcut, thumbUrl } from "@/lib/concepts";
import { pickPhotos, registerPhoto, type PhotoRef } from "@/lib/photo";
import { copy } from "@/lib/copy";
import { color, radius, space } from "@/theme/tokens";
import { duration } from "@/theme/motion";

// ============================================================================
// 옵션 화면 (SPEC §3 생성): 상단 바 제목=컨셉명 · 미리보기 크게 · "내 사진: 등록된 사진 사용 · 변경" 한 줄
// · 컨셉별 옵션(드레스룸 의상 5장 + 거울셀카/일상컷 + 장수 / 인생네컷 컷수 + 스타일 / 배치 장수)
// · 만들기 → (로그인) → 홈으로 복귀 + 내 사진 진행 카드.
// STEP 02(사진 업로드) 화면 없음 — 매직부스(일회용)·커플(상대) 은 여기 슬롯.
// ============================================================================

export default function ConceptOptions() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { byId, photo, setPhoto, fourcutStyles } = useStore();
  const { requireLogin } = useAuth();
  const { start } = useGeneration();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const concept = byId(id);

  const dress = isDressroom(concept);
  const fourcut = isFourcut(concept);
  const couple = isCoupleConcept(concept);
  const art = isArtOnly(concept);

  const [artPhoto, setArtPhoto] = useState<PhotoRef | null>(null);
  const [partner, setPartner] = useState<PhotoRef | null>(null);
  const [garments, setGarments] = useState<PhotoRef[]>([]);
  const [dressStyle, setDressStyle] = useState<"mirror" | "model">("mirror");
  const [batchCount, setBatchCount] = useState<number>(1);
  const [fourcutCount, setFourcutCount] = useState<number>(4);
  const [fourcutStyle, setFourcutStyle] = useState<string>(concept?.fourcutStyle || fourcutStyles[0]?.key || "cute");
  const [busy, setBusy] = useState(false);

  const cost = useMemo(() => {
    if (fourcut) return 1; // 스트립 한 장 = 1 크레딧(웹 2026-08-13 규칙)
    if (art) return 1;
    return copy.batch.find((b) => b.count === batchCount)?.cost ?? 1;
  }, [fourcut, art, batchCount]);

  if (!concept) {
    return (
      <Screen scrollModel="fixed" header={<AppHeader title="" back right={<View />} />}>
        <View style={styles.center}><Text tone="muted">{copy.home.loadFail}</Text></View>
      </Screen>
    );
  }

  const previewW = width - space.screen * 2;
  const previewH = Math.round((previewW * 4) / 3);

  const changeMyPhoto = async () => {
    const [p] = await pickPhotos();
    if (!p) return;
    setBusy(true);
    try { setPhoto(await registerPhoto(p)); } finally { setBusy(false); }
  };
  const pickOne = async (set: (p: PhotoRef) => void) => {
    const [p] = await pickPhotos();
    if (p) set(p);
  };
  const addGarments = async () => {
    const room = GARMENT_MAX - garments.length;
    if (room <= 0) return;
    const picked = await pickPhotos({ multiple: true, limit: room });
    if (picked.length) setGarments((g) => [...g, ...picked].slice(0, GARMENT_MAX));
  };

  // 준비 판정 — 웹 `ready` 와 같은 조건
  const mainPhoto = art ? artPhoto : photo;
  const ready = !!mainPhoto && (!couple || !!partner) && (!dress || garments.length > 0);

  const onMake = () => {
    if (!mainPhoto) { Alert.alert(art ? copy.options.artHint : copy.options.pickHint); return; }
    if (dress && garments.length === 0) { Alert.alert(copy.options.dress.needGarment); return; }
    if (couple && !partner) { Alert.alert(copy.options.partnerNeed); return; }
    const route = `/concept/${String(concept.id)}`;
    requireLogin("make", () => {
      start({
        concept,
        photo: mainPhoto,
        partner: couple ? partner : null,
        garments: dress ? garments : undefined,
        dressStyle: dress ? dressStyle : undefined,
        batchCount,
        fourcutCount: fourcut ? fourcutCount : undefined,
        fourcutStyle: fourcut ? fourcutStyle : undefined,
      });
      // 홈으로 복귀 + 내 사진 진행 카드 (SPEC §3): 스택을 탭까지 걷고 내 사진 탭으로.
      router.dismissAll();
      router.navigate("/(tabs)/photos");
    }, route);
  };

  return (
    <View style={{ flex: 1 }}>
      <Screen scrollModel="scroll" actionBar header={<AppHeader title={concept.title} back right={<View />} />} contentStyle={styles.content}>
        <Image source={{ uri: thumbUrl(concept.id) }} style={{ width: previewW, height: previewH, borderRadius: radius.card, backgroundColor: color.mat }} contentFit="cover" transition={duration.enter} cachePolicy="disk" />

        {art ? (
          <PhotoRow label={copy.options.artPhoto} hint={copy.options.artHint} photo={artPhoto} actionLabel={artPhoto ? copy.options.change : copy.options.artPick} onPress={() => { void pickOne(setArtPhoto); }} />
        ) : (
          <PhotoRow
            label={copy.options.myPhoto}
            hint={photo ? `${copy.options.useRegistered} · ${copy.options.registeredHint}` : copy.options.pickHint}
            photo={photo}
            actionLabel={photo ? copy.options.change : copy.options.pick}
            onPress={() => { void changeMyPhoto(); }}
          />
        )}

        {couple ? (
          <PhotoRow label={copy.options.partner} hint={copy.options.partnerNeed} photo={partner} actionLabel={partner ? copy.options.change : copy.options.partnerPick} onPress={() => { void pickOne(setPartner); }} />
        ) : null}

        {dress ? (
          <Card style={{ gap: space.s3 }}>
            <Text size="footnote" weight="semibold">{copy.options.dress.garmentLabel}</Text>
            <GarmentRow garments={garments} max={GARMENT_MAX} onAdd={() => { void addGarments(); }} onRemove={(i) => setGarments((g) => g.filter((_, k) => k !== i))} addFirst={copy.options.dress.addFirst} addMore={copy.options.dress.addMore} />
            <Text size="caption" tone="subtle" weight="medium">{copy.options.dress.autoNote}</Text>
            <Text size="footnote" weight="semibold" style={{ marginTop: space.s2 }}>{copy.options.dress.styleLabel}</Text>
            <Segmented options={[{ value: "mirror", label: copy.options.dress.mirror }, { value: "model", label: copy.options.dress.model }] as const} value={dressStyle} onChange={setDressStyle} />
          </Card>
        ) : null}

        {fourcut ? (
          <Card style={{ gap: space.s3 }}>
            <Text size="footnote" weight="semibold">{copy.options.fourcut.countLabel}</Text>
            <View style={styles.chips}>
              {FOURCUT_COUNTS.map((n) => <Chip key={n} label={`${n}컷`} active={fourcutCount === n} onPress={() => setFourcutCount(n)} />)}
            </View>
            <Text size="footnote" weight="semibold" style={{ marginTop: space.s2 }}>{copy.options.fourcut.styleLabel}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.s2 }} overScrollMode="never">
              {fourcutStyles.map((s) => <Chip key={s.key} label={`${s.emoji ? s.emoji + " " : ""}${s.label}`} active={fourcutStyle === s.key} onPress={() => setFourcutStyle(s.key)} />)}
            </ScrollView>
          </Card>
        ) : !art ? (
          <Card style={{ gap: space.s3 }}>
            <Text size="footnote" weight="semibold">{copy.options.batchLabel}</Text>
            <View style={styles.chips}>
              {copy.batch.map((b) => <Chip key={b.count} label={"badge" in b && b.badge ? `${b.label} · ${b.badge}` : b.label} active={batchCount === b.count} onPress={() => setBatchCount(b.count)} />)}
            </View>
          </Card>
        ) : null}
      </Screen>

      {/* 고정 액션 바 — 콘텐츠는 이 아래로 스크롤한다 */}
      <View style={[styles.actionBar, { paddingBottom: insets.bottom + space.s4 }]}>
        <Button label={copy.options.makeWithCredits(cost)} full loading={busy} disabled={!ready} onPress={onMake} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.screen, gap: space.s4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.s2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  actionBar: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: space.screen, paddingTop: space.s3, backgroundColor: color.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },
});
