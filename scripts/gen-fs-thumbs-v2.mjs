#!/usr/bin/env node
// 필터 전/후 썸네일 v2 — 필터마다 다른 원본 사진(2026-10-26 오너: 샘플 전부 새로, "빡 대비가 느껴져야").
// 원본: <dir>/<key>.png (힉스필드로 뽑은 색감 없는 원본). 실제 앱 필터 엔진(src/filters.js applyLook)으로 입힌다.
// 결과: public/thumbs/fs_<key>.webp (왼쪽 원본 | 오른쪽 필터, 세로 분할) · public/thumbs/ff_<key>.webp (필터만 전체)
// 실행: node scripts/gen-fs-thumbs-v2.mjs <원본폴더> [key ...]
import sharp from "../node_modules/sharp/dist/index.cjs";
import { FILM_PRESETS, applyLook } from "../src/filters.js";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = process.argv[2];
const ONLY = process.argv.slice(3);
const W = 900, H = 1200;
const divider = Buffer.from(`<svg width='${W}' height='${H}'><rect x='${W / 2 - 1}' y='0' width='2' height='${H}' fill='rgba(255,255,255,0.95)'/></svg>`);

let n = 0;
for (const p of FILM_PRESETS) {
  if (p.key === "none" || (ONLY.length && !ONLY.includes(p.key))) continue;
  const src = join(DIR, p.key + ".png");
  if (!existsSync(src)) { console.log("원본 없음", p.key); continue; }
  const { data, info } = await sharp(src).resize(W, H, { fit: "cover", position: "attention" }).raw().toBuffer({ resolveWithObject: true });
  const base = Buffer.alloc(W * H * 4);
  for (let i = 0, j = 0; i < data.length; i += info.channels, j += 4) { base[j] = data[i]; base[j + 1] = data[i + 1]; base[j + 2] = data[i + 2]; base[j + 3] = 255; }
  const px = Buffer.from(base);
  applyLook(px, W, H, p, { ...(p.fx || {}), seed: 7 });
  await sharp(Buffer.from(px), { raw: { width: W, height: H, channels: 4 } }).webp({ quality: 84 }).toFile(join(ROOT, "public/thumbs/ff_" + p.key + ".webp"));
  for (let y = 0; y < H; y++) for (let x = 0; x < W / 2; x++) { const i = (y * W + x) * 4; px[i] = base[i]; px[i + 1] = base[i + 1]; px[i + 2] = base[i + 2]; }
  await sharp(px, { raw: { width: W, height: H, channels: 4 } }).composite([{ input: divider, left: 0, top: 0 }])
    .webp({ quality: 84 }).toFile(join(ROOT, "public/thumbs/fs_" + p.key + ".webp"));
  n++;
}
console.log("v2 썸네일", n, "종");
