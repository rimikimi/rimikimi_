#!/usr/bin/env node
// ============================================================
// "세계여행" 카테고리 태깅 (오너 지시 2026-09-13)
//
//   프롬프트에 **해외 여행지 고유명사**가 적혀 있는 컨셉에 카테고리를 하나 더 붙인다.
//   기존 카테고리는 건드리지 않는다(추가만). 프롬프트 본문도 건드리지 않는다.
//
//   ⚠️ 한국 지명(서울·부산·제주·한옥…)은 "세계여행"이 아니라서 목록에 없다.
//   ⚠️ 오탐으로 걸렸던 것들은 EXCLUDE 에 박아둔다 — India ink(먹), safari 는 의상 스타일.
//
//   node scripts/tag-world-travel.mjs [--dry] [--list]
// ============================================================
import { readFileSync, writeFileSync } from "node:fs";

const CAT = "세계여행";
const SRC = new URL("../api/_data/concepts.json", import.meta.url);
const DRY = process.argv.includes("--dry");
const LIST = process.argv.includes("--list");

// 해외 도시·지역·랜드마크. 사람 이름이나 사물과 겹치는 단어는 넣지 않는다.
const PLACES = [
  "Paris","Eiffel","Montmartre","Provence","Cannes","Monaco","Marseille",
  "Santorini","Mykonos","Athens","Greece",
  "Kyoto","Tokyo","Osaka","Okinawa","Hokkaido","Sapporo","Kanazawa","Nara","Shibuya","Shinjuku","Ginza","Asakusa","Dotonbori",
  "Bali","Ubud","Phuket","Bangkok","Chiang Mai","Vietnam","Da Nang","Hoi An","Hanoi","Singapore","Hong Kong","Macau","Taipei","Taiwan","Jiufen",
  "Hawaii","Waikiki","Honolulu","Maui","Maldives","Bora Bora","Fiji","Tahiti",
  "New York","Manhattan","Brooklyn","Chicago","Boston","Seattle","San Francisco","Los Angeles","Malibu","Miami","Las Vegas","New Orleans","Aspen",
  "London","Edinburgh","Scotland","Ireland","Dublin","Amsterdam","Copenhagen","Stockholm","Oslo","Helsinki","Reykjavik","Iceland","Norway","Finland","Sweden","Denmark",
  "Rome","Venice","Florence","Milan","Amalfi","Capri","Positano","Tuscany","Sicily","Naples","Como",
  "Barcelona","Madrid","Seville","Ibiza","Lisbon","Porto","Portugal","Spain",
  "Berlin","Munich","Vienna","Prague","Budapest","Salzburg","Hallstatt","Switzerland","Zermatt","Interlaken","Lucerne","Swiss Alps",
  "Istanbul","Cappadocia","Bosphorus","Turkey","Morocco","Marrakech","Chefchaouen","Sahara","Egypt","Cairo","Dubai","Abu Dhabi","Petra","Jordan",
  "Serengeti","Kenya","Tanzania","Cape Town","Zanzibar",
  "Mexico","Tulum","Oaxaca","Cancun","Cuba","Havana","Peru","Machu Picchu","Cusco","Rio de Janeiro","Buenos Aires","Patagonia","Chile","Argentina","Brazil",
  "Sydney","Melbourne","Queenstown","Auckland","New Zealand","Australia","Vancouver","Montreal","Toronto","Banff","Quebec",
  "Shanghai","Beijing","Chengdu","Jaipur","Udaipur","Rajasthan","Nepal","Himalaya","Mongolia","Siberia","Moscow",
];

// 오탐: 332 수묵 미인도("India ink"=먹), 871·868(safari 는 장소가 아니라 의상 스타일)
const EXCLUDE = new Set([332, 871, 868]);

const raw = readFileSync(SRC, "utf8");
const indent = ((raw.split("\n")[1] || "").match(/^ */) || [""])[0].length || 1;
const all = JSON.parse(raw);

const res = [];
for (const c of all) {
  if (EXCLUDE.has(Number(c.id))) continue;
  const txt = `${c.title || ""} ${c.title_en || ""} ${c.text || ""}`;
  const found = PLACES.filter((p) =>
    new RegExp("\\b" + p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i").test(txt)
  );
  if (!found.length) continue;
  const cats = c.categories || (c.category ? [c.category] : []);
  res.push({ c, cats, found });
}

let added = 0;
for (const { c, cats, found } of res) {
  if (LIST) console.log(`${c.id} ${c.title} → ${found.join(", ")} [${cats.join("/")}]`);
  if (cats.includes(CAT)) continue;
  added++;
  if (!DRY) c.categories = [...cats, CAT];
}

console.log(`여행지 언급 ${res.length}종 · 새로 태깅 ${added}종${DRY ? " (dry)" : ""}`);
if (!DRY && added) {
  writeFileSync(SRC, JSON.stringify(all, null, indent) + (raw.endsWith("\n") ? "\n" : ""));
  console.log("concepts.json 기록 — scripts/build-fallback.mjs 를 이어서 돌릴 것");
}
