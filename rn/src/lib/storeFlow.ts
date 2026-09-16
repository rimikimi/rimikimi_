import { useCallback, useEffect, useState } from "react";
import { getIapPacks, grantWithRetry, iapAvailable, purchaseIap, restoreIap, type IapPack } from "./iap";
import { isSubscription } from "./packs";
import { copy } from "./copy";
import { useAuth } from "./auth";
import { useQuota } from "./quota";

// 스토어 화면과 크레딧 부족 시트가 같은 구매 흐름을 쓴다(웹 StoreScreen startIap/startRestore).

export interface StoreFlow {
  packs: IapPack[];
  loading: boolean;
  busyId: string | null;
  restoring: boolean;
  message: { ok?: string; error?: string };
  available: boolean;
  buy: (productId: string, opts?: { onCredited?: () => void }) => Promise<boolean>;
  restore: () => Promise<void>;
  reload: () => void;
}

export function useStoreFlow(): StoreFlow {
  const { session } = useAuth();
  const { refresh } = useQuota();
  const [packs, setPacks] = useState<IapPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [message, setMessage] = useState<{ ok?: string; error?: string }>({});
  const [tick, setTick] = useState(0);
  const available = iapAvailable();

  useEffect(() => {
    let on = true;
    setLoading(true);
    (async () => {
      const list = available ? await getIapPacks() : [];
      if (!on) return;
      setPacks(list);
      setLoading(false);
    })();
    return () => { on = false; };
  }, [available, tick]);

  const buy = useCallback<StoreFlow["buy"]>(async (productId, opts) => {
    setMessage({});
    const token = session?.access_token;
    if (!token) { setMessage({ error: copy.store.needLogin }); return false; }
    if (!available) { setMessage({ error: copy.store.notConfigured }); return false; }
    const pack = packs.find((p) => p.id === productId);
    if (!pack) { setMessage({ error: copy.store.noProduct }); return false; }
    setBusyId(productId);
    const sub = isSubscription(productId);
    try {
      const res = await purchaseIap(pack);
      if (res.cancelled) return false;
      try {
        await grantWithRetry(token, productId, res.transactionId);
      } catch (e) {
        // 구독은 웹훅(INITIAL_PURCHASE)이 적립 → 즉시 반영 안 돼도 실패 아님
        if (!sub) throw e;
      }
      refresh();
      opts?.onCredited?.();
      setMessage({ ok: sub ? copy.store.subDone : copy.store.packDone(pack.count) });
      return true;
    } catch (e) {
      setMessage({ error: (e as Error)?.message || String(e) });
      return false;
    } finally {
      setBusyId(null);
    }
  }, [available, packs, refresh, session?.access_token]);

  const restore = useCallback(async () => {
    setMessage({});
    setRestoring(true);
    try {
      const r = await restoreIap();
      if (!r.restored) { setMessage({ error: r.error || copy.store.restoreFail }); return; }
      refresh();
      setMessage({ ok: copy.store.restoreOk });
    } finally {
      setRestoring(false);
    }
  }, [refresh]);

  const reload = useCallback(() => setTick((n) => n + 1), []);

  return { packs, loading, busyId, restoring, message, available, buy, restore, reload };
}
