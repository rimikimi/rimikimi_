// ============================================================
// 크레딧 패키지 + 구독 정의 (모든 결제수단 공통 단일 소스)
// 가격 수정은 여기 한 곳만 고치면 됨. 프론트 src/iap.js IAP_PRODUCTS,
// src/PortraitStudio.jsx CREDIT_PACKS 와 id 1:1 매칭 필수.
//
// id       : 우리 코드 (DB/API/스토어 productId. 절대 바꾸지 말 것)
// kind     : "consumable"(크레딧 팩) | "subscription"(자동갱신 구독)
// period   : 구독만 — "month" | "year"
// credits  : 적립 크레딧 수 (구독은 1갱신당 지급량)
// usd      : 달러 가격 (스토어 참고/PayPal) — 소수점 2자리 string
// krw      : 원 가격 (참고 표시) — 정수
// label_ko/label_en, tagline_ko/tagline_en, badge_ko/badge_en : UI 표시
//
// 2026-08-14: claire(`claire/api/_lib/payments/packages.js`) 크레딧 구조에 맞춰
// 신규 판매 팩 4종을 claire.pack.* 와 동일한 크레딧/가격/의미(첫 구매·베스트 가치·
// 장당 최저)로 교체(오너 지시). 구독은 이번에 건드리지 않음(기존 구독자 가격 유지).
// ============================================================

export const PACKAGES = [
  // ── 소비형 크레딧 팩 — 2026-09-30 오너 가격 개편(장당 약 ₩1,000 기준, 인트로 팩 폐지) ──
  {
    id: "rimikimi.pack.mini", kind: "consumable", credits: 12,
    usd: "8.99", krw: 11900,
    label_ko: "미니 팩", label_en: "Mini",
    tagline_ko: "12장", tagline_en: "12 images",
    badge_ko: null, badge_en: null,
  },
  {
    id: "rimikimi.pack.standard", kind: "consumable", credits: 24,
    usd: "16.99", krw: 22900,
    label_ko: "스탠다드 팩", label_en: "Standard",
    tagline_ko: "24장 · 가장 인기", tagline_en: "24 images · most popular",
    badge_ko: "베스트 가치", badge_en: "Best value",
  },
  {
    id: "rimikimi.pack.pro", kind: "consumable", credits: 48,
    usd: "32.99", krw: 44900,
    label_ko: "프로 팩", label_en: "Pro",
    tagline_ko: "48장 · 장당 최저", tagline_en: "48 images · lowest per-image",
    badge_ko: "장당 최저", badge_en: "Lowest per image",
  },

  // ── 구독 rimikimi+ — 2026-09-30 가격 개편(같은 상품 id, 애플에서 기존 구독자 가격 유지).
  //    첫 결제 30% 할인은 애플 첫 결제 할인(Introductory Offer)으로 — 지급 장수는 같다.
  {
    id: "rimikimi.sub.plus.weekly", kind: "subscription", period: "week", credits: 10,
    usd: "6.99", krw: 9900,
    label_ko: "rimikimi+ 위클리", label_en: "rimikimi+ Weekly",
    tagline_ko: "주 10장", tagline_en: "10 photos/week",
    badge_ko: null, badge_en: null,
  },
  {
    id: "rimikimi.sub.plus.monthly", kind: "subscription", period: "month", credits: 35,
    usd: "19.99", krw: 29900,
    label_ko: "rimikimi+ 먼슬리", label_en: "rimikimi+ Monthly",
    tagline_ko: "월 35장", tagline_en: "35 photos/month",
    badge_ko: "광고 제거", badge_en: "Ad-free",
  },
  {
    id: "rimikimi.sub.plus.annual", kind: "subscription", period: "year", credits: 400,
    usd: "199.99", krw: 299000,
    label_ko: "rimikimi+ 애뉴얼", label_en: "rimikimi+ Annual",
    tagline_ko: "연 400장", tagline_en: "400 photos/year",
    badge_ko: "가장 저렴", badge_en: "Best value",
  },
];

