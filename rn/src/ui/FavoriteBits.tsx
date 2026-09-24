import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import * as Haptics from "expo-haptics";
import { Text } from "./Text";
import { IconCheck, IconStar } from "./icons";
import { color } from "@/theme/tokens";
import { copy } from "@/lib/copy";

// 즐겨찾기 별 · "이미 만든 컨셉" 표시 — iOS 2.0 과 같은 모양(오너 지시 2026-09-22).

/** 사진 위가 아니라 **상단바**에 놓는 별(카테고리 화면·브라우저 오른쪽 위). */
export function FavoriteStarButton({ on, onPress }: { on: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={on ? copy.ui.unfavorite : copy.ui.favorite}
      hitSlop={12}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={styles.starBtn}
    >
      <IconStar size={24} color={on ? STAR : color.ink} filled={on} />
    </Pressable>
  );
}

/** 사진 **위에** 얹는 별 — 사진 밝기와 무관하게 보이도록 어두운 원 안에 둔다. */
export function FavoriteBadge({ size = 22 }: { size?: number }) {
  return (
    <View
      accessibilityLabel={copy.ui.favorite}
      style={[styles.badge, { width: size, height: size, borderRadius: size / 2 }]}
    >
      <IconStar size={16} color={STAR} filled />
    </View>
  );
}

/**
 * "이미 만들어 본 컨셉" 표시 — 아래쪽 반투명 그라데이션 + 체크.
 * 사진을 가리지 않을 만큼만 덮는다(오너 지시: "한 눈에 알 수 있도록").
 */
export function GeneratedScrim({ compact }: { compact?: boolean }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityLabel={copy.ui.generated}>
      <Svg style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="genScrim" x1="0" y1="0.45" x2="0" y2="1">
            <Stop offset="0" stopColor="#000" stopOpacity="0" />
            <Stop offset="1" stopColor="#000" stopOpacity="0.55" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#genScrim)" />
      </Svg>
      {compact ? (
        <View style={styles.checkOnly}>
          <IconCheck size={16} color="#FFFFFF" />
        </View>
      ) : (
        <View style={styles.genLabel}>
          <IconCheck size={16} color="#FFFFFF" />
          <Text size="footnote" style={styles.genText}>{copy.ui.generatedShort}</Text>
        </View>
      )}
    </View>
  );
}

/** 즐겨찾기 별의 노란색 — 사진 위에서도 눈에 띄어야 해서 강조색과 별개로 둔다. */
const STAR = "#F5B301";

const styles = StyleSheet.create({
  starBtn: { alignItems: "center", justifyContent: "center", width: 32, height: 32 },
  badge: { alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.35)" },
  genLabel: {
    position: "absolute",
    left: 6,
    bottom: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  genText: { color: "#FFFFFF" },
  checkOnly: { position: "absolute", left: 4, bottom: 4 },
});
