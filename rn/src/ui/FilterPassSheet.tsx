import React, { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { Sheet } from "./Sheet";
import { Text } from "./Text";
import { Card } from "./Card";
import { Button } from "./Button";
import { Spinner } from "./Spinner";
import {
  FILTER_PLAN_KRW, FILTER_PLAN_ORDER, getFilterPackages, iapAvailable, purchaseFilterPackage, restoreFilterAccess,
  useFilterAccess, type FilterPackage, type FilterPlan,
} from "@/lib/iap";
import { won } from "@/lib/packs";
import { getEnv } from "@/lib/env";
import { c21 } from "@/lib/copy21";
import { copy } from "@/lib/copy";
import { color, radius, space, themedStyles } from "@/theme/tokens";

// ============================================================================
// 필터 이용권 결제 시트(scratchpad filterpass_spec.md "결제 시트(네이티브)").
//  · RevenueCat offering "filters" 의 3개(연간 강조 → 월간 → 평생). 가격은 스토어 priceString,
//    못 불러오면 원화 참고가(누를 수는 없음) — StoreList 와 같은 규칙.
//  · 기간·자동갱신 안내 · 이용약관/개인정보 링크(설정 화면과 같은 주소) · 구매 복원.
//  · 크레딧 적립(/api/iap/grant)과 무관 — 로그인 없이도 산다(카메라 탭은 로그인 없이 쓴다).
//  · "무료 체험"이라는 말을 구독과 묶어 쓰지 않는다.
// iOS 결제 시트가 아직 없어 CreditSheet(StoreList) 모양을 따랐다.
// ============================================================================

const PLAN_LABEL: Record<FilterPlan, () => string> = { annual: () => c21.fpAnnual, monthly: () => c21.fpMonthly, lifetime: () => c21.fpLifetime };
const PLAN_NOTE: Record<FilterPlan, () => string> = { annual: () => c21.fpAnnualNote, monthly: () => c21.fpMonthlyNote, lifetime: () => c21.fpLifetimeNote };

export function FilterPassSheet({ open, onClose, onUnlocked }: { open: boolean; onClose: () => void; onUnlocked: () => void }) {
  const access = useFilterAccess();
  const [pkgs, setPkgs] = useState<FilterPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<FilterPlan | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const available = iapAvailable();

  useEffect(() => {
    if (!open) return;
    let on = true;
    setMsg({});
    setLoading(true);
    void getFilterPackages().then((list) => { if (on) { setPkgs(list); setLoading(false); } });
    return () => { on = false; };
  }, [open]);

  const buy = useCallback(async (plan: FilterPlan) => {
    const p = pkgs.find((x) => x.plan === plan);
    if (!p) { setMsg({ error: copy.store.noProduct }); return; }
    setMsg({});
    setBusy(plan);
    try {
      const r = await purchaseFilterPackage(p);
      if (r.cancelled) return;
      if (r.unlocked) { setMsg({ ok: c21.fpDone }); onUnlocked(); }
      else setMsg({ error: copy.store.grantLate });
    } catch (e) {
      setMsg({ error: (e as Error)?.message || String(e) });
    } finally {
      setBusy(null);
    }
  }, [pkgs, onUnlocked]);

  const restore = useCallback(async () => {
    setMsg({});
    setRestoring(true);
    try {
      const r = await restoreFilterAccess();
      if (r.unlocked) { setMsg({ ok: c21.fpDone }); onUnlocked(); }
      else setMsg({ error: r.error || c21.fpRestoreNone });
    } finally {
      setRestoring(false);
    }
  }, [onUnlocked]);

  const base = getEnv().apiBase;
  const expired = access.source === "locked";

  return (
    <Sheet open={open} title={c21.fpTitle} onClose={onClose}>
      <Text size="callout" tone="muted">{expired ? c21.fpLeadExpired : c21.fpLead}</Text>
      <View style={{ gap: space.s2 }}>
        {FILTER_PLAN_ORDER.map((plan) => {
          const p = pkgs.find((x) => x.plan === plan);
          const best = plan === "annual";
          const isBusy = busy === plan;
          const disabled = !!busy || restoring || (!p && !loading) || !available;
          return (
            <Pressable
              key={plan}
              accessibilityRole="button"
              accessibilityState={{ disabled }}
              disabled={disabled}
              onPress={() => { void buy(plan); }}
              style={({ pressed }) => [styles.row, best && styles.rowBest, pressed && { backgroundColor: color.fill }, disabled && !isBusy && { opacity: 0.55 }]}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <View style={styles.titleRow}>
                  <Text size="headline">{PLAN_LABEL[plan]()}</Text>
                  {best ? <View style={styles.badge}><Text size="caption" tone="onAccent">{c21.fpBest}</Text></View> : null}
                </View>
                <Text size="footnote" tone="muted">{PLAN_NOTE[plan]()}</Text>
              </View>
              <View style={styles.trail}>
                {isBusy ? <Spinner size={20} color={color.accent} /> : (
                  <Text size="callout" weight="semibold" tabular>{p?.priceString || won(FILTER_PLAN_KRW[plan])}</Text>
                )}
              </View>
            </Pressable>
          );
        })}
      </View>
      <Card padded>
        <Text size="footnote" tone="muted">{c21.fpPlusFree}</Text>
      </Card>
      {!available ? <Text size="footnote" tone="muted" center>{copy.store.notConfigured}</Text>
        : msg.error ? <Text size="footnote" tone="danger" center>{msg.error}</Text>
          : msg.ok ? <Text size="footnote" tone="accent" center>{msg.ok}</Text>
            : !loading && !pkgs.length ? <Text size="footnote" tone="muted" center>{copy.store.noProduct}</Text> : null}
      <Button
        label={restoring ? copy.store.restoring : copy.store.restore}
        variant="quiet"
        size="sm"
        loading={restoring}
        disabled={!available || !!busy}
        onPress={() => { void restore(); }}
      />
      <Text size="caption" tone="subtle" weight="medium">{c21.fpLegal}</Text>
      <View style={styles.links}>
        <Pressable accessibilityRole="link" hitSlop={8} onPress={() => { void Linking.openURL(`${base}/terms.html`); }}>
          <Text size="caption" tone="muted" style={styles.link}>{copy.profile.terms}</Text>
        </Pressable>
        <Text size="caption" tone="subtle">·</Text>
        <Pressable accessibilityRole="link" hitSlop={8} onPress={() => { void Linking.openURL(`${base}/privacy.html`); }}>
          <Text size="caption" tone="muted" style={styles.link}>{copy.profile.privacy}</Text>
        </Pressable>
      </View>
    </Sheet>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  row: {
    flexDirection: "row", alignItems: "center", minHeight: 62, paddingHorizontal: space.s4, paddingVertical: space.s3,
    backgroundColor: color.card, borderRadius: radius.card, borderWidth: 1, borderColor: color.line,
  },
  rowBest: { borderWidth: 2, borderColor: color.accent },
  titleRow: { flexDirection: "row", alignItems: "center", gap: space.s2 },
  badge: { backgroundColor: color.accent, borderRadius: radius.pill, paddingHorizontal: space.s2, paddingVertical: 2 },
  trail: { minWidth: 72, alignItems: "flex-end" },
  links: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: space.s2 },
  link: { textDecorationLine: "underline" },
}));
