import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Sheet } from "./Sheet";
import { Text } from "./Text";
import { Button } from "./Button";
import { IconSparkle } from "./icons";
import { subscribeAdFreePrompt, type AdFreeChoice } from "@/lib/adFreePrompt";
import { c21 } from "@/lib/copy21";
import { color, space, themedStyles } from "@/theme/tokens";

// 만들기 직전 안내(iOS 와 같다): "광고 없애기" → buy(호출부가 생성 대신 충전 시트를 연다),
// "광고 보고 계속" 또는 끌어내림·바깥 누름·뒤로가기 → continue(예전 그대로 생성).
export function AdFreePrompt() {
  const [open, setOpen] = useState(false);
  const resolver = useRef<((c: AdFreeChoice) => void) | null>(null);

  const finish = useCallback((c: AdFreeChoice) => {
    setOpen(false);
    const r = resolver.current;
    resolver.current = null;
    r?.(c);
  }, []);

  useEffect(() => subscribeAdFreePrompt((resolve) => {
    resolver.current?.("continue"); // 겹쳐 물으면 앞의 것은 그대로 진행
    resolver.current = resolve;
    setOpen(true);
  }), []);

  const onContinue = useCallback(() => finish("continue"), [finish]);
  const onBuy = useCallback(() => finish("buy"), [finish]);

  return (
    <Sheet open={open} onClose={onContinue}>
      <View style={styles.body}>
        <View style={styles.icon}><IconSparkle size={28} color={color.accent} /></View>
        <Text size="headline" style={styles.center}>{c21.adFreeTitle}</Text>
        <Text size="footnote" tone="muted" style={styles.center}>{c21.adFreeBody}</Text>
      </View>
      <Button label={c21.adFreeRemove} onPress={onBuy} full />
      <Button label={c21.adFreeWatch} onPress={onContinue} variant="quiet" full />
    </Sheet>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  body: { alignItems: "center", gap: space.s2, paddingTop: space.s3, paddingBottom: space.s2 },
  icon: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: color.fill },
  center: { textAlign: "center" },
}));
