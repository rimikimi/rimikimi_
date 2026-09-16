import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Sheet } from "./Sheet";
import { Text } from "./Text";
import { Card } from "./Card";
import { IconChevron } from "./icons";
import { PackRows, StoreMessage, SubRows } from "./StoreList";
import { useCreditGate } from "@/lib/creditGate";
import { useStoreFlow } from "@/lib/storeFlow";
import { copy } from "@/lib/copy";
import { color, space, themedStyles } from "@/theme/tokens";

// 크레딧 부족 시트 — 팩 3개 · 구독 1개(먼슬리) · "친구 초대로 무료 3장". 구매 즉시 하던 생성 이어짐.
export function CreditSheet() {
  const gate = useCreditGate();
  const flow = useStoreFlow();
  return (
    <Sheet open={gate.open} title={copy.creditSheet.title} onClose={gate.close}>
      <Text size="footnote" tone="muted">{copy.creditSheet.desc(gate.need)} {copy.creditSheet.resume}</Text>
      <PackRows flow={flow} limit={3} onBought={gate.onPurchased} />
      <SubRows flow={flow} only={["rimikimi.sub.plus.monthly"]} onBought={gate.onPurchased} />
      <Card padded={false}>
        <Pressable
          accessibilityRole="button"
          onPress={() => { gate.close(); router.push("/(tabs)/profile"); }}
          style={({ pressed }) => [styles.invite, pressed && { backgroundColor: color.fill }]}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text size="headline">{copy.creditSheet.inviteTitle}</Text>
            <Text size="footnote" tone="muted">{copy.creditSheet.inviteDesc}</Text>
          </View>
          <IconChevron size={16} color={color.ink3} />
        </Pressable>
      </Card>
      <StoreMessage flow={flow} />
    </Sheet>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  invite: { flexDirection: "row", alignItems: "center", gap: space.s3, padding: space.s4 },
}));
