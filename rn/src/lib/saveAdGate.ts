import { useCallback } from "react";
import { useQuota } from "./quota";
import { showAndWait } from "./ads";

/**
 * 저장 전 광고 — **무료 사용자만**(오너 지시 2026-10-07 "무료 사용자는 무조건 저장하려면 광고를 봐야 함",
 * "유료 사용자는 보이면 안 되고"). 크레딧이 남아 있는지와는 상관없다. ios2 `AppState.adGateBeforeSave()` 와 같은 규칙.
 *   - 무료 = 결제 기록(크레딧팩·구독)이 한 번도 없는 계정 — 서버 quota `firstPurchase`.
 *   - 무제한 계정 → 안 띄운다.
 *   - quota 를 아직 못 불러왔으면 → 안 띄운다(모르면 안 띄우는 쪽).
 * 돌려준 함수를 await 하면 광고가 닫힌 뒤에 돌아온다. 그다음 저장하면 된다.
 */
export function useSaveAdGate(): () => Promise<void> {
  const { quota, loaded } = useQuota();
  return useCallback(async () => {
    if (!loaded || !quota || quota.unlimited || quota.firstPurchase !== true) return;
    await showAndWait();
  }, [loaded, quota]);
}
