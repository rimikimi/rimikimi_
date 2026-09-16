import React from "react";
import { Text as RNText, type TextProps as RNTextProps, StyleSheet } from "react-native";
import { color, font, roleWeight, type as typeScale, weight } from "@/theme/tokens";

// Type primitives. Feature code may not set a raw fontSize — everything goes through
// `Text`. size + lineHeight + tracking travel together as a set (SPEC §1 타입 행).
// Face = SYSTEM font (Roboto / Noto Sans KR resolved per glyph by the OS). `fontFamily`
// is never set; `fontWeight` carries the weight.

type Size = keyof typeof typeScale;
type Tone = "default" | "muted" | "subtle" | "onAccent" | "accent" | "danger";
type Weight = keyof typeof weight;

const tones: Record<Tone, string> = {
  default: color.ink,
  muted: color.ink2,
  subtle: color.ink3,
  onAccent: color.accentOn,
  accent: color.accent,
  danger: color.danger,
};

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
        { color: tones[tone], fontWeight: weight[ww], fontFamily: font[ww] },
        tabular && styles.tabular,
        center && styles.center,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  tabular: { fontVariant: ["tabular-nums"] },
  center: { textAlign: "center" },
});
