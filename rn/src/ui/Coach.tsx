import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View, useWindowDimensions, type ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useIsFocused } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { Text } from "./Text";
import { useApp21 } from "@/lib/app21";
import { c21 } from "@/lib/copy21";
import { chrome, color, radius, space, themedStyles } from "@/theme/tokens";

// ============================================================================
// 튜토리얼(코치마크) — 화면을 어둡게 하고 설명할 곳만 밝게(iOS `CoachMarks.swift` 와 같다).
// 첫 실행: 홈 4단계(고치기 카드 → 목적 → 앨범 → 카메라 탭). 그 밖은 그 기능을 처음 쓸 때 한 번씩.
//
// 자리 표시: `<CoachAnchor id="cards">` 로 감싸면 창 기준 사각형을 재서 등록한다. 각 화면의
// `<CoachHost keys=[...]>` 는 자기 화면의 자리만 그린다(다른 탭에 남은 자리를 엉뚱하게 비추지 않게).
// "cameraTab" 은 탭바라 자리 대신 화면 아래 가운데를 쓴다(iOS 와 같다).
// ============================================================================

type Rect = { x: number; y: number; w: number; h: number };
const anchors = new Map<string, Rect>();
const measurers = new Map<string, () => void>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

export function CoachAnchor({ id, children, style }: { id: string; children: React.ReactNode; style?: ViewStyle }) {
  const ref = useRef<View>(null);
  const measure = useCallback(() => {
    ref.current?.measureInWindow((x, y, w, h) => {
      if (w > 0 && h > 0) { anchors.set(id, { x, y, w, h }); emit(); }
    });
  }, [id]);
  useEffect(() => {
    measurers.set(id, measure);
    return () => { if (measurers.get(id) === measure) measurers.delete(id); anchors.delete(id); };
  }, [id, measure]);
  return (
    <View ref={ref} collapsable={false} style={style} onLayout={() => setTimeout(measure, 50)}>
      {children}
    </View>
  );
}

/** 화면이 스크롤로 자리를 맞출 때 쓴다 — 등록된 자리(창 기준)와 다시 재기. */
export const coachAnchorRect = (id: string): Rect | undefined => anchors.get(id);
export const remeasureCoach = (id: string) => measurers.get(id)?.();

/** 설명 카드가 들어갈 수 있는 화면 아래 끝 — 아래 메뉴(탭바)·안드로이드 하단 버튼 영역을 뺀다
 *  (오너 2026-10-15 "튜토리얼이 아래 메뉴에 가려서 안 보이자나", 갤럭시). */
export const coachUsableBottom = (height: number, insetBottom: number, hasTabBar: boolean) =>
  height - insetBottom - (hasTabBar ? chrome.tabBarH + chrome.tabBarBottom : 0) - 12;

export function CoachHost({ keys, hasTabBar = false }: { keys: string[]; hasTabBar?: boolean }) {
  const { coachStep, coachIndex, coachTotal, advanceCoach, skipCoach } = useApp21();
  const focused = useIsFocused();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [, setTick] = useState(0);
  const [bubbleH, setBubbleH] = useState(160);
  useEffect(() => {
    const f = () => setTick((n) => n + 1);
    listeners.add(f);
    return () => { listeners.delete(f); };
  }, []);
  // 단계가 바뀌면 그 자리를 다시 잰다(스크롤로 움직였을 수 있다).
  useEffect(() => { if (coachStep) measurers.get(coachStep.key)?.(); }, [coachStep]);

  if (!focused || !coachStep || !keys.includes(coachStep.key)) return null;
  let rect = anchors.get(coachStep.key);
  if (!rect && coachStep.key === "cameraTab") {
    // 탭 3개 중 가운데(카메라·필터)
    const w = (width - chrome.tabBarSide * 2) / 3;
    rect = { x: chrome.tabBarSide + w + 8, y: height - insets.bottom - chrome.tabBarBottom - chrome.tabBarH, w: w - 16, h: chrome.tabBarH };
  }
  if (!rect) return null;
  const hx = rect.x - 6, hy = rect.y - 6, hw = rect.w + 12, hh = rect.h + 12, r = 16;
  const hole = `M${hx + r},${hy} H${hx + hw - r} A${r},${r} 0 0 1 ${hx + hw},${hy + r} V${hy + hh - r} A${r},${r} 0 0 1 ${hx + hw - r},${hy + hh} H${hx + r} A${r},${r} 0 0 1 ${hx},${hy + hh - r} V${hy + r} A${r},${r} 0 0 1 ${hx + r},${hy} Z`;
  const d = `M0,0 H${width} V${height} H0 Z ${hole}`;
  // 카드는 자리 아래가 기본, 아래 메뉴와 겹치면 위로. 어느 쪽이든 화면 안(상단 안전영역 ~ 아래 메뉴 위)에 가둔다.
  const bottomLimit = coachUsableBottom(height, insets.bottom, hasTabBar);
  const below = hy + hh + 12 + bubbleH <= bottomLimit;
  const want = below ? hy + hh + 12 : hy - 12 - bubbleH;
  const top = Math.min(Math.max(insets.top + 8, want), bottomLimit - bubbleH);
  const last = coachIndex + 1 === coachTotal;
  return (
    <Animated.View style={StyleSheet.absoluteFill} entering={FadeIn.duration(250)} exiting={FadeOut.duration(200)} pointerEvents="box-none">
      {/* 화면 전체에서 설명할 자리만 뚫는다(짝홀 채우기). 뒤는 못 누르게 막는다. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={() => undefined}>
        <Svg width={width} height={height}>
          <Path d={d} fill="rgba(0,0,0,0.62)" fillRule="evenodd" />
        </Svg>
      </Pressable>
      <View style={[styles.bubble, { top }]} onLayout={(e) => { const h = Math.ceil(e.nativeEvent.layout.height); if (Math.abs(h - bubbleH) > 2) setBubbleH(h); }}>
        <Text size="headline">{coachStep.title}</Text>
        <Text size="callout" tone="muted">{coachStep.text}</Text>
        <View style={styles.row}>
          {coachTotal > 1 ? (
            <Pressable accessibilityRole="button" onPress={skipCoach} hitSlop={8}>
              <Text size="callout" weight="semibold" tone="muted">{c21.coachSkip}</Text>
            </Pressable>
          ) : <View />}
          {coachTotal > 1 ? <Text size="footnote" tone="subtle" tabular>{`${coachIndex + 1}/${coachTotal}`}</Text> : <View />}
          <Pressable accessibilityRole="button" onPress={advanceCoach} style={styles.next}>
            <Text size="callout" weight="semibold" style={{ color: "#FFFFFF" }}>
              {coachTotal <= 1 ? c21.coachGotIt : last ? c21.coachStart : c21.coachNext}
            </Text>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  bubble: {
    position: "absolute", left: space.screen, right: space.screen,
    backgroundColor: color.card, borderRadius: radius.sheet, padding: space.s4, gap: space.s2,
    shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 12,
  },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space.s1 },
  next: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: radius.pill, backgroundColor: color.accent },
}));
