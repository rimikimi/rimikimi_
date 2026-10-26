import { t } from "@/lib/copy21";

// 필터 묶음 — iOS `FilterTabView.groups` 와 같은 순서·같은 키(2026-10-26 5탭 개편). 카메라 탭 칩과 필터 탭이 같이 쓴다.
// 소프트 플래시(flashsoft)는 안드 실시간 셰이더에 인물 분리가 없어 빠졌다.
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
  { key: "fx", title: () => t("효과", "Effects"), keys: FX },
];
/** 추천·신규 — iOS featuredKeys / newKeys 와 같다. */
export const FEATURED = ["ph7", "golden", "vintC", "peach", "ph4s", "bloom", "cine", "vintS"];
export const NEW_KEYS = ["folder", "y2k", "haduri"];
