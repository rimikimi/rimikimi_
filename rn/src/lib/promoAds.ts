// 생성 중 케이스 광고(오너 2026-10-29, iOS PromoAdStore 와 같은 규칙) — 서버 `/promo-ads.json` 이 정한다.
// 끄기·영상·링크 교체는 서버 파일로(빌드 없이). 안드로이드는 갤럭시 케이스 영상·갤럭시 상품.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getEnv } from "./env";
import { isKo } from "./locale";

type Pair = { ios?: string; android?: string };
type Txt = { ko?: string; en?: string };
export type PromoSegment = { until: number; series?: string; link: Pair };
export type PromoAd = { id: string; video: Pair; poster?: Pair; segments: PromoSegment[] };
export type PromoConfig = { enabled: boolean; locales?: string[]; headline?: Txt; button?: Txt; magicBoothFirst?: string; ads: PromoAd[] };

const KEY = "promoAds.cache";
const MUTE_KEY = "promoAds.muted";
let cfg: PromoConfig | null = null;
const subs = new Set<() => void>();

export function promoConfig(): PromoConfig | null { return cfg; }
export function onPromoChange(f: () => void): () => void { subs.add(f); return () => { subs.delete(f); }; }

export async function loadPromoAds(): Promise<void> {
  try { const raw = await AsyncStorage.getItem(KEY); if (raw) { cfg = JSON.parse(raw); subs.forEach((f) => f()); } } catch { /* 캐시 없음 */ }
  try {
    const r = await fetch(`${getEnv().apiBase}/promo-ads.json`, { cache: "no-cache" });
    if (!r.ok) return;
    const j = (await r.json()) as PromoConfig;
    if (j && Array.isArray(j.ads)) { cfg = j; subs.forEach((f) => f()); await AsyncStorage.setItem(KEY, JSON.stringify(j)); }
  } catch { /* 오프라인 */ }
}

export function promoActive(): boolean {
  if (!cfg || !cfg.enabled || !cfg.ads?.length) return false;
  if (cfg.locales?.length) return cfg.locales.includes(isKo ? "ko" : "en");
  return true;
}

export function promoText(t: Txt | undefined, ko: string, en: string): string {
  const v = isKo ? t?.ko : t?.en;
  return v ? v : isKo ? ko : en;
}

export function promoUrl(path?: string): string | null {
  if (!path) return null;
  return /^https?:/.test(path) ? path : `${getEnv().apiBase}/${path.replace(/^\//, "")}`;
}

/** 무작위 순서. 매직 부스 생성이면 magicBoothFirst(커스텀)부터. */
export function promoPlaylist(magicBooth: boolean): PromoAd[] {
  if (!cfg) return [];
  const list = [...cfg.ads];
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  if (magicBooth && cfg.magicBoothFirst) {
    const i = list.findIndex((a) => a.id === cfg!.magicBoothFirst);
    if (i > 0) list.unshift(list.splice(i, 1)[0]);
  }
  return list;
}

export function promoLink(ad: PromoAd, seconds: number): string | null {
  const seg = ad.segments.find((s) => seconds < s.until) ?? ad.segments[ad.segments.length - 1];
  return seg?.link.android ?? null;
}

export async function loadPromoMuted(): Promise<boolean> { try { return (await AsyncStorage.getItem(MUTE_KEY)) === "1"; } catch { return false; } }
export async function savePromoMuted(m: boolean): Promise<void> { try { await AsyncStorage.setItem(MUTE_KEY, m ? "1" : "0"); } catch { /* 무시 */ } }
