#!/usr/bin/env node
// ============================================================
// 컨셉 프롬프트의 색 묘사에 hex 코드를 붙인다 (오너 지시 2026-08-29).
//
// 왜: "ivory / charcoal / navy" 같은 말은 모델이 매번 다르게 해석해 같은 컨셉인데도
// 컷마다 색이 튄다. 단어 뒤에 hex 를 붙여 색을 고정한다.
//   before: "a warm ivory sheet with visible fibres"
//   after : "a warm ivory (#F6F1E7) sheet with visible fibres"
//
// 원칙:
//   · 오너가 쓴 문장은 건드리지 않는다 — 단어 뒤에 " (#XXXXXX)" 를 끼워넣기만 한다.
//   · 컨셉마다 같은 색 단어는 첫 등장에만 붙인다(중복 표기로 프롬프트가 길어지지 않게).
//   · 색이 아닌 관용구는 건너뛴다: Kodak Gold 200, golden hour, black and white,
//     white balance, blue hour, red carpet, silver halide/gelatin, green screen …
//   · 이미 hex 가 붙어 있으면 다시 붙이지 않는다(여러 번 돌려도 안전).
//   · "pastel / neon" 처럼 특정 색이 없는 수식어는 대상에서 뺀다.
//
//   node scripts/annotate-colors.mjs --dry   # 리포트만
//   node scripts/annotate-colors.mjs         # 적용 (그 뒤 npm run build 로 폴백 재생성)
// ============================================================
import { readFileSync, writeFileSync } from "node:fs";

const FILE = new URL("../api/_data/concepts.json", import.meta.url);
const DRY = process.argv.includes("--dry");

// 색 → hex. 복합어(off-white, rose gold)가 먼저 매칭되도록 길이순으로 정렬해 쓴다.
const COLORS = {
  "rose gold": "#B76E79",
  "off-white": "#F7F4EF",
  terracotta: "#B5573A",
  turquoise: "#2EC4B6",
  champagne: "#E4CFA8",
  chocolate: "#4A2C1D",
  burgundy: "#6E1B2E",
  charcoal: "#36393D",
  lavender: "#C7BCE8",
  platinum: "#D9DCE0",
  magenta: "#E0218A",
  emerald: "#0F7B5F",
  crimson: "#A21C2B",
  caramel: "#C68E4E",
  apricot: "#F2B27C",
  mustard: "#D6A419",
  scarlet: "#C81D25",
  cobalt: "#0F3FA8",
  indigo: "#34406B",
  maroon: "#5C1A1B",
  salmon: "#F08A76",
  silver: "#C0C4C9",
  violet: "#7B4FB5",
  golden: "#C9A227",
  orange: "#E8721C",
  purple: "#6B3FA0",
  bronze: "#8C6239",
  copper: "#B87333",
  yellow: "#F2C744",
  greige: "#B5ADA3",
  blush: "#F3C9C4",
  beige: "#E6D9C3",
  cream: "#FBF3E4",
  coral: "#F4796B",
  ivory: "#F6F1E7",
  khaki: "#A89A6B",
  olive: "#6B7238",
  slate: "#5A6773",
  taupe: "#8B7B6E",
  amber: "#C8791E",
  brown: "#6B4A32",
  black: "#101010",
  white: "#FFFFFF",
  green: "#3F8F5C",
  peach: "#FFCBA4",
  honey: "#E0A93B",
  ochre: "#C08A28",
  mauve: "#A97C9B",
  sepia: "#704214",
  lilac: "#C8A2C8",
  navy: "#1B2A4A",
  mint: "#B8E4D0",
  teal: "#1F7A78",
  sage: "#A3B18A",
  sand: "#E3D2B4",
  rose: "#C96A78",
  wine: "#6E1D2B",
  plum: "#6E2C50",
  gold: "#C9A227",
  grey: "#8A8A8A",
  gray: "#8A8A8A",
  blue: "#2B5FA8",
  pink: "#F2A5C0",
  lime: "#B7E33A",
  cyan: "#00E5FF",
  aqua: "#7FDBDA",
  tan: "#D2B48C",
  red: "#C0392B",
};

// 색이 아닌 관용구 — 이 안에 들어가는 매치는 건너뛴다.
const GUARDS = [
  /kodak\s+gold/i, /\bgold\s+200\b/i, /portra|ektar|superia|velvia|provia|cinestill/i,
  /golden\s+(hour|ratio|age|rule)/i,
  /black[-\s]and[-\s]white/i, /black\s*&\s*white/i, /\bblack\s+tie\b/i,
  /white\s+balance/i, /white\s+noise/i, /whites?\s+of\s+the\s+eyes/i,
  /silver\s+(halide|gelatin|screen)/i,
  /green\s+screen/i, /blue\s+hour/i, /red\s+carpet/i, /red\s+eye/i,
  /grey\s?scale|gray\s?scale/i,
];

// 밝기 수식어 — "dark grey" 에 중간 회색 hex 를 붙이면 오히려 틀린 지시가 된다.
// 앞에 붙은 수식어만큼 hex 를 밝게/어둡게 굴려서 붙인다. (warm/cool 처럼 색조만
// 건드리는 말은 대상이 아니다 — 원래 hex 를 그대로 쓴다.)
const SHADE = {
  jet: -0.55, midnight: -0.5, deep: -0.35, dark: -0.35,
  muted: -0.12,
  light: 0.35, pale: 0.45, pastel: 0.5, bright: 0.15,
};
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) =>
    amt >= 0 ? Math.round(v + (255 - v) * amt) : Math.round(v * (1 + amt))
  );
  return "#" + ch.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("").toUpperCase();
}

