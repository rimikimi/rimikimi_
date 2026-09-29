// 커스텀 보정 ③ — 고칠 영역 찾기: 원본 사진 + ①의 edits → 영역 박스(0~1000 정규화)
//   node regions.mjs --img <원본> --plan out/<stem>-plan.json
// 결과: out/<stem>-regions.json  { regions: [{ label, box_2d: [ymin, xmin, ymax, xmax] }] }
import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const IMG = arg("img"), PLAN = arg("plan");
if (!IMG || !PLAN) { console.error("--img <원본> --plan <plan.json> 필요"); process.exit(1); }
const env = Object.fromEntries(readFileSync("/Users/home/Documents/rimikimi_app/.env.local", "utf8").split("\n")
  .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/)).filter(Boolean).map((m) => [m[1], m[2]]));
const KEY = env.GEMINI_API_KEY;
if (!KEY) { console.error("GEMINI_API_KEY 없음"); process.exit(1); }

const { plan } = JSON.parse(readFileSync(PLAN, "utf8"));
const buf = readFileSync(IMG);
const mime = buf[0] === 0x89 && buf[1] === 0x50 ? "image/png" : buf.slice(8, 12).toString() === "WEBP" ? "image/webp" : "image/jpeg";
const BOXES = { type: "ARRAY", items: { type: "OBJECT", required: ["label", "box_2d"],
  properties: { label: { type: "STRING" }, box_2d: { type: "ARRAY", items: { type: "INTEGER" } } } } };
const t0 = Date.now();
const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent", {
  method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": KEY },
  body: JSON.stringify({
    contents: [{ role: "user", parts: [
      { inline_data: { mime_type: mime, data: buf.toString("base64") } },
      { text: `A retoucher will make these edits to this photo:
${(plan.edits || []).map((e) => "- " + e).join("\n")}

Return the regions of THIS photo that these edits touch, as tight boxes around the objects being changed
(for example the hair and the veil — including where the veil will hang after the edit), and nothing else.
Do not include faces, skin or other people unless an edit explicitly changes them.
If an edit changes skin tone or brightness, include EVERY visible skin area of that person as its own box (face, neck, chest, ears, hands, arms) so the tone stays consistent between face and body.
Also return "protect": a tight box around every person's face (forehead to chin, ear to nose tip) that the edits do NOT explicitly change — these will be kept from the original photo.
JSON: {"regions": [{"label": "short name", "box_2d": [ymin, xmin, ymax, xmax]}], "protect": [{"label": "short name", "box_2d": [...]}]} with coordinates normalized 0-1000.` },
    ] }],
    generationConfig: {
      responseMimeType: "application/json", thinkingConfig: { thinkingLevel: "low" },
      // 스키마를 강제한다 — 스키마 없이 받으면 괄호가 빠진 JSON 이 온 적이 있다(9/29)
      responseSchema: { type: "OBJECT", required: ["regions", "protect"], properties: { regions: BOXES, protect: BOXES } },
    },
  }),
});
const j = await r.json();
if (!r.ok) { console.error("실패", r.status, JSON.stringify(j).slice(0, 300)); process.exit(1); }
const out = JSON.parse(j.candidates[0].content.parts.map((p) => p.text || "").join(""));
const stem = basename(IMG).replace(/\.[^.]+$/, "");
writeFileSync(join(HERE, "out", `${stem}-regions.json`), JSON.stringify(out, null, 2));
console.log(`영역 ${out.regions.length}개 (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
for (const g of out.regions) console.log(`  ${g.label}: ${JSON.stringify(g.box_2d)}`);
for (const g of out.protect || []) console.log(`  보호 ${g.label}: ${JSON.stringify(g.box_2d)}`);
