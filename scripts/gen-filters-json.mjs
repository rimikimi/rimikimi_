#!/usr/bin/env node
// 앱(iOS·안드) 필터 카탈로그 — public/filters.json. 오너 2026-10-27: "필터 업데이트할 때마다 빌드?" → 컨셉처럼 서버에서.
// 원본 = src/filters.js(웹 편집기와 같은 값). 여기서 묶음·추천·신규만 정한다. hidden 프리셋(뷰티 등)은 넣지 않는다.
// 새 필터: filters.js 에 프리셋 추가 → 아래 GROUPS 에 키 추가 → node scripts/gen-filters-json.mjs → sw 올리고 배포. 앱 빌드 불필요.
// ⚠️ 앱 엔진에 없는 special(새 그리기 방식)은 앱이 모르는 값이라 건너뛴다 — 그건 빌드가 필요.
import { FILM_PRESETS, CATALOG } from "../src/filters.js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// 묶음·추천·신규는 src/filters.js CATALOG 하나에서 — 웹 편집기·iOS·안드가 같은 분류를 쓴다(오너 2026-10-27 "필터 분류가 다르자나").
const { groups: GROUPS, featured: FEATURED, new: NEW } = CATALOG;

const byKey = Object.fromEntries(FILM_PRESETS.map((p) => [p.key, p]));
const FIELDS = ["temp", "tint", "ex", "con", "fade", "whitePull", "sat", "vib", "sh", "hi", "bw", "hsl", "fx", "special", "c1", "c2"];
const presets = {};
for (const g of GROUPS) for (const k of g.keys) {
  const p = byKey[k];
  if (!p) throw new Error(`filters.js 에 없는 키: ${k}`);
  if (p.hidden) throw new Error(`숨김 프리셋을 목록에 넣었다: ${k}`);
  const o = { ko: p.ko, en: p.en };
  for (const f of FIELDS) if (p[f] !== undefined) o[f] = p[f];
  presets[k] = o;
}
for (const k of [...FEATURED, ...NEW]) if (!presets[k]) throw new Error(`추천/신규 키가 묶음에 없다: ${k}`);
const out = { v: 1, groups: GROUPS, featured: FEATURED, new: NEW, presets };
const here = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(here, "../public/filters.json"), JSON.stringify(out, null, 1) + "\n");
console.log("filters.json", Object.keys(presets).length, "종 ·", GROUPS.map((g) => `${g.key} ${g.keys.length}`).join(" · "));
