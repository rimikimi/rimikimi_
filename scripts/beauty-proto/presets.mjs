// 뷰티 필터 v3 — 리서치 반영(2026-10-27): 베리필름(milk·clean·sweet·butter·hush 등)·SODA(물광~매트)·2026 트렌드(새틴 스킨·레트로 글로우)·
// 얼짱 보정 공식(대비↓·하이라이트 핑크 틴트·채도는 그대로·그림자 들기). 공통 기법: 피부 대역(hue 20~40)만 밝히고 붉은기↓ → 배경은 덜 날아가고 얼굴만 뽀얗게.
const SKIN = (l, s, h = 0) => ({ c: 28, w: 22, h, s, l });
export const BEAUTY = [
  { key: "bMilk",   ko: "우유",     en: "Milk",       temp: -2, tint: 6,  ex: 0.18, con: -0.26, fade: 22, whitePull: 20, sat: -0.2,  vib: 0.04, sh: [6, 4, 10], hi: [8, 6, 10], hsl: [SKIN(0.06, -0.15)], fx: { glow: 0.6, grain: 0.12 } }, // 뽀용 디카
  { key: "bPink",   ko: "연핑크",   en: "Soft Pink",  temp: -2, tint: 18, ex: 0.16, con: -0.16, fade: 12, whitePull: 18, sat: -0.04, vib: 0.06, sh: [6, 0, 6],  hi: [12, 2, 8], hsl: [SKIN(0.05, -0.1)], fx: { glow: 0.35 } },   // clean: 깨끗+연핑크
  { key: "bPeach",  ko: "복숭아",   en: "Peach",      temp: 14, tint: 12, ex: 0.18, con: -0.14, fade: 14, whitePull: 16, sat: 0,     vib: 0.16, sh: [10, 4, 2], hi: [16, 8, 4], hsl: [SKIN(0.05, -0.05)], fx: { glow: 0.45 } },   // sweet: 햇살 머금은 복숭아
  { key: "bLavender",ko: "라벤더",  en: "Lavender",   temp: -16, tint: 16, ex: 0.24, con: -0.28, fade: 24, whitePull: 22, sat: -0.32, vib: 0,   sh: [6, -2, 18], hi: [8, 4, 14], hsl: [SKIN(0.06, -0.2)], fx: { glow: 0.55 } },   // 오너 레퍼런스
  { key: "bButter", ko: "버터",     en: "Butter",     temp: 20, tint: 2,  ex: 0.14, con: -0.12, fade: 16, whitePull: 14, sat: -0.06, vib: 0.1,  sh: [10, 8, -4], hi: [14, 12, 0], hsl: [SKIN(0.05, -0.08)], fx: { glow: 0.35 } }, // 크림 웜
  { key: "bCool",   ko: "쿨톤",     en: "Cool Tone",  temp: -22, tint: 6, ex: 0.16, con: -0.1,  fade: 12, whitePull: 18, sat: -0.12, vib: 0.06, sh: [-2, 4, 18], hi: [2, 6, 14], hsl: [SKIN(0.06, -0.18)], fx: { glow: 0.35 } },
  { key: "bHush",   ko: "차분",     en: "Hush",       temp: -4, tint: 4,  ex: 0.08, con: -0.18, fade: 22, whitePull: 10, sat: -0.38, vib: 0,    sh: [4, 4, 6],  hi: [6, 4, 2],  hsl: [SKIN(0.04, -0.1)], fx: { grain: 0.3, glow: 0.2 } }, // 저채도·차분·그레인
  { key: "bDewy",   ko: "물광",     en: "Glass Skin", temp: -4, tint: 8,  ex: 0.1,  con: 0.06,  fade: 8,  whitePull: 12, sat: -0.02, vib: 0.12, sh: [2, 0, 6],  hi: [20, 18, 20], hsl: [SKIN(0.05, -0.1)], fx: { glow: 1.0 } },
  { key: "bSatin",  ko: "새틴",     en: "Satin Skin", temp: 4,  tint: 6,  ex: 0.08, con: -0.06, fade: 8,  whitePull: 8,  sat: -0.04, vib: 0.08, sh: [4, 2, 2],  hi: [6, 4, 2],  hsl: [SKIN(0.04, -0.2)], fx: { glow: 0.3, blur: 0.04 } }, // 자연스러움·붉은기만 정리
  { key: "bRetroGlow", ko: "레트로 글로우", en: "Retro Glow", temp: 22, tint: 10, ex: 0.12, con: 0.04, fade: 14, whitePull: 6, sat: 0.06, vib: 0.1, sh: [6, -2, 8], hi: [20, 10, -4], hsl: [SKIN(0.04, -0.05)], fx: { glow: 0.7, grain: 0.18, vignette: 0.3 } },
];
