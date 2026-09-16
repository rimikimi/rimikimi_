import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { Sheet } from "./Sheet";
import { Text } from "./Text";
import { Card } from "./Card";
import { Spinner } from "./Spinner";
import { Button } from "./Button";
import { IconChevron } from "./icons";
import { cropToPortrait, hasFaceDetector } from "@/lib/fit";
import type { PhotoRef } from "@/lib/photo";
import { copy } from "@/lib/copy";
import { color, space } from "@/theme/tokens";

// 정방향 맞춤 제안 시트 — 잘라 맞춤(무료) / 채워 맞춤(1크레딧, 버튼만) / 그대로 두기.
export function FitSheet({ open, uri, onClose, onFitted }: { open: boolean; uri: string | null; onClose: () => void; onFitted: (p: PhotoRef) => void }) {
  const [busy, setBusy] = useState(false);
  const crop = async () => {
    if (!uri || busy) return;
    setBusy(true);
    try {
      const p = await cropToPortrait(uri);
      onFitted(p);
      onClose();
    } catch {
      Alert.alert(copy.common.retry);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} title={copy.fit.title} onClose={onClose}>
      <Text size="footnote" tone="muted">{copy.fit.desc}</Text>
      <Card padded={false}>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void crop(); }} style={({ pressed }) => [styles.row, pressed && { backgroundColor: color.fill }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text size="headline">{copy.fit.crop}</Text>
            <Text size="footnote" tone="muted">{hasFaceDetector() ? copy.fit.cropHint : "가운데·위쪽 기준으로 3:4 크롭"}</Text>
          </View>
          {busy ? <Spinner size={20} color={color.accent} /> : <IconChevron size={16} color={color.ink3} />}
        </Pressable>
        <View style={styles.sep} />
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => Alert.alert(copy.fit.soon)} style={({ pressed }) => [styles.row, pressed && { backgroundColor: color.fill }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text size="headline">{copy.fit.outpaint}</Text>
            <Text size="footnote" tone="muted">{copy.fit.outpaintHint}</Text>
          </View>
          <IconChevron size={16} color={color.ink3} />
        </Pressable>
      </Card>
      <Button label={copy.fit.skip} variant="quiet" onPress={onClose} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.s3, padding: space.s4 },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: color.line, marginLeft: space.s4 },
});
