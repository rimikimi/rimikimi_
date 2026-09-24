// ============================================================
// 생성 결과 불량 검사 (2026-09-24 오너 지시)
//
// "팔 3개, 손가락 6개 같은 생성 엔진 실수를 내보내기 전에 막아라."
// 만든 이미지를 비전 모델이 한 번 보고, **명백한** 불량이면 false 를 돌려준다.
// 호출측은 false 일 때 한 번만 다시 뽑는다(드레스룸 기장 검사와 같은 틀).
//
// 원칙
//  · 오탐이 더 나쁘다 — 멀쩡한 사진을 다시 뽑으면 시간·원가만 두 배다. 확실한 것만 잡는다.
//  · 검사가 생성을 막으면 안 된다 — 판단 불가·타임아웃·오류는 null(통과).
// ============================================================

// 실측(9/24): 손가락 6개를 2.5-flash·2.5-pro 는 5개로 셌고 3-flash 만 6개로 셌다(3초대로 가장 빠름).
const QA_MODEL = "gemini-3-flash-preview";

function buildPrompt({ people, panels, art }) {
  const who = panels > 1
    ? `This is a photo strip with ${panels} panels; each panel should show ${people === 2 ? "the same two people" : "the same one person"}.`
    : people === 2
    ? "The image should contain exactly two people."
    : "The image should contain exactly one main subject.";
  return (
    "You are a strict quality inspector for AI-generated images. Look for OBVIOUS generation defects " +
    "that a normal viewer would notice immediately. " + who + "\n\n" +
    "Flag a defect ONLY for these, and only when clearly visible:\n" +
    "1. LIMBS: an extra or missing arm, leg, hand or foot; a limb attached in an impossible place; a floating " +
    "or detached body part; a ghost / semi-transparent duplicate limb.\n" +
    (art
      ? "2. HANDS & FEET: clearly broken ones — e.g. fingers sprouting from the wrist, a hand or foot fused into the body " +
        "or pointing backwards. Simplified cartoon / pixel / stitched hands and feet with 3–4 fingers, mitten hands or " +
        "blob feet are NORMAL in artwork — do not flag them.\n"
      : "2. HANDS & FEET: a clearly visible hand with 6 or more fingers or fewer than 4 (when not hidden); a clearly " +
        "visible bare foot with extra or missing toes; fingers or toes fused, melted or twisted; a foot pointing the " +
        "wrong way.\n") +
    "3. JOINTS & BODY: a knee, elbow, wrist or neck bent in an anatomically impossible direction; a twisted torso " +
    "(chest and hips facing opposite ways); a grossly stretched neck or limb.\n" +
    "4. FACE: melted or duplicated face, two heads, extra or misplaced eyes / mouth / ears, badly mismatched eyes, " +
    "melted or far too many teeth.\n" +
    "5. FUSION: body parts fused with objects or clothing (a cup melted into the fingers, hair or a sleeve melting " +
    "into the skin or the background), two people merged into one.\n" +
    "6. PEOPLE: the wrong number of main people, or an extra deformed / partial face or body appearing where it " +
    "should not.\n" +
    // 배경 간판의 작은 글자까지 잡으면 재생성이 너무 잦다 — 눈에 띄는 것만.
    "7. TEXT: PROMINENT garbled pseudo-letters (on the subject's clothing or a large sign that draws the eye), or a " +
    "stray watermark, logo or camera date stamp printed on the photo. Ignore small, blurry background signage.\n" +
    (art
      ? "8. This image is meant to be fully in one ARTWORK style (illustration, pixel art, embroidery, painting…). " +
        "Flag it if part of it is still a real PHOTOGRAPH — e.g. a photographic background, a photographic body " +
        "or face next to drawn parts, or artwork pasted over a photo. A photograph OF a physical handmade piece " +
        "(embroidery on fabric, a clay figure, a miniature model, a painting on a table) is the INTENDED look — the " +
        "fabric, table or room around the craft is fine; only flag when the SUBJECT itself is partly a real photo.\n"
      : "") +
    "\nDo NOT flag: stylisation, unusual but physically possible poses (a raised leg, crossed arms), hands or feet " +
    "hidden or cropped by the frame, motion blur, shallow depth of field, " +
    "artistic exaggeration (chibi proportions are fine), makeup, accessories, or anything you are unsure about. " +
    "When in doubt, answer no defect.\n\n" +
    // 실측(9/24): 그냥 물으면 손가락 6개를 놓쳤다 — 손마다 **먼저 세게** 한다.
    (art ? "" : "Before deciding, look at EVERY clearly visible hand and bare foot and count its fingers / toes one by one, including the thumb.\n\n") +
    'Reply with JSON only: {"hands": [{"where": "short location", "fingers": number, "fully_visible": true|false}], ' +
    (art ? '"photographic_parts": true|false, ' : "") +
    '"defect": true|false, "issue": "short reason or empty"}. A fully visible hand whose finger count is not 5 is a defect.' +
    // 실측(9/24): 그림체 불량(실사 배경 위 픽셀)을 같은 이미지 3번 중 1번 놓쳤다 → 따로 답하게 한다.
    (art ? ' "photographic_parts" = true when the SUBJECT (person, animal) or its surroundings are left as a real photograph ' +
      "instead of being re-made in the artwork style — e.g. a drawn head on a real photographed body, or artwork pasted on a real street photo. " +
      "A photo OF a handmade piece (embroidery fabric, clay figure, miniature model) where the whole subject is the craft counts as false." : "")
  );
}

