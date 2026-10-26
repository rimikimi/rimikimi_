#!/usr/bin/env node
// 필터 원본 썸네일 — ff_<key>(필터 결과)와 **같은 크롭**의 원본(fo_<key>). 필터 탭 카드의 원본↔필터 쓸기 비교용(2026-10-26 오너 "1번").
// 실행: node scripts/gen-fo-thumbs.mjs <원본폴더> [key=path ...]   (key=path 는 폴더 밖 원본을 따로 지정)
import sharp from "../node_modules/sharp/dist/index.cjs";
import { FILM_PRESETS } from "../src/filters.js";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = process.argv[2];
const extra = Object.fromEntries(process.argv.slice(3).map(a => a.split("=")));
const W = 900, H = 1200;
let n = 0;
for (const p of FILM_PRESETS) {
  if (p.key === "none") continue;
  const src = extra[p.key] || join(DIR, p.key + ".png");
  if (!existsSync(src)) { console.log("원본 없음", p.key); continue; }
  await sharp(src).resize(W, H, { fit: "cover", position: "attention" }).webp({ quality: 84 })
    .toFile(join(ROOT, "public/thumbs/fo_" + p.key + ".webp"));
  n++;
}
console.log("fo 썸네일", n, "종");
