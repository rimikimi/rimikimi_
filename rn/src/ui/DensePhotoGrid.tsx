import React, { useCallback, useMemo, useRef, useState } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { Thumb, photoHeight } from "./Thumb";
import { FavoriteBadge, GeneratedScrim } from "./FavoriteBits";
import { Text } from "./Text";
import { CoachAnchor } from "./Coach";
import { conceptThumb, conceptTitle, isBatchable, type Concept } from "@/lib/concepts";
import { useStore } from "@/lib/store";
import { useApp21 } from "@/lib/app21";
import { c21 } from "@/lib/copy21";
import { color } from "@/theme/tokens";
import { radius, space } from "@/theme/tokens";
import { ease } from "@/theme/motion";

// 카테고리 화면의 빽빽한 사진 격자 — 핀치로 3열 ↔ 5열(두 단계만). 손가락을 따라 줄고 커지며 겹쳐 바뀐다(iOS 71 과 같은 동작).
// 2.1: 탭 = 크게 보기(필름스트립), 길게 누르기(0.35초) = 담기/빼기 — **0.35초가 차는 순간**(손 떼기 전)
// 무거운 햅틱과 함께 담긴다(iOS TileLongPressGesture). 셀카 한 장으로 못 만드는 컨셉은 담지 않고 알려 준다.
// 담긴 칸은 강조색 테두리 + 순서 번호.

const GAP = 4;
const NARROW = 3;
const WIDE = 5;

/**
 * ⚠️ **내림**해야 한다. 나눠떨어지지 않으면 타일 폭 합이 가용 폭을 소수점만큼 넘어서
 *    `flexWrap` 이 마지막 칸을 다음 줄로 밀어 버린다 — 3열이 2열로 보였다(실측).
 */
function tileWidth(screenW: number, cols: number): number {
  return Math.floor((screenW - space.screen * 2 - GAP * (cols - 1)) / cols);
}

