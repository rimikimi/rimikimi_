import React from "react";
import { Text as RNText, type TextProps as RNTextProps, StyleSheet } from "react-native";
import { color, font, roleWeight, themedStyles, type as typeScale, weight } from "@/theme/tokens";

// Type primitives. Feature code may not set a raw fontSize — everything goes through
// `Text`. size + lineHeight + tracking travel together as a set (SPEC §1 타입 행).
// Face = SYSTEM font (Roboto / Noto Sans KR resolved per glyph by the OS). `fontFamily`
// is never set; `fontWeight` carries the weight.

type Size = keyof typeof typeScale;
type Tone = "default" | "muted" | "subtle" | "onAccent" | "accent" | "danger";
type Weight = keyof typeof weight;

// ⚠️ 렌더 시점에 계산한다 — 모듈 스코프에 두면 다크 모드 전환 때 값이 안 바뀐다(색은
// `color` 객체 하나를 계속 mutate 하는 방식이라, 최초 import 시점 값이 그대로 굳어버린다).
function toneColor(t: Tone): string {
  switch (t) {
    case "muted": return color.ink2;
    case "subtle": return color.ink3;
    case "onAccent": return color.accentOn;
    case "accent": return color.accent;
    case "danger": return color.danger;
    default: return color.ink;
  }
}

export interface TextProps extends RNTextProps {
  size?: Size;
  tone?: Tone;
  /** 생략하면 SPEC 롤 기본 굵기(Title2 700 · Headline 600 · Footnote 500 · Caption 600). */
  weight?: Weight;
  /** credits, counts and dimensions must not jitter as digits change */
  tabular?: boolean;
  center?: boolean;
}

export function Text({ size = "body", tone = "default", weight: w, tabular, center, style, ...rest }: TextProps) {
  const ww = w ?? roleWeight[size];
  return (
    <RNText
      {...rest}
      style={[
        typeScale[size],
        { color: toneColor(tone), fontWeight: weight[ww], fontFamily: font[ww] },
        tabular && styles.tabular,
        center && styles.center,
        style,
      ]}
    />
  );
}

const styles = themedStyles(() => StyleSheet.create({
  tabular: { fontVariant: ["tabular-nums"] },
  center: { textAlign: "center" },
}));
