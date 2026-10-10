import React, { useState } from "react";
import { Dimensions, Pressable, ScrollView, StyleSheet, Switch, View } from "react-native";
import { Sheet } from "./Sheet";
import { Text } from "./Text";
import { Thumb } from "./Thumb";
import { Button } from "./Button";
import { IconShirt, IconSliders } from "./icons21";
import { useApp21 } from "@/lib/app21";
import { c21 } from "@/lib/copy21";
import { conceptThumb } from "@/lib/concepts";
import { pickPhotos } from "@/lib/photo";
import {
  KNOB_RECIPE_KEY, STUDIO_TABS, axisValues, dressList, knobLabel, knobSwatch, knobValues, type DressAxis,
} from "@/lib/studio";
import { color, radius, space, themedStyles } from "@/theme/tokens";

// ============================================================================
// 목적 화면 시트들 — iOS PurposeView.swift 의 KnobSheet · DressFilterSheet · StudioStepSheet.
// ============================================================================

const MAX_H = Math.round(Dimensions.get("window").height * 0.62);

/** 머리줄 — 왼쪽 "기본값으로" · 가운데 제목 · 오른쪽 "닫기"(iOS 툴바와 같은 자리). */
function SheetHead({ title, onReset, onClose }: { title: string; onReset?: () => void; onClose: () => void }) {
  return (
    <View style={styles.head}>
      <View style={styles.headSide}>
        {onReset ? <Pressable hitSlop={8} onPress={onReset}><Text size="callout" tone="accent">{c21.reset}</Text></Pressable> : null}
      </View>
      <Text size="headline">{title}</Text>
      <View style={[styles.headSide, { alignItems: "flex-end" }]}>
        <Pressable hitSlop={8} onPress={onClose}><Text size="callout" weight="semibold" tone="accent">{c21.close}</Text></Pressable>
      </View>
    </View>
  );
}

/** 줄바꿈하며 흐르는 선택 칩. */
export function FlowChip({ label, active, swatch, onPress }: { label: string; active: boolean; swatch?: string | null; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.flowChip, active ? { backgroundColor: color.ink, borderWidth: 0 } : null]}
    >
      {swatch ? <View style={[styles.swatch, { backgroundColor: swatch }]} /> : null}
      <Text size="callout" style={{ color: active ? color.bg : color.ink }}>{label}</Text>
    </Pressable>
  );
}

