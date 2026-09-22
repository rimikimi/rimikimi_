import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Screen } from "@/ui/Screen";
import { AppHeader } from "@/ui/AppHeader";
import { Button } from "@/ui/Button";
import { Text } from "@/ui/Text";
import { Thumb, photoHeight } from "@/ui/Thumb";
import { useStore } from "@/lib/store";
import { byNewest, categoriesOf, thumbUrl, type Concept } from "@/lib/concepts";
import { color, radius, space } from "@/theme/tokens";
import { ease } from "@/theme/motion";

// 카테고리 안의 사진을 훑어보는 화면 — 큰 사진 + 아래 필름스트립(네이티브 사진 앱 방식).
// iOS 2.0 에 있던 화면을 안드로이드에 옮긴 것(오너 지시 2026-09-22 "안드로이드도 동일하게").
//
// 들어 있는 동작
//  · 아래로 끌어내리면 화면이 따라 내려가며 작아지고 격자로 돌아간다.
//  · 필름스트립을 끌면 큰 사진이 따라 바뀌고(스크러빙), 큰 사진을 넘겨도 스트립이 따라온다.
//  · 열자마자 **선택한 칸이 가운데**에 온다.

const STRIP_W = 52;
const STRIP_GAP = 8;
/** 이만큼 내리면 닫는다. */
const DISMISS_Y = 140;

