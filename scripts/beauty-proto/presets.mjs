// 뷰티 필터 시안 10종 v2(오너 2026-10-27 레퍼런스: 밝고 뽀얀 피부·낮은 대비·라벤더/핑크 쿨톤·은은한 글로우). 색 + glow/blur — AI 피부 보정 아님.
export const BEAUTY = [
  { key: "bLavender", ko: "라벤더",  en: "Lavender",  temp: -18, tint: 16, ex: 0.26, con: -0.3,  fade: 26, whitePull: 22, sat: -0.38, vib: 0,    sh: [6, -2, 20], hi: [8, 4, 16],  fx: { glow: 0.55 } },
  { key: "bMilk",     ko: "우유빛",  en: "Milky",     temp: -6, tint: 8,  ex: 0.26, con: -0.26, fade: 22, whitePull: 28, sat: -0.22, vib: 0.05, sh: [4, 2, 10],  hi: [10, 8, 12], fx: { glow: 0.6 } },
  { key: "bPorcelain",ko: "뽀얀",    en: "Porcelain", temp: -4, tint: 4,  ex: 0.34, con: -0.34, fade: 30, whitePull: 34, sat: -0.3,  vib: 0,    sh: [8, 8, 12],  hi: [12, 12, 14], fx: { glow: 0.65 } },
  { key: "bRose",     ko: "로즈",    en: "Rose",      temp: 4,  tint: 26, ex: 0.18, con: -0.18, fade: 18, whitePull: 16, sat: -0.1,  vib: 0.12, sh: [14, -4, 8], hi: [14, 2, 8],  fx: { glow: 0.45 } },
  { key: "bPeach",    ko: "피치",    en: "Peach",     temp: 18, tint: 12, ex: 0.18, con: -0.16, fade: 16, whitePull: 16, sat: -0.04, vib: 0.18, sh: [12, 4, 2],  hi: [16, 8, 2],  fx: { glow: 0.45 } },
  { key: "bCool",     ko: "쿨톤",    en: "Cool Tone", temp: -26, tint: 6, ex: 0.16, con: -0.12, fade: 14, whitePull: 18, sat: -0.16, vib: 0.05, sh: [-4, 4, 20], hi: [2, 6, 16],  fx: { glow: 0.4 } },
  { key: "bWarm",     ko: "웜톤",    en: "Warm Tone", temp: 24, tint: 4,  ex: 0.16, con: -0.1,  fade: 14, whitePull: 14, sat: -0.04, vib: 0.14, sh: [10, 6, -6], hi: [16, 10, -2], fx: { glow: 0.4 } },
  { key: "bSoft",     ko: "소프트",  en: "Soft",      temp: 2,  tint: 8,  ex: 0.2,  con: -0.36, fade: 26, whitePull: 18, sat: -0.16, vib: 0.05, sh: [8, 4, 8],   hi: [8, 6, 6],   fx: { glow: 0.95, blur: 0.12 } },
  { key: "bClear",    ko: "클리어",  en: "Clear",     temp: -8, tint: 2,  ex: 0.2,  con: 0.08,  fade: 4,  whitePull: 22, sat: 0.04,  vib: 0.16, sh: [0, 2, 6],   hi: [6, 6, 8],   fx: { glow: 0.25 } },
  { key: "bDewy",     ko: "물광",    en: "Dewy",      temp: -4, tint: 8,  ex: 0.14, con: 0.06,  fade: 10, whitePull: 14, sat: -0.04, vib: 0.12, sh: [4, 0, 6],   hi: [20, 18, 20], fx: { glow: 1.0 } },
];
