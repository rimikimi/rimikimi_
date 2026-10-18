#!/usr/bin/env node
// 성별 고정 컨셉(프롬프트에 "a young woman")에 다른 성별 사진을 넣었을 때 성별이 바뀌는지 실사 테스트.
//   node scripts/test-gender.mjs --person=man.png --concept=339 [--out=dir] [--wrap=old|new]
// 서버 generate.js 의 PHOTOREALISM·SKIN_FINAL·단일 인물 래퍼를 소스에서 그대로 읽어 쓴다.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const args = process.argv.slice(2);
const get = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l && !l.startsWith("#") && l.includes("="))
  .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]));
const src = readFileSync(new URL("../api/generate.js", import.meta.url), "utf8");
const grab = (name) => { const m = src.match(new RegExp(`const ${name} =([\\s\\S]*?);\\n`)); return eval(m[1]); };
const PHOTOREALISM = grab("PHOTOREALISM"), SKIN_FINAL = grab("SKIN_FINAL");
const wrapNew = src.match(/: "Using the person in the provided photo, generate a new portrait. " \+([\s\S]*?)\+ prompt;/);
const concept = JSON.parse(readFileSync(new URL("../api/_data/concepts.json", import.meta.url))).find((c) => String(c.id) === get("concept", "339"));
const wrapper = eval('"Using the person in the provided photo, generate a new portrait. " +' + wrapNew[1] + '+ ""');
const instruction = PHOTOREALISM + wrapper + concept.text + SKIN_FINAL;
if (args.includes("--print")) console.log(wrapper);
const person = get("person");
const body = { contents: [{ role: "user", parts: [{ text: instruction },
  { inline_data: { mime_type: person.endsWith(".png") ? "image/png" : "image/jpeg", data: readFileSync(person).toString("base64") } }] }],
  generationConfig: { imageConfig: { imageSize: "1K", aspectRatio: "3:4" } } };
const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image:generateContent",
  { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY }, body: JSON.stringify(body) });
const j = await r.json();
const p = (j?.candidates?.[0]?.content?.parts || []).find((x) => x.inlineData || x.inline_data);
if (!p) { console.error(r.status, JSON.stringify(j).slice(0, 400)); process.exit(1); }
const out = get("out", "gender-test.png");
writeFileSync(out, Buffer.from((p.inlineData || p.inline_data).data, "base64"));
console.log("saved", out);
