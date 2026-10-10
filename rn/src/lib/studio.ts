import { getEnv } from "./env";
import { isKo } from "./locale";
import type { Concept } from "./concepts";

// ============================================================================
// 브루클린 목적 사진 카탈로그(`/studio-catalog.json`) + 조세핀 드레스(`/wedding-catalog.json`).
// iOS `ios2/rimikimi/UI/Home/StudioCatalog.swift` 를 그대로 옮긴 것.
// 지시문은 서버가 만든다 — 앱은 무엇을 골랐는지(id·값)만 보낸다.
// ============================================================================

export interface LText { ko?: string | null; en?: string | null }
export const ltext = (x?: LText | null): string => ((isKo ? x?.ko : x?.en) ?? x?.ko ?? x?.en ?? "") || "";

export interface StudioPreset { id: string; purpose: string; title: LText; thumb?: string | null }
export interface KnobValue { id: string; title?: LText | null; css?: string | null; hex?: string | null; name?: string | null }
export interface StudioCatalog {
  purposes: { id: string; title: LText }[];
  presets: StudioPreset[];
  knobs: Record<string, KnobValue[]>;
  purposeKnobs: Record<string, string[]>;
  purposeKnobExclude?: Record<string, Record<string, string[]>> | null;
}

export interface WeddingDress {
  code: string; kind: string; silhouette: string; color: string; neckline: string; sleeve: string; thumb: string;
}

/** 배경 색은 서버에 한국어 이름이 없다 — 시제품과 같은 이름을 붙인다(iOS `KnobValue.label`). */
const BG_KO: Record<string, string> = {
  "pure white": "화이트", "soft warm light grey": "웜그레이", "warm ivory cream": "아이보리", "soft pastel pink": "파스텔 핑크",
  "light sky blue": "스카이블루", "soft muted teal": "뮤트 틸", "deep navy blue": "딥네이비", "deep muted purple": "딥퍼플",
};
export function knobLabel(v: KnobValue): string {
  const tt = v.title ? ltext(v.title) : "";
  if (tt) return tt;
  const n = v.name ?? "";
  return (isKo ? BG_KO[n] : n) || n || v.id;
}
export function knobSwatch(v: KnobValue): string | null {
  const s = v.css ?? v.hex;
  return s && s.startsWith("#") ? s : null;
}

/** 세부 조정 항목 → 서버 레시피 키(picbox catalog.js KNOB_KEY 와 1:1). */
export const KNOB_RECIPE_KEY: Record<string, string> = {
  suits: "idSuit", inners: "idInner", bgs: "idBg", expressions: "expressionId", angles: "angleId",
  hair: "hairId", mono: "monochrome", actorOutfits: "actorOutfitId", moods: "actorLookId",
  beautyOutfits: "beautyOutfitId", beautyLooks: "actorLookId", retouch: "retouch", makeup: "makeup",
};

/** 전문 프로필 탭(브루클린 목적). 탭 이름은 시제품 그대로(오너 확인). */
export const STUDIO_TABS = ["resume", "linkedin", "audition"] as const;

/** 그 목적의 룩을 격자·담기 줄이 쓰는 컨셉 모양으로. */
export function studioLooks(cat: StudioCatalog | null, purpose: string): Concept[] {
  if (!cat) return [];
  return cat.presets
    .filter((p) => p.purpose === purpose)
    .map((p) => ({
      id: "studio:" + p.id,
      title: p.title.ko ?? p.id,
      title_en: p.title.en ?? undefined,
      thumb: p.thumb ?? undefined,
      studioPurpose: purpose,
      studioPreset: p.id,
    }));
}

export function knobValues(cat: StudioCatalog | null, knob: string, purpose: string): KnobValue[] {
  if (!cat) return [];
  const ex = new Set(cat.purposeKnobExclude?.[purpose]?.[knob] ?? []);
  return (cat.knobs[knob] ?? []).filter((v) => !ex.has(v.id));
}

export function dressConcept(d: WeddingDress): Concept {
  return { id: "dress:" + d.code, title: `${d.code} ${d.silhouette}`, thumb: d.thumb, dressCode: d.code };
}

export type DressAxis = "sil" | "col" | "neck" | "slv";
export type DressFilter = Partial<Record<DressAxis, string[]>>;
const axisOf = (d: WeddingDress, a: DressAxis) => (a === "sil" ? d.silhouette : a === "col" ? d.color : a === "neck" ? d.neckline : d.sleeve);

export function dressList(all: WeddingDress[], kind: string, f: DressFilter): WeddingDress[] {
  return all.filter((d) =>
    d.kind === kind && (["sil", "col", "neck", "slv"] as DressAxis[]).every((a) => {
      const sel = f[a];
      return !sel || sel.length === 0 || sel.includes(axisOf(d, a));
    }));
}

export function axisValues(all: WeddingDress[], axis: DressAxis, kind: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const d of all) {
    if (d.kind !== kind) continue;
    const v = axisOf(d, axis);
    if (!seen.has(v)) { seen.add(v); out.push(v); }
  }
  return out;
}

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(`${getEnv().apiBase}/${path}`);
    if (r.status !== 200) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}
export const fetchStudioCatalog = () => fetchJson<StudioCatalog>("studio-catalog.json");
export const fetchWeddingCatalog = () => fetchJson<WeddingDress[]>("wedding-catalog.json");
