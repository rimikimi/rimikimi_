// ============================================================
// 크레딧 패키지 + 구독 정의 (모든 결제수단 공통 단일 소스)
// 가격 수정은 여기 한 곳만 고치면 됨.
//
// id       : 우리 코드 (DB/API/스토어 productId. 절대 바꾸지 말 것)
// kind     : "consumable"(크레딧 팩) | "subscription"(자동갱신 구독)
// period   : 구독만 — "month" | "year"
// credits  : 적립 크레딧 수 (구독은 1갱신당 지급량)
// usd      : 달러 가격 (스토어 참고/PayPal) — 소수점 2자리 string
// krw      : 원 가격 (참고 표시) — 정수
// ============================================================

export const PACKAGES = [
  // ── 소비형 크레딧 팩 (2026-07 Pro 엔진 반영 재가격, 10장=₩790/장 기준) ──
  {
    id: "credits_10", kind: "consumable", credits: 10,
    usd: "5.99", krw: 7900,
    label_ko: "10 크레딧", label_en: "10 Credits",
    badge_ko: null, badge_en: null,
  },
  {
    id: "credits_30", kind: "consumable", credits: 30,
    usd: "14.99", krw: 19800,
    label_ko: "30 크레딧", label_en: "30 Credits",
    badge_ko: "인기", badge_en: "Popular",
  },
  {
    id: "credits_70", kind: "consumable", credits: 70,
    usd: "29.99", krw: 39800,
    label_ko: "70 크레딧", label_en: "70 Credits",
    badge_ko: "이득", badge_en: "Best Value",
  },
  {
    id: "credits_120", kind: "consumable", credits: 120,
    usd: "44.99", krw: 59800,
    label_ko: "120 크레딧", label_en: "120 Credits",
    badge_ko: "최고 가성비", badge_en: "Best Deal",
  },

  // ── 구독 rimikimi+ (광고·워터마크 제거 + 크레딧 자동 충전) ──
  // Pro 엔진(원가↑) 반영: 장당 실효 ~₩412~495. 월간 20크레딧, 연간 240(=월 20×12, 2개월 무료).
  {
    id: "rimikimi_plus_monthly", kind: "subscription", period: "month", credits: 20,
    usd: "7.99", krw: 9900,
    label_ko: "rimikimi+ 월간", label_en: "rimikimi+ Monthly",
    badge_ko: "광고 제거", badge_en: "Ad-free",
  },
  {
    id: "rimikimi_plus_annual", kind: "subscription", period: "year", credits: 240,
    usd: "74.99", krw: 99000,
    label_ko: "rimikimi+ 연간", label_en: "rimikimi+ Annual",
    badge_ko: "2개월 무료", badge_en: "2 Months Free",
  },
];

export const CONSUMABLES = PACKAGES.filter((p) => p.kind === "consumable");
export const SUBSCRIPTIONS = PACKAGES.filter((p) => p.kind === "subscription");
export const SUBSCRIPTION_IDS = SUBSCRIPTIONS.map((p) => p.id);
export const IS_SUBSCRIPTION = (id) => SUBSCRIPTION_IDS.includes(id);

export function findPackage(id) {
  return PACKAGES.find((p) => p.id === id) || null;
}
