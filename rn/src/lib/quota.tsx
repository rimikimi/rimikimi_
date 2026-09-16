import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { fetchQuota, type Quota } from "./api";
import { useAuth } from "./auth";

// 크레딧·오늘 무료 잔여 — 앱 전체에 하나. 헤더 칩과 프로필 탭이 같은 숫자를 읽는다.

interface QuotaValue {
  quota: Quota | null;
  loaded: boolean;
  refresh: () => void;
  /** 오늘 남은 무료 장수 */
  freeLeft: number;
  /** 지금 만들 수 있는 장수(무제한이면 Infinity) */
  available: number;
}

const Ctx = createContext<QuotaValue>({ quota: null, loaded: false, refresh: () => undefined, freeLeft: 0, available: 0 });
export const useQuota = () => useContext(Ctx);

export function QuotaProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const token = session?.access_token;
  const [quota, setQuota] = useState<Quota | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!token) { setQuota(null); setLoaded(false); return; }
    let cancelled = false;
    fetchQuota(token)
      .then((q) => { if (!cancelled) { setQuota(q); setLoaded(true); } })
      .catch(() => { /* 실패 시 잘못된 기본값을 드러내지 않는다 */ });
    return () => { cancelled = true; };
  }, [token, tick]);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  const value = useMemo<QuotaValue>(() => {
    const freeLeft = quota ? Math.max(0, quota.limit - quota.used) : 0;
    const available = quota ? (quota.unlimited ? Infinity : freeLeft + quota.credits) : 0;
    return { quota, loaded, refresh, freeLeft, available };
  }, [quota, loaded, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
