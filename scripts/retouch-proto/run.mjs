// 커스텀 보정 테스트 — 사진 + 사용자가 쭉 적은 글 → ① 의도 파악(flash) ② 그 부분만 편집(pro-image)
//   node run.mjs --img <사진경로> --text "고칠 내용(아무 언어)" [--n 2]
//   → regions.mjs(고칠 영역·보호할 얼굴) → composite.py(고친 곳만 원본에 붙임) 또는 levels.py(세기 20~100% 단계)
// 오너가 직접 실행한다(실제 사람 사진이라 내가 외부 API 로 보내지 않는다).
// GEMINI_API_KEY 는 .env.local 에서 프로세스 안에서만 읽는다(출력하지 않음).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const IMG = arg("img");
if (!IMG) { console.error("--img <사진경로> 가 필요합니다"); process.exit(1); }
const N = Number(arg("n", "2"));
const TEXT = arg("text");
if (!TEXT) { console.error("--text \"고칠 내용\" 이 필요합니다"); process.exit(1); }

const env = Object.fromEntries(readFileSync("/Users/home/Documents/rimikimi_app/.env.local", "utf8").split("\n")
  .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/)).filter(Boolean).map((m) => [m[1], m[2]]));
const KEY = env.GEMINI_API_KEY;
if (!KEY) { console.error("GEMINI_API_KEY 없음"); process.exit(1); }

const buf = readFileSync(IMG);
// 확장자가 아니라 파일 앞 바이트로 형식을 판단 — Gemini 는 .png 로 저장해도 JPEG 바이트를 줄 때가 있다
const mime = buf[0] === 0x89 && buf[1] === 0x50 ? "image/png" : buf.slice(8, 12).toString() === "WEBP" ? "image/webp" : "image/jpeg";
const b64 = buf.toString("base64");
// 원본 크기(JPEG SOF / PNG IHDR) → 가장 가까운 지원 비율
const dims = (() => {
  if (mime === "image/png") return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
  for (let i = 2; i < buf.length - 9;) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1], len = buf.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
    i += 2 + len;
  }
  return [1000, 1000];
})();
const RATIOS = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9"];
const want = dims[0] / dims[1];
const aspect = RATIOS.map((r) => { const [a, b] = r.split(":").map(Number); return [r, Math.abs(Math.log(a / b / want))]; })
  .sort((x, y) => x[1] - y[1])[0][0];
console.log(`입력 ${basename(IMG)} ${dims[0]}x${dims[1]} → 비율 ${aspect}`);

async function gem(model, body, ms) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": KEY }, body: JSON.stringify(body), signal: ac.signal });
    const j = await r.json().catch(() => null);
    if (!r.ok) return { err: `${r.status} ${JSON.stringify(j?.error?.message || j).slice(0, 200)}` };
    return { j };
  } catch (e) { return { err: String(e.message || e) }; } finally { clearTimeout(t); }
}

// ① 의도 파악 — 푸념 섞인 자유 글을 사진을 보면서 "무엇을 어떻게 고칠지 / 무엇은 건드리지 말지"로 바꾼다
const t0 = Date.now();
const interp = await gem("gemini-3-flash-preview", {
  contents: [{ role: "user", parts: [
    { inline_data: { mime_type: mime, data: b64 } },
    { text: `You are a professional photo retoucher. A customer sent this photo with the request below. It may be written casually and in any language (Korean, English, Arabic, anything).
Look at the photo and work out what they actually want fixed (read the context and intent, not just the literal words),
and what must stay untouched. Only include changes the customer asked for or clearly implied — no extra "improvements".

Customer request:
"""${TEXT}"""

Return JSON: {"lang": "language code of the request", "summary": "one or two polite sentences for the customer, in the SAME language as the request, saying what will be fixed", "edits": ["precise English edit instruction tied to what is visible in this photo", ...], "keep": ["what must stay exactly the same", ...], "feasible": true, "note": "anything hard or risky, in the same language as the request (empty string if none)"}` },
  ] }],
  generationConfig: { responseMimeType: "application/json", thinkingConfig: { thinkingLevel: "low" } },
}, 60000);
if (interp.err) { console.error("의도 파악 실패:", interp.err); process.exit(1); }
const plan = JSON.parse(interp.j.candidates[0].content.parts.map((p) => p.text || "").join(""));
console.log(`\n① 의도 파악 (${((Date.now() - t0) / 1000).toFixed(1)}s)
  언어: ${plan.lang}  요약: ${plan.summary}
  고칠 것:\n${(plan.edits || []).map((e) => "   - " + e).join("\n")}
  그대로 둘 것:\n${(plan.keep || []).map((e) => "   - " + e).join("\n")}${plan.note ? "\n  주의: " + plan.note : ""}\n`);

// ② 편집 — 고칠 곳만, 나머지는 원본 그대로
const editPrompt = `Retouch this exact photograph. This is an edit of the provided photo, not a new photo.

Apply ONLY these changes:
${(plan.edits || []).map((e) => "- " + e).join("\n")}

Keep everything else exactly as it is in the original:
${(plan.keep || []).map((e) => "- " + e).join("\n")}
- Same framing, crop, camera angle and composition; the same people in the same poses and positions
- Same faces and identities (same face shape, eyes, nose, mouth, age), same body shapes, same clothing
- Same lighting direction, exposure, white balance, color grading, contrast and photo texture
- Same background and scenery
(Each "same" rule above yields only where an edit above explicitly asks for that change.)
The result must look like the same real photo after a skilled human retoucher's careful work: photorealistic, no painted or AI look, no added objects, no text, no frame or border.`;
mkdirSync(join(HERE, "out"), { recursive: true });
const stem = basename(IMG).replace(/\.[^.]+$/, "");
writeFileSync(join(HERE, "out", `${stem}-plan.json`), JSON.stringify({ text: TEXT, plan, editPrompt }, null, 2));

await Promise.all(Array.from({ length: N }, async (_, k) => {
  const t1 = Date.now();
  for (let attempt = 1; attempt <= 2; attempt++) {
    const r = await gem("gemini-3-pro-image", {
      contents: [{ role: "user", parts: [{ inline_data: { mime_type: mime, data: b64 } }, { text: editPrompt }] }],
      generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: aspect, imageSize: "2K" } },
    }, 150000);
    const part = (r.j?.candidates?.[0]?.content?.parts || []).find((x) => x.inlineData || x.inline_data);
    if (part) {
      const d = part.inlineData || part.inline_data;
      const f = join(HERE, "out", `${stem}-edit${k + 1}.png`);
      writeFileSync(f, Buffer.from(d.data, "base64"));
      console.log(`② 편집 ${k + 1}: ${((Date.now() - t1) / 1000).toFixed(1)}s → out/${basename(f)}`);
      return;
    }
    console.log(`② 편집 ${k + 1} 시도 ${attempt} 실패: ${r.err || r.j?.candidates?.[0]?.finishReason || "이미지 없음"}`);
  }
}));
console.log("끝");
