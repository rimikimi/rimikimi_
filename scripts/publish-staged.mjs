#!/usr/bin/env node
// ============================================================
// 대기 중인 컨셉을 공개 데이터(api/_data/concepts.json)에 넣는다.
//
//   node scripts/publish-staged.mjs 591 610            → 즉시 공개
//   node scripts/publish-staged.mjs 591 710 --daily 3  → 매일 20시(KST) 3종씩 예약
//   node scripts/publish-staged.mjs --list             → 대기 목록만 보기
//
// 넣기만 하고 배포는 안 한다. 확인 후 커밋·push 하면 반영된다.
// (컨셉은 서버가 publishAt 으로 걸러 내려주므로 앱 빌드는 필요 없다)
// ============================================================

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(REPO, "api/_data/concepts.json");
const STAGE = join(REPO, "staged_concepts");

const staged = readdirSync(STAGE)
  .filter((f) => f.endsWith(".json"))
  .flatMap((f) => JSON.parse(readFileSync(join(STAGE, f), "utf8")));
const stagedById = new Map(staged.map((c) => [Number(c.id), c]));

const data = JSON.parse(readFileSync(DATA, "utf8"));
const liveIds = new Set(data.map((c) => Number(c.id)));

const args = process.argv.slice(2);
if (args.includes("--list") || args.length < 2) {
  const pending = [...stagedById.keys()].filter((id) => !liveIds.has(id)).sort((a, b) => a - b);
  // 공개 여부는 시간 기준 — publishAt 이 지난 것도 이미 공개된 것이다
  const now = Date.now();
  const isLive = (c) => !c.publishAt || Date.parse(c.publishAt) <= now;
  const publishedNow = data.filter(isLive).length;
  const scheduled = data.length - publishedNow;
  console.log(`공개됨 ${publishedNow}종 / 예약됨 ${scheduled}종`);
  console.log(`대기(미반영) ${pending.length}종:`, pending.length ? `${pending[0]} ~ ${pending[pending.length - 1]}` : "없음");
  process.exit(0);
}

const from = Number(args[0]);
const to = Number(args[1]);
const di = args.indexOf("--daily");
const perDay = di >= 0 ? Number(args[di + 1] || 3) : 0;

const picked = [];
for (let id = from; id <= to; id++) {
  if (liveIds.has(id)) continue;          // 이미 들어가 있으면 건너뛴다
  const c = stagedById.get(id);
  if (c) picked.push(structuredClone(c));
}
if (!picked.length) {
  console.log("추가할 컨셉이 없어요 (이미 반영됐거나 대기 목록에 없음).");
  process.exit(0);
}

if (perDay > 0) {
  // 이미 예약된 마지막 날 다음날부터 이어서 배치
  const lastAt = data.reduce((m, c) => (c.publishAt && c.publishAt > m ? c.publishAt : m), "");
  const base = lastAt ? new Date(lastAt) : new Date();
  picked.forEach((c, i) => {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + Math.floor(i / perDay) + 1);
    d.setUTCHours(11, 0, 0, 0);           // 11:00 UTC = 20:00 KST
    c.publishAt = d.toISOString().replace(/\.\d{3}Z$/, "Z");
  });
} // perDay 0 이면 publishAt 없이 = 즉시 공개

// ⚠️ 마지막 공개 시각은 reverse 전에 뽑는다. reverse 는 배열을 제자리에서
//    뒤집으므로, 뒤에서 picked[length-1] 을 읽으면 "첫" 공개일이 나온다
//    (실제로 190종을 4종씩 깔고 "9/20 까지" 라고 잘못 출력했었다).
const lastPublishAt = picked[picked.length - 1].publishAt;

writeFileSync(DATA, JSON.stringify([...picked.reverse(), ...data], null, 0), "utf8");

const ids = picked.map((c) => c.id).sort((a, b) => a - b);
console.log(`추가 ${picked.length}종: ${ids[0]} ~ ${ids[ids.length - 1]}`);
console.log(perDay > 0
  ? `예약: 매일 ${perDay}종씩 ${lastPublishAt} 까지`
  : "즉시 공개");
console.log("\n다음: public/sw.js VERSION 올리고 커밋·push 하면 반영됩니다.");
