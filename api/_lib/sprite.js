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
  "Reply in plain English, max 90 words, as one paragraph with exactly these parts: " +
  "subject type (person / animal / object); for a person: apparent gender presentation, hair length and style, " +
  "hair colour as a hex code; every visible clothing item top to bottom with its colour as a hex code and notable " +
  "details (knit texture, buttons, belt); shoes with colour hex; bag or accessories with colour hex; pose " +
  "(standing / walking / sitting, what the hands do) and which way the body faces (toward the viewer, three-quarter " +
  "left, three-quarter right). For an animal or object: its kind, colours as hex codes and pose. " +
  "No background, no names, no guesses about identity.";

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
    return text.length > 20 ? text.slice(0, 1200) : null;
  } catch (_) {
    return null;
  } finally {
    clearTimeout(t);
  }
}
