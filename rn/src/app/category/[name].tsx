import React, { useMemo } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Screen } from "@/ui/Screen";
import { AppHeader } from "@/ui/AppHeader";
import { ConceptCard } from "@/ui/ConceptCard";
import { useStore } from "@/lib/store";
import { byNewest, categoriesOf } from "@/lib/concepts";
import { space } from "@/theme/tokens";

// 카테고리 더보기 — 2열 격자, 최신순.
export default function CategoryScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const { concepts } = useStore();
  const { width } = useWindowDimensions();
  const items = useMemo(() => concepts.filter((c) => categoriesOf(c).includes(name ?? "")).sort(byNewest), [concepts, name]);
  const cardW = Math.floor((width - space.screen * 2 - space.s3) / 2);
  return (
    <Screen scrollModel="scroll" header={<AppHeader title={name ?? ""} back right={<View />} />}>
      <View style={styles.grid}>
        {items.map((c) => <ConceptCard key={String(c.id)} concept={c} width={cardW} />)}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.s3, paddingHorizontal: space.screen },
});
