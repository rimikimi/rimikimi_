// 401-407 아트 변환 카테고리 썸네일 생성 (관리자 얼굴 input)
// scripts/admin.jpeg 의 얼굴만 가져와서 각 아트 스타일로 자유롭게 변형
// (분위기/포즈/배경/의상 모두 새롭게 — 같은 정면 셀카 반복 X)
//
// 실행: node scripts/gen_art_thumbs.mjs

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

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

// 관리자 얼굴 사진 (input)
const ADMIN_PATH = path.join("scripts", "admin.jpeg");
if (!fs.existsSync(ADMIN_PATH)) {
  console.error("❌ scripts/admin.jpeg 없음");
  process.exit(1);
}
const ADMIN_BYTES = fs.readFileSync(ADMIN_PATH);
const ADMIN_B64 = ADMIN_BYTES.toString("base64");
const ADMIN_MIME = "image/jpeg";
console.log(`📷 admin.jpeg 로드 (${(ADMIN_BYTES.length / 1024).toFixed(0)}KB)`);

// 각 아트 스타일별 prompt (얼굴 보존 + 자유로운 분위기)
const COMMON_FACE = (
  "Keep the EXACT same face, identity, and gender from the reference photo. " +
  "Preserve facial features, eye shape, nose, lips, and hairline so the person " +
  "is clearly recognizable. But invent a fresh new scene — change the pose, " +
  "outfit, hair style/color, lighting, background, and mood freely. " +
  "Do NOT mimic the reference's frontal ID-photo composition; create an " +
  "expressive, story-like portrait."
);

const CONCEPTS = [
  {
    id: 401,
    style:
      "Thick impasto oil painting. Bold visible brush strokes, generous layers, " +
      "rich textured surface with palette knife marks, deep saturated warm colors, " +
      "classical museum-quality oil portrait. Dramatic gallery lighting, " +
      "slight canvas texture visible. NOT photorealistic — celebrate the paint.",
    scene:
      "Suggested scene: half-turned shoulder, looking off-camera, " +
      "in a warm autumn light by a window with vague garden behind.",
  },
  {
    id: 402,
    style:
      "Loose wet-on-wet watercolor painting. Soft pigment bleeds, transparent washes, " +
      "paper grain visible, gentle color pooling along edges, fine ink line accents, " +
      "airy pastel palette, untouched white paper around the figure.",
    scene:
      "Suggested scene: dreamy 3/4 angle, soft smile, holding a small flower or " +
      "tea cup, background fading into white paper.",
  },
  {
    id: 403,
    style:
      "Drawn by a 5-year-old kindergarten child with chunky oil pastels on rough " +
      "sketch paper. Big simple shapes, wonky proportions, head bigger than body, " +
      "dot eyes, wide smile, crayon-thick wax lines, color smudges, visible paper " +
      "texture. Naive, joyful, charming.",
    scene:
      "Suggested scene: full-body stick-figure-ish, jumping or waving, with a " +
      "scribbled sun, hearts, or flowers around.",
  },
  {
    id: 404,
    style:
      "Clean flat 2D vector illustration, modern editorial style (New Yorker / " +
      "Behance feel). Solid color fills, minimal shading 2-3 tones per area, " +
      "crisp clean outlines, simplified geometric features, limited cohesive " +
      "palette of 4-6 colors, smooth bezier curves.",
    scene:
      "Suggested scene: stylish urban setting — sitting at a café table with " +
      "a latte, or walking past a colorful storefront. Confident pose.",
  },
  {
    id: 405,
    style:
      "Soft-clay 3D character: matte pastel-colored plasticine, gentle rounded " +
      "shapes, visible fingerprint texture, miniature handcrafted look (Aardman / " +
      "Pixar clay aesthetic), soft studio lighting, shallow depth of field, " +
      "subtle clay shine, soft drop shadow. Cute, tactile, charming.",
    scene:
      "Suggested scene: tiny clay character standing in a tiny clay scene — " +
      "with a clay cat at her feet, or holding a clay heart.",
  },
  {
    id: 406,
    style:
      "Expressive rough charcoal drawing on textured paper. Strong thick black " +
      "charcoal strokes, gestural sketch energy, dramatic chiaroscuro with deep " +
      "blacks and luminous paper whites, smudges and finger-blended shadows, " +
      "visible loose hatching, monochrome (charcoal on warm off-white paper).",
    scene:
      "Suggested scene: dramatic side-light, head tilted, hair flowing, " +
      "intense gaze — like a life-drawing studio session.",
  },
  {
    id: 407,
    style:
      "Glamorous fashion illustration in colored pencil (David Downton / Vogue " +
      "illustration style). Exaggerated elongated elegant proportions, confident " +
      "colored pencil strokes, layered hatching, vibrant accent colors on lips " +
      "and clothing, loose suggestion of background, white space around the figure.",
    scene:
      "Suggested scene: high-fashion runway pose, dramatic gown or coat, " +
      "tall heels, one hand on hip — sophisticated and chic.",
  },
];

const ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/" +
  "gemini-2.5-flash-image:generateContent?key=" +
  KEY;

async function generate(concept) {
  const prompt = `${COMMON_FACE}\n\nArtistic style:\n${concept.style}\n\n${concept.scene}\n\nVertical 3:4 portrait composition.`;
  console.log(`[${concept.id}] 요청 보내는 중...`);
  const body = {
    contents: [
      {
        parts: [
          { text: prompt },
          { inline_data: { mime_type: ADMIN_MIME, data: ADMIN_B64 } },
        ],
      },
    ],
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
    await new Promise((r) => setTimeout(r, 1500));
  }
  console.log("🎉 끝");
}
main();
