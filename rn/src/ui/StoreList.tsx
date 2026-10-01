import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Card } from "./Card";
import { Text } from "./Text";
import { Button } from "./Button";
import { Spinner } from "./Spinner";
import { IconHeart } from "./icons";
import { CREDIT_PACKS, FIRST_PACK_ID, FIRST_PACK_KRW, SUB_PLANS, planBadge, planLabel, won } from "@/lib/packs";
import { useQuota } from "@/lib/quota";
import type { StoreFlow } from "@/lib/storeFlow";
import { copy } from "@/lib/copy";
import { color, radius, space, themedStyles } from "@/theme/tokens";

// 팩 행 + 구독 행. 가격은 스토어(RevenueCat)가 준 priceString 을 우선 표시하고, 상품을 못 불러왔으면 원화 참고가.

export function PackRows({ flow, limit, onBought }: { flow: StoreFlow; limit?: number; onBought?: () => void }) {
  const packs = limit ? CREDIT_PACKS.slice(0, limit) : CREDIT_PACKS;
  const { quota } = useQuota();
  return (
    <Card padded={false}>
      {packs.map((p, i) => {
        const regularRc = flow.packs.find((x) => x.id === p.id);
        // 첫 구매 할인 팩 — 결제 기록 없는 계정이고 스토어가 그 상품을 돌려줄 때만(iOS StoreManager.packs 와 같음)
        const firstRc = quota?.firstPurchase ? flow.packs.find((x) => x.id === FIRST_PACK_ID[p.id]) : undefined;
        const rc = firstRc ?? regularRc;
        const buyId = firstRc ? firstRc.id : p.id;
        const krw = firstRc ? (FIRST_PACK_KRW[p.id] ?? p.krw) : p.krw;
        const busy = flow.busyId === buyId;
        const disabled = !!flow.busyId || flow.restoring || (!rc && !flow.loading);
        return (
          <View key={p.id}>
            {i > 0 ? <View style={styles.sep} /> : null}
            <Pressable
              accessibilityRole="button"
              disabled={disabled}
              onPress={() => { void flow.buy(buyId, { onCredited: onBought }); }}
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: color.fill }, disabled && !busy && { opacity: 0.55 }]}
            >
              <View style={styles.lead}>
                <IconHeart size={20} color={color.accent} filled />
                <View style={{ gap: 2 }}>
                  <View style={styles.titleRow}>
                    <Text size="headline">{copy.store.count(p.count)}</Text>
                    {firstRc ? <View style={styles.badge}><Text size="caption" tone="onAccent">{copy.store.badge.firstDiscount}</Text></View>
                      : p.badge ? <View style={styles.badge}><Text size="caption" tone="onAccent">{copy.store.badge[p.badge]}</Text></View> : null}
                  </View>
                  <Text size="footnote" tone="muted">{copy.store.per(won(Math.round(krw / p.count)))}</Text>
                </View>
              </View>
              <View style={styles.trail}>
                {busy ? <Spinner size={20} color={color.accent} /> : (
                  <>
                    {firstRc ? <Text size="footnote" tone="subtle" tabular style={styles.strike}>{regularRc?.priceString || won(p.krw)}</Text> : null}
                    <Text size="callout" weight="semibold" tabular>{rc?.priceString || won(krw)}</Text>
                  </>
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
        // 첫 결제 할인(Play 제안 first30) — 스토어가 이 계정에 할인가를 줄 때만(결제창에도 같은 값이 뜬다)
        const ip = rc?._product.introPrice;
        const intro = ip && ip.price > 0 ? ip.priceString : null;
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
                  <Text size="headline">{planLabel(s)}</Text>
                  {s.badge ? <View style={styles.badge}><Text size="caption" tone="onAccent">{planBadge(s)}</Text></View> : null}
                </View>
                <Text size="footnote" tone="muted">{copy.ui.subCredits(s.credits, s.period)}</Text>
                {intro ? <Text size="footnote" tone="accent">{copy.store.introLine(s.period, intro, rc?.priceString || won(s.krw))}</Text> : null}
              </View>
              <View style={styles.trail}>
                {busy ? <Spinner size={20} color={color.accent} /> : <Text size="callout" weight="semibold" tabular>{intro || rc?.priceString || won(s.krw)}</Text>}
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

const styles = themedStyles(() => StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 62, paddingHorizontal: space.s4, paddingVertical: space.s3 },
  lead: { flexDirection: "row", alignItems: "center", gap: space.s3 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: space.s2 },
  badge: { backgroundColor: color.accent, borderRadius: radius.pill, paddingHorizontal: space.s2, paddingVertical: 2 },
  trail: { minWidth: 72, alignItems: "flex-end" },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: color.line, marginLeft: space.s4 },
  subHead: { padding: space.s4, gap: 2 },
  strike: { textDecorationLine: "line-through" },
}));