/** 세부 조정 시트 — 항목·값은 서버 카탈로그가 정한다(브루클린 AdjustSheet 와 같은 구성). */
export function KnobSheet({ purpose, open, onClose }: { purpose: string; open: boolean; onClose: () => void }) {
  const { catalog, overrides, setOverride, resetOverrides, outfit } = useApp21();
  const o = overrides[purpose] ?? {};
  const dimmed = new Set(outfit[purpose] ? ["actorOutfits", "suits"] : []);
  return (
    <Sheet open={open} onClose={onClose}>
      <SheetHead title={c21.fineTune} onReset={() => resetOverrides(purpose)} onClose={onClose} />
      <ScrollView style={{ maxHeight: MAX_H }} contentContainerStyle={{ gap: space.s5, paddingBottom: space.s4 }}>
        {outfit[purpose] ? <Text size="footnote" tone="muted">{`👕 ${c21.outfitSetsClothes}`}</Text> : null}
        {(catalog?.purposeKnobs[purpose] ?? []).map((knob) => {
          const key = KNOB_RECIPE_KEY[knob] ?? knob;
          const off = dimmed.has(knob);
          return (
            <View key={knob} style={{ gap: space.s2, opacity: off ? 0.4 : 1 }} pointerEvents={off ? "none" : "auto"}>
              <Text size="headline">{c21.knobTitle(knob, purpose)}</Text>
              {knob === "mono" ? (
                <View style={styles.toggleRow}>
                  <Text size="body">{c21.knobTitle("mono", purpose)}</Text>
                  <Switch value={o[key] === true} onValueChange={(v) => setOverride(purpose, key, v ? true : undefined)} trackColor={{ true: color.accent, false: color.fillPress }} thumbColor="#FFFFFF" />
                </View>
              ) : (
                <View style={styles.flow}>
                  {knob === "hair" ? (
                    <FlowChip label={c21.keepMine} active={o[key] == null || o[key] === ""} onPress={() => setOverride(purpose, key, "")} />
                  ) : null}
                  {knobValues(catalog, knob, purpose).map((v) => {
                    const id = knob === "bgs" ? (v.hex ?? v.id) : v.id;
                    return <FlowChip key={v.id} label={knobLabel(v)} swatch={knobSwatch(v)} active={o[key] === id} onPress={() => setOverride(purpose, key, id)} />;
                  })}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </Sheet>
  );
}

/** 웨딩 드레스 필터 — 실루엣·컬러·넥라인·소매, 여러 개 골라 거른다(조세핀 디자인으로 보기). */
export function DressFilterSheet({ kind, open, onClose }: { kind: string; open: boolean; onClose: () => void }) {
  const { dresses, dressFilter, setDressFilter } = useApp21();
  const axes: [DressAxis, string][] = [["sil", c21.axisSil], ["col", c21.axisCol], ["neck", c21.axisNeck], ["slv", c21.axisSlv]];
  const n = dressList(dresses, kind, dressFilter).length;
  return (
    <Sheet open={open} onClose={onClose}>
      <SheetHead title={c21.filter} onReset={() => setDressFilter({})} onClose={onClose} />
      <ScrollView style={{ maxHeight: MAX_H }} contentContainerStyle={{ gap: space.s5, paddingBottom: space.s4 }}>
        {axes.map(([axis, title]) => (
          <View key={axis} style={{ gap: space.s2 }}>
            <Text size="headline">{title}</Text>
            <View style={styles.flow}>
              {axisValues(dresses, axis, kind).map((v) => {
                const sel = dressFilter[axis] ?? [];
                const on = sel.includes(v);
                return (
                  <FlowChip key={v} label={v} active={on} onPress={() => {
                    setDressFilter({ ...dressFilter, [axis]: on ? sel.filter((x) => x !== v) : [...sel, v] });
                  }} />
                );
              })}
            </View>
          </View>
        ))}
        <Text size="footnote" tone="muted" center>{c21.dressMatch(n)}</Text>
      </ScrollView>
    </Sheet>
  );
}

/** 옵션 버튼(웨딩 필터·신랑 / 세부 조정·옷 바꾸기). 켜진 건 강조색. */
export function ToolButton({ title, Icon, on, onPress }: { title: string; Icon: typeof IconSliders; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.tool, on && { backgroundColor: color.accentWeak, borderColor: color.accent }, pressed && { opacity: 0.85 }]}
    >
      <Icon size={20} color={on ? color.accent : color.ink} />
      <Text size="body" weight="semibold" numberOfLines={1} style={{ color: on ? color.accent : color.ink }}>{title}</Text>
    </Pressable>
  );
}

/**
 * "N장 만들기" 다음 단계 — 담은 전문 프로필 룩을 탭별로 묶어 세부 조정·옷 바꾸기를 고른다.
 * 옵션은 그 탭에서 담은 룩에만 적용된다(iOS StudioStepSheet). 루트 레이아웃이 그린다.
 */
export function StudioStepSheet() {
  const { studioStep, setStudioStep, cart, overrides, outfit, setOutfit, generateCart } = useApp21();
  const [knobTab, setKnobTab] = useState<string | null>(null);
  const tabs = STUDIO_TABS.filter((tt) => cart.some((c) => c.studioPurpose === tt));
  const close = () => setStudioStep(false);
  return (
    <>
      <Sheet open={studioStep && !knobTab} onClose={close}>
        <SheetHead title={c21.purposeProfile} onClose={close} />
        <ScrollView style={{ maxHeight: MAX_H }} contentContainerStyle={{ gap: space.s5, paddingBottom: space.s2 }}>
          {tabs.map((tt) => {
            const n = Object.keys(overrides[tt] ?? {}).length;
            const has = !!outfit[tt];
            return (
              <View key={tt} style={{ gap: space.s2 }}>
                <Text size="headline">{c21.studioTab(tt)}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.s2 }}>
                  {cart.filter((c) => c.studioPurpose === tt).map((c) => (
                    <Thumb key={String(c.id)} uri={conceptThumb(c)} width={52} height={68} rounded={9} />
                  ))}
                </ScrollView>
                <View style={{ flexDirection: "row", gap: space.s2 }}>
                  <ToolButton title={c21.fineTune + (n > 0 ? ` · ${n}` : "")} Icon={IconSliders} on={n > 0} onPress={() => setKnobTab(tt)} />
                  <ToolButton
                    title={has ? c21.outfitApplied : c21.changeOutfit}
                    Icon={IconShirt}
                    on={has}
                    onPress={async () => {
                      if (has) { setOutfit(tt, undefined); return; }
                      const [p] = await pickPhotos();
                      if (p) setOutfit(tt, p);
                    }}
                  />
                </View>
              </View>
            );
          })}
        </ScrollView>
        <Button label={c21.cartMake(cart.length)} full onPress={() => { close(); setTimeout(() => generateCart(true), 350); }} />
      </Sheet>
      {knobTab ? <KnobSheet purpose={knobTab} open={!!knobTab} onClose={() => setKnobTab(null)} /> : null}
    </>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space.s1 },
  headSide: { width: 90 },
  flow: { flexDirection: "row", flexWrap: "wrap", gap: space.s2 },
  flowChip: {
    flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: radius.pill, backgroundColor: color.card, borderWidth: 1, borderColor: color.line,
  },
  swatch: { width: 14, height: 14, borderRadius: 7, borderWidth: StyleSheet.hairlineWidth, borderColor: color.line },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  tool: {
    flex: 1, minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    borderRadius: radius.pill, backgroundColor: color.fill, borderWidth: 1, borderColor: "transparent", paddingHorizontal: space.s3,
  },
}));
