#!/usr/bin/env node
// ============================================================
// 예약된 컨셉을 계절에 맞게 재배치한다 (오너 지시 2026-08-31: "여름 컨셉 앞으로 땡겨").
//
// 공개 슬롯(날짜·하루 개수)은 그대로 두고 "어느 컨셉이 어느 날 나가는지"만 바꾼다.
// 이미 공개된 것(publishAt 이 지난 것)은 건드리지 않는다.
//
//   node scripts/reschedule-seasonal.mjs --dry   # 분류·배치 결과만 출력
//   node scripts/reschedule-seasonal.mjs         # 적용
// ============================================================
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DATA = join(dirname(fileURLToPath(import.meta.url)), "../api/_data/concepts.json");
const DRY = process.argv.includes("--dry");

const raw = readFileSync(DATA, "utf8");
const data = JSON.parse(raw);
const indent = ((raw.split("\n")[1] || "").match(/^ +/) || [""])[0].length;

const now = Date.now();
const future = data.filter((c) => c.publishAt && Date.parse(c.publishAt) > now);
const rest = data.filter((c) => !(c.publishAt && Date.parse(c.publishAt) > now));

// ── 계절 판정 ──────────────────────────────────────────────
// 배경·의상·날씨 단어로 본다. 실내 스튜디오처럼 계절이 없는 건 neutral 이고,
// neutral 은 아무 때나 나가도 되므로 여름 뒤·가을 앞 완충으로 쓴다.
// ⚠️ 약한 단어를 넣으면 안 된다. 처음엔 gloves/scarf/sleeveless/shorts/iced/chestnut 까지
//    넣었다가 오페라 장갑 → 겨울, 민소매 스튜디오컷 → 여름, 밤색(chestnut) 머리 → 가을로
//    빠졌다. 계절이 "장면 자체"인 단어만 쓴다. 애매하면 neutral 이 맞다.
const SUMMER = /\b(summer|midsummer|beach|seaside|poolside|swimsuit|swimwear|bikini|tropical|sunbathing|sunscreen|heatwave|watermelon|cicada|beach resort|seaside resort)\b|여름|열대야|해변|바닷가|수영장|물놀이|피서/i;
const AUTUMN = /\b(autumn|fall foliage|fallen leaves|autumn leaves|maple leaves|pumpkin patch|harvest festival)\b|가을|단풍|낙엽|추석/i;
const WINTER = /\b(winter|snowy|snowfall|snow-covered|falling snow|christmas|xmas|puffer jacket|down jacket|padded coat|fireplace|ski resort|ice skating|frost-covered|holiday market|new year's eve)\b|겨울|크리스마스|패딩|설날|한파|눈 내리/i;
// 계절과 무관한데 계절 단어를 품은 표현들 — 매치돼도 무시한다
const FALSE = /\bsnow leopard\b|\bsnowflake (pattern|print|earring)/i;

function season(c) {
  const t = `${c.title || ""} ${c.title_en || ""} ${c.text || ""}`;
  const clean = t.replace(FALSE, " ");
  // 겨울·가을 신호가 더 구체적이므로 먼저 본다
  if (WINTER.test(clean)) return "winter";
  if (AUTUMN.test(clean)) return "autumn";
  if (SUMMER.test(clean)) return "summer";
  return "neutral";
}

const groups = { summer: [], neutral: [], autumn: [], winter: [] };
for (const c of future) groups[season(c)].push(c);
// 그룹 안에서는 지금 순서를 유지한다 (기존 흐름을 최대한 보존)
for (const k of Object.keys(groups)) groups[k].sort((a, b) => Date.parse(a.publishAt) - Date.parse(b.publishAt));

// 달력 순서: 여름 → 중립 → 가을 → 겨울
const ordered = [...groups.summer, ...groups.neutral, ...groups.autumn, ...groups.winter];

// 슬롯(날짜)은 원래 있던 것을 그대로 재사용
const slots = future.map((c) => c.publishAt).sort();
if (slots.length !== ordered.length) { console.error("슬롯 수가 안 맞습니다"); process.exit(1); }

const fmt = (s) => new Date(s).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" });
const byMonth = {};
ordered.forEach((c, i) => {
  const at = slots[i];
  const m = new Date(at).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "long" });
  const s = season(c);
  byMonth[m] = byMonth[m] || {};
  byMonth[m][s] = (byMonth[m][s] || 0) + 1;
  if (!DRY) c.publishAt = at;
});

console.log("계절 분류:", Object.entries(groups).map(([k, v]) => `${k} ${v.length}`).join(" / "));
console.log("\n재배치 후 월별 구성:");
for (const [m, o] of Object.entries(byMonth)) {
  console.log(`  ${m.padStart(4)}  ` + Object.entries(o).map(([k, v]) => `${k}:${v}`).join("  "));
}
console.log("\n여름 첫 컷:", fmt(slots[0]), ordered[0].title, "| 여름 마지막:", fmt(slots[groups.summer.length - 1]), ordered[groups.summer.length - 1].title);
if (groups.winter.length) {
  const wi = ordered.length - groups.winter.length;
  console.log("겨울 첫 컷:", fmt(slots[wi]), ordered[wi].title);
}

if (DRY) { console.log("\nDRY — 파일 안 바꿈"); process.exit(0); }

// 안전 검증: 컨셉 수·id 집합·슬롯 집합이 그대로여야 한다 (섞기만 한 것)
const after = [...rest, ...ordered];
if (after.length !== data.length) { console.error("✗ 컨셉 수가 변했습니다"); process.exit(1); }
const idsBefore = data.map((c) => String(c.id)).sort().join(",");
const idsAfter = after.map((c) => String(c.id)).sort().join(",");
if (idsBefore !== idsAfter) { console.error("✗ id 집합이 변했습니다"); process.exit(1); }
const slotsAfter = after.filter((c) => c.publishAt && Date.parse(c.publishAt) > now).map((c) => c.publishAt).sort().join(",");
if (slotsAfter !== slots.join(",")) { console.error("✗ 공개 슬롯이 변했습니다"); process.exit(1); }

// 파일 순서는 기존 규칙대로 최신(번호 큰 것)이 앞
writeFileSync(DATA, JSON.stringify(data, null, indent), "utf8");
console.log("\n✓ 재배치 완료 (컨셉 수·id·슬롯 동일, 순서만 변경)");
