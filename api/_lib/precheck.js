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
