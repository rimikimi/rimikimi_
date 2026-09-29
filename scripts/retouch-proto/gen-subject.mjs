// 테스트용 가상 인물 만들기 — 실제 사람 사진 없이 텍스트만으로 생성 (보정 전 "평범한 셀카")
//   node gen-subject.mjs [--out subject.png]
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const OUT = join(HERE, (argv.indexOf("--out") >= 0 ? argv[argv.indexOf("--out") + 1] : "subject.png"));
const env = Object.fromEntries(readFileSync("/Users/home/Documents/rimikimi_app/.env.local", "utf8").split("\n")
  .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/)).filter(Boolean).map((m) => [m[1], m[2]]));
const KEY = env.GEMINI_API_KEY;
if (!KEY) { console.error("GEMINI_API_KEY 없음"); process.exit(1); }

const prompt = `An ordinary, unretouched smartphone selfie of a fictional East Asian woman in her late twenties, taken indoors at home in the evening.
No makeup. Her skin shows natural, realistic everyday texture: slightly dull and uneven tone, a little redness around the nose and cheeks, faint under-eye shadows, visible pores.
Warm, slightly dim ceiling light; plain off-white wall behind her. She looks straight at the camera with a relaxed, neutral expression, head and shoulders in frame, wearing a plain grey crew-neck T-shirt, shoulder-length black hair.
Realistic phone-camera photo, slight noise, no beauty filter, no retouching. Not a real or famous person. No text, no frame, no watermark.`;

const t0 = Date.now();
const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image:generateContent", {
  method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": KEY },
  body: JSON.stringify({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "3:4", imageSize: "2K" } },
  }),
});
const j = await r.json();
const part = (j?.candidates?.[0]?.content?.parts || []).find((x) => x.inlineData || x.inline_data);
if (!part) { console.error("실패", r.status, JSON.stringify(j).slice(0, 300)); process.exit(1); }
writeFileSync(OUT, Buffer.from((part.inlineData || part.inline_data).data, "base64"));
console.log(`가상 인물 ${((Date.now() - t0) / 1000).toFixed(1)}s → ${OUT}`);
