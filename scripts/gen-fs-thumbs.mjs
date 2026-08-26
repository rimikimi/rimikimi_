#!/usr/bin/env node
// 필터 카테고리 전/후 썸네일(fs_<key>.webp) 전체 재생성 — 재미(fun) 그룹 포함.
// 소스: store_assets/filter_thumb_src.jpg (candid 거리 사진, 하단 워터마크 크롭)
// 실행: node scripts/gen-fs-thumbs.mjs   (repo 루트에서)
import sharp from "../node_modules/sharp/dist/index.cjs";
import { FILM_PRESETS, applyLook } from "../src/filters.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "store_assets/filter_thumb_src.jpg");
const W = 400, H = 536;

const meta = await sharp(SRC).metadata();
const { data, info } = await sharp(SRC)
  .extract({ left: 0, top: 0, width: meta.width, height: Math.round(meta.height * 0.86) })
  .resize(W, H, { fit: "cover", position: "attention" })
  .raw().toBuffer({ resolveWithObject: true });
const base = Buffer.alloc(W * H * 4);
for (let i = 0, j = 0; i < data.length; i += info.channels, j += 4) {
  base[j] = data[i]; base[j + 1] = data[i + 1]; base[j + 2] = data[i + 2]; base[j + 3] = 255;
}
const divider = Buffer.from(
  `<svg width='${W}' height='${H}'><rect x='${W / 2 - 1}' y='0' width='2' height='${H}' fill='rgba(255,255,255,0.9)'/></svg>`);

let n = 0;
for (const p of FILM_PRESETS) {
  if (p.key === "none") continue;
  const px = Buffer.from(base);
  applyLook(px, W, H, p, { ...(p.fx || {}), seed: 7 });
  // 왼쪽 절반은 원본 (전/후 분할)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W / 2; x++) {
      const i = (y * W + x) * 4;
      px[i] = base[i]; px[i + 1] = base[i + 1]; px[i + 2] = base[i + 2];
    }
  await sharp(px, { raw: { width: W, height: H, channels: 4 } })
    .composite([{ input: divider, left: 0, top: 0 }])
    .webp({ quality: 82 }).toFile(join(ROOT, "public/thumbs/fs_" + p.key + ".webp"));
  n++;
}
console.log("fs 썸네일", n, "종 재생성 완료");
