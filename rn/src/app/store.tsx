import React from "react";
import { StyleSheet, View } from "react-native";
import { Screen } from "@/ui/Screen";
import { AppHeader } from "@/ui/AppHeader";
import { Text } from "@/ui/Text";
import { PackRows, RestoreButton, StoreMessage } from "@/ui/StoreList";
import { useStoreFlow } from "@/lib/storeFlow";
import { useQuota } from "@/lib/quota";
import { copy } from "@/lib/copy";
import { space } from "@/theme/tokens";

// 프로필 > 스토어 — 크레딧 팩 + 구매 복원 (rimikimi+ 구독은 판매 중단, 오너 2026-10-11) (웹 StoreScreen 과 같은 구성).
export default function StoreScreen() {
  const flow = useStoreFlow();
  const { quota } = useQuota();
  return (
    <Screen scrollModel="scroll" header={<AppHeader title={copy.store.title} back right={<View />} />} contentStyle={styles.content}>
      {quota ? <Text size="footnote" weight="semibold">{copy.store.held(quota.credits)}</Text> : null}
      <PackRows flow={flow} />
      <StoreMessage flow={flow} />
      <View style={{ alignItems: "center" }}><RestoreButton flow={flow} /></View>
    </Screen>
  );
}

const styles = StyleSheet.create({ content: { paddingHorizontal: space.screen, gap: space.s4 } });
