// ============================================================
// 매직 부스 "픽셀 캐릭터"(964) — 2단계 생성 (2026-09-24)
//
// 왜 2단계인가: 사진을 이미지 모델에 넣으면 편집 모드로 들어가 원본이 새어 나온다.
//   실측 5장 중 4장이 원본 위에 픽셀 머리만 덧칠됐다(거리 배경·실사 몸통이 그대로 남음).
//   출력 비율을 1:1 로 바꿔도 더 나빠졌다.
// → ① 비전 모델이 사진을 글로 옮긴다(머리·옷·신발·가방 색 hex, 자세, 방향)
//   ② 이미지 모델은 **사진 없이** 그 글만 보고 스프라이트를 그린다 → 원본 픽셀이 섞일 수 없다.
//   실측 4장 4/4 깨끗(흰 배경·아이소 타일·옷 색 반영).
// ============================================================

export const SPRITE_CONCEPT_IDS = new Set(["964"]);

const DESCRIBE =
  "Describe the main subject of this photo for a character artist who will draw them as a small game sprite. " +
  "If several people are in the photo, describe ONLY the single most prominent one (the largest / most central) and never mention the others. " +
  "Reply in plain English, max 110 words, as one paragraph with exactly these parts: " +
  "subject type (person / animal / object); for a person: apparent gender presentation, hair length and style, " +
  "hair colour as a hex code; skin tone as ONE word from: very fair / fair / light-medium / medium / tan / brown / deep (judge the person's natural skin, not shadows or warm/cool lighting — when unsure pick the lighter neighbour); glasses (none, or frame shape and colour hex); facial hair if any; every visible clothing item top to bottom with its colour as a hex code and notable " +
  "details (knit texture, buttons, belt); shoes with colour hex; bag or accessories with colour hex; pose " +
  "(standing / walking / sitting, what the hands do) and which way the body faces (toward the viewer, three-quarter " +
  "left, three-quarter right). For an animal or object: its kind, colours as hex codes and pose. " +
  "No background, no names, no guesses about identity.";

