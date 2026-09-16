import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Card } from "./Card";
import { Text } from "./Text";
import { Button } from "./Button";
import { Spinner } from "./Spinner";
import { IconHeart } from "./icons";
import { CREDIT_PACKS, SUB_PLANS, packDiscountPercent, perUnitKrw, won } from "@/lib/packs";
import type { StoreFlow } from "@/lib/storeFlow";
import { copy } from "@/lib/copy";
import { color, radius, space } from "@/theme/tokens";

// 팩 행 + 구독 행. 가격은 스토어(RevenueCat)가 준 priceString 을 우선 표시하고, 상품을 못 불러왔으면 원화 참고가.

export function PackRows({ flow, limit, onBought }: { flow: StoreFlow; limit?: number; onBought?: () => void }) {
  const packs = limit ? CREDIT_PACKS.slice(0, limit) : CREDIT_PACKS;
  return (
    <Card padded={false}>
      {packs.map((p, i) => {
        const rc = flow.packs.find((x) => x.id === p.id);
        const discount = packDiscountPercent(p);
        const busy = flow.busyId === p.id;
        const disabled = !!flow.busyId || flow.restoring || (!rc && !flow.loading);
        return (
          <View key={p.id}>
            {i > 0 ? <View style={styles.sep} /> : null}
            <Pressable
              accessibilityRole="button"
              disabled={disabled}
              onPress={() => { void flow.buy(p.id, { onCredited: onBought }); }}
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: color.fill }, disabled && !busy && { opacity: 0.55 }]}
            >
              <View style={styles.lead}>
                <IconHeart size={20} color={color.accent} filled />
                <View style={{ gap: 2 }}>
                  <View style={styles.titleRow}>
                    <Text size="headline">{copy.store.count(p.count)}</Text>
                    {p.badge ? <View style={styles.badge}><Text size="caption" tone="onAccent">{copy.store.badge[p.badge]}</Text></View> : null}
                  </View>
                  <Text size="footnote" tone="muted">
                    {copy.store.per(won(perUnitKrw(p)))}{discount != null ? ` · ${discount}% 할인` : ""}
                  </Text>
                </View>
              </View>
              <View style={styles.trail}>
                {busy ? <Spinner size={20} color={color.accent} /> : (
                  <Text size="callout" weight="semibold" tabular>{rc?.priceString || won(p.krw)}</Text>
                )}
              </View>
            </Pressable>
          </View>
        );
      })}
    </Card>
  );
}

export function SubRows({ flow, only, onBought }: { flow: StoreFlow; only?: string[]; onBought?: () => void }) {
  const plans = only ? SUB_PLANS.filter((s) => only.includes(s.id)) : SUB_PLANS;
  return (
    <Card padded={false}>
      <View style={styles.subHead}>
        <Text size="headline">{copy.store.subTitle}</Text>
        <Text size="footnote" tone="muted">{copy.store.subDesc}</Text>
      </View>
      {plans.map((s) => {
        const rc = flow.packs.find((x) => x.id === s.id);
        const busy = flow.busyId === s.id;
        const disabled = !!flow.busyId || flow.restoring || (!rc && !flow.loading);
        return (
          <View key={s.id}>
            <View style={styles.sep} />
            <Pressable
              accessibilityRole="button"
              disabled={disabled}
              onPress={() => { void flow.buy(s.id, { onCredited: onBought }); }}
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: color.fill }, disabled && !busy && { opacity: 0.55 }]}
            >
              <View style={{ gap: 2 }}>
                <View style={styles.titleRow}>
                  <Text size="headline">{s.label}</Text>
                  {s.badge ? <View style={styles.badge}><Text size="caption" tone="onAccent">{s.badge}</Text></View> : null}
                </View>
                <Text size="footnote" tone="muted">{`크레딧 ${s.credits}장 / ${s.period === "week" ? "주" : s.period === "month" ? "월" : "년"}`}</Text>
              </View>
              <View style={styles.trail}>
                {busy ? <Spinner size={20} color={color.accent} /> : <Text size="callout" weight="semibold" tabular>{rc?.priceString || won(s.krw)}</Text>}
              </View>
            </Pressable>
          </View>
        );
      })}
    </Card>
  );
}

export function StoreMessage({ flow }: { flow: StoreFlow }) {
  if (!flow.available) return <Text size="footnote" tone="muted" center>{copy.store.notConfigured}</Text>;
  if (flow.message.error) return <Text size="footnote" tone="danger" center>{flow.message.error}</Text>;
  if (flow.message.ok) return <Text size="footnote" tone="accent" center>{flow.message.ok}</Text>;
  if (!flow.loading && flow.packs.length === 0) return <Text size="footnote" tone="muted" center>{copy.store.noProduct}</Text>;
  return null;
}

export function RestoreButton({ flow }: { flow: StoreFlow }) {
  return <Button label={flow.restoring ? copy.store.restoring : copy.store.restore} variant="quiet" size="sm" loading={flow.restoring} disabled={!flow.available || !!flow.busyId} onPress={() => { void flow.restore(); }} />;
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 62, paddingHorizontal: space.s4, paddingVertical: space.s3 },
  lead: { flexDirection: "row", alignItems: "center", gap: space.s3 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: space.s2 },
  badge: { backgroundColor: color.accent, borderRadius: radius.pill, paddingHorizontal: space.s2, paddingVertical: 2 },
  trail: { minWidth: 72, alignItems: "flex-end" },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: color.line, marginLeft: space.s4 },
  subHead: { padding: space.s4, gap: 2 },
});
