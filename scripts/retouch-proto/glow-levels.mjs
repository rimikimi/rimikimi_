#!/usr/bin/env node
// "예쁘고 뽀얗게" 필터 단계 = AI 피부 보정(levels.py 결과) + 앱의 뽀샤시(소프트 글로우) 효과.
// 뽀샤시는 src/filters.js 의 applyLook(effects.glow) 를 그대로 쓴다 — 편집기 "효과 > 뽀샤시"와 같은 계산.
//   node scripts/retouch-proto/glow-levels.mjs <입력접두사> <출력접두사> [최대글로우=0.5] [20,40,60,80,100]
//   예) 입력 out/beauty1s-20.jpg … → 출력 out/bbosyasi-20.jpg …
import sharp from "../../node_modules/sharp/dist/index.cjs";
import { applyLook } from "../../src/filters.js";

const [inPrefix, outPrefix, gmaxArg, levelsArg] = process.argv.slice(2);
if (!inPrefix || !outPrefix) { console.error("<입력접두사> <출력접두사> 필요"); process.exit(1); }
const GMAX = Number(gmaxArg || "0.5");
const LEVELS = (levelsArg || "20,40,60,80,100").split(",").map(Number);

for (const L of LEVELS) {
  const src = `${inPrefix}-${L}.jpg`;
  const { data, info } = await sharp(src).raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels } = info;
  const px = Buffer.alloc(w * h * 4);
  for (let i = 0, j = 0; i < data.length; i += channels, j += 4) {
    px[j] = data[i]; px[j + 1] = data[i + 1]; px[j + 2] = data[i + 2]; px[j + 3] = 255;
  }
  const glow = (L / 100) * GMAX;
  applyLook(px, w, h, null, { glow, seed: 7 });
  const out = `${outPrefix}-${L}.jpg`;
  await sharp(px, { raw: { width: w, height: h, channels: 4 } }).jpeg({ quality: 95 }).toFile(out);
  console.log(`${L}% · 뽀샤시 ${glow.toFixed(2)} → ${out}`);
}
