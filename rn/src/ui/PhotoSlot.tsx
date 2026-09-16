import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { Card } from "./Card";
import { Text } from "./Text";
import { IconClose, IconImage, IconPlus } from "./icons";
import type { PhotoRef } from "@/lib/photo";
import { color, radius, space } from "@/theme/tokens";

/** "내 사진: 등록된 사진 사용 · 변경" 한 줄 카드. 사진이 없으면 여기서 고른다. */
export function PhotoRow({ label, hint, photo, actionLabel, onPress }: {
  label: string;
  hint: string;
  photo: PhotoRef | null;
  actionLabel: string;
  onPress: () => void;
}) {
  return (
    <Card padded={false}>
      <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: color.fill }]}>
        {photo ? (
          <Image source={{ uri: photo.uri }} style={styles.thumb} contentFit="cover" />
        ) : (
          <View style={[styles.thumb, styles.thumbEmpty]}><IconImage size={24} color={color.ink3} /></View>
        )}
        <View style={styles.body}>
          <Text size="headline">{label}</Text>
          <Text size="footnote" tone="muted" numberOfLines={2}>{hint}</Text>
        </View>
        <Text size="footnote" weight="semibold" tone="accent">{actionLabel}</Text>
      </Pressable>
    </Card>
  );
}

/** 의상 슬롯(최대 5) — 가로 줄, 마지막에 추가 타일. */
export function GarmentRow({ garments, max, onAdd, onRemove, addFirst, addMore }: {
  garments: PhotoRef[];
  max: number;
  onAdd: () => void;
  onRemove: (i: number) => void;
  addFirst: string;
  addMore: string;
}) {
  return (
    <View style={styles.garmentRow}>
      {garments.map((g, i) => (
        <View key={g.uri + i} style={styles.garment}>
          <Image source={{ uri: g.uri }} style={styles.garmentImg} contentFit="cover" />
          <Pressable accessibilityRole="button" accessibilityLabel="의상 삭제" onPress={() => onRemove(i)} hitSlop={6} style={styles.remove}>
            <IconClose size={16} color={color.accentOn} />
          </Pressable>
        </View>
      ))}
      {garments.length < max ? (
        <Pressable accessibilityRole="button" onPress={onAdd} style={({ pressed }) => [styles.garment, styles.add, pressed && { backgroundColor: color.fillPress }]}>
          <IconPlus size={24} color={color.accent} />
          <Text size="caption" weight="semibold" center>{garments.length === 0 ? addFirst : addMore}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.s3, padding: space.s3 },
  thumb: { width: 56, height: 56, borderRadius: radius.thumb, backgroundColor: color.mat },
  thumbEmpty: { alignItems: "center", justifyContent: "center" },
  body: { flex: 1, gap: 2 },
  garmentRow: { flexDirection: "row", flexWrap: "wrap", gap: space.s2 },
  garment: { width: 72, height: 96, borderRadius: radius.thumb, backgroundColor: color.mat, overflow: "hidden" },
  garmentImg: { width: "100%", height: "100%" },
  remove: { position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: radius.pill, backgroundColor: "rgba(35,31,32,0.6)", alignItems: "center", justifyContent: "center" },
  add: { backgroundColor: color.fill, alignItems: "center", justifyContent: "center", gap: space.s1, padding: space.s1 },
});