export function DensePhotoGrid({
  items,
  onOpen,
  startWide,
  pinchPreview,
}: {
  items: Concept[];
  onOpen: (c: Concept) => void;
  /** 캡처·검증용 — 5열로 바로 띄운다(에뮬레이터엔 핀치가 없다). */
  startWide?: boolean;
  /** 캡처·검증용 — 핀치 도중 배율(예 0.8)로 멈춘 화면을 띄운다. */
  pinchPreview?: number;
}) {
  const { width } = useWindowDimensions();
  const { isGenerated, isFavoriteConcept } = useStore();
  const { cartIndex, toggleCart, toast } = useApp21();
  const [wide, setWide] = useState(!!startWide);
  /** 핀치하는 동안 위에 겹쳐 서서히 드러나는 다음 열 수의 격자. 핀치 시작 때 붙이고 끝나면 뗀다. */
  const [target, setTarget] = useState<number | null>(null);
  /** 핀치 도중에는 탭을 무시한다 — 손을 뗀 지점이 탭으로 잡혀 엉뚱한 사진이 열린다. */
  const pinching = useRef(false);

  const cols = wide ? WIDE : NARROW;
  const other = wide ? NARROW : WIDE;

  // iOS ConceptCards 와 같은 방식(오너 2026-10-15·16 녹화 "손가락 끝까지 따라붙고, 뒤에 남은 것도 페이드"):
  // 지금 격자는 손가락 배율 그대로 두 손가락 가운데를 기준으로 줄고/커지고, 다음 열 수의 격자가 같은 점을
  // 기준으로 겹쳐 진행 후반(0.3→0.85)에 비쳐 나오며, 그만큼 뒤 격자도 같이 흐려진다.
  const fromCols = useSharedValue(cols);
  const liveScale = useSharedValue(1);
  const nextScale = useSharedValue(1);
  const nextOpacity = useSharedValue(0);
  const baseFade = useSharedValue(1);
  const ox = useSharedValue(0);
  const oy = useSharedValue(0);
  /** 손을 뗀 뒤 넘어가기로 한 열 수 — 상태가 바뀐 다음 프레임에 겹친 장을 뗀다. */
  const committing = useRef<number | null>(null);

  React.useEffect(() => { fromCols.value = cols; }, [cols, fromCols]);

  // 5열로 좁히면 화면에 칸이 세 배 가까이 늘어난다. 미리 받아 두지 않으면 그 칸들이 빈 바탕으로
  // 있다가 하나씩 뜬다. 썸네일은 장당 수십 KB라 한 화면 분량은 미리 받아 두는 게 낫다.
  React.useEffect(() => {
    Image.prefetch(items.slice(0, 60).map((c) => conceptThumb(c)), { cachePolicy: "memory-disk" }).catch(() => {});
  }, [items]);

  // 넘어간 뒤: 아래 장이 새 열 수로 다시 그려졌다(위 장과 똑같은 모습) → 아래를 원래대로 돌리고,
  // 한 프레임 뒤에 위 장을 뗀다. 같은 프레임에 둘 다 바꾸면 한 프레임 허옇게 뜬다(iOS 에서 확인).
  React.useLayoutEffect(() => {
    if (committing.current == null) return;
    committing.current = null;
    liveScale.value = 1;
    baseFade.value = 1;
    requestAnimationFrame(() => {
      nextOpacity.value = 0;
      nextScale.value = 1;
      setTarget(null);
    });
  }, [wide, liveScale, baseFade, nextOpacity, nextScale]);

  const commit = useCallback((to: number) => {
    committing.current = to;
    setWide(to === WIDE);
    Haptics.selectionAsync().catch(() => {});
  }, []);
  const dropTarget = useCallback(() => setTarget(null), []);

  const setPinching = useCallback((v: boolean) => {
    pinching.current = v;
  }, []);
  /** 떼는 순간의 잔여 터치가 탭으로 새지 않게 한 박자 뒤에 푼다(JS 쪽에서 타이머를 건다).
   *  ⚠️ 워크릿 안에서 `runOnJS(setTimeout)(() => …)` 처럼 그 자리에서 만든 함수를 넘기면
   *     worklets 0.10 이 "Locally defined function passed to scheduleOnRN" 으로 앱을 죽인다
   *     (2.1 에뮬레이터에서 첫 터치에 재현). JS 함수 하나를 통째로 넘긴다. */
  const releasePinchSoon = useCallback(() => {
    setTimeout(() => { pinching.current = false; }, 250);
  }, []);
  const startPinch = useCallback((to: number) => {
    pinching.current = true;
    setTarget(to);
  }, []);

  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .onStart((e) => {
          // 격자 좌표의 핀치 중심(시작 순간 고정). 바깥 여백만큼 뺀다.
          ox.value = e.focalX - space.screen;
          oy.value = e.focalY - space.s2;
          const from = fromCols.value;
          runOnJS(startPinch)(from === NARROW ? WIDE : NARROW);
        })
        .onUpdate((e) => {
          const s = e.scale;
          const from = fromCols.value;
          const to = s < 1 ? (from === NARROW ? WIDE : 0) : s > 1 ? (from === WIDE ? NARROW : 0) : 0;
          if (!to) {
            // 더 갈 단계가 없는 쪽 — 고무줄처럼 살짝만.
            nextOpacity.value = 0;
            baseFade.value = 1;
            liveScale.value = 1 + (s - 1) * 0.12;
            return;
          }
          const r = from / to; // 3→5 = 0.6, 5→3 ≈ 1.67
          const p = Math.min(1, Math.max(0, (s - 1) / (r - 1)));
          liveScale.value = 1 + p * (r - 1);
          nextScale.value = liveScale.value / r; // 다음 격자는 끝에서 정확히 1배
          const f = Math.min(1, Math.max(0, (p - 0.3) / 0.55));
          nextOpacity.value = f * f * (3 - 2 * f);
          baseFade.value = 1 - nextOpacity.value;
        })
        .onEnd((e) => {
          const from = fromCols.value;
          const to = from === NARROW ? WIDE : NARROW;
          const r = from / to;
          const p = Math.min(1, Math.max(0, (liveScale.value - 1) / (r - 1)));
          const flick = to === WIDE ? e.velocity < -0.6 : e.velocity > 0.6;
          const cfg = { duration: 260, easing: ease.standard };
          if (p > 0.5 || flick) {
            nextScale.value = withTiming(1, cfg);
            nextOpacity.value = withTiming(1, cfg);
            baseFade.value = withTiming(0, cfg);
            liveScale.value = withTiming(r, cfg, (done) => {
              if (done) runOnJS(commit)(to);
            });
          } else {
            nextScale.value = withTiming(1 / r, { duration: 240, easing: ease.standard });
            nextOpacity.value = withTiming(0, { duration: 240, easing: ease.standard });
            baseFade.value = withTiming(1, { duration: 240, easing: ease.standard });
            liveScale.value = withTiming(1, { duration: 240, easing: ease.standard }, (done) => {
              if (done) runOnJS(dropTarget)();
            });
          }
        })
        .onFinalize(() => {
          runOnJS(releasePinchSoon)();
        }),
    [fromCols, liveScale, nextScale, nextOpacity, baseFade, ox, oy, startPinch, commit, dropTarget, releasePinchSoon],
  );

  // 검증용 — 핀치 도중 한 장면으로 멈춘다(에뮬레이터엔 두 손가락이 없다).
  React.useEffect(() => {
    if (!pinchPreview) return;
    const from = cols, to = other, s = pinchPreview;
    setTarget(to);
    ox.value = (width - space.screen * 2) / 2; oy.value = 300;
    const r = from / to;
    const p = Math.min(1, Math.max(0, (s - 1) / (r - 1)));
    liveScale.value = 1 + p * (r - 1);
    nextScale.value = liveScale.value / r;
    const f = Math.min(1, Math.max(0, (p - 0.3) / 0.55));
    nextOpacity.value = f * f * (3 - 2 * f);
    baseFade.value = 1 - nextOpacity.value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinchPreview]);

  const baseStyle = useAnimatedStyle(() => ({
    opacity: baseFade.value,
    transformOrigin: [ox.value, oy.value, 0],
    transform: [{ scale: liveScale.value }],
  }));
  const nextStyle = useAnimatedStyle(() => ({
    opacity: nextOpacity.value,
    transformOrigin: [ox.value, oy.value, 0],
    transform: [{ scale: nextScale.value }],
  }));

  /** 길게 누르기 = 담기/빼기. 핀치 중이면 무시. */
  const onLong = useCallback((c: Concept) => {
    if (pinching.current) return;
    if (isBatchable(c)) toggleCart(c, true);
    else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      toast(c21.cartNeedsOptions);
    }
  }, [toggleCart, toast]);
  const onTap = useCallback((c: Concept) => {
    // ⚠️ 막는 시점이 **누를 때가 아니라 동작할 때**다(iOS 에서 같은 실수를 했다).
    if (pinching.current) return;
    onOpen(c);
  }, [onOpen]);

  const grid = (n: number, interactive: boolean) => {
    const w = tileWidth(width, n);
    const h = photoHeight(w);
    const r = n === WIDE ? 6 : radius.thumb;
    return (
      <View style={[styles.grid, { gap: GAP }]}>
        {items.map((c, i) => {
          const tile = (
            <View style={{ width: w, height: h, borderRadius: r, overflow: "hidden" }}>
              <Thumb uri={conceptThumb(c)} width={w} height={h} rounded={r} />
              {isGenerated(c.id) ? <GeneratedScrim compact={n === WIDE} /> : null}
              {isFavoriteConcept(c.id) ? (
                <View style={styles.badge}>
                  <FavoriteBadge size={n === WIDE ? 16 : 20} />
                </View>
              ) : null}
              <CartMark index={cartIndex(c)} wide={n === WIDE} r={r} />
            </View>
          );
          if (!interactive) return <View key={String(c.id)}>{tile}</View>;
          const body = (
            <Tile key={String(c.id)} concept={c} onTap={onTap} onLong={onLong}>{tile}</Tile>
          );
          return i === 0 ? <CoachAnchor key={String(c.id)} id="firstTile">{body}</CoachAnchor> : body;
        })}
      </View>
    );
  };

  if (!items.length) {
    return <View style={styles.empty}><Text tone="muted">{c21.noResults}</Text></View>;
  }

  return (
    <GestureDetector gesture={pinch}>
      <View style={styles.wrap}>
        <Animated.View style={baseStyle}>{grid(cols, true)}</Animated.View>
        {target !== null ? (
          // 자리를 차지하지 않게 절대배치로 얹는다 — 아래 지금 배치가 스크롤 높이를 정한다.
          <Animated.View style={[styles.fadeLayer, nextStyle]} pointerEvents="none">
            {grid(target, false)}
          </Animated.View>
        ) : null}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  // 핀치로 커지는 격자가 위 제목줄을 덮지 않게 자른다.
  wrap: { paddingHorizontal: space.screen, paddingTop: space.s2, overflow: "hidden" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  fadeLayer: { position: "absolute", left: space.screen, right: space.screen, top: space.s2 },
  // 즐겨찾기 별은 왼쪽 위 — 오른쪽 위는 담기 번호 자리(iOS 와 같다).
  badge: { position: "absolute", top: 4, left: 4 },
  empty: { paddingVertical: space.s7, alignItems: "center" },
});