/**
 * @returns {Promise<{ok: boolean|null, issue?: string}>} ok=false 만 "다시 뽑아라".
 */
// 2K 원본을 그대로 보내면 모델이 오래 생각해 20초 타임아웃이 잦았다(실측 9/24) — 검사용으로만 줄인다.
async function shrinkForQa(base64, mimeType) {
  try {
    const sharp = (await import("sharp")).default;
    const out = await sharp(Buffer.from(base64, "base64")).rotate()
      .resize(1280, 1280, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
    return { data: out.toString("base64"), mime: "image/jpeg" };
  } catch (_) {
    return { data: base64, mime: mimeType || "image/png" };
  }
}

export async function inspectImage({ base64, mimeType, apiKey, people = 1, panels = 1, art = false, timeoutMs = 20000 }) {
  if (!base64 || !apiKey) return { ok: null };
  const small = await shrinkForQa(base64, mimeType);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${QA_MODEL}:generateContent`,
      {
        method: "POST",
        signal: ctrl.signal,
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [
            { text: buildPrompt({ people, panels, art }) },
            { inline_data: { mime_type: small.mime, data: small.data } },
          ] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0, thinkingConfig: { thinkingLevel: "low" } },
        }),
      }
    );
    if (!r.ok) { console.error("[qa] upstream", r.status); return { ok: null }; }
    const j = await r.json();
    const text = (j?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
    const v = JSON.parse(text);
    if (typeof v?.defect !== "boolean") return { ok: null };
    if (art && v.photographic_parts === true) return { ok: false, issue: v.issue || "그림체에 실사가 섞임" };
    // 모델이 센 숫자와 결론이 어긋나면 숫자를 믿는다(다 보이는 손인데 5개가 아님 = 불량).
    // 그림체(art)는 손을 단순화해 그리는 게 정상이라 숫자 규칙을 쓰지 않는다(픽셀·자수 4손가락 오탐 실측).
    const badHand = !art && Array.isArray(v.hands) && v.hands.find((h) => h && h.fully_visible === true && Number.isFinite(h.fingers) && h.fingers !== 5);
    if (badHand && !v.defect) return { ok: false, issue: `손가락 ${badHand.fingers}개 (${badHand.where || "손"})` };
    return { ok: !v.defect, issue: String(v.issue || "").slice(0, 200) };
  } catch (e) {
    console.error("[qa] 판단불가:", e?.name === "AbortError" ? "timeout" : String(e?.message || e).slice(0, 120));
    return { ok: null };
  } finally {
    clearTimeout(t);
  }
}
