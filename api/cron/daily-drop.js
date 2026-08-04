// ============================================================
// 매일 컨셉 드롭 알림 (Vercel Cron, 11:00 UTC = 20:00 KST)
//
// 컨셉 공개 자체는 이 크론이 하지 않는다 — api/concepts.js 가 publishAt 으로
// 알아서 거른다. 이 크론은 "오늘 공개된 게 있으면 푸시만 쏜다".
// 그래서 이 크론이 실패해도 컨셉은 정상 공개된다 (알림만 안 감).
//
// 발송: FCM v1 → topic "concepts". 토픽이라 기기 토큰을 저장할 필요가 없다.
//       iOS 도 Firebase 에 APNs 키를 올려두면 같은 경로로 나간다.
//
// 필요한 환경변수 (Vercel):
//   CRON_SECRET          - 호출 인증 (이미 있음)
//   FCM_SERVICE_ACCOUNT  - Firebase 서비스 계정 JSON 전체 (문자열)
// ============================================================

import { createSign } from "node:crypto";
import ALL from "../_data/concepts.json" with { type: "json" };

const TOPIC = "concepts";

function b64url(buf) {
  return Buffer.from(buf).toString("base64")
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

// 서비스 계정 → OAuth2 access token (FCM v1 은 OAuth 필요)
async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const sig = b64url(signer.sign(sa.private_key));
  const jwt = `${header}.${claims}.${sig}`;

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error("token 발급 실패: " + JSON.stringify(j).slice(0, 200));
  return j.access_token;
}

// 오늘(UTC 기준 이 크론이 도는 시각까지) 새로 공개된 컨셉
function droppedToday(now) {
  const since = now - 24 * 60 * 60 * 1000;
  return ALL.filter((c) => {
    if (!c?.publishAt) return false;
    const t = Date.parse(c.publishAt);
    return Number.isFinite(t) && t > since && t <= now;
  });
}

export default async function handler(req, res) {
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || (req.headers.authorization || "") !== expected) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const now = Date.now();
  const dropped = droppedToday(now);
  if (!dropped.length) {
    return res.status(200).json({ ok: true, skipped: "오늘 공개된 컨셉 없음" });
  }

  const raw = process.env.FCM_SERVICE_ACCOUNT;
  if (!raw) {
    // 아직 Firebase 설정 전 — 컨셉은 이미 공개됐으므로 실패로 처리하지 않는다.
    return res.status(200).json({
      ok: true, dropped: dropped.map((c) => c.id),
      skipped: "FCM_SERVICE_ACCOUNT 미설정",
    });
  }

  try {
    const sa = JSON.parse(raw);
    const token = await getAccessToken(sa);
    const names = dropped.map((c) => c.title).join(", ");
    const body = dropped.length === 1
      ? `오늘의 새 컨셉 · ${names}`
      : `오늘의 새 컨셉 ${dropped.length}종 · ${names}`;

    const r = await fetch(
      `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            topic: TOPIC,
            notification: { title: "새로운 컨셉이 도착했어요 ✨", body },
            data: { kind: "concept_drop", ids: dropped.map((c) => c.id).join(",") },
            android: { notification: { channel_id: "concept_drop" }, priority: "high" },
            apns: {
              headers: { "apns-priority": "10" },
              payload: { aps: { sound: "default" } },
            },
          },
        }),
      }
    );
    const j = await r.json();
    if (!r.ok) throw new Error(JSON.stringify(j).slice(0, 300));
    return res.status(200).json({ ok: true, sent: j.name, dropped: dropped.map((c) => c.id) });
  } catch (e) {
    console.error("[daily-drop push 실패]", e?.message || e);
    // 푸시 실패가 컨셉 공개에 영향을 주지 않는다는 걸 응답으로도 분명히 한다.
    return res.status(200).json({
      ok: false, pushError: String(e?.message || e).slice(0, 300),
      dropped: dropped.map((c) => c.id), note: "컨셉은 정상 공개됨",
    });
  }
}
