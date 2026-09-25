// ============================================================
// 사전 얼굴 검사 — Gemini 2.5 Flash Lite 로 빠르고 저렴하게 판단
//   사람 / 동물 / 캐릭터 얼굴이 있는지 YES/NO 로 답받음.
//   결과:
//     { hasFace: true  }       — 얼굴 있음 (진행)
//     { hasFace: false }       — 얼굴 없음 (사용자에게 안내, 차감 X)
//     { hasFace: true, error } — 검사 자체가 실패 → "fail open" 으로 진행
// ============================================================

const PRECHECK_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/" +
  "gemini-2.5-flash-lite:generateContent";

const PRECHECK_PROMPT =
  "Look at this image. Does it contain a clearly visible face of at least one of these: " +
  "(a) a real human person, (b) an animal such as a dog, cat, or other recognizable creature, " +
  "or (c) a stylized character such as anime, cartoon, or illustration? " +
  "Answer with ONLY one word: YES or NO. No punctuation, no explanation.";

export async function precheckHasFace(apiKey, mimeType, base64) {
  let res;
  try {
    res = await fetch(PRECHECK_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: PRECHECK_PROMPT },
              { inline_data: { mime_type: mimeType, data: base64 } },
            ],
          },
        ],
        generationConfig: {
          maxOutputTokens: 5,
          temperature: 0,
        },
      }),
    });
  } catch (e) {
    return { hasFace: true, error: "precheck network: " + (e?.message || e) };
  }

  if (!res.ok) {
    return { hasFace: true, error: "precheck http " + res.status };
  }

  let json;
  try {
    json = await res.json();
  } catch {
    return { hasFace: true, error: "precheck parse" };
  }

  const raw = (
    json?.candidates?.[0]?.content?.parts?.[0]?.text || ""
  )
    .trim()
    .toUpperCase();

  if (raw.startsWith("YES")) return { hasFace: true };
  if (raw.startsWith("NO")) return { hasFace: false };

  // 애매한 응답 (드뭄) → 안전하게 통과
  return { hasFace: true, error: "precheck unexpected: " + raw.slice(0, 30) };
}

// ============================================================
// 얼굴 프로필 ↔ 이번 사진 동일인 검사 (2026-09-25 오너 신고)
//   기기에 저장된 얼굴 스캔(faceRefs)이 "내 사진"과 **다른 사람**이면, 서버는 스캔을
//   우선 신원으로 써서 엉뚱한 사람(예전에 스캔한 남자)이 나왔다. 화면엔 여자 사진만 보여
//   사용자는 알 수 없다. → 다르면 스캔을 버리고 이번 사진만 쓴다.
//   결과: "same" | "different" | "unsure"(오류·타임아웃 — 기존대로 스캔 사용)
// ============================================================
const SAME_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent";
const SAME_PROMPT =
  "Image 1 and image 2 each show a person's face. Are they the SAME person? " +
  "Judge only identity (bone structure, facial features, apparent sex and age) — ignore lighting, " +
  "angle, hairstyle changes, makeup, glasses and image quality. " +
  'Reply JSON only: {"same": "yes" | "no" | "unsure"}. Answer "no" only when they are clearly different people.';

export async function samePerson(apiKey, a, b, timeoutMs = 9000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(SAME_ENDPOINT, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts: [
          { text: SAME_PROMPT },
          { inline_data: { mime_type: a.mimeType, data: a.base64 } },
          { inline_data: { mime_type: b.mimeType, data: b.base64 } },
        ] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0, thinkingConfig: { thinkingLevel: "low" } },
      }),
    });
    if (!r.ok) return "unsure";
    const j = await r.json();
    const v = JSON.parse((j?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join(""));
    return v?.same === "no" ? "different" : v?.same === "yes" ? "same" : "unsure";
  } catch (_) {
    return "unsure";
  } finally {
    clearTimeout(t);
  }
}
