import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { t } from "@/lib/copy21";
import { getEnv } from "@/lib/env";
import { FILM_PRESETS, type Preset } from "@/filters";
import { clearLookCache } from "@/ui/LiveCamera";

// 필터 묶음 — iOS `FilterTabView.groups` 와 같은 순서·같은 키(2026-10-26 5탭 개편). 카메라 탭 칩과 필터 탭이 같이 쓴다.
// 2026-10-27(오너 "필터 업데이트할 때마다 빌드?"): 서버 `/filters.json`(scripts/gen-filters-json.mjs)이 있으면
// 묶음·추천·신규·이름·값을 그것으로 바꾼다 — 배열은 **제자리에서** 갈아끼운다(가져다 쓰는 곳이 그대로 보게).
// 안드 실시간 셰이더에 없는 그리기(소프트 플래시·피사체 글로우·빛번짐 dreamy 등)는 받지 않는다 — 앱 기본값이 있으면 그것.
export const PHONE = ["ph16pro", "ph15pro", "ph14pro", "phxs", "ph7", "ph6s", "ph4s", "ph3gs", "folder"];
export const VINTAGE = ["vintC", "vintL", "vintP", "vintG", "vintS", "vintF", "haduri"];
export const MOOD = [
  "golden", "peach", "slide", "retro", "vivid", "green", "pastel", "cine", "newtro", "softmono",
  "warm", "cool", "vintage", "docu", "mono", "digicam", "y2k", "toy", "dispo", "instant",
];
export const FX = ["neonglow", "bloom", "lightleak", "softfocus", "haze", "spotlight", "grainy", "vhs", "glitch", "pixelate"];

export interface FilterGroupDef { key: string; title: () => string; keys: string[] }
export const FILTER_GROUPS: FilterGroupDef[] = [
  { key: "phone", title: () => t("폰카", "Phone"), keys: PHONE },
  { key: "vintage", title: () => t("빈티지", "Vintage"), keys: VINTAGE },
  { key: "mood", title: () => t("감성", "Mood"), keys: MOOD },
  { key: "fx", title: () => t("특수효과", "Special FX"), keys: FX },
];
/** 추천·신규 — iOS featuredKeys / newKeys 와 같다. */
export const FEATURED = ["ph7", "golden", "vintC", "peach", "ph4s", "bloom", "cine", "vintS"];
export const NEW_KEYS = ["folder", "y2k", "haduri"];

const ANDROID_SPECIALS = new Set(["duotone", "thermal", "glitch", "vhs", "pixelate", "sketch"]);
const CACHE_KEY = "filters.cache";
let version = 0;
const listeners = new Set<() => void>();
const replace = (arr: string[], next: string[]) => { arr.splice(0, arr.length, ...next); };

type Remote = { groups?: { key: string; ko?: string; en?: string; keys?: string[] }[]; featured?: string[]; new?: string[]; presets?: Record<string, Partial<Preset> & { ko?: string; en?: string }> };

/** 서버 카탈로그 반영. 형식이 틀리면 아무것도 바꾸지 않는다. 반영했으면 true. */
export function applyFilterCatalog(j: Remote): boolean {
  if (!j || typeof j !== "object" || !j.presets || !Array.isArray(j.groups)) return false;
  const builtin = new Set(FILM_PRESETS.map((p) => p.key));
  const usable = new Set<string>();
  for (const [k, v] of Object.entries(j.presets)) {
    if (!v || typeof v !== "object") continue;
    if (v.special && !ANDROID_SPECIALS.has(v.special)) { if (builtin.has(k)) usable.add(k); continue; }   // 모르는 그리기 → 앱 값
    const p = { ...(v as Preset), key: k, ko: v.ko ?? k, en: v.en ?? k } as Preset;
    const i = FILM_PRESETS.findIndex((x) => x.key === k);
    if (i >= 0) FILM_PRESETS[i] = { ...p, group: FILM_PRESETS[i].group }; else FILM_PRESETS.push(p);
    usable.add(k);
  }
  const ok = (k: string) => usable.has(k) || (builtin.has(k) && k !== "flashsoft" && k !== "subjectglow");
  const byKey: Record<string, string[]> = {};
  for (const g of j.groups) if (g && typeof g.key === "string" && Array.isArray(g.keys)) byKey[g.key] = g.keys.filter(ok);
  if (!Object.values(byKey).some((a) => a.length)) return false;
  if (byKey.phone) replace(PHONE, byKey.phone);
  if (byKey.vintage) replace(VINTAGE, byKey.vintage);
  if (byKey.mood) replace(MOOD, byKey.mood);
  if (byKey.fx) replace(FX, byKey.fx);
  for (const g of j.groups) {                                   // 묶음 이름도 서버 것으로(빌드 없이 바꾸게)
    const def = FILTER_GROUPS.find((x) => x.key === g.key);
    if (def && g.ko && g.en) { const ko = g.ko, en = g.en; def.title = () => t(ko, en); }
  }
  if (Array.isArray(j.featured)) replace(FEATURED, j.featured.filter(ok));
  if (Array.isArray(j.new)) replace(NEW_KEYS, j.new.filter(ok));
  clearLookCache();
  version++; listeners.forEach((f) => f());
  return true;
}

/** 앱 시작 때 1회 — 저장본 먼저, 그다음 서버. */
export async function loadFilterCatalog(): Promise<void> {
  try { const raw = await AsyncStorage.getItem(CACHE_KEY); if (raw) applyFilterCatalog(JSON.parse(raw)); } catch { /* 없음 */ }
  try {
    const r = await fetch(`${getEnv().apiBase}/filters.json`, { cache: "no-cache" });
    if (!r.ok) return;
    const txt = await r.text();
    if (applyFilterCatalog(JSON.parse(txt))) await AsyncStorage.setItem(CACHE_KEY, txt);
  } catch { /* 오프라인 — 기본값 */ }
}

/** 카탈로그가 바뀌면 다시 그리게 하는 훅. */
export function useFilterCatalogVersion(): number {
  const [v, setV] = useState(version);
  useEffect(() => { const f = () => setV(version); listeners.add(f); return () => { listeners.delete(f); }; }, []);
  return v;
}