/** 담긴 칸 — 강조색 테두리 + 순서 번호(5열이면 작게). */
function CartMark({ index, wide, r }: { index: number; wide: boolean; r: number }) {
  if (index < 0) return null;
  const d = wide ? 18 : 22;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: r, borderWidth: 3, borderColor: color.accent }]}>
      <View style={{ position: "absolute", top: wide ? 3 : 6, right: wide ? 3 : 6, minWidth: d, height: d, borderRadius: d / 2, paddingHorizontal: 4, backgroundColor: color.accent, alignItems: "center", justifyContent: "center" }}>
        <Text size="caption" weight="bold" style={{ color: "#FFFFFF", fontSize: wide ? 10 : 12 }}>{String(index + 1)}</Text>
      </View>
    </View>
  );
}

/**
 * 한 칸의 제스처 — 탭과 길게 누르기를 **배타적으로**(길게 누른 뒤 손 떼기가 탭으로 새지 않게).
 * 길게 누르기는 `onStart` = 0.35초가 찬 순간(손 떼기 전)에 돈다. 손가락이 움직이면 실패해
 * 스크롤·핀치로 넘어간다.
 */
function Tile({ concept, onTap, onLong, children }: { concept: Concept; onTap: (c: Concept) => void; onLong: (c: Concept) => void; children: React.ReactNode }) {
  const gesture = useMemo(() => {
    const long = Gesture.LongPress().minDuration(350).maxDistance(10).onStart(() => { runOnJS(onLong)(concept); });
    const tap = Gesture.Tap().maxDuration(350).onEnd((_e, ok) => { if (ok) runOnJS(onTap)(concept); });
    return Gesture.Exclusive(long, tap);
  }, [concept, onTap, onLong]);
  return (
    <GestureDetector gesture={gesture}>
      <View accessible accessibilityRole="button" accessibilityLabel={conceptTitle(concept)} collapsable={false}>{children}</View>
    </GestureDetector>
  );
}
