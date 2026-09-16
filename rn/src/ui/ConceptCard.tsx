import React from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { Text } from "./Text";
import { thumbUrl, type Concept } from "@/lib/concepts";
import { color, radius, space } from "@/theme/tokens";
import { CARD_PRESS_SCALE, duration, ease } from "@/theme/motion";

// 컨셉 카드 — 3:4 썸네일 + 제목. 누름 0.985. 탭 = 옵션 화면 푸시(slide_from_right).

export function ConceptCard({ concept, width, onPress }: { concept: Concept; width: number; onPress?: () => void }) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const height = Math.round((width * 4) / 3);
  return (
    <Animated.View style={[{ width }, animated]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={concept.title}
        onPressIn={() => { scale.value = withTiming(CARD_PRESS_SCALE, { duration: duration.press, easing: ease.out }); }}
        onPressOut={() => { scale.value = withTiming(1, { duration: duration.pressRelease, easing: ease.out }); }}
        onPress={onPress ?? (() => router.push({ pathname: "/concept/[id]", params: { id: String(concept.id) } }))}
        style={{ gap: space.s2 }}
      >
        <Image
          source={{ uri: thumbUrl(concept.id) }}
          style={{ width, height, borderRadius: radius.thumb, backgroundColor: color.mat }}
          contentFit="cover"
          transition={duration.enter}
          cachePolicy="disk"
        />
        <Text size="footnote" numberOfLines={1}>{concept.title}</Text>
      </Pressable>
    </Animated.View>
  );
}

/** 가로 줄 — 제목(+더보기) 아래 카드들. 큰 줄(추천·새로 나왔어요)은 카드 폭 150, 카테고리 줄은 120. */
export function ConceptRail({ title, items, big, onMore }: { title: string; items: Concept[]; big?: boolean; onMore?: () => void }) {
  const w = big ? 150 : 120;
  if (!items.length) return null;
  return (
    <View style={styles.rail}>
      <View style={styles.railHead}>
        <Text size="headline">{title}</Text>
        {onMore ? (
          <Pressable accessibilityRole="button" onPress={onMore} hitSlop={8}>
            <Text size="footnote" tone="muted">더보기</Text>
          </Pressable>
        ) : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.railRow} overScrollMode="never">
        {items.map((c) => <ConceptCard key={String(c.id)} concept={c} width={w} />)}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: { gap: space.s3 },
  railHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.screen },
  railRow: { paddingHorizontal: space.screen, gap: space.s3 },
});