export default function BrowseScreen() {
  const { name, start } = useLocalSearchParams<{ name: string; start?: string }>();
  const { concepts } = useStore();
  const { width } = useWindowDimensions();

  const items = useMemo(
    () => concepts.filter((c) => categoriesOf(c).includes(name ?? "")).sort(byNewest),
    [concepts, name],
  );
  const startIndex = Math.max(0, items.findIndex((c) => String(c.id) === String(start)));
  const [index, setIndex] = useState(startIndex < 0 ? 0 : startIndex);
  const current: Concept | undefined = items[index];

  const pager = useRef<FlatList<Concept>>(null);
  const strip = useRef<FlatList<Concept>>(null);
  /**
   * ⚠️ **사람이 끄는 중일 때만** 상대를 따라 움직인다.
   *
   * 이 구분이 없으면 되먹임 고리가 생긴다 — 스트립을 프로그램으로 옮기면 그 `onScroll` 이
   * 페이저를 옮기고, 페이저의 `onScroll` 이 다시 스트립을 옮긴다. 서로 밀치다 엉뚱한 데서
   * 멈춰서, 고른 칸이 화면 **맨 오른쪽**에 붙어 있었다(실측). 프로그램 스크롤은 `BeginDrag` 가
   * 없으므로 이 깃발로 정확히 갈린다.
   */
  const pagerDriving = useRef(false);
  const stripDriving = useRef(false);

  const dragY = useSharedValue(0);

  const sideInset = Math.max(0, (width - STRIP_W) / 2);

  /**
   * 선택 칸을 가운데로.
   *
   * ⚠️ 오프셋을 손으로 계산해 `scrollTo` 하면 안 된다. 내용 크기가 아직 최종값이 아니면 그 시점의
   *    최대값으로 **잘려서**, 고른 칸이 가운데가 아니라 오른쪽 끝에 붙는다(실측 3회). `FlatList` 는
   *    `getItemLayout` 으로 각 칸의 자리를 정확히 알고 있어 인덱스로 바로 간다.
   */
  // ⚠️ 목록이 비었을 때 부르면 `scrollToIndex out of range` 로 **앱이 죽는다**(실측).
  //    컨셉 목록은 화면보다 늦게 올 수 있으므로 매번 막아 준다.
  const canScroll = useCallback((i: number) => items.length > 0 && i >= 0 && i < items.length, [items.length]);

  const centerStrip = useCallback(
    (i: number, animated: boolean) => {
      if (!canScroll(i)) return;
      strip.current?.scrollToIndex({ index: i, animated, viewPosition: 0.5 });
    },
    [canScroll],
  );

  const goPager = useCallback(
    (i: number, animated: boolean) => {
      if (!canScroll(i)) return;
      pager.current?.scrollToIndex({ index: i, animated });
    },
    [canScroll],
  );

  /** 칸 크기가 일정하므로 자리를 계산해 줄 수 있다 — 그래야 아직 안 그려진 칸으로도 갈 수 있다. */
  const stripLayout = useCallback(
    (_: unknown, i: number) => ({ length: STRIP_W + STRIP_GAP, offset: (STRIP_W + STRIP_GAP) * i, index: i }),
    [],
  );
  const pagerLayout = useCallback(
    (_: unknown, i: number) => ({ length: width, offset: width * i, index: i }),
    [width],
  );

  /**
   * 자리 다시 맞추기 — 내용 크기가 바뀔 때마다 부른다.
   *
   * ⚠️ **한 번만 하면 안 된다.** 스트립 내용은 한 번에 최종 크기가 되지 않아서, 첫 호출 때
   *    `scrollTo` 가 그 시점의 작은 최대값으로 **잘린다**. 그래서 고른 칸이 가운데가 아니라
   *    오른쪽 끝에 붙어 있었다(실측 2회). 사람이 끄는 중이 아니면 그때마다 다시 맞춘다.
   */
  // ⚠️ 컨셉 목록은 화면이 그려진 **뒤에** 올 수 있다. 그때 `startIndex` 가 비로소 제 값이 되므로
  //    고른 칸도 다시 맞춘다 — 안 하면 목록이 늦은 경우 늘 첫 장이 열린다(실측).
  useEffect(() => { setIndex(startIndex); }, [startIndex]);

  /**
   * 고른 칸이 바뀌면 둘 다 그 자리로 — **사람이 끄는 중이 아닐 때만**.
   *
   * ⚠️ `contentOffset` 으로 첫 위치를 못박으려 했는데 **안드로이드 `ScrollView` 는 그걸 무시한다**
   *    (실측 — 늘 0 에서 시작했다). `onContentSizeChange` 한 번만으로도 모자란다. 배치가 끝난
   *    다음 프레임에 직접 민다.
   */
  useEffect(() => {
    if (stripDriving.current || pagerDriving.current) return;
    const id = requestAnimationFrame(() => {
      goPager(index, false);
      centerStrip(index, false);
    });
    return () => cancelAnimationFrame(id);
  }, [index, goPager, centerStrip]);

  /** 사람이 큰 사진을 넘겼을 때만 — 스트립이 따라온다. */
  const onPagerScroll = useCallback(
    (x: number) => {
      if (!pagerDriving.current) return;
      const i = Math.round(x / width);
      if (i === index || i < 0 || i >= items.length) return;
      setIndex(i);
      centerStrip(i, true);
    },
    [index, items.length, width, centerStrip],
  );

  /** 사람이 스트립을 굴렸을 때만 — 큰 사진이 따라온다. 애니메이션 없이(여러 장 지날 때 끊기지 않게). */
  const onStripScroll = useCallback(
    (x: number) => {
      if (!stripDriving.current) return;
      const i = Math.round(x / (STRIP_W + STRIP_GAP));
      if (i === index || i < 0 || i >= items.length) return;
      setIndex(i);
      goPager(i, false);
    },
    [index, items.length, goPager],
  );

  const jump = useCallback(
    (i: number) => {
      Haptics.selectionAsync().catch(() => {});
      setIndex(i);
      goPager(i, true);
      centerStrip(i, true);
    },
    [goPager, centerStrip],
  );

  // 아래로 끌어 닫기. 가로 페이저와 싸우지 않도록 **세로로 더 많이 움직였을 때만** 잡는다.
  const close = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    router.back();
  }, []);

  const drag = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-999, 14])
        .failOffsetX([-20, 20])
        .onUpdate((e) => {
          // 위로는 거의 안 따라오게(고무줄) — 닫기는 아래 방향만이다.
          dragY.value = e.translationY > 0 ? e.translationY : e.translationY * 0.2;
        })
        .onEnd((e) => {
          if (dragY.value > DISMISS_Y || e.velocityY > 900) {
            runOnJS(close)();
          } else {
            dragY.value = withSpring(0, { damping: 18, stiffness: 220 });
          }
        }),
    [dragY, close],
  );

  const sheet = useAnimatedStyle(() => {
    const p = Math.min(1, Math.max(0, dragY.value / 300));
    return { transform: [{ translateY: dragY.value }, { scale: 1 - p * 0.14 }], opacity: 1 - p * 0.35 };
  });

  const bigH = photoHeight(width);

  return (
    <Screen scrollModel="fixed" header={<AppHeader title={name ?? ""} back right={<View />} />}>
      <GestureDetector gesture={drag}>
        <Animated.View style={[styles.body, sheet]}>
          <FlatList
            ref={pager}
            data={items}
            keyExtractor={(c) => String(c.id)}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            getItemLayout={pagerLayout}
            initialScrollIndex={items.length ? startIndex : undefined}
            onScrollBeginDrag={() => { pagerDriving.current = true; }}
            onMomentumScrollEnd={() => { pagerDriving.current = false; }}
            onScroll={(e) => onPagerScroll(e.nativeEvent.contentOffset.x)}
            onScrollToIndexFailed={() => {}}
            // 미리보기는 전부 3:4 — 큰 사진도 예외가 아니다.
            renderItem={({ item }) => (
              <Thumb uri={thumbUrl(item.id)} width={width} height={bigH} rounded={0} />
            )}
          />

          {current ? (
            <Text size="headline" numberOfLines={1} style={styles.title}>
              {current.title}
            </Text>
          ) : null}

          <FlatList
            ref={strip}
            data={items}
            keyExtractor={(c) => String(c.id)}
            horizontal
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            decelerationRate="fast"
            snapToInterval={STRIP_W + STRIP_GAP}
            getItemLayout={stripLayout}
            initialScrollIndex={items.length ? startIndex : undefined}
            // ⚠️ 없으면 고른 칸이 바뀌어도 줄이 다시 그려지지 않아 **테두리가 안 따라온다**(실측).
            //    `FlatList` 는 행을 메모이즈해서 바깥 상태 변화를 모른다.
            extraData={index}
            // ⚠️ 간격은 `gap` 이 아니라 칸의 `marginRight` 로 준다 — `getItemLayout` 이 말한 칸 크기와
            //    실제 배치가 **정확히** 같아야 인덱스로 가는 게 어긋나지 않는다.
            contentContainerStyle={{ paddingHorizontal: sideInset }}
            onScrollBeginDrag={() => { stripDriving.current = true; }}
            onMomentumScrollEnd={() => { stripDriving.current = false; }}
            onScroll={(e) => onStripScroll(e.nativeEvent.contentOffset.x)}
            onScrollToIndexFailed={() => {}}
            style={styles.strip}
            renderItem={({ item, index: i }) => (
              <Pressable accessibilityRole="button" accessibilityLabel={item.title} onPress={() => jump(i)}>
                <View style={{ marginRight: STRIP_GAP }}>
                  {/* 필름스트립 칸도 3:4 (오너 지시). 안 고른 칸을 흐리게 하지 않는다 — 사진 앱도 안 한다. */}
                  <Thumb uri={thumbUrl(item.id)} width={STRIP_W} rounded={radius.thumb - 2} />
                  {/* ⚠️ 테두리를 `borderWidth` 로 주면 안 된다. 칸이 4px 넓어져서 실제 배치가
                      `getItemLayout` 이 말한 크기와 어긋나고, 뒤로 갈수록 그 오차가 쌓여 고른 칸이
                      화면 밖으로 밀린다(54번째에서 216px 어긋났다 — 실측). 자리를 안 먹는 덧그림으로. */}
                  {i === index ? <View style={styles.ring} pointerEvents="none" /> : null}
                </View>
              </Pressable>
            )}
          />

          {current ? (
            <View style={styles.cta}>
              <Button
                label="이 컨셉으로 만들기"
                full
                onPress={() => router.push({ pathname: "/concept/[id]", params: { id: String(current.id) } })}
              />
            </View>
          ) : null}
        </Animated.View>
      </GestureDetector>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1 },
  title: { textAlign: "center", paddingTop: space.s3, paddingHorizontal: space.screen },
  strip: { flexGrow: 0, paddingVertical: space.s3 },
  ring: {
    position: "absolute",
    left: 0, right: 0, top: 0, bottom: 0,
    borderRadius: radius.thumb - 2,
    borderWidth: 2,
    borderColor: color.accent,
  },
  cta: { paddingHorizontal: space.screen, paddingBottom: space.s4 },
});
