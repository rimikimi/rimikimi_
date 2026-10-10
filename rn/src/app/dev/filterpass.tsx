import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Screen } from "@/ui/Screen";
import { AppHeader } from "@/ui/AppHeader";
import { Card } from "@/ui/Card";
import { Text } from "@/ui/Text";
import { Button } from "@/ui/Button";
import { FilterPassSheet } from "@/ui/FilterPassSheet";
import { setFilterDevState, useFilterAccess, type FilterDevState } from "@/lib/iap";
import { withFilterAccess } from "@/lib/editorPayload";
import { c21 } from "@/lib/copy21";
import { color, space, themedStyles } from "@/theme/tokens";

// dev 전용 — 필터 이용권 상태 강제(scratchpad filterpass_spec.md "검증").
//   com.rimikimi.app://dev/filterpass?state=trial|expired|unlocked|plus   (state=off = 강제 해제)
// 강제하면 원격 스위치(filterPass.enabled)도 켠 것으로 본다. 앱 프로세스가 살아 있는 동안 유지.
const STATES: (FilterDevState | "off")[] = ["trial", "expired", "unlocked", "plus", "off"];

export default function DevFilterPass() {
  const { state } = useLocalSearchParams<{ state?: string }>();
  const access = useFilterAccess();
  const [sheet, setSheet] = useState(false);

  useEffect(() => {
    if (!__DEV__) return;
    if (state === "off") setFilterDevState(null);
    else if (state && (STATES as string[]).includes(state)) setFilterDevState(state as FilterDevState);
  }, [state]);

  if (!__DEV__) return <View style={{ flex: 1, backgroundColor: color.bg }} />;

  const daysLeft = access.trialEndsAt ? Math.max(0, Math.ceil((Date.parse(access.trialEndsAt) - Date.now()) / 86400000)) : null;
  return (
    <View style={{ flex: 1 }}>
      <Screen scrollModel="scroll" header={<AppHeader title="dev · 필터 이용권" back right={<View />} />} contentStyle={{ paddingHorizontal: space.screen, gap: space.s4 }}>
        <Card>
          <Text size="headline">{access.devState ? `강제: ${access.devState}` : "강제 없음(실제 상태)"}</Text>
          <Text size="footnote" tone="muted">
            {`enabled=${access.enabled} · unlocked=${access.unlocked} · source=${access.source}`}
          </Text>
          <Text size="footnote" tone="muted">{`trialEndsAt=${access.trialEndsAt ?? "null"}${daysLeft != null && access.unlocked ? ` · ${c21.fpDaysLeft(daysLeft)}` : ""}`}</Text>
          <Text size="caption" tone="subtle">{`__rimikimiInit += ${JSON.stringify(withFilterAccess({}))}`}</Text>
        </Card>
        <View style={styles.row}>
          {STATES.map((s) => (
            <Button key={s} size="sm" variant={(access.devState ?? "off") === s ? "primary" : "secondary"} label={s} onPress={() => router.setParams({ state: s })} />
          ))}
        </View>
        <Button full label="결제 시트 열기" onPress={() => setSheet(true)} />
        <Button full variant="secondary" label="카메라·필터 탭" onPress={() => router.push("/(tabs)/filter")} />
        <Button full variant="secondary" label="편집기 → 저장(paywall 브리지 흉내)" onPress={() => router.push({ pathname: "/editor", params: { devPaywall: "1" } })} />
      </Screen>
      <FilterPassSheet open={sheet} onClose={() => setSheet(false)} onUnlocked={() => setSheet(false)} />
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.s2 },
}));
