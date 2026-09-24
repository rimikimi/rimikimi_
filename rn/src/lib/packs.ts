import { isKo, pick } from "./locale";

// 판매 상품 — 웹 src/PortraitStudio.jsx CREDIT_PACKS / SUB_PLANS + src/iap.js IAP_PRODUCTS 그대로.
// id 는 서버 api/_lib/payments/packages.js 및 RevenueCat/Play 상품 ID 와 1:1.

export interface CreditPack { id: string; count: number; krw: number; badge: "first" | "best" | "cheapest" | null }
export interface SubPlan { id: string; period: "week" | "month" | "year"; credits: number; krw: number; label: string; label_en: string; badge: string | null; badge_en: string | null }

export const CREDIT_PACKS: readonly CreditPack[] = [
  { id: "rimikimi.pack.intro", count: 6, krw: 3900, badge: "first" },
  { id: "rimikimi.pack.mini", count: 12, krw: 7900, badge: null },
  { id: "rimikimi.pack.standard", count: 24, krw: 14900, badge: "best" },
  { id: "rimikimi.pack.pro", count: 45, krw: 27000, badge: "cheapest" },
];

export const SUB_PLANS: readonly SubPlan[] = [
  { id: "rimikimi.sub.plus.weekly", period: "week", credits: 8, krw: 6900, label: "위클리", label_en: "Weekly", badge: null, badge_en: null },
  { id: "rimikimi.sub.plus.monthly", period: "month", credits: 30, krw: 12900, label: "먼슬리", label_en: "Monthly", badge: null, badge_en: null },
  { id: "rimikimi.sub.plus.annual", period: "year", credits: 240, krw: 109000, label: "애뉴얼", label_en: "Annual", badge: "가장 저렴", badge_en: "Best price" },
];

/** productId → 지급 크레딧(1.x IAP_PRODUCTS). 옛 구독 ID 는 기존 구독자 갱신용으로 남긴다. */
export const IAP_PRODUCTS: Record<string, number> = {
  "rimikimi.pack.intro": 6,
  "rimikimi.pack.mini": 12,
  "rimikimi.pack.standard": 24,
  "rimikimi.pack.pro": 45,
  "rimikimi.sub.plus.weekly": 8,
  "rimikimi.sub.plus.monthly": 30,
  "rimikimi.sub.plus.annual": 240,
  plus_monthly: 20,
  plus_annual: 240,
  rimikimi_plus_monthly: 20,
  rimikimi_plus_annual: 240,
};
export const SUBSCRIPTION_IDS = [
  "rimikimi.sub.plus.weekly", "rimikimi.sub.plus.monthly", "rimikimi.sub.plus.annual",
  "plus_monthly", "plus_annual", "rimikimi_plus_monthly", "rimikimi_plus_annual",
];
export const isSubscription = (id: string) => SUBSCRIPTION_IDS.includes(id);
/** Play 는 구독 상품 ID 를 `subId:basePlanId` 로 내려준다 — 접미사를 뗀다(1.x baseProductId). */
export const baseProductId = (id: string | undefined | null) => String(id || "").split(":")[0];
export const PRODUCT_IDS = Object.keys(IAP_PRODUCTS);

export const won = (n: number) => (isKo ? n.toLocaleString("ko-KR") + "원" : "₩" + n.toLocaleString("en-US"));
/** 구독 플랜 표시 이름·배지(영어 UI 면 _en). */
export const planLabel = (s: SubPlan) => pick(s.label, s.label_en);
export const planBadge = (s: SubPlan) => (s.badge ? pick(s.badge, s.badge_en) : null);
/** 장당 가격(원) */
export const perUnitKrw = (p: CreditPack) => Math.round(p.krw / p.count);
/** 첫 팩 대비 할인율(%) — 웹 packDiscountPercent 와 같은 뜻 */
export function packDiscountPercent(p: CreditPack): number | null {
  const base = perUnitKrw(CREDIT_PACKS[0]);
  const mine = perUnitKrw(p);
  if (mine >= base) return null;
  return Math.round((1 - mine / base) * 100);
}
