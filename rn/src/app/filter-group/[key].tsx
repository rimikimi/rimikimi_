import React, { useCallback, useState } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { Screen } from "@/ui/Screen";
import { AppHeader } from "@/ui/AppHeader";
import { Text } from "@/ui/Text";
import { presetByKey } from "@/filters";
import { isKo } from "@/lib/locale";
import { FILTER_GROUPS , useFilterCatalogVersion } from "@/lib/filterGroups";
import { FlipCard } from "@/app/(tabs)/edit";
import { color, space } from "@/theme/tokens";

// 필터 앨범 안 — 그 묶음 필터를 3열 뒤집기 카드로(iOS FilterGroupGrid).
export default function FilterGroupScreen() {
  useFilterCatalogVersion();
  const { key } = useLocalSearchParams<{ key: string }>();
  const g = FILTER_GROUPS.find((x) => x.key === key) ?? FILTER_GROUPS[0];
  const { width } = useWindowDimensions();
  const w = Math.floor((width - space.screen * 2 - space.s2 * 2) / 3);
  const [favs, setFavs] = useState<string[]>([]);
  useFocusEffect(useCallback(() => {
    void AsyncStorage.getItem("filter.favorites").then((v) => { try { const a = JSON.parse(v || "[]"); if (Array.isArray(a)) setFavs(a); } catch { /* 없음 */ } });
  }, []));
  const toggle = (k: string) => setFavs((cur) => {
    const next = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k];
    void AsyncStorage.setItem("filter.favorites", JSON.stringify(next)); void Haptics.selectionAsync(); return next;
  });
  return (
    <Screen scrollModel="scroll" header={<AppHeader title={g.title()} back />}>
      <View style={styles.grid}>
        {g.keys.map((k) => (
          <View key={k} style={{ width: w, gap: 6 }}>
            <FlipCard k={k} width={w} fav={favs.includes(k)} onFav={() => toggle(k)} caption={false} />
            <Text size="footnote" numberOfLines={1} style={{ color: color.ink, textAlign: "center" }}>{isKo ? presetByKey(k).ko : presetByKey(k).en}</Text>
          </View>
        ))}
      </View>
    </Screen>
  );
}
const styles = StyleSheet.create({ grid: { flexDirection: "row", flexWrap: "wrap", gap: space.s2, rowGap: space.s3, paddingHorizontal: space.screen, paddingTop: space.s2 } });