// ── 첫 구매 30% 할인 크레딧 팩 (2026-09-30) — 애플 소모품엔 할인 기능이 없어 별도 상품이다.
//    판매 목록(PACKAGES)에는 넣지 않는다: 앱이 quota.firstPurchase 가 참일 때만 일반 팩 대신 보여 준다.
//    지급 장수는 일반 팩과 같다.
export const FIRST_PURCHASE_PACKAGES = [
  { id: "rimikimi.pack.mini.first", kind: "consumable", credits: 12, usd: "5.99", krw: 8300 },
  { id: "rimikimi.pack.standard.first", kind: "consumable", credits: 24, usd: "11.99", krw: 15900 },
  { id: "rimikimi.pack.pro.first", kind: "consumable", credits: 48, usd: "22.99", krw: 31500 },
];

// ── 레거시 소비형 productId → 크레딧 매핑 (판매 목록에서는 제외 — 새 구매는 여기서 불가) ──
// ⚠️ 절대 지우지 말 것. 이미 스토어에 승인돼 있던 productId 들이라 과거 구매자의
// 복원(restore)·영수증 재검증·RevenueCat 웹훅 재전송이 계속 들어올 수 있다. 여기서 빠지면
// grantCreditsForTransaction() 이 "알 수 없는 상품"(400)으로 거부해 과거 구매자 적립이 깨진다.
//   - credits10/30/70/120      : 2026-07~2026-08 실제 판매 상품(승인·라이브). 2026-08-14 신규
//     rimikimi.pack.* 4종으로 교체하며 판매 목록에서만 제외 — 매핑은 존속.
//   - credits_10/30/70/120     : credits10 이전 세대 productId. ASC 심사에 갇혀 재생성됐다
//     (commit e118799, 2026-07-20) — 실구매자가 없었을 가능성이 높지만, 남아있을 수 있는
//     리시트 재검증/복원 요청이 거부되지 않도록 방어적으로 계속 유지.
//   - plus_monthly / plus_annual : 2026-08-14 이전 세대 구독. **기존 구독자가 매달 갱신 중**이라
//     갱신 영수증·웹훅이 계속 들어온다. 판매 목록에서만 뺐고 매핑은 존속해야 한다.
//   - rimikimi_plus_*            : 그 이전 세대(스토어에 PENDING 으로 남아있음). 방어적으로 유지.
export const LEGACY_PACKAGES = [
  // 2026-09-30 판매 중단(인트로 팩) — 이미 산 사람의 재검증·웹훅이 거부되지 않게 매핑은 둔다.
  { id: "rimikimi.pack.intro", kind: "consumable", credits: 6 },
  { id: "plus_monthly", kind: "subscription", period: "month", credits: 20 },
  { id: "plus_annual", kind: "subscription", period: "year", credits: 240 },
  { id: "rimikimi_plus_monthly", kind: "subscription", period: "month", credits: 20 },
  { id: "rimikimi_plus_annual", kind: "subscription", period: "year", credits: 240 },
  { id: "credits10", kind: "consumable", credits: 10 },
  { id: "credits30", kind: "consumable", credits: 30 },
  { id: "credits70", kind: "consumable", credits: 70 },
  { id: "credits120", kind: "consumable", credits: 120 },
  { id: "credits_10", kind: "consumable", credits: 10 },
  { id: "credits_30", kind: "consumable", credits: 30 },
  { id: "credits_70", kind: "consumable", credits: 70 },
  { id: "credits_120", kind: "consumable", credits: 120 },
];

// 그랜트/웹훅 등 "이 productId 가 우리 상품이 맞는가 + 몇 크레딧인가" 판정에 쓰는 전체 목록.
// 판매 목록(UI)에는 PACKAGES 만 쓰고, 지급 판정에는 반드시 이 ALL_PACKAGES(판매중 + 레거시)를 쓴다.
export const ALL_PACKAGES = [...PACKAGES, ...FIRST_PURCHASE_PACKAGES, ...LEGACY_PACKAGES];

export const CONSUMABLES = PACKAGES.filter((p) => p.kind === "consumable");
export const SUBSCRIPTIONS = PACKAGES.filter((p) => p.kind === "subscription");
export const SUBSCRIPTION_IDS = SUBSCRIPTIONS.map((p) => p.id);
export const IS_SUBSCRIPTION = (id) => SUBSCRIPTION_IDS.includes(id);

export function findPackage(id) {
  return ALL_PACKAGES.find((p) => p.id === id) || null;
}
