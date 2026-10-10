import React, { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from "react-native";
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
import { FavoriteStarButton } from "@/ui/FavoriteBits";
import { useStore } from "@/lib/store";
import { FOURCUT_COUNTS, GARMENT_MAX, ID_BGS, ID_SUITS, conceptTitle, type Concept, isArtOnly, isRetouch, optionLabel, isCoupleConcept, isDressroom, isFourcut, isIdPhoto, thumbUrl } from "@/lib/concepts";
import { useApp21 } from "@/lib/app21";
import { c21 } from "@/lib/copy21";
import { pickPhotos, registerPhoto, type PhotoRef } from "@/lib/photo";
import { copy } from "@/lib/copy";
import { chrome, color, radius, space, themedStyles } from "@/theme/tokens";
import { duration } from "@/theme/motion";

// ============================================================================
// 옵션 화면 (SPEC §3 생성): 상단 바 제목=컨셉명 · 미리보기 크게 · "내 사진: 등록된 사진 사용 · 변경" 한 줄
// · 컨셉별 옵션(드레스룸 의상 5장 + 거울셀카/일상컷 + 장수 / 인생네컷 컷수 + 스타일 / 배치 장수)
// · 만들기 → (로그인) → 홈으로 복귀 + 내 사진 진행 카드.
// STEP 02(사진 업로드) 화면 없음 — 매직부스(일회용)·커플(상대) 은 여기 슬롯.
//
// iOS `ConceptOptionsView(concept:top:navTitle:)` 와 같다 — `top` 을 주면 맨 위 미리보기 대신 그걸 둔다.
// 컨셉 훑어보기(browse/[name])가 큰 사진 페이저 + 컨셉명 + 필름스트립을 `top` 으로 넣어 한 화면이 된다
// (iOS d76446f, 오너 2026-10-10 "이거 두 개 한 페이지로 합쳐줘"). 만들기 버튼은 아래 고정.
// ============================================================================

export function ConceptOptionsView({ concept, top, navTitle }: { concept: Concept | undefined; top?: React.ReactNode; navTitle?: string }) {
  const { photo, setPhoto, fourcutStyles, isFavoriteConcept, toggleFavoriteConcept } = useStore();
  const { requestGenerate } = useApp21();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const dress = isDressroom(concept);
  const fourcut = isFourcut(concept);
  const couple = isCoupleConcept(concept);
  const art = isArtOnly(concept);
  const idphoto = isIdPhoto(concept);
  const retouch = isRetouch(concept);
  const [retouchText, setRetouchText] = useState("");

  const [artPhoto, setArtPhoto] = useState<PhotoRef | null>(null);
  const [idSuit, setIdSuit] = useState<string>(ID_SUITS[0].key);
  const [idBg, setIdBg] = useState<string>(ID_BGS[0].hex);
  const [partner, setPartner] = useState<PhotoRef | null>(null);
  const [garments, setGarments] = useState<PhotoRef[]>([]);
  const [dressStyle, setDressStyle] = useState<"mirror" | "model">("mirror");
  const [batchCount, setBatchCount] = useState<number>(1);
  const [fourcutCount, setFourcutCount] = useState<number>(4);
  const [fourcutStyle, setFourcutStyle] = useState<string>(concept?.fourcutStyle || fourcutStyles[0]?.key || "cute");
  const [busy, setBusy] = useState(false);
  // 합친 화면에서 다른 컨셉으로 넘기면 네컷 스타일 기본값을 그 컨셉 것으로(고른 사진·장수는 그대로 둔다 — iOS 와 같다)
  const conceptId = concept?.id;
  useEffect(() => {
    if (conceptId == null) return;
    setFourcutStyle(concept?.fourcutStyle || fourcutStyles[0]?.key || "cute");
  }, [conceptId]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const ready = !!mainPhoto && (!couple || !!partner) && (!dress || garments.length > 0) && (!retouch || !!retouchText.trim());

  const onMake = () => {
    if (!mainPhoto) { Alert.alert(art ? copy.options.artHint : copy.options.pickHint); return; }
    if (dress && garments.length === 0) { Alert.alert(copy.options.dress.needGarment); return; }
    if (couple && !partner) { Alert.alert(copy.options.partnerNeed); return; }
    if (retouch && !retouchText.trim()) { Alert.alert(c21.needRetouchText); return; }
    // 만들기 → (로그인돼 있으면 크레딧 확인 → 시작 → 내 사진 진행 카드 / 아니면 게스트 첫 1장 또는 로그인 시트).
    // iOS ConceptOptionsView.generate → app.requireLogin(.generate(req)) 와 같은 길(lib/app21.tsx).
    requestGenerate({
      concept,
      photo: mainPhoto,
      partner: couple ? partner : null,
      garments: dress ? garments : undefined,
      dressStyle: dress ? dressStyle : undefined,
      batchCount: fourcut || art ? 1 : batchCount,
      fourcutCount: fourcut ? fourcutCount : undefined,
      fourcutStyle: fourcut ? fourcutStyle : undefined,
      idSuit: idphoto ? idSuit : undefined,
      idBg: idphoto ? idBg : undefined,
      retouchText: retouch ? retouchText : undefined,
    }, { cost, creditsOnly: !fourcut && !art && batchCount > 1 });
  };

  return (
    <View style={{ flex: 1 }}>
      <Screen
        scrollModel="scroll"
        actionBar
        header={
          <AppHeader
            title={navTitle ?? conceptTitle(concept)}
            back
            right={<FavoriteStarButton on={isFavoriteConcept(concept.id)} onPress={() => toggleFavoriteConcept(concept.id)} />}
          />
        }
        contentStyle={top ? { ...styles.content, paddingTop: insets.top + chrome.headerH } : styles.content}
      >
        {top ? (
          // 큰 사진 페이저는 화면 끝까지 — 내용 좌우 여백을 되돌린다
          <View style={{ marginHorizontal: -space.screen }}>{top}</View>
        ) : (
          <Image source={{ uri: thumbUrl(concept.id) }} style={{ width: previewW, height: previewH, borderRadius: radius.card, backgroundColor: color.mat }} contentFit="cover" transition={duration.enter} cachePolicy="disk" />
        )}

        {art ? (
          <>
            <PhotoRow
              label={retouch ? c21.retouchPhotoTitle : copy.options.artPhoto}
              photo={artPhoto}
              actionLabel={artPhoto ? copy.options.change : retouch ? c21.retouchPhotoSub : copy.options.artPick}
              onPress={() => { void pickOne(setArtPhoto); }}
            />
            {retouch ? (
              // 커스텀 보정 — "어떻게 고칠까요?" 글 입력(iOS RetouchTextBlock).
              <Card style={{ gap: space.s2 }}>
                <Text size="headline">{c21.retouchTitle}</Text>
                <TextInput
                  value={retouchText}
                  onChangeText={(v) => setRetouchText(v.slice(0, 1000))}
                  placeholder={c21.retouchPlaceholder}
                  placeholderTextColor={color.ink3}
                  multiline
                  textAlignVertical="top"
                  style={styles.retouchInput}
                />
              </Card>
            ) : null}
          </>
        ) : (
          <PhotoRow
            label={copy.options.myPhoto}
            photo={photo}
            actionLabel={photo ? copy.options.change : copy.options.pick}
            onPress={() => { void changeMyPhoto(); }}
          />
        )}

        {couple ? (
          <PhotoRow label={copy.options.partner} photo={partner} actionLabel={partner ? copy.options.change : copy.options.partnerPick} onPress={() => { void pickOne(setPartner); }} />
        ) : null}

        {dress ? (
          <Card style={{ gap: space.s3 }}>
            <Text size="footnote" weight="semibold">{copy.options.dress.garmentLabel}</Text>
            <GarmentRow garments={garments} max={GARMENT_MAX} onAdd={() => { void addGarments(); }} onRemove={(i) => setGarments((g) => g.filter((_, k) => k !== i))} addFirst={copy.options.dress.addFirst} addMore={copy.options.dress.addMore} />
            <Text size="footnote" weight="semibold" style={{ marginTop: space.s2 }}>{copy.options.dress.styleLabel}</Text>
            <Segmented options={[{ value: "mirror", label: copy.options.dress.mirror }, { value: "model", label: copy.options.dress.model }] as const} value={dressStyle} onChange={setDressStyle} />
          </Card>
        ) : null}

        {fourcut ? (
          <Card style={{ gap: space.s3 }}>
            <Text size="footnote" weight="semibold">{copy.options.fourcut.countLabel}</Text>
            <View style={styles.chips}>
              {FOURCUT_COUNTS.map((n) => <Chip key={n} label={copy.ui.cuts(n)} active={fourcutCount === n} onPress={() => setFourcutCount(n)} />)}
            </View>
            <Text size="footnote" weight="semibold" style={{ marginTop: space.s2 }}>{copy.options.fourcut.styleLabel}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.s2 }} overScrollMode="never">
              {fourcutStyles.map((s) => <Chip key={s.key} label={`${s.emoji ? s.emoji + " " : ""}${optionLabel(s)}`} active={fourcutStyle === s.key} onPress={() => setFourcutStyle(s.key)} />)}
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

        {idphoto ? (
          <Card style={{ gap: space.s3 }}>
            <Text size="footnote" weight="semibold">{copy.options.idphoto.suitLabel}</Text>
            <View style={styles.chips}>
              {ID_SUITS.map((s) => (
                <Chip
                  key={s.key}
                  label={optionLabel(s)}
                  active={idSuit === s.key}
                  onPress={() => setIdSuit(s.key)}
                />
              ))}
            </View>
            <Text size="footnote" weight="semibold" style={{ marginTop: space.s2 }}>{copy.options.idphoto.bgLabel}</Text>
            <View style={styles.swatchRow}>
              {ID_BGS.map((b) => (
                <Pressable
                  key={b.hex}
                  accessibilityRole="button"
                  accessibilityLabel={b.name}
                  onPress={() => setIdBg(b.hex)}
                  style={[styles.swatch, { backgroundColor: b.hex }, idBg.toLowerCase() === b.hex.toLowerCase() ? styles.swatchOn : null]}
                />
              ))}
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

const styles = themedStyles(() => StyleSheet.create({
  content: { paddingHorizontal: space.screen, gap: space.s4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.s2 },
  swatchRow: { flexDirection: "row", flexWrap: "wrap", gap: space.s3 },
  swatch: { width: 36, height: 36, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: color.line },
  swatchOn: { borderWidth: 2, borderColor: color.accent },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  retouchInput: { minHeight: 96, maxHeight: 160, fontSize: 17, lineHeight: 22, color: color.ink, padding: 0 },
  actionBar: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: space.screen, paddingTop: space.s3, backgroundColor: color.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },
}));
