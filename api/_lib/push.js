// ============================================================
// 원격 푸시 발송 (Firebase Cloud Messaging HTTP v1)
//
// 왜 원격 푸시인가:
//   기존 드롭 알림은 앱이 /api/drops 를 받아 로컬 알림을 "미리 예약"하는
//   방식이었다. 앱을 한동안 안 열면 예약이 갱신되지 않고, iOS 는 대기 중인
//   로컬 알림을 64개로 제한한다. 실제로 CORS 사고 때 예약이 통째로 비어
//   알림이 한 번도 안 떴다. 서버가 직접 쏘면 앱 상태와 무관하게 도착한다.
//
// 대상 지정은 토픽(topic) 을 쓴다. 기기 토큰을 DB 에 모으지 않아도 되고
// (테이블·정리 로직 불필요), 발송이 요청 1번으로 끝난다. 구독은 앱이
// 시작할 때 스스로 한다(src/push.js).
//
// 필요한 환경변수: FCM_SA_JSON — Firebase 프로젝트 설정 > 서비스 계정에서
//   받은 JSON 전체. (Vertex 용 VERTEX_SA_JSON 과는 다른 프로젝트라 별개다)
// ============================================================

let tokenCache = { token: null, exp: 0 };

function b64url(buf) {
  return Buffer.from(buf).toString("base64")
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export function fcmSA() {
  const raw = process.env.FCM_SA_JSON;
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (_) { return null; }
}

// 서비스 계정 → OAuth 액세스 토큰 (1시간). 람다가 살아있는 동안 재사용.
async function getAccessToken(sa) {
  if (tokenCache.token && Date.now() < tokenCache.exp) return tokenCache.token;

  const { createSign } = await import("node:crypto");
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now, exp: now + 3600,
  }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const jwt = `${header}.${claims}.${b64url(signer.sign(sa.private_key))}`;

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error("FCM token 실패: " + JSON.stringify(j).slice(0, 150));
  // 실제 만료보다 5분 일찍 버린다 (경계에서 만료된 토큰 사용 방지)
  tokenCache = { token: j.access_token, exp: Date.now() + 55 * 60 * 1000 };
  return j.access_token;
}

// 토픽 전체에 알림 1건 발송.
//   topic  : "concepts" 같은 문자열 (앱이 구독한 이름과 같아야 한다)
//   data   : 알림을 눌렀을 때 앱이 읽을 부가 정보 (전부 문자열이어야 함)
export async function sendToTopic(topic, { title, body, data = {} } = {}) {
  const sa = fcmSA();
  if (!sa) return { ok: false, error: "FCM_SA_JSON 미설정" };

  let accessToken;
  try {
    accessToken = await getAccessToken(sa);
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }

  const payload = {
    message: {
      topic,
      notification: { title, body },
      // 값은 반드시 문자열 — 숫자를 넣으면 FCM 이 400 을 준다
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
      android: {
        priority: "high",
        notification: { sound: "default", default_vibrate_timings: true },
      },
      apns: {
        headers: { "apns-priority": "10" },
        payload: { aps: { sound: "default", badge: 1 } },
      },
    },
  };

  try {
    const r = await fetch(
      `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );
    const text = await r.text();
    if (!r.ok) return { ok: false, status: r.status, error: text.slice(0, 300) };
    return { ok: true, name: (() => { try { return JSON.parse(text).name; } catch { return null; } })() };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}
