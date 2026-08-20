#!/usr/bin/env node
// ============================================================
// public/concepts.fallback.json 굽기 (npm prebuild 에 물려 있다)
//
// 이 파일은 네이티브 앱에 번들되는 오프라인 스냅샷이다. 앱은 먼저 서버의
// /concepts.json 을 읽고, 실패(오프라인 등)하면 이걸 쓴다.
//   → src/PortraitStudio.jsx 의 컨셉 로드 참고
//
// 왜 자동화하나:
//   손으로 만들다 보니 그대로 굳었다. 2026-08-20 확인 시점에 폴백은 301종짜리
//   옛 스냅샷이었다 — 매직 부스 신규 782~787 이 통째로 빠져 있었고, 이미
//   예술/클래식으로 되돌린 330 이 아직 매직 부스로 남아 있었다. 오프라인
//   사용자만 다른 목록을 보는 상태였고 아무도 알아채지 못했다.
//
// 정렬·필터는 api/_lib/conceptList.js 를 그대로 쓴다(서버와 같은 결과 보장).
// 빌드 시각 기준으로 "이미 공개된 것"만 담는다 — 예약분을 넣으면 오프라인
// 사용자가 드롭 전에 미리 보게 된다.
// ============================================================

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { publishedConcepts } from "../api/_lib/conceptList.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "api/_data/concepts.json");
const OUT = join(ROOT, "public/concepts.fallback.json");

const ALL = JSON.parse(readFileSync(SRC, "utf8"));
const list = publishedConcepts(ALL, Date.now());

if (!Array.isArray(list) || list.length === 0) {
  console.error("[fallback] 공개된 컨셉이 0개다 — 폴백을 덮어쓰지 않는다");
  process.exit(1);
}

// 한 줄에 한 항목. diff 를 읽을 수 있게 하려는 것 — 통짜 한 줄이면
// 컨셉 하나만 바뀌어도 전체가 바뀐 것처럼 보인다.
const body = "[\n" + list.map((c) => JSON.stringify(c)).join(",\n") + "\n]\n";

let before = 0;
try { before = JSON.parse(readFileSync(OUT, "utf8")).length; } catch { /* 없으면 0 */ }

writeFileSync(OUT, body);
const kb = (Buffer.byteLength(body) / 1024).toFixed(0);
console.log(`[fallback] ${before} → ${list.length}종 (${kb}KB) 기록`);
