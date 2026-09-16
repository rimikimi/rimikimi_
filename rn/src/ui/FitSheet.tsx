import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { Sheet } from "./Sheet";
import { Text } from "./Text";
import { Card } from "./Card";
import { Spinner } from "./Spinner";
import { Button } from "./Button";
import { IconChevron } from "./icons";
import { cropToPortrait, hasFaceDetector } from "@/lib/fit";
import { encodeForUpload, type PhotoRef } from "@/lib/photo";
import { outpaintImage, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useQuota } from "@/lib/quota";
import { useCreditGate } from "@/lib/creditGate";
import { copy } from "@/lib/copy";
import { color, space, themedStyles } from "@/theme/tokens";

// 정방향 맞춤 제안 시트 — 잘라 맞춤(무료) / 채워 맞춤(서버 /api/generate?fit=outpaint, 1크레딧) / 그대로 두기.
export function FitSheet({ open, uri, onClose, onFitted }: { open: boolean; uri: string | null; onClose: () => void; onFitted: (p: PhotoRef) => void }) {
  const [busy, setBusy] = useState(false);
  const [outBusy, setOutBusy] = useState(false);
  const { session } = useAuth();
  const { refresh: refreshQuota } = useQuota();
  const gate = useCreditGate();

  const crop = async () => {
    if (!uri || busy || outBusy) return;
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

  const runOutpaint = async () => {
    if (!uri) return;
    const token = session?.access_token;
    if (!token) { Alert.alert(copy.common.retry); return; }
    setOutBusy(true);
    try {
      const encoded = await encodeForUpload({ uri }, 1024);
      const r = await outpaintImage(token, encoded);
      onFitted({ uri: r.imageDataUrl });
      refreshQuota();
      onClose();
    } catch (err) {
      const e = err as ApiError;
      if (e?.quotaExceeded) {
        // 크레딧 부족 — 기존 크레딧 시트로 넘기고, 구매 후 이어서 재시도한다.
        gate.request(1, () => { void runOutpaint(); });
      } else {
        Alert.alert(e?.message || copy.common.retry);
      }
    } finally {
      setOutBusy(false);
    }
  };

  const outpaint = () => {
    if (busy || outBusy) return;
    gate.request(1, () => { void runOutpaint(); });
  };

  return (
    <Sheet open={open} title={copy.fit.title} onClose={onClose}>
      <Text size="footnote" tone="muted">{copy.fit.desc}</Text>
      <Card padded={false}>
        <Pressable accessibilityRole="button" disabled={busy || outBusy} onPress={() => { void crop(); }} style={({ pressed }) => [styles.row, pressed && { backgroundColor: color.fill }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text size="headline">{copy.fit.crop}</Text>
            <Text size="footnote" tone="muted">{hasFaceDetector() ? copy.fit.cropHint : "가운데·위쪽 기준으로 3:4 크롭"}</Text>
          </View>
          {busy ? <Spinner size={20} color={color.accent} /> : <IconChevron size={16} color={color.ink3} />}
        </Pressable>
        <View style={styles.sep} />
        <Pressable accessibilityRole="button" disabled={busy || outBusy} onPress={outpaint} style={({ pressed }) => [styles.row, pressed && { backgroundColor: color.fill }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text size="headline">{copy.fit.outpaint}</Text>
            <Text size="footnote" tone="muted">{copy.fit.outpaintHint}</Text>
          </View>
          {outBusy ? <Spinner size={20} color={color.accent} /> : <IconChevron size={16} color={color.ink3} />}
        </Pressable>
      </Card>
      <Button label={copy.fit.skip} variant="quiet" onPress={onClose} />
    </Sheet>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.s3, padding: space.s4 },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: color.line, marginLeft: space.s4 },
}));
