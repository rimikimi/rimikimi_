import React from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { color } from "@/theme/tokens";

// dev 전용 — scripts/previews.tsx 의 항목 하나를 띄운다.
export default function DevPreview() {
  const { name } = useLocalSearchParams<{ name: string }>();
  if (!__DEV__) return <View style={{ flex: 1, backgroundColor: color.bg }} />;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PREVIEWS } = require("../../../scripts/previews") as typeof import("../../../scripts/previews");
  const entry = PREVIEWS.find((p) => p.name === name);
  if (!entry) return <View style={{ flex: 1, backgroundColor: color.bg }} />;
  const C = entry.Component;
  return <C />;
}
