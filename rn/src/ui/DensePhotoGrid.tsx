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

// 카테고리 화면의 빽빽한 사진 격자 — 핀치로 3열 ↔ 5열(두 단계만). iOS 2.0 과 같은 동작.
// 2.1: 탭 = 크게 보기(필름스트립), 길게 누르기(0.35초) = 담기/빼기 — **0.35초가 차는 순간**(손 떼기 전)
// 무거운 햅틱과 함께 담긴다(iOS TileLongPressGesture). 셀카 한 장으로 못 만드는 컨셉은 담지 않고 알려 준다.
// 담긴 칸은 강조색 테두리 + 순서 번호.

const GAP = 4;
const NARROW = 3;
const WIDE = 5;
/** 문턱 — "조금 벌린 것"에는 반응하지 않되 한 번의 자연스러운 핀치로는 확실히 넘는 값. */
const ZOOM_IN = 1.25;
const ZOOM_OUT = 0.8;
/** 열 바뀜을 덮는 크로스페이드 길이. */
const FADE_MS = 240;

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
}: {
  items: Concept[];
  onOpen: (c: Concept) => void;
  /** 캡처·검증용 — 5열로 바로 띄운다(에뮬레이터엔 핀치가 없다). */
  startWide?: boolean;
}) {
  const { width } = useWindowDimensions();
  const { isGenerated, isFavoriteConcept } = useStore();
  const { cartIndex, toggleCart, toast } = useApp21();
  const [wide, setWide] = useState(!!startWide);
  /** 사라지는 쪽 격자의 열 수. 전환하는 동안만 값이 있고, 위에 겹쳐서 흐려진다. */
  const [fadingCols, setFadingCols] = useState<number | null>(null);
  const fade = useSharedValue(0);
  /** 핀치 도중에는 탭을 무시한다 — 손을 뗀 지점이 탭으로 잡혀 엉뚱한 사진이 열린다. */
  const pinching = useRef(false);

  const cols = wide ? WIDE : NARROW;

  // 5열로 좁히면 화면에 칸이 세 배 가까이 늘어난다. 미리 받아 두지 않으면 그 칸들이 빈 바탕으로
  // 있다가 하나씩 뜬다. 썸네일은 장당 수십 KB라 한 화면 분량은 미리 받아 두는 게 낫다.
  React.useEffect(() => {
    Image.prefetch(items.slice(0, 60).map((c) => conceptThumb(c)), { cachePolicy: "memory-disk" }).catch(() => {});
  }, [items]);

  /**
   * 열 수를 바꾼다 — **배치는 한 번에 갈아끼우고, 옛 화면을 위에 겹쳐 흐린다.**
   *
   * 네이티브 사진 앱이 정확히 이렇게 한다(오너가 전환 순간을 캡처해 왔다 — 타일 자리는 이미 최종
   * 배열이고 칸 안에서 두 사진이 겹쳐 있었다). 자리를 옮기는 게 아니라 **크로스페이드**다.
   * 칸마다 제 자리로 움직이게도 해 봤는데(iOS 에서 `Layout` 까지 짰다) 이동 거리가 제각각이라
   * 중간 프레임이 계단처럼 벌어진다. 사진 앱이 그 방식을 안 쓰는 이유다.
   */
  const step = useCallback(
    (next: boolean) => {
      setFadingCols(next ? NARROW : WIDE);
      fade.value = 1;
      setWide(next);
      fade.value = withTiming(0, { duration: FADE_MS, easing: ease.standard }, (done) => {
        if (done) runOnJS(setFadingCols)(null);
      });
      Haptics.selectionAsync().catch(() => {});
    },
    [fade],
  );

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

  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .onStart(() => {
          runOnJS(setPinching)(true);
        })
        .onUpdate((e) => {
          // 문턱을 넘는 **즉시** 바꾼다(손을 뗄 때가 아니라) — 사진 앱도 핀치 도중에 열이 바뀐다.
          if (e.scale >= ZOOM_IN) runOnJS(step)(false);
          else if (e.scale <= ZOOM_OUT) runOnJS(step)(true);
        })
        .onFinalize(() => {
          // 떼는 순간의 잔여 터치가 탭으로 새지 않게 한 박자 뒤에 푼다.
          runOnJS(releasePinchSoon)();
        }),
    [step, setPinching, releasePinchSoon],
  );

  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

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
        {grid(cols, true)}
        {fadingCols !== null ? (
          // 자리를 차지하지 않게 절대배치로 얹는다 — 아래 새 배치가 스크롤 높이를 정한다.
          <Animated.View style={[styles.fadeLayer, fadeStyle]} pointerEvents="none">
            {grid(fadingCols, false)}
          </Animated.View>
        ) : null}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: space.screen, paddingTop: space.s2 },
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
