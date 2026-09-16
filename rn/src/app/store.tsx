import React from "react";
import { StyleSheet, View } from "react-native";
import { Screen } from "@/ui/Screen";
import { AppHeader } from "@/ui/AppHeader";
import { Text } from "@/ui/Text";
import { PackRows, RestoreButton, StoreMessage, SubRows } from "@/ui/StoreList";
import { useStoreFlow } from "@/lib/storeFlow";
import { useQuota } from "@/lib/quota";
import { copy } from "@/lib/copy";
import { space } from "@/theme/tokens";

// 프로필 > 스토어 — 팩 4개 + 구독 3개 + 구매 복원 (웹 StoreScreen 과 같은 구성).
export default function StoreScreen() {
  const flow = useStoreFlow();
  const { quota } = useQuota();
  return (
    <Screen scrollModel="scroll" header={<AppHeader title={copy.store.title} back right={<View />} />} contentStyle={styles.content}>
      <Text size="footnote" tone="muted">{copy.store.intro(quota?.limit ?? 1)}</Text>
      {quota ? <Text size="footnote" weight="semibold">{copy.store.held(quota.credits)}</Text> : null}
      <PackRows flow={flow} />
      <SubRows flow={flow} />
      <StoreMessage flow={flow} />
      <Text size="caption" tone="subtle" weight="medium">{copy.store.note}</Text>
      <Text size="caption" tone="subtle" weight="medium">{copy.store.subLegal}</Text>
      <View style={{ alignItems: "center" }}><RestoreButton flow={flow} /></View>
    </Screen>
  );
}

const styles = StyleSheet.create({ content: { paddingHorizontal: space.screen, gap: space.s4 } });
