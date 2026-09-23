#!/usr/bin/env node
// 인생네컷 전용 프롬프트 스타일 실사 테스트 — 서버와 같은 프롬프트 모듈, 같은 모델.
//   node scripts/test-fourcut.mjs --person=a.png [--style=editorial|glow] [--count=4] [--out=fourcut-test.png] [--print]
import { readFileSync, writeFileSync } from "node:fs";
import { buildEditorialStrip } from "../api/_lib/fourcutEditorial.js";
import { buildGlowStrip } from "../api/_lib/fourcutGlow.js";

const args = process.argv.slice(2);
const get = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const personPath = get("person");
const n = Number(get("count", "4"));
const out = get("out", "fourcut-test.png");
if (!personPath) { console.error("사용법: --person=사람사진 [--count=2|3|4|6]"); process.exit(1); }

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")])
);
const apiKey = env.GEMINI_API_KEY;
if (!apiKey) { console.error(".env.local 에 GEMINI_API_KEY 가 없습니다"); process.exit(1); }

const GRID = { 2: "1 column x 2 rows", 3: "1 column x 3 rows", 4: "2 columns x 2 rows", 6: "2 columns x 3 rows" };
const RATIO = { 2: "3:4", 3: "9:16", 4: "3:4", 6: "3:4" };
const style = get("style", "editorial");
const instruction = (style === "glow" ? buildGlowStrip : buildEditorialStrip)(n, GRID[n]);
if (args.includes("--print")) console.log("\n----- 프롬프트 -----\n" + instruction + "\n-------------------\n");

const mimeOf = (p) => (/\.png$/i.test(p) ? "image/png" : /\.webp$/i.test(p) ? "image/webp" : "image/jpeg");
const body = {
  contents: [{ role: "user", parts: [
    { text: instruction },
    { inline_data: { mime_type: mimeOf(personPath), data: readFileSync(personPath).toString("base64") } },
  ] }],
  generationConfig: { imageConfig: { imageSize: "2K", aspectRatio: RATIO[n] } },
};
const t0 = Date.now();
const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image:generateContent",
  { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey }, body: JSON.stringify(body) });
const j = await r.json().catch(() => null);
console.log(`HTTP ${r.status} · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (!r.ok) { console.error(JSON.stringify(j?.error || j).slice(0, 400)); process.exit(1); }
const part = (j?.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData || p.inline_data);
const data = part?.inlineData?.data || part?.inline_data?.data;
if (!data) { console.error("이미지가 없습니다:", JSON.stringify(j).slice(0, 400)); process.exit(1); }
writeFileSync(out, Buffer.from(data, "base64"));
console.log("저장:", out);
