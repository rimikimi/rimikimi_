#!/usr/bin/env node
// ============================================================
// 드레스룸 프롬프트 실사 테스트.
// 서버(api/generate.js)와 "같은 프롬프트 조립 코드"(api/_lib/dressroom.js)를 쓰고,
// 같은 모델(gemini-3-pro-image) · 같은 요청 형태로 한 장 만들어 파일로 떨군다.
//
//   node scripts/test-dressroom.mjs --person=a.png --garment=b.png --garment=c.png \
//        [--style=model|mirror] [--out=result.png] [--print]
//
// GEMINI_API_KEY 는 .env.local 에서 읽는다.
// ============================================================
import { readFileSync, writeFileSync } from "node:fs";
import { buildDressroom } from "../api/_lib/dressroom.js";

const args = process.argv.slice(2);
const get = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const all = (k) => args.filter((x) => x.startsWith(`--${k}=`)).map((x) => x.slice(k.length + 3));

const personPath = get("person");
const garmentPaths = all("garment");
const style = get("style", "model");
const out = get("out", "dressroom-test.png");
if (!personPath || !garmentPaths.length) {
  console.error("사용법: --person=사람사진 --garment=의상사진 [--garment=…] [--style=model|mirror]");
  process.exit(1);
}

// .env.local 에서 키 읽기
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")])
);
const apiKey = env.GEMINI_API_KEY;
if (!apiKey) { console.error(".env.local 에 GEMINI_API_KEY 가 없습니다"); process.exit(1); }

const mimeOf = (p) => (/\.png$/i.test(p) ? "image/png" : /\.webp$/i.test(p) ? "image/webp" : "image/jpeg");
const b64 = (p) => readFileSync(p).toString("base64");

const garments = garmentPaths.map((p) => ({ mimeType: mimeOf(p), base64: b64(p) }));
const { instruction, garmentList, sceneGroup, scene } = await buildDressroom({ garments, dressStyle: style, apiKey });

console.log(`스타일: ${style} · 의상 ${garmentList.length}장`);
if (scene) console.log(`의상 분류: ${sceneGroup} → 배경: ${scene}`);
else {
  const scenes = instruction.split("\n").filter((l) => /^ {2}\d\)/.test(l));
  if (scenes.length) console.log("분류 실패 → 후보 폴백:\n" + scenes.join("\n"));
}
if (args.includes("--print")) console.log("\n----- 프롬프트 -----\n" + instruction + "\n-------------------\n");

// 서버 bodyFor 와 같은 형태: [지시문] + [사람] + [의상 …], Pro 는 2K / 3:4
const body = {
  contents: [{
    role: "user",
    parts: [
      { text: instruction },
      { inline_data: { mime_type: mimeOf(personPath), data: b64(personPath) } },
      ...garmentList.map((g) => ({ inline_data: { mime_type: g.mimeType, data: g.base64 } })),
    ],
  }],
  generationConfig: { imageConfig: { imageSize: "2K", aspectRatio: "3:4" } },
};

const t0 = Date.now();
const r = await fetch(
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image:generateContent",
  { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey }, body: JSON.stringify(body) }
);
const j = await r.json().catch(() => null);
console.log(`HTTP ${r.status} · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (!r.ok) { console.error(JSON.stringify(j?.error || j).slice(0, 400)); process.exit(1); }

const part = (j?.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData || p.inline_data);
const data = part?.inlineData?.data || part?.inline_data?.data;
if (!data) {
  console.error("이미지가 없습니다:", JSON.stringify(j).slice(0, 400));
  process.exit(1);
}
writeFileSync(out, Buffer.from(data, "base64"));
console.log("저장:", out, `(${(Buffer.from(data, "base64").length / 1024 / 1024).toFixed(2)}MB)`);
