import { useCallback } from "react";
import { ToastAndroid } from "react-native";
import { useQuota } from "./quota";
import { useCreditGate } from "./creditGate";
import { askAdFree } from "./adFreePrompt";
import { showRewardedForCreate } from "./ads";
import { c21 } from "./copy21";

/**
 * 저장 전 광고 — **무료 사용자만**(오너 지시 2026-10-07 "무료 사용자는 무조건 저장하려면 광고를 봐야 함",
 * "유료 사용자는 보이면 안 되고"). 크레딧이 남아 있는지와는 상관없다. ios2 `AppState.adGateBeforeSave()` 와 같은 규칙.
 *   - 무료 = 결제 기록(크레딧팩·구독)이 한 번도 없는 계정 — 서버 quota `firstPurchase`.
 *   - 무제한 계정 → 안 띄운다.
 *   - quota 를 아직 못 불러왔으면 → 안 띄운다(모르면 안 띄우는 쪽).
 * 2026-10-12 오너: 저장 광고도 보상형 — 만들기와 같은 안내("광고 없애기" / "광고 보고 저장")를 먼저 띄운다.
 * true = 저장 진행(끝까지 봄·광고 없음·무료 아님), false = 저장 안 함(닫음·중간에 끔·충전으로 감).
 * 끝까지 본 뒤 90초 동안은 다시 묻지 않는다(여러 장 저장 = 광고 1번). 동시에 여러 번 불려도 안내는 하나.
 */
let passUntil = 0;
let inflight: Promise<boolean> | null = null;

export function useSaveAdGate(): () => Promise<boolean> {
  const { quota, loaded } = useQuota();
  const gate = useCreditGate();
  return useCallback(async () => {
    if (!loaded || !quota || quota.unlimited || quota.firstPurchase !== true) return true;
    if (Date.now() < passUntil) return true;
    if (inflight) return inflight;
    inflight = (async () => {
      const choice = await askAdFree("member", "save");
      if (choice === "buy") { setTimeout(gate.openAdFree, 300); return false; } // 안내 시트 닫힘 뒤에
      if (choice !== "watch") return false;
      await new Promise((r) => setTimeout(r, 300)); // 시트 닫힘 애니메이션 뒤에 광고를 띄운다
      const ok = await showRewardedForCreate();
      if (ok) passUntil = Date.now() + 90_000;
      else ToastAndroid.show(c21.rewardedIncompleteSave, ToastAndroid.SHORT);
      return ok;
    })();
    try { return await inflight; } finally { inflight = null; }
  }, [loaded, quota, gate]);
}
