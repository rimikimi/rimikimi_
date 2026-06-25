// ============================================================
// 크레딧 패키지 정의 (모든 결제수단 공통)
// 가격 수정은 여기 한 곳만 고치면 됨.
//
// id      : 우리 코드 (DB/API에서 사용. 절대 바꾸지 말 것)
// credits : 적립 크레딧 수
// usd     : 달러 가격 (PayPal 용) — 소수점 2자리 string
// krw     : 원 가격 (이니시스 용) — 정수
// label_ko/label_en : UI 표시
// ============================================================

export const PACKAGES = [
  {
    id: "credits_10",
    credits: 10,
    usd: "7.90",
    krw: 7900,
    label_ko: "10 크레딧",
    label_en: "10 Credits",
    badge_ko: null,
    badge_en: null,
  },
  {
    id: "credits_30",
    credits: 30,
    usd: "22.50",
    krw: 22500,
    label_ko: "30 크레딧",
    label_en: "30 Credits",
    badge_ko: "인기",
    badge_en: "Popular",
  },
  {
    id: "credits_70",
    credits: 70,
    usd: "49.90",
    krw: 49900,
    label_ko: "70 크레딧",
    label_en: "70 Credits",
    badge_ko: "이득",
    badge_en: "Best Value",
  },
  {
    id: "credits_120",
    credits: 120,
    usd: "79.90",
    krw: 79900,
    label_ko: "120 크레딧",
    label_en: "120 Credits",
    badge_ko: "최고 가성비",
    badge_en: "Best Deal",
  },
];

export function findPackage(id) {
  return PACKAGES.find((p) => p.id === id) || null;
}