// 피부톤은 사진에서 hex 로 받으면 조명 따라 들쭉날쭉했다(같은 사진이 #C99E7E / #695046 — 실측 10/10).
// 단계 단어로 받고, 그리는 모델엔 정해진 색으로 넘긴다 — 단어만 주면 "light-medium" 을 갈색으로 그렸다.
const SKIN_HEX = [
  ["very fair", "#FBE3D2"], ["light-medium", "#EDC3A5"], ["fair", "#F6D5BF"], ["medium", "#D9A582"],
  ["tan", "#B98060"], ["brown", "#8A5A3E"], ["deep", "#5E3B28"],
];
function withSkinHex(text) {
  const m = text.match(/\b(very fair|light-medium|fair|medium|tan|brown|deep)\b(?=[^.;]*skin|\s*skin)|skin(?: tone)?[^.;#]{0,20}?\b(very fair|light-medium|fair|medium|tan|brown|deep)\b/i);
  const word = (m && (m[1] || m[2]) || "").toLowerCase();
  const hit = SKIN_HEX.find(([w]) => w === word);
  return hit ? text + ` Skin colour to use for the sprite: ${hit[1]} (${hit[0]}).` : text;
}

/** 사진 → 외형 설명. 실패하면 null (호출측이 기존 방식으로 폴백). */
export async function describeForSprite({ base64, mimeType, apiKey, timeoutMs = 15000 }) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      {
        method: "POST",
        signal: ctrl.signal,
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [
            { text: DESCRIBE },
            { inline_data: { mime_type: mimeType || "image/jpeg", data: base64 } },
          ] }],
        }),
      }
    );
    if (!r.ok) return null;
    const j = await r.json();
    const text = (j?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("").trim();
    return text.length > 20 ? withSkinHex(text.slice(0, 1200)) : null;
  } catch (_) {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// ============================================================
// 2단계: 얼굴 닮게 다시 그리기 (2026-10-10 오너 "미니미도 실제 모습을 미니미로")
//
// 1단계(글 → 그림)는 머리·옷은 맞지만 얼굴이 전부 같은 템플릿(점 눈·같은 미소)이다 — 글에는 얼굴이 안 담긴다.
// → 1단계 스프라이트를 **편집 대상(IMAGE 1)**, 손님 사진을 **닮음 참고(IMAGE 2)** 로 주고 얼굴만 다시 그린다.
//   편집 대상이 스프라이트라 원본 사진이 새지 않는다(실측 20장 중 실사 섞임 0 — 예전 누수는 사진이 편집 대상일 때).
//   수염·앞머리·주름·웃는 얼굴이 들어간다. 대신 없는 안경을 씌우거나 모자를 벗기는 일이 가끔 있어서
//   (가드 문구 넣고도 12장 중 2장) 아래 changeCheck 로 1단계와 비교해 잡고, 걸리면 1단계 그림을 그대로 쓴다.
//   flash-image 는 안경을 지어내는 비율이 높아 탈락(단발 3/3, 모자 2/3) — pro 만 쓴다.
// 실패·시간 부족·검사 불합격 → null (호출측이 1단계 그림을 내보낸다. 사용자에겐 지금보다 나빠질 일이 없다)
// ============================================================

import { checkIdentity } from "./qa.js";

const REFINE_MODEL = "gemini-3-pro-image";
const CHECK_MODEL = "gemini-3-flash-preview";

const refinePrompt = (desc) =>
  "You are given TWO images.\n" +
  "IMAGE 1 is a finished pixel-art chibi game sprite on a pure white background. It is the image you edit and output.\n" +
  "IMAGE 2 is a real photo of the person the sprite represents. Use it ONLY as a likeness reference for the face — never copy any of " +
  "its pixels, background, lighting, photo texture or realism into the output.\n\n" +
  "The person (ground truth for hair colour, hat, glasses and outfit): " + desc + "\n\n" +
  "TASK: redraw only the sprite's face and the hair around it so that friends would instantly recognise the person from IMAGE 2: " +
  "match their hairline, bangs and parting, face shape, eye shape and spacing, eyebrow shape, nose and mouth character, expression, " +
  "skin tone, glasses and facial hair, and any moles or freckles — translated into the SAME pixel-art style as IMAGE 1 (same coarse " +
  "visible pixel grid, hard square pixels, no anti-aliasing, 1-pixel dark #2A1414 outline, flat 2–3 shade cel shading, same chibi " +
  "head-to-body proportion).\n" +
  "If the sprite in IMAGE 1 wears a hat or cap, it stays exactly as it is; redraw only the face and the hair visible under it.\n" +
  "Never invent anything the person does not have: no glasses unless they clearly wear glasses, no facial hair unless they clearly " +
  "have it, no new hat or accessory. Keep the hair colour and the skin colour of IMAGE 1 exactly (they already match the person — do not tan, darken or lighten the skin because of the photo's lighting). If IMAGE 2 shows several people, use the one whose outfit " +
  "matches the sprite.\n" +
  "Keep everything else in IMAGE 1 exactly as it is: body, pose, outfit, colours, floor tile, framing, and the solid pure white " +
  "(#FFFFFF) background edge to edge. The output must be a pixel-art sprite, never a photo. Exactly one character, no text.";

// 실측(10/10): 알려진 불량 6장 중 5장(안경 추가 3·모자 빠짐·통째로 다시 그림) 잡고, 정상 6장은 전부 통과.
const CHECK =
  "Image 1 is a pixel-art game sprite. Image 2 is supposed to be the SAME sprite with only the face (and the hair right around it) " +
  "redrawn to look more like a real person. Everything else must be unchanged.\n" +
  "Answer each question by comparing image 2 against image 1:\n" +
  "- glasses_changed: glasses appeared or disappeared.\n" +
  "- hat_changed: a hat/cap appeared, disappeared or changed.\n" +
  "- hair_colour_changed: the hair colour clearly changed (e.g. black became brown, grey became dark). Small shading differences do not count.\n" +
  "- skin_tone_changed: the skin colour of the face or hands is clearly lighter or darker than in image 1 (e.g. pale became tan or brown). Small shading differences do not count.\n" +
  "- outfit_changed: clothing items, their colours, the bag or held objects clearly changed.\n" +
  "- redrawn: the whole sprite was re-made instead of edited — clearly different body proportions (no longer a big-head chibi), a " +
  "clearly different pose, or the isometric floor tile disappeared.\n" +
  "- photographic: any part of image 2 looks like a real photograph or photo background instead of pixel art.\n" +
  "Ignore changes to the face itself, the expression, bangs, small pixel noise and slight shifts in position or scale.\n" +
  'Reply with JSON only: {"glasses_changed":bool,"hat_changed":bool,"hair_colour_changed":bool,"skin_tone_changed":bool,"outfit_changed":bool,"redrawn":bool,"photographic":bool,"reason":"short"}';
const CHECK_KEYS = ["glasses_changed", "hat_changed", "hair_colour_changed", "skin_tone_changed", "outfit_changed", "redrawn", "photographic"];

async function shrink(base64, px) {
  const sharp = (await import("sharp")).default;
  return (await sharp(Buffer.from(base64, "base64")).rotate()
    .resize(px, px, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer()).toString("base64");
}

// 흰 배경 테두리 검사 — 사진 배경이 새면 테두리가 흰색이 아니게 된다(실측 불량 11%, 정상 ≤1%).
async function borderDirt(base64) {
  const sharp = (await import("sharp")).default;
  const { data, info } = await sharp(Buffer.from(base64, "base64")).resize(300, 400, { fit: "fill" })
    .removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height, c = info.channels;
  let n = 0, bad = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (x > 6 && x < w - 7 && y > 6 && y < h - 7) continue;
    n++;
    const i = (y * w + x) * c;
    if (Math.min(data[i], data[i + 1], data[i + 2]) < 225) bad++;
  }
  return bad / n;
}

// 1K 로 그린 결과를 1단계(2K) 크기로 되돌린다 — 픽셀 그림이라 최근접 확대면 손실이 없다(갤러리 원본 크기 유지).
async function upscaleTo(base64, likeBase64) {
  const sharp = (await import("sharp")).default;
  try {
    const m = await sharp(Buffer.from(likeBase64, "base64")).metadata();
    return (await sharp(Buffer.from(base64, "base64")).resize(m.width, m.height, { fit: "fill", kernel: "nearest" })
      .png().toBuffer()).toString("base64");
  } catch (_) {
    return base64;
  }
}

async function postJson(model, body, apiKey, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST", signal: ctrl.signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
    });
    return r.ok ? await r.json() : null;
  } catch (_) {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** 1단계와 비교해 바뀌면 안 되는 게 바뀌었는지. 판단 불가면 true(통과) 대신 false — 1단계 그림이 안전한 기본값이다. */
async function changeCheck(spriteSmall, outBase64, apiKey) {
  const [outSmall, dirt] = await Promise.all([shrink(outBase64, 768), borderDirt(outBase64).catch(() => 1)]);
  if (dirt > 0.05) return { ok: false, issue: `테두리 ${Math.round(dirt * 100)}%` };
  const j = await postJson(CHECK_MODEL, {
    contents: [{ role: "user", parts: [
      { inline_data: { mime_type: "image/jpeg", data: spriteSmall } },
      { inline_data: { mime_type: "image/jpeg", data: outSmall } },
      { text: CHECK },
    ] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0, thinkingConfig: { thinkingLevel: "low" } },
  }, apiKey, 15000);
  try {
    const v = JSON.parse((j?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join(""));
    const bad = CHECK_KEYS.filter((k) => v[k] === true);
    if (CHECK_KEYS.some((k) => typeof v[k] !== "boolean")) return { ok: false, issue: "판단불가" };
    return bad.length ? { ok: false, issue: bad.join(",") + " " + String(v.reason || "").slice(0, 80) } : { ok: true };
  } catch (_) {
    return { ok: false, issue: "판단불가" };
  }
}

/**
 * 1단계 스프라이트 + 손님 사진 → 얼굴만 닮게 다시 그린 스프라이트.
 * @returns {Promise<{data: string, mime: string} | null>} null 이면 1단계 그림을 그대로 쓴다.
 */
export async function refineSpriteFace({ spriteBase64, photoBase64, spriteDesc, apiKey, timeLeftMs }) {
  const deadline = Date.now() + Math.max(0, timeLeftMs);
  const left = () => deadline - Date.now();
  try {
    const [spriteIn, photoIn, spriteSmall] = await Promise.all([
      shrink(spriteBase64, 1024), shrink(photoBase64, 1024), shrink(spriteBase64, 768),
    ]);
    // 검사에 걸리면 한 번만 다시 — 그래도 안 되면 1단계 그림.
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (left() < 30000) return null;
      const j = await postJson(REFINE_MODEL, {
        contents: [{ role: "user", parts: [
          { text: refinePrompt(spriteDesc) },
          { inline_data: { mime_type: "image/jpeg", data: spriteIn } },
          { inline_data: { mime_type: "image/jpeg", data: photoIn } },
        ] }],
        // ⚠️ 2K 로 주면 손님 사진(거리 배경)이 통째로 섞여 나왔다(실측 10/10, 10장 중 9장) — 1K 에선 0/20.
        generationConfig: { responseModalities: ["IMAGE"], imageConfig: { imageSize: "1K", aspectRatio: "3:4" } },
      }, apiKey, Math.min(60000, left() - 18000));
      const part = (j?.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData || p.inline_data);
      const inl = part && (part.inlineData || part.inline_data);
      if (!inl?.data) { console.log(`[sprite] 얼굴 다시 그리기 실패(응답 없음) ${attempt}`); continue; }
      // ① 1단계와 비교(안경·모자·머리색·옷·통째로 다시 그림·실사·흰 테두리) ② 손님 사진과 비교(피부톤·인종·성별 —
      //    1단계 비교로는 안 보인다: 1단계 얼굴이 템플릿이라). 그림체 완화판(art) — 판단 불가는 통과.
      let [chk, idt] = await Promise.all([
        changeCheck(spriteSmall, inl.data, apiKey),
        checkIdentity({ refBase64: photoIn, refMime: "image/jpeg", base64: inl.data, mimeType: inl.mimeType || inl.mime_type || "image/png",
          apiKey, art: true, timeoutMs: 15000 }).catch(() => ({ ok: null })),
      ]);
      // 검사 모델이 답을 못 한 건 그림 탓이 아니다 — 다시 그리지 말고 검사만 한 번 더.
      if (chk.issue === "판단불가") chk = await changeCheck(spriteSmall, inl.data, apiKey);
      if (chk.ok && idt.ok === false) chk = { ok: false, issue: "다른 사람 " + (idt.issue || "") };
      console.log(`[sprite] 얼굴 다시 그리기 ${attempt}번째 ${chk.ok ? "통과" : "불합격 " + chk.issue}`);
      if (chk.ok) return { data: await upscaleTo(inl.data, spriteBase64), mime: "image/png" };
    }
    return null;
  } catch (e) {
    console.log("[sprite] 얼굴 다시 그리기 예외", e?.message || e);
    return null;
  }
}
