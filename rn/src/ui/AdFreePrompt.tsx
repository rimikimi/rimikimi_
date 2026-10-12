import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Sheet } from "./Sheet";
import { Text } from "./Text";
import { Button } from "./Button";
import { IconSparkle } from "./icons";
import { subscribeAdFreePrompt, type AdFreeChoice, type AdFreeMode } from "@/lib/adFreePrompt";
import { c21 } from "@/lib/copy21";
import { color, space, themedStyles } from "@/theme/tokens";

// 만들기 직전 안내(iOS 와 같다): "광고 없애기" → buy(호출부가 생성 대신 충전 시트를 연다),
// "광고 보고 만들기" → watch(호출부가 보상형 광고 → 끝까지 보면 생성),
// 끌어내림·바깥 누름·뒤로가기 → cancel(생성 안 함, 오너 결정 2026-10-12).
export function AdFreePrompt() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AdFreeMode>("member");
  const resolver = useRef<((c: AdFreeChoice) => void) | null>(null);

  const finish = useCallback((c: AdFreeChoice) => {
    setOpen(false);
    const r = resolver.current;
    resolver.current = null;
    r?.(c);
  }, []);

  useEffect(() => subscribeAdFreePrompt((resolve, m) => {
    resolver.current?.("cancel"); // 겹쳐 물으면 앞의 것은 취소
    resolver.current = resolve;
    setMode(m);
    setOpen(true);
  }), []);

  const onWatch = useCallback(() => finish("watch"), [finish]);
  const onCancel = useCallback(() => finish("cancel"), [finish]);
  const onBuy = useCallback(() => finish("buy"), [finish]);

  return (
    <Sheet open={open} onClose={onCancel}>
      <View style={styles.body}>
        <View style={styles.icon}><IconSparkle size={28} color={color.accent} /></View>
        <Text size="headline" style={styles.center}>{mode === "guest" ? c21.guestRewardTitle : c21.adFreePromptTitle}</Text>
        <Text size="footnote" tone="muted" style={styles.center}>{mode === "guest" ? c21.guestRewardBody : c21.adFreeBody}</Text>
      </View>
      {mode === "guest" ? (
        <Button label={c21.adFreeWatch} onPress={onWatch} full />
      ) : (
        <>
          <Button label={c21.adFreeRemove} onPress={onBuy} full />
          <Button label={c21.adFreeWatch} onPress={onWatch} variant="quiet" full />
        </>
      )}
    </Sheet>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  body: { alignItems: "center", gap: space.s2, paddingTop: space.s3, paddingBottom: space.s2 },
  icon: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: color.fill },
  center: { textAlign: "center" },
}));
