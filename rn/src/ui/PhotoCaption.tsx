import React from "react";
import { Text as RNText, View } from "react-native";

/**
 * 사진 안 왼쪽 아래 이름 — 아래쪽만 살짝 어둡게 깔고 흰 굵은 글씨(사진 앱 "앨범"처럼, 오너 2026-10-11).
 * iOS `PhotoCaption` 과 같은 처리. 그라데이션은 RN 0.76+ `experimental_backgroundImage`.
 */
export function PhotoCaption({ title, subtitle, size = 15 }: { title: string; subtitle?: string; size?: number }) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute", left: 0, right: 0, bottom: 0,
        paddingHorizontal: 10, paddingBottom: 9, paddingTop: 28,
        experimental_backgroundImage: "linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,0.55))",
      }}
    >
      <RNText numberOfLines={2} style={{ color: "#fff", fontSize: size, fontWeight: "700", textShadowColor: "rgba(0,0,0,0.35)", textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } }}>{title}</RNText>
      {subtitle ? <RNText style={{ color: "rgba(255,255,255,0.85)", fontSize: size - 4, fontWeight: "500", marginTop: 1 }}>{subtitle}</RNText> : null}
    </View>
  );
}
