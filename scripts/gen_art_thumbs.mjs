// 401-407 아트 변환 카테고리 썸네일 자동 생성
// text-only Gemini 2.5 flash image generation → sharp 로 400x533 webp 변환
// 실행: node scripts/gen_art_thumbs.mjs

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

// .env.local 직접 파싱 (dotenv 없이)
function loadEnv() {
  const p = path.join(process.cwd(), ".env.local");
  const txt = fs.readFileSync(p, "utf8");
  const env = {};
  for (const line of txt.split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+?)\s*$/);
    if (m && !line.trim().startsWith("#")) env[m[1]] = m[2];
  }
  return env;
}
const ENV = loadEnv();
const KEY = ENV.GEMINI_API_KEY;
if (!KEY) {
  console.error("❌ GEMINI_API_KEY 없음");
  process.exit(1);
}

// 가상 인물 베이스 (모든 컨셉 동일하게 "한 명의 여성 정면 상반신")
const SUBJECT =
  "a portrait of a young East Asian woman in her 20s, soft natural expression, " +
  "front-facing upper body, shoulder-length dark hair, simple plain top, " +
  "neutral studio background, vertical 3:4 composition";

const CONCEPTS = [
  {
    id: 401,
    style:
      "Render in classical thick impasto oil painting technique: bold visible " +
      "brush strokes, generous layers of paint, rich textured surface with palette " +
      "knife marks, deep saturated warm colors, museum-quality, slight canvas " +
      "texture. NOT photorealistic — celebrate the paint texture.",
  },
  {
    id: 402,
    style:
      "Render as a loose wet-on-wet watercolor painting: soft pigment bleeds, " +
      "transparent washes, paper grain visible, gentle color pooling along edges, " +
      "fine ink line accents, airy pastel palette, untouched white paper around " +
      "the figure. Hand-painted feel.",
  },
  {
    id: 403,
    style:
      "Drawn by a 5-year-old kindergarten child with chunky oil pastels on rough " +
      "sketch paper. Big simple shapes, wonky proportions, head bigger than body, " +
      "dot eyes, wide smile, crayon-thick wax lines, color smudges, visible paper " +
      "texture, charmingly naive and joyful.",
  },
  {
    id: 404,
    style:
      "Clean flat 2D vector illustration, modern editorial style (New Yorker / " +
      "Behance feel). Solid color fills, minimal shading with 2-3 tones per area, " +
      "crisp clean outlines, simplified geometric features, limited cohesive " +
      "palette of 4-6 colors, flat background, smooth bezier curves.",
  },
  {
    id: 405,
    style:
      "Re-render as a soft-clay 3D character: matte pastel-colored plasticine, " +
      "gentle rounded shapes, visible fingerprint texture, miniature handcrafted " +
      "look (Aardman / Pixar clay aesthetic), soft studio lighting, shallow depth " +
      "of field, subtle clay shine, soft drop shadow. Cute and tactile.",
  },
  {
    id: 406,
    style:
      "Expressive rough charcoal drawing on textured paper. Strong thick black " +
      "charcoal strokes, gestural sketch energy, dramatic chiaroscuro with deep " +
      "blacks and luminous paper whites, smudges and finger-blended shadows, " +
      "visible loose hatching, monochrome (charcoal black on warm off-white paper).",
  },
  {
    id: 407,
    style:
      "Glamorous fashion illustration in colored pencil (David Downton / Vogue " +
      "illustration style). Exaggerated elongated elegant proportions, confident " +
      "colored pencil strokes, layered hatching, vibrant accent colors on lips " +
      "and clothing, loose suggestion of background, white space around the " +
      "figure. Sophisticated, chic, runway-ready.",
  },
];

const ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/" +
  "gemini-2.5-flash-image:generateContent?key=" +
  KEY;

async function generate(concept) {
  const prompt = `${SUBJECT}. ${concept.style}`;
  console.log(`[${concept.id}] 요청 보내는 중...`);
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ["IMAGE"] },
  };
  const r = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`HTTP ${r.status}: ${txt.slice(0, 400)}`);
  }
  const data = await r.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  for (const p of parts) {
    if (p.inlineData?.data) {
      return Buffer.from(p.inlineData.data, "base64");
    }
  }
  throw new Error(`이미지 응답 없음: ${JSON.stringify(data).slice(0, 400)}`);
}

async function saveThumb(id, raw) {
  const out = path.join("public", "thumbs", `${id}.webp`);
  await sharp(raw)
    .resize(400, 533, { fit: "cover", position: "attention" })
    .webp({ quality: 80 })
    .toFile(out);
  const sz = fs.statSync(out).size;
  console.log(`[${id}] ✅ ${out} (${(sz / 1024).toFixed(1)} KB)`);
}

async function main() {
  for (const c of CONCEPTS) {
    let attempt = 0;
    while (attempt < 3) {
      try {
        const raw = await generate(c);
        await saveThumb(c.id, raw);
        break;
      } catch (e) {
        attempt++;
        console.error(`[${c.id}] 실패 #${attempt}: ${e.message}`);
        if (attempt >= 3) console.error(`[${c.id}] ⛔ 포기`);
        else await new Promise((r) => setTimeout(r, 2000));
      }
    }
    // rate limit 보호
    await new Promise((r) => setTimeout(r, 1500));
  }
  console.log("🎉 끝");
}
main();
