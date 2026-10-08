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
  const who = people === 0
    ? "The photo may contain any number of people — do not judge how many there are."
    : panels > 1
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
    // 오너 지시(2026-10-08): 모든 생성에 물리법칙도 같이 본다 — 명백한 것만.
    "9. PHYSICS: an object clearly floating with nothing holding or supporting it (a cup or phone hovering in the air, " +
    "a bag hanging from nothing); a person or object passing through a solid object (a hand inside a table, legs merged " +
    "into a chair); liquid, hair or fabric clearly defying gravity with no wind or motion to explain it; a mirror or window " +
    "reflection showing a different person, a different pose or a scene that does not match; a shadow falling in a clearly " +
    "impossible direction compared with the other shadows. " +
    (art ? "Cartoon and craft styles may bend physics on purpose — only flag what is clearly a mistake, not a stylistic choice.\n" : "\n") +
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

// ============================================================
// 얼굴 동일인 검사 (2026-10-02 오너 신고: 평소 쓰던 사진으로 "밴쿠버 레트로 다이너"를 만들었는데
// 서양인 얼굴이 나왔다). 같은 사진·같은 프롬프트로도 가끔 장면(외국 장소·서양식 옷)에 끌려 다른 사람이 된다.
// 프롬프트로 확률을 0 으로 만들 수 없으니 결과를 원본과 비교해 다르면 한 번 다시 뽑는다.
// 오탐은 재생성(시간·원가)만 늘리므로 두 번 물어 둘 다 "다른 사람"일 때만 false.
// ============================================================
// 오너 지시(2026-10-08): 얼굴 동일인 검사는 모든 생성에 — 커플(2인)·인생네컷(여러 칸)·그림체도.
// 그림체는 얼굴이 원래 단순해지므로 안정 특징(인종·피부톤·성별·안경·머리색/길이)만 본다(10/02 서양인 얼굴 사고가 인종 변경).
const NO_PERSON = "If image 1 shows no person at all (an animal, object or scene), answer same_person true.\n";
function identityPrompt({ art = false, panels = 1, pair = false } = {}) {
  if (pair) {
    return (
      "Image 1 is person A's own photo. Image 2 is person B's own photo. Image 3 is an AI-generated picture that MUST show both of them" +
      (panels > 1 ? ` in every one of its ${panels} panels` : "") + ".\n" +
      "Decide whether person A AND person B are each recognisably present in image 3 (as the same individuals, not lookalikes of another ethnicity).\n" +
      (art
        ? "Image 3 is an illustration — judge only stable traits: ethnicity, skin tone, gender presentation, glasses, hair colour and length.\n"
        : "Compare stable traits: ethnicity, eye shape, nose, lips, face shape, jaw, brows, skin undertone. IGNORE hair styling, makeup, outfit, lighting, angle, expression.\n") +
      "If either person is missing, swapped for someone else, or merged into one face, they are NOT the same.\n" +
      'Reply with JSON only: {"same_person": true|false, "ethnicity_changed": true|false, "reason": "short"}'
    );
  }
  if (art) {
    return (
      "Image 1 is the customer's own photo. Image 2 is an ILLUSTRATION / artwork (cartoon, pixel, embroidery, clay, painting…) " +
      "made from it" + (panels > 1 ? `, with ${panels} panels` : "") + ".\n" +
      "Faces are simplified on purpose in artwork — do NOT compare detailed facial features.\n" +
      "Judge only whether the main person in image 2 could still be this customer by stable traits: ethnicity, skin tone, " +
      "gender presentation, glasses (present or not), hair colour and rough hair length.\n" +
      "Only a clear change of ethnicity / skin tone / gender, or a clearly different person, means NOT the same. When in doubt, answer the same.\n" +
      NO_PERSON +
      'Reply with JSON only: {"same_person": true|false, "ethnicity_changed": true|false, "reason": "short"}'
    );
  }
  return (
    "Image 1 is the customer's own photo. Image 2 is an AI-generated portrait that MUST show the same person" +
    (panels > 1 ? ` in every one of its ${panels} panels — if ANY panel shows a different person, it is NOT the same` : "") + ".\n" +
    "Decide whether the main person in image 2 is recognisably the SAME individual as in image 1.\n" +
    "Compare stable traits only: ethnicity, eye shape and eyelids, nose, lips, face shape, jaw and cheekbones, brow shape, skin undertone.\n" +
    "IGNORE: hairstyle and hair colour, makeup, outfit, lighting, camera angle, expression, retouched skin, and a slightly different age look.\n" +
    "A different ethnicity, or a clearly different face that friends would not recognise as this person, means NOT the same.\n" +
    NO_PERSON +
    'Reply with JSON only: {"same_person": true|false, "ethnicity_changed": true|false, "reason": "short"}'
  );
}
export async function checkIdentity({ refBase64, refMime, base64, mimeType, apiKey, timeoutMs = 15000,
  art = false, panels = 1, ref2Base64 = null, ref2Mime = null }) {
  if (!refBase64 || !base64 || !apiKey) return { ok: null };
  const pair = !!ref2Base64;
  const [ref, out, ref2] = await Promise.all([shrinkForQa(refBase64, refMime), shrinkForQa(base64, mimeType),
    pair ? shrinkForQa(ref2Base64, ref2Mime) : null]);
  const once = async () => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${QA_MODEL}:generateContent`, {
        method: "POST", signal: ctrl.signal,
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [
            { inline_data: { mime_type: ref.mime, data: ref.data } },
            ...(pair ? [{ inline_data: { mime_type: ref2.mime, data: ref2.data } }] : []),
            { inline_data: { mime_type: out.mime, data: out.data } },
            { text: identityPrompt({ art, panels, pair }) },
          ] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0, thinkingConfig: { thinkingLevel: "low" } },
        }),
      });
      if (!r.ok) return null;
      const j = await r.json();
      const v = JSON.parse((j?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join(""));
      if (typeof v?.same_person !== "boolean") return null;
      return { same: v.same_person && v.ethnicity_changed !== true, reason: String(v.reason || "").slice(0, 160) };
    } catch (_) { return null; } finally { clearTimeout(t); }
  };
  const votes = (await Promise.all([once(), once()])).filter(Boolean);
  if (!votes.length) return { ok: null };
  const diff = votes.filter((v) => !v.same);
  return { ok: !(diff.length === votes.length), issue: diff[0]?.reason || "" };
}

// ============================================================
// 장면(배경) 검사 (2026-10-08 오너 지시: "한 번에 여러 장 생성하면 배경을 이상하게 따오는 경우 — 그런 일도 없어야 함").
// 컨셉이 정한 장소 대신 손님 셀카의 방·배경을 그대로 가져오거나, 장소가 컨셉과 딴판인 경우만 잡는다.
// 원본 배경을 일부러 살리는 경로(매직 부스·말로 고치기·복원·드레스룸 장면 치환)는 호출측에서 부르지 않는다.
// 오탐이 더 나쁘다 — 두 번 물어 둘 다 불량일 때만 false.
// ============================================================
function scenePrompt(sceneText) {
  return (
    "Image 1 is the customer's own selfie (used ONLY for their face). Image 2 is an AI-generated photo that should be set in the scene described below.\n" +
    "REQUESTED SCENE / CONCEPT (excerpt):\n" + sceneText + "\n\n" +
    "Flag a problem ONLY in these two clear cases:\n" +
    "1. COPIED BACKGROUND: image 2's background is visibly the same room / wall / backdrop / place as the selfie in image 1 " +
    "(same furniture, same wall, same window, same street) instead of the requested scene.\n" +
    "2. WRONG PLACE: the kind of place in image 2 clearly contradicts the requested scene (e.g. a bedroom when a beach was requested, " +
    "an outdoor street when a studio backdrop was requested).\n" +
    "Do NOT flag: a different but plausible interpretation of the scene, plain studio backdrops when the concept asks for a studio, " +
    "lighting or colour differences, small props, or anything you are unsure about. When in doubt, answer no problem.\n" +
    'Reply with JSON only: {"copied_background": true|false, "wrong_place": true|false, "reason": "short"}'
  );
}
export async function checkScene({ refBase64, refMime, base64, mimeType, sceneText, apiKey, timeoutMs = 15000 }) {
  if (!refBase64 || !base64 || !apiKey || !sceneText) return { ok: null };
  const [ref, out] = await Promise.all([shrinkForQa(refBase64, refMime), shrinkForQa(base64, mimeType)]);
  const text = scenePrompt(String(sceneText).slice(0, 1800));
  const once = async () => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${QA_MODEL}:generateContent`, {
        method: "POST", signal: ctrl.signal,
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [
            { inline_data: { mime_type: ref.mime, data: ref.data } },
            { inline_data: { mime_type: out.mime, data: out.data } },
            { text },
          ] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0, thinkingConfig: { thinkingLevel: "low" } },
        }),
      });
      if (!r.ok) return null;
      const j = await r.json();
      const v = JSON.parse((j?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join(""));
      if (typeof v?.copied_background !== "boolean") return null;
      return { bad: v.copied_background === true || v.wrong_place === true,
        reason: (v.copied_background ? "셀카 배경을 가져옴: " : v.wrong_place ? "장소가 컨셉과 다름: " : "") + String(v.reason || "").slice(0, 140) };
    } catch (_) { return null; } finally { clearTimeout(t); }
  };
  const votes = (await Promise.all([once(), once()])).filter(Boolean);
  if (!votes.length) return { ok: null };
  const bad = votes.filter((v) => v.bad);
  return { ok: !(bad.length === votes.length), issue: bad[0]?.reason || "" };
}
