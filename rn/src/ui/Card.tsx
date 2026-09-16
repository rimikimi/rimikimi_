import React from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { color, radius, space, themedStyles } from "@/theme/tokens";

// Card surface — 카드·행 #FFFFFF on 바탕, radius 14, no border, no shadow, no glass (SPEC §0·§1).
export function Card({ children, style, padded = true }: { children: React.ReactNode; style?: ViewStyle; padded?: boolean }) {
  return <View style={[styles.card, padded && styles.padded, style]}>{children}</View>;
}

const styles = themedStyles(() => StyleSheet.create({
  card: { backgroundColor: color.card, borderRadius: radius.card, overflow: "hidden" },
  padded: { padding: space.s4 },
}));
