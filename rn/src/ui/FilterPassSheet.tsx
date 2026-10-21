import React, { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { Sheet } from "./Sheet";
import { Text } from "./Text";
import { Card } from "./Card";
import { Button } from "./Button";
import { Spinner } from "./Spinner";
import {
  FILTER_PLAN_KRW, FILTER_PLANS_SHOWN, filterPlanFallbackKrw, getFilterPackages, lifetimePromoActive, iapAvailable, purchaseFilterPackage, restoreFilterAccess,
  useFilterAccess, type FilterPackage, type FilterPlan,
} from "@/lib/iap";
import { won } from "@/lib/packs";
import { getEnv } from "@/lib/env";
import { c21 } from "@/lib/copy21";
import { copy } from "@/lib/copy";
import { color, radius, space, themedStyles } from "@/theme/tokens";

// ============================================================================
// 카메라 이용권 결제 시트(scratchpad filterpass_spec.md "결제 시트(네이티브)").
//  · 오너 결정 2026-10-12: 평생(rimikimi.filter.lifetime, 먼저·기본 선택) + 월간(₩1,900/월) — FILTER_PLANS_SHOWN.
//    연간은 스토어·RevenueCat 에 그대로 두고 숨긴다(복원은 FILTER_PRODUCTS 로 계속 된다).
//    평생 런칭가(~2026-11-13 KST): "런칭 기념" 배지 + "11월 13일까지 · 정가 ₩9,900" + 가격 옆 정가 취소선.
//  · Play 오퍼 first-month-free(첫 1개월 무료, 1회) 가 상품에 붙어 오면(freeTrial) 요금제 아래
//    "첫 1개월 무료 · 이후 월 {갱신가} 자동 갱신" 과 상단 버튼 "첫 달 0원으로 시작" 을 보여 준다.
//    오퍼가 안 오면(이미 써 본 계정 등) 기존 "매월 자동 갱신" + "계속하기 · {가격}".
//  · 가격은 스토어 priceString, 못 불러오면 원화 참고가(누를 수는 없음) — StoreList 와 같은 규칙.
//  · 기간·자동갱신 안내 · 이용약관/개인정보 링크(설정 화면과 같은 주소) · 구매 복원.
//  · 크레딧 적립(/api/iap/grant)과 무관 — 로그인 없이도 산다(카메라 탭은 로그인 없이 쓴다).
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
  // 미리 고른 요금제 = 보이는 것 중 첫째(평생). 상단 버튼이 이걸 산다. 줄을 누르면 그 요금제를 바로 산다.
  const selected: FilterPlan = FILTER_PLANS_SHOWN[0];
  const selPkg = pkgs.find((x) => x.plan === selected);
  const selPrice = selPkg?.priceString || won(filterPlanFallbackKrw(selected));
  const promo = lifetimePromoActive();
  const ctaDisabled = !!busy || restoring || (!selPkg && !loading) || !available;

  return (
    <Sheet open={open} title={c21.fpTitle} onClose={onClose}>
      <Text size="callout" tone="muted">{expired ? c21.fpLeadExpired : c21.fpLead}</Text>
      <View style={{ gap: space.s2 }}>
        {FILTER_PLANS_SHOWN.map((plan) => {
          const p = pkgs.find((x) => x.plan === plan);
          const isBusy = busy === plan;
          const disabled = !!busy || restoring || (!p && !loading) || !available;
          const launch = plan === "lifetime" && promo;
          // 정가(₩9,900)는 원화 스토어에서만 보인다 — 미국 등 다른 통화 스토어에서 "₩9,900 취소선 + $2.99"가
          // 같이 뜨던 결함(오너 2026-10-22). 스토어 가격을 못 받아 원화 참고가를 쓰는 경우도 원화로 본다.
          const shownPrice = p?.priceString || won(filterPlanFallbackKrw(plan));
          const krwStore = /₩|원|KRW/.test(shownPrice);
          const note = p?.freeTrial ? c21.fpIntroNote(p.renewPrice || p.priceString)
            : launch ? c21.fpLaunchNote(krwStore ? won(FILTER_PLAN_KRW.lifetime) : null) : PLAN_NOTE[plan]();
          return (
            <Pressable
              key={plan}
              accessibilityRole="button"
              accessibilityState={{ disabled, selected: plan === selected }}
              disabled={disabled}
              onPress={() => { void buy(plan); }}
              style={({ pressed }) => [styles.row, plan === selected && styles.rowSelected, pressed && { backgroundColor: color.fill }, disabled && !isBusy && { opacity: 0.55 }]}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <View style={styles.titleRow}>
                  <Text size="headline">{PLAN_LABEL[plan]()}</Text>
                  {launch ? (
                    <View style={styles.pill}>
                      <Text size="caption" weight="semibold" tone="onAccent">{c21.fpLaunchPill}</Text>
                    </View>
                  ) : null}
                </View>
                <Text size="footnote" tone="muted">{note}</Text>
              </View>
              <View style={styles.trail}>
                {isBusy ? <Spinner size={20} color={color.accent} /> : (
                  <View style={styles.priceRow}>
                    {launch && krwStore ? <Text size="footnote" tone="subtle" tabular style={styles.strike}>{won(FILTER_PLAN_KRW.lifetime)}</Text> : null}
                    <Text size="callout" weight="semibold" tabular>{(p?.freeTrial ? p.renewPrice : p?.priceString) || won(filterPlanFallbackKrw(plan))}</Text>
                  </View>
                )}
              </View>
            </Pressable>
          );
        })}
      </View>
      <Button
        label={selPkg?.freeTrial ? c21.fpCtaIntro : c21.fpCtaPrice(selPrice)}
        loading={busy === selected}
        disabled={ctaDisabled}
        onPress={() => { void buy(selected); }}
      />
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
  rowSelected: { borderWidth: 2, borderColor: color.accent },
  trail: { minWidth: 72, alignItems: "flex-end" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: space.s2, flexWrap: "wrap" },
  pill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: color.accent },
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  strike: { textDecorationLine: "line-through" },
  links: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: space.s2 },
  link: { textDecorationLine: "underline" },
}));
