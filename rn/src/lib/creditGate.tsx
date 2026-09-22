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
  /** 잔액이 충분하면 즉시 proceed. 아니면 시트를 열고 구매 뒤 proceed.
   *  creditsOnly: 묶음(2장+)·채워 맞춤은 서버에서 **크레딧 전용**이다 — 하루 무료 1장을 더하면 안 된다. */
  request: (cost: number, proceed: () => void, opts?: { creditsOnly?: boolean }) => void;
  /** 잔액 계산과 상관없이 시트를 연다 — 서버가 크레딧 부족이라고 답했을 때. */
  force: (cost: number, proceed: () => void) => void;
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
  const { available, loaded, refresh, quota } = useQuota();
  const [open, setOpen] = useState(false);
  const [need, setNeed] = useState(1);
  const pending = useRef<(() => void) | null>(null);

  const force = useCallback<GateValue["force"]>((cost, proceed) => {
    pending.current = proceed;
    setNeed(cost);
    setOpen(true);
  }, []);

  const request = useCallback<GateValue["request"]>((cost, proceed, opts) => {
    // ⚠️ 묶음·채워 맞춤은 서버가 크레딧만 본다(api/generate.js). 무료 1장을 더해 통과시키면
    //    서버에서 거절되고 — 채워 맞춤은 거절 뒤 다시 이 게이트를 불러 **요청이 끝없이 반복**됐다
    //    (2026-09-23 스윕 확정). 그래서 크레딧 전용이면 크레딧만 센다.
    const usable = opts?.creditsOnly
      ? (quota?.unlimited ? Infinity : (quota?.credits ?? 0))
      : available;
    // 잔액을 아직 모르면(로드 전) 서버 판정에 맡긴다 — 서버가 402/429 로 거절하면 카드에 실패로 뜬다.
    if (!loaded || usable >= cost) { proceed(); return; }
    force(cost, proceed);
  }, [available, loaded, quota, force]);

  const onPurchased = useCallback(() => {
    refresh();
    setOpen(false);
    const p = pending.current;
    pending.current = null;
    // 잔액 재조회가 끝나기 전이라도 서버가 최종 판정한다 — 바로 이어간다.
    if (p) setTimeout(p, 300);
  }, [refresh]);

  const close = useCallback(() => { pending.current = null; setOpen(false); }, []);

  const value = useMemo<GateValue>(() => ({ open, need, request, force, onPurchased, close }), [open, need, request, force, onPurchased, close]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
