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
    "1. A person with an extra or missing arm, leg or hand, or a limb attached in an impossible place.\n" +
    (art
      ? "2. Hands that are clearly broken — e.g. fingers sprouting from the wrist or a hand fused into the body. " +
        "Simplified cartoon / pixel / stitched hands with 3–4 fingers or mitten hands are NORMAL in artwork — do not flag them.\n"
      : "2. A clearly visible hand with 6 or more fingers, fewer than 4 fingers (when not hidden), or fingers " +
        "that are fused, melted or twisted into an impossible shape.\n") +
    "3. A face that is melted, duplicated, has misplaced or extra eyes / mouth, or two heads on one body.\n" +
    "4. The wrong number of people (an extra partial body, a floating extra face, a merged person).\n" +
    (art
      ? "5. This image is meant to be fully in one ARTWORK style (illustration, pixel art, embroidery, painting…). " +
        "Flag it if part of it is still a real PHOTOGRAPH — e.g. a photographic background, a photographic body " +
        "or face next to drawn parts, or artwork pasted over a photo. A photograph OF a physical handmade piece " +
        "(embroidery on fabric, a clay figure, a miniature model, a painting on a table) is the INTENDED look — the " +
        "fabric, table or room around the craft is fine; only flag when the SUBJECT itself is partly a real photo.\n"
      : "") +
    "\nDo NOT flag: stylisation, unusual poses, hands hidden or cropped by the frame, motion blur, " +
    "artistic exaggeration (chibi proportions are fine), makeup, accessories, or anything you are unsure about. " +
    "When in doubt, answer no defect.\n\n" +
    // 실측(9/24): 그냥 물으면 손가락 6개를 놓쳤다 — 손마다 **먼저 세게** 한다.
    (art ? "" : "Before deciding, look at EVERY clearly visible hand and count its fingers one by one, including the thumb.\n\n") +
    'Reply with JSON only: {"hands": [{"where": "short location", "fingers": number, "fully_visible": true|false}], ' +
    '"defect": true|false, "issue": "short reason or empty"}. A fully visible hand whose finger count is not 5 is a defect.'
  );
}

/**
 * @returns {Promise<{ok: boolean|null, issue?: string}>} ok=false 만 "다시 뽑아라".
 */
export async function inspectImage({ base64, mimeType, apiKey, people = 1, panels = 1, art = false, timeoutMs = 20000 }) {
  if (!base64 || !apiKey) return { ok: null };
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
            { inline_data: { mime_type: mimeType || "image/png", data: base64 } },
          ] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0 },
        }),
      }
    );
    if (!r.ok) return { ok: null };
    const j = await r.json();
    const text = (j?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
    const v = JSON.parse(text);
    if (typeof v?.defect !== "boolean") return { ok: null };
    // 모델이 센 숫자와 결론이 어긋나면 숫자를 믿는다(다 보이는 손인데 5개가 아님 = 불량).
    // 그림체(art)는 손을 단순화해 그리는 게 정상이라 숫자 규칙을 쓰지 않는다(픽셀·자수 4손가락 오탐 실측).
    const badHand = !art && Array.isArray(v.hands) && v.hands.find((h) => h && h.fully_visible === true && Number.isFinite(h.fingers) && h.fingers !== 5);
    if (badHand && !v.defect) return { ok: false, issue: `손가락 ${badHand.fingers}개 (${badHand.where || "손"})` };
    return { ok: !v.defect, issue: String(v.issue || "").slice(0, 200) };
  } catch (_) {
    return { ok: null };
  } finally {
    clearTimeout(t);
  }
}
