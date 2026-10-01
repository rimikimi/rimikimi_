import { isKo, pick } from "./locale";

// 판매 상품 — 웹 src/PortraitStudio.jsx CREDIT_PACKS / SUB_PLANS + src/iap.js IAP_PRODUCTS 그대로.
// id 는 서버 api/_lib/payments/packages.js 및 RevenueCat/Play 상품 ID 와 1:1.

export interface CreditPack { id: string; count: number; krw: number; label: string; label_en: string; badge: "first" | "best" | "cheapest" | null }
export interface SubPlan { id: string; period: "week" | "month" | "year"; credits: number; krw: number; label: string; label_en: string; badge: string | null; badge_en: string | null }

// 2026-09-30 오너 가격 개편(iOS StoreManager 와 같음): 6장 인트로 판매 중단 → 1장 ₩1,900 · 인트로 3장 ₩3,900 ·
// 미니 12 ₩11,900 · 스탠다드 24 ₩22,900 · 프로 48 ₩44,900 / 구독 주 10장 ₩9,900 · 월 35장 ₩29,900 · 연 400장 ₩299,000.
export const CREDIT_PACKS: readonly CreditPack[] = [
  { id: "rimikimi.pack.single", count: 1, krw: 1900, label: "1장", label_en: "Single", badge: null },
  { id: "rimikimi.pack.trial", count: 3, krw: 3900, label: "인트로", label_en: "Intro", badge: null },
  { id: "rimikimi.pack.mini", count: 12, krw: 11900, label: "미니", label_en: "Mini", badge: null },
  { id: "rimikimi.pack.standard", count: 24, krw: 22900, label: "스탠다드", label_en: "Standard", badge: "best" },
  { id: "rimikimi.pack.pro", count: 48, krw: 44900, label: "프로", label_en: "Pro", badge: "cheapest" },
];

/** 첫 구매 30% 할인 — 소모품은 스토어 할인 기능이 없어 **별도 상품**(같은 장수). 결제 기록 없는 계정
 *  (서버 quota.firstPurchase)에게만, 스토어가 그 상품을 돌려줄 때만 정가 팩 대신 보여 준다. */
export const FIRST_PACK_ID: Record<string, string> = {
  "rimikimi.pack.single": "rimikimi.pack.single.first",
  "rimikimi.pack.trial": "rimikimi.pack.trial.first",
  "rimikimi.pack.mini": "rimikimi.pack.mini.first",
  "rimikimi.pack.standard": "rimikimi.pack.standard.first",
  "rimikimi.pack.pro": "rimikimi.pack.pro.first",
};
export const FIRST_PACK_KRW: Record<string, number> = {
  "rimikimi.pack.single": 1300, "rimikimi.pack.trial": 2700, "rimikimi.pack.mini": 8300,
  "rimikimi.pack.standard": 15900, "rimikimi.pack.pro": 31500,
};

export const SUB_PLANS: readonly SubPlan[] = [
  { id: "rimikimi.sub.plus.weekly", period: "week", credits: 10, krw: 9900, label: "위클리", label_en: "Weekly", badge: null, badge_en: null },
  { id: "rimikimi.sub.plus.monthly", period: "month", credits: 35, krw: 29900, label: "먼슬리", label_en: "Monthly", badge: null, badge_en: null },
  { id: "rimikimi.sub.plus.annual", period: "year", credits: 400, krw: 299000, label: "애뉴얼", label_en: "Annual", badge: "가장 저렴", badge_en: "Best price" },
];

/** productId → 장수(표시용 — 실제 지급은 서버 packages.js 가 정한다). 옛 구독 ID 는 기존 구독자 갱신용으로 남긴다. */
export const IAP_PRODUCTS: Record<string, number> = {
  "rimikimi.pack.single": 1,
  "rimikimi.pack.single.first": 1,
  "rimikimi.pack.trial": 3,
  "rimikimi.pack.trial.first": 3,
  "rimikimi.pack.mini": 12,
  "rimikimi.pack.mini.first": 12,
  "rimikimi.pack.standard": 24,
  "rimikimi.pack.standard.first": 24,
  "rimikimi.pack.pro": 48,
  "rimikimi.pack.pro.first": 48,
  "rimikimi.sub.plus.weekly": 10,
  "rimikimi.sub.plus.monthly": 35,
  "rimikimi.sub.plus.annual": 400,
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
/** 팩 표시 이름(영어 UI 면 _en). */
export const packLabel = (p: CreditPack) => pick(p.label, p.label_en);
/** 구독 플랜 표시 이름·배지(영어 UI 면 _en). */
export const planLabel = (s: SubPlan) => pick(s.label, s.label_en);
export const planBadge = (s: SubPlan) => (s.badge ? pick(s.badge, s.badge_en) : null);
/** 장당 가격(원) */
export const perUnitKrw = (p: CreditPack) => Math.round(p.krw / p.count);
