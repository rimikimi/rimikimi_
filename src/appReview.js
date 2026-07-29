// ============================================================
// 인앱 리뷰 요청 — Apple SKStoreReviewController / Play In-App Review
//
// 왜 필요한가: 사진을 만든 유저 수 대비 스토어 리뷰가 거의 없다. 안 물어봐서 안
//   쌓인 것 — picbox 앱에서 같은 문제를 이 로직으로 해결한 전례를 그대로 이식한다.
//
// 🔴 절대 금지 — 리뷰에 어떤 보상도 걸지 말 것:
//   Google Play "Don't offer rewards or incentives for ratings or reviews."
//   Apple: "paid, incentivized ... feedback" 적발 시 개발자 프로그램 퇴출 가능.
//   애초에 기술적으로도 불가능하다 — 이 API 는 **리뷰를 남겼는지 알려주지 않는다**
//   (콜백 없음, 팝업이 떴는지도 모름). 보상 로직을 만들 방법 자체가 없다.
//   자체 별점 UI 를 만들어 고평점만 스토어로 보내는 것도 금지다.
//
// 호출 예산: 애플은 **연 3회**로 제한하고 초과분은 조용히 무시한다.
//   그래서 "아무 때나"가 아니라 만족도가 가장 높은 순간에 한 번만 쓴다.
//   트리거: 생성 2장 이상 성공 + 결과를 사진첩에 저장한 직후(= 마음에 들었다는 신호).
//   한 번 요청하면 REASK_DAYS 동안 다시 묻지 않는다.
//
// ⚠️ 정적 import + 동기 getter 패턴 필수 — Capacitor 프록시의 .then 접근이 네이티브
//   호출로 해석돼 영구 정지되는 함정 때문(nativeBridge.js·iap.js 주석 참고).
// ============================================================
import { Capacitor } from "@capacitor/core";
import { InAppReview as _InAppReviewStatic } from "@capacitor-community/in-app-review";

const getInAppReview = () => _InAppReviewStatic;

const KEY_GENS = "rimikimi_review_gen_count_v1";   // 성공 생성 누적 횟수
const KEY_ASKED = "rimikimi_review_asked_at_v1";   // 마지막 요청 시각(ms)

const MIN_GENERATIONS = 2;   // 이만큼 만들어 본 뒤에 묻는다(첫 사용에 묻지 않기)
const REASK_DAYS = 120;      // 한 번 물으면 이 기간 동안 재요청 금지

function readInt(key) {
  try {
    const v = parseInt(localStorage.getItem(key) || "0", 10);
    return Number.isFinite(v) ? v : 0;
  } catch (_) {
    return 0;
  }
}

function writeInt(key, v) {
  try { localStorage.setItem(key, String(v)); } catch (_) { /* 무시 */ }
}

// 생성이 성공할 때마다 호출 — 카운트만 올린다(요청은 하지 않음).
export function noteGeneration() {
  writeInt(KEY_GENS, readInt(KEY_GENS) + 1);
}

// 지금 리뷰를 물어도 되는 상태인가. (테스트 위해 now 주입 가능)
export function shouldAskForReview(now = Date.now()) {
  if (readInt(KEY_GENS) < MIN_GENERATIONS) return false;
  const asked = readInt(KEY_ASKED);
  if (!asked) return true;
  return now - asked > REASK_DAYS * 24 * 60 * 60 * 1000;
}

// 저장 성공 직후 호출. 조건을 만족하면 네이티브 리뷰 시트를 1회 요청한다.
// 반환값은 "요청을 시도했는지"일 뿐 — 유저가 리뷰를 남겼는지는 알 수 없다(알 방법이 없다).
// 실패해도 앱 동작에 영향이 없어야 하므로 전부 삼킨다.
export async function maybeRequestReview({ now = Date.now() } = {}) {
  try {
    if (!Capacitor.isNativePlatform()) return false; // 웹은 대상 아님
    if (!shouldAskForReview(now)) return false;
    writeInt(KEY_ASKED, now); // 시트가 떴든 안 떴든 예산을 쓴 것으로 간주(연 3회 보호)
    await getInAppReview().requestReview();
    return true;
  } catch (_) {
    return false;
  }
}
