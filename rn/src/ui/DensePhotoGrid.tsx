import React, { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { Thumb, photoHeight } from "./Thumb";
import { thumbUrl, type Concept } from "@/lib/concepts";
import { radius, space } from "@/theme/tokens";
import { ease } from "@/theme/motion";

// 카테고리 화면의 빽빽한 사진 격자 — 핀치로 3열 ↔ 5열(두 단계만). iOS 2.0 과 같은 동작.

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
    Image.prefetch(items.slice(0, 60).map((c) => thumbUrl(c.id)), { cachePolicy: "memory-disk" }).catch(() => {});
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
          runOnJS(setTimeout)(() => setPinching(false), 250);
        }),
    [step, setPinching],
  );

  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  const grid = (n: number, interactive: boolean) => {
    const w = tileWidth(width, n);
    const h = photoHeight(w);
    const r = n === WIDE ? 6 : radius.thumb;
    return (
      <View style={[styles.grid, { gap: GAP }]}>
        {items.map((c) => (
          <Pressable
            key={String(c.id)}
            accessibilityRole="button"
            accessibilityLabel={c.title}
            // ⚠️ 막는 시점이 **누를 때가 아니라 동작할 때**다. 손가락이 닿는 순간엔 이미 늦다 —
            //    그때 핀치가 시작될지 알 수 없기 때문이다(iOS 에서 같은 실수를 했다).
            onPress={() => {
              if (pinching.current || !interactive) return;
              onOpen(c);
            }}
          >
            <Thumb uri={thumbUrl(c.id)} width={w} height={h} rounded={r} />
          </Pressable>
        ))}
      </View>
    );
  };

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
});