const keys = Object.keys(COLORS).sort((a, b) => b.length - a.length);
const esc = (s) => s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
// 여러 단어짜리 색 이름(rose gold …) — 한 단어 키가 이 안쪽을 물면 건너뛴다.
// 안 그러면 "rose gold" 가 "rose (#C96A78) gold" 로 쪼개진다.
const MULTI = keys.filter((k) => k.includes(" "));

function annotate(text) {
  let out = text;
  const added = [];
  for (const key of keys) {
    const hex = COLORS[key];
    const re = new RegExp("\\b" + esc(key) + "\\b", "gi");
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(out)) !== null) {
      const start = m.index, end = start + m[0].length;
      // 이미 hex 가 붙어 있으면 이 색은 통과
      if (/^\s*\(#[0-9A-Fa-f]{6}\)/.test(out.slice(end))) break;
      // 이미 hex 안(예: #F6F1E7)의 문자열이면 스킵
      if (/#[0-9A-Fa-f]{0,6}$/.test(out.slice(Math.max(0, start - 7), start))) { continue; }
      // 하이픈 결합어(brown-black, blue-navy, charcoal-grey…)는 건드리지 않는다.
      // 중간에 hex 를 끼우면 "brown (#6B4A32)-black" 처럼 말이 끊기고, 두 색을 섞은
      // 뉘앙스라 어느 한쪽 hex 로 고정하는 것도 틀린 지시가 된다.
      if (out[end] === "-" || out[start - 1] === "-") continue;
      // 여러 단어 색 이름의 일부면 건너뛴다 (rose gold 의 rose / gold)
      if (!key.includes(" ") && MULTI.some((mk) => {
        const mre = new RegExp("\\b" + esc(mk) + "\\b", "gi");
        let mm;
        while ((mm = mre.exec(out)) !== null) {
          if (start >= mm.index && end <= mm.index + mm[0].length) return true;
        }
        return false;
      })) continue;
      // 관용구 방어 — 앞뒤 문맥 창으로 검사
      const win = out.slice(Math.max(0, start - 24), Math.min(out.length, end + 24));
      if (GUARDS.some((g) => g.test(win))) continue;
      // 바로 앞 단어가 밝기 수식어면 그만큼 hex 를 조정한다 (dark grey → 진한 회색)
      const prev = out.slice(Math.max(0, start - 14), start).match(/([A-Za-z]+)[\s-]+$/);
      const mod = prev && SHADE[prev[1].toLowerCase()];
      const useHex = mod ? shade(hex, mod) : hex;
      out = out.slice(0, end) + ` (${useHex})` + out.slice(end);
      added.push(`${prev && mod ? prev[1] + " " : ""}${m[0]}→${useHex}`);
      break; // 컨셉당 색 하나에 한 번만
    }
  }
  return { text: out, added };
}

const raw = readFileSync(FILE, "utf8");
const data = JSON.parse(raw);
const list = Array.isArray(data) ? data : data.concepts;
if (!Array.isArray(list)) { console.error("컨셉 배열을 못 찾았습니다"); process.exit(1); }

let touched = 0, inserts = 0;
const samples = [];
for (const c of list) {
  if (typeof c.text !== "string" || !c.text) continue;
  const before = c.text;
  const { text, added } = annotate(before);
  if (!added.length) continue;
  touched++; inserts += added.length;
  if (samples.length < 8) {
    const at = text.indexOf("(#");
    samples.push(`[${c.id} ${c.title}] ${added.length}개: ${added.join(", ")}\n    …${text.slice(Math.max(0, at - 70), at + 40).replace(/\n/g, " ")}…`);
  }
  if (!DRY) c.text = text;
}

console.log(`대상 컨셉 ${touched} / ${list.length}, hex 삽입 ${inserts}개`);
console.log("\n== 샘플\n" + samples.join("\n"));

if (DRY) { console.log("\nDRY — 파일 안 바꿈"); process.exit(0); }

// 검증 ① 삽입한 " (#XXXXXX)" 를 도로 지우면 원본과 완전히 같아야 한다(다른 글자 변형 없음)
const strip = (s) => s.replace(/ \(#[0-9A-Fa-f]{6}\)/g, "");
const orig = JSON.parse(raw);
const origList = Array.isArray(orig) ? orig : orig.concepts;
if (origList.length !== list.length) { console.error("✗ 컨셉 수가 달라졌습니다"); process.exit(1); }
for (let i = 0; i < list.length; i++) {
  const a = { ...origList[i] }, b = { ...list[i] };
  if (typeof b.text === "string") b.text = strip(b.text);
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    console.error(`✗ ${list[i].id} 에서 삽입 외 변경이 감지됨 — 쓰지 않고 중단합니다.`);
    process.exit(1);
  }
}
// 검증 ② 원본 파일과 같은 직렬화 형식(indent 1)으로 쓴다 — 형식 차이로 인한 대량 diff 방지
const outJson = JSON.stringify(data, null, 1);
if (strip(outJson) !== raw) {
  console.error("✗ 직렬화 형식이 원본과 다릅니다 — 쓰지 않고 중단합니다.");
  process.exit(1);
}
writeFileSync(FILE, outJson);
console.log("\n✓ api/_data/concepts.json 갱신 (삽입 외 변경 없음 · 형식 동일 검증 통과)");
