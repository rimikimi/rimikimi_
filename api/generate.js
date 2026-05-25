// ============================================================
// 중간 창구 (Vercel 서버리스 함수)
//
// 1. 사용자 토큰 검증 (Supabase)
// 2. 오늘 사용량 조회 → 한도 초과 시 거절
// 3. Gemini 호출
// 4. 성공 시 usage_log 에 한 줄 추가
// 5. 결과 + 갱신된 quota 반환
// ============================================================

import { getAuthedUser, countTodayUsage, FREE_DAILY } from "./_lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST 만 받습니다." });
  }

  // 1) 사용자 인증
  const auth = await getAuthedUser(req);
  if (auth.error) {
    return res.status(auth.status).json({ error: auth.error });
  }
  const { user, admin } = auth;

  // 2) 오늘 사용량
  const usage = await countTodayUsage(admin, user.id);
  if (usage.error) {
    return res.status(500).json({ error: "사용 기록 조회 실패: " + usage.error });
  }
  if (usage.count >= FREE_DAILY) {
    return res.status(429).json({
      error: `오늘의 무료 한도(${FREE_DAILY}장)를 모두 사용했어요. 내일 자정에 다시 사용 가능합니다.`,
      quotaUsed: usage.count,
      quotaLimit: FREE_DAILY,
    });
  }

  // 3) 요청 본문 확인
  const { mimeType, base64, prompt } = req.body || {};
  if (!mimeType || !base64 || !prompt) {
    return res
      .status(400)
      .json({ error: "mimeType, base64, prompt 가 모두 필요합니다." });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res
      .status(500)
      .json({ error: "서버에 GEMINI_API_KEY 가 설정돼 있지 않습니다." });
  }

  // 4) Gemini 호출
  const instruction =
    "Using the person in the provided photo, generate a new portrait. " +
    "Keep the same face, identity, and facial features clearly recognizable. " +
    "Apply the following concept:\n" + prompt;

  const endpoint =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    "gemini-2.5-flash-image:generateContent";

  let upstream;
  try {
    upstream = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: instruction },
              { inline_data: { mime_type: mimeType, data: base64 } },
            ],
          },
        ],
      }),
    });
  } catch (e) {
    return res
      .status(502)
      .json({ error: "Gemini 호출 실패: " + (e?.message || String(e)) });
  }

  if (!upstream.ok) {
    const raw = await upstream.text().catch(() => "");
    return res.status(upstream.status).json({
      error: "Gemini 오류 (" + upstream.status + ")",
      detail: raw.slice(0, 500),
    });
  }

  const json = await upstream.json();
  const parts = json?.candidates?.[0]?.content?.parts || [];
  const imgPart = parts.find((p) => p.inlineData || p.inline_data);

  if (!imgPart) {
    const textPart = parts.find((p) => p.text);
    return res.status(502).json({
      error: textPart?.text
        ? "이미지를 만들지 못했어요: " + textPart.text.slice(0, 120)
        : "이미지 응답을 받지 못했어요.",
    });
  }

  // 5) 성공 → 사용 기록에 한 줄 추가 (실패해도 일단 결과는 돌려줌)
  await admin
    .from("usage_log")
    .insert({ user_id: user.id })
    .then(() => {})
    .catch((e) => console.error("usage_log insert 실패:", e));

  const inline = imgPart.inlineData || imgPart.inline_data;
  return res.status(200).json({
    mimeType: inline.mimeType || inline.mime_type || "image/png",
    base64: inline.data,
    quotaUsed: usage.count + 1,
    quotaLimit: FREE_DAILY,
  });
}
