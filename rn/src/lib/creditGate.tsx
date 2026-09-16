import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { useQuota } from "./quota";

// ============================================================================
// 크레딧 부족 게이트 (SPEC §3): 토스트 대신 시트 — 팩 3개 · 구독 1개 · "친구 초대로 무료 3장".
// 구매 즉시 하던 생성이 이어진다: `request(cost, proceed)` 가 잔액을 보고 충분하면 바로 proceed,
// 부족하면 시트를 띄우고 구매 성공(잔액 갱신) 뒤 proceed 를 이어서 실행한다.
// 시트 자체(CreditSheet.tsx)는 루트 레이아웃이 그린다.
// ============================================================================

interface GateValue {
  open: boolean;
  need: number;
  /** 잔액이 충분하면 즉시 proceed. 아니면 시트를 열고 구매 뒤 proceed. */
  request: (cost: number, proceed: () => void) => void;
  /** 시트가 "구매 성공" 을 알린다 → 잔액 새로고침 뒤 pending proceed 실행 */
  onPurchased: () => void;
  close: () => void;
}

const Ctx = createContext<GateValue | null>(null);
export function useCreditGate(): GateValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCreditGate outside CreditGateProvider");
  return v;
}

export function CreditGateProvider({ children }: { children: React.ReactNode }) {
  const { available, loaded, refresh } = useQuota();
  const [open, setOpen] = useState(false);
  const [need, setNeed] = useState(1);
  const pending = useRef<(() => void) | null>(null);

  const request = useCallback<GateValue["request"]>((cost, proceed) => {
    // 잔액을 아직 모르면(로드 전) 서버 판정에 맡긴다 — 서버가 402/429 로 거절하면 카드에 실패로 뜬다.
    if (!loaded || available >= cost) { proceed(); return; }
    pending.current = proceed;
    setNeed(cost);
    setOpen(true);
  }, [available, loaded]);

  const onPurchased = useCallback(() => {
    refresh();
    setOpen(false);
    const p = pending.current;
    pending.current = null;
    // 잔액 재조회가 끝나기 전이라도 서버가 최종 판정한다 — 바로 이어간다.
    if (p) setTimeout(p, 300);
  }, [refresh]);

  const close = useCallback(() => { pending.current = null; setOpen(false); }, []);

  const value = useMemo<GateValue>(() => ({ open, need, request, onPurchased, close }), [open, need, request, onPurchased, close]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
