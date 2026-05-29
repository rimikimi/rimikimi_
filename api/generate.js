// ============================================================
// 중간 창구 (Vercel 서버리스 함수)
//
// 1. 사용자 토큰 검증 (Supabase)
// 2. 오늘 사용량 조회 → 한도 초과 시 거절
// 3. Gemini 호출
// 4. 성공 시 usage_log 에 한 줄 추가
// 5. 결과 + 갱신된 quota 반환
// ============================================================

import { getAuthedUser, countTodayUsage, FREE_DAILY, isUnlimited, isTester } from "./_lib/auth.js";
import { precheckHasFace } from "./_lib/precheck.js";
import { getCreditInfo, consumeCredit } from "./_lib/credits.js";

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
  const unlimited = isUnlimited(user);
  const tester = isTester(user);

  // 1.5) 어드민/테스터 아니면 베타 차단
  if (!unlimited && !tester) {
    return res.status(403).json({
      error: "현재 베타 테스터만 이용 가능해요. 곧 정식 오픈됩니다 🙏",
      blocked: true,
    });
  }

  // 2) 오늘 사용량 + 크레딧 (무제한 사용자는 건너뜀)
  //    하루 한도 남으면 그걸 쓰고, 다 썼으면 크레딧으로 대체.
  let usage = { count: 0 };
  let useCredit = false;
  let creditsLeft = 0;
  if (!unlimited) {
    usage = await countTodayUsage(admin, user.id);
    if (usage.error) {
      return res.status(500).json({ error: "사용 기록 조회 실패: " + usage.error });
    }

    if (usage.count >= FREE_DAILY) {
      // 하루 한도 소진 → 크레딧 확인
      const credit = await getCreditInfo(admin, user.id);
      creditsLeft = credit.error ? 0 : credit.creditsAvailable;
      if (creditsLeft > 0) {
        useCredit = true; // 크레딧으로 진행
      } else {
        return res.status(429).json({
          error:
            "오늘의 무료 한도를 모두 사용했어요.\n친구 2명을 초대하면 크레딧 1개가 생겨요!",
          quotaUsed: usage.count,
          quotaLimit: FREE_DAILY,
          credits: 0,
        });
      }
    }
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

  // 3.5) 사전 얼굴 검사 (Flash Lite, ~$0.002, 1~2초)
  //      얼굴 없으면 본 모델 호출 안 함 → 차감 X
  const pre = await precheckHasFace(apiKey, mimeType, base64);
  if (!pre.hasFace) {
    return res.status(422).json({
      error:
        "사진에 얼굴이 인식되지 않아 이미지를 생성할 수 없습니다.\n사진을 다시 선택해 주세요.\n크레딧은 차감되지 않았으니 안심하세요🙂",
      noFace: true,
      quotaUsed: unlimited ? 0 : usage.count, // 차감 안 됨
      quotaLimit: unlimited ? null : FREE_DAILY,
      unlimited,
    });
  }
  // pre.error 있는 경우는 fail-open — 본 모델 호출로 진행

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

  // 5) 이미지가 안 왔으면 (pre-check 통과했는데 본 모델이 거절/실패 — 드뭄)
  //    → 차감 X (우리가 OK 라고 했으니 책임 우리쪽)
  if (!imgPart) {
    const textPart = parts.find((p) => p.text);
    return res.status(502).json({
      error: textPart?.text
        ? "이미지 생성에 실패했어요: " + textPart.text.slice(0, 120)
        : "이미지를 만들지 못했어요. 다른 컨셉으로 시도해 주세요.",
      quotaUsed: unlimited ? 0 : usage.count,
      quotaLimit: unlimited ? null : FREE_DAILY,
      unlimited,
    });
  }

  // 6) 성공 → 사용 기록 (크레딧 사용 시 크레딧 차감, 아니면 오늘 한도 차감)
  if (!unlimited) {
    if (useCredit) {
      await consumeCredit(admin, user.id);
      creditsLeft = Math.max(0, creditsLeft - 1);
    } else {
      await admin
        .from("usage_log")
        .insert({ user_id: user.id })
        .then(() => {})
        .catch((e) => console.error("usage_log insert 실패:", e));
    }
  }

  const inline = imgPart.inlineData || imgPart.inline_data;
  return res.status(200).json({
    mimeType: inline.mimeType || inline.mime_type || "image/png",
    base64: inline.data,
    quotaUsed: unlimited ? 0 : useCredit ? usage.count : usage.count + 1,
    quotaLimit: unlimited ? null : FREE_DAILY,
    usedCredit: useCredit,
    credits: unlimited ? null : creditsLeft,
    unlimited,
  });
}
