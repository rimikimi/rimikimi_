// ============================================================
// 원격 푸시(FCM) — 네이티브 전용
//
// 서버가 언제든 알림을 보낼 수 있게 한다. 기존 로컬 알림(notify.js)은
// "앱이 미리 예약해 둔 것"만 뜨기 때문에, 앱을 오래 안 열면 예약이 비어
// 아무것도 안 왔다. 원격 푸시는 앱이 꺼져 있어도 도착한다.
//
// 대상 지정은 토픽 구독으로 한다 — 기기 토큰을 서버에 올릴 필요가 없어
// 등록용 API 도, 토큰 테이블도 필요 없다.
//
// ⚠️ 플러그인은 정적 import 한다. 네이티브 WKWebView 에서 동적 import() 가
//    영원히 pending 되는 버그를 겪은 적이 있다(nativeBridge.js 참고).
//    이 패키지의 웹 구현은 registerPlugin 안에서 lazy 로 불리므로 웹
//    번들에는 firebase SDK 가 딸려오지 않는다.
// ============================================================

import { FirebaseMessaging } from "@capacitor-firebase/messaging";
import { isNative } from "./nativeBridge";
import { setRemotePushActive } from "./notify";

// 여기서 하는 일은 "생성 완료" 알림뿐이다.
//
// 새 컨셉 드롭 알림은 원격이 아니라 로컬 예약(notify.js)으로 간다. 드롭은
// 받는 사람의 현지 저녁 8시에 떠야 하는데, 서버에서 그러려면 15분마다 크론을
// 돌려야 하고 Vercel Hobby 는 크론이 하루 1회로 제한된다. 로컬 알림은 OS 가
// 기기 현지시각으로 띄워주므로 시간대·서머타임이 공짜로 맞는다.
// (Pro 로 올리면 api/cron/notify-drop 이 그대로 살아 있으니 되돌릴 수 있다)

let inited = false;
let fcmToken = null;

// 네이티브 브리지 호출이 응답 없이 멈추는 것 방지 (nativeBridge.withTimeout 과 같은 패턴).
// 계측(notif_state 전 기기 0건)상 초기화 어딘가가 완주하지 못하고 있었다 — 어떤 호출이든
// 멈추면 조용히 실패로 처리하고 앱은 로컬 알림으로 계속 간다.
const withTimeout = (p, ms) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("bridge timeout")), ms))]);

// 서버 api/_lib/dropNotice.js 의 dropTopicFor 와 규칙이 같아야 한다.
// 기기의 UTC 오프셋(분)을 토픽 이름에 담는다 — drop_p540 = UTC+9(한국).
function dropTopicFor() {
  const off = -new Date().getTimezoneOffset();
  return `drop_${off < 0 ? "m" : "p"}${Math.abs(off)}`;
}

// 이 기기로 직접 알림을 보낼 때 쓰는 토큰. 생성 요청에 같이 실어 보내면
// 서버가 "생성 끝났다"를 이 기기에만 쏜다 — 등록용 API 가 필요 없다.
export function getPushToken() {
  return fcmToken;
}

// 원격 푸시 준비. 성공하면 true — 호출부는 이 값을 보고 로컬 예약을
// 건너뛴다(둘 다 켜두면 같은 알림이 두 번 뜬다).
//
// ask=false 면 이미 허용된 경우에만 조용히 설정하고, 권한 팝업은 띄우지 않는다.
// 앱을 켜자마자 아무 맥락 없이 "알림을 허용하시겠습니까"를 띄우면 대부분 거부를
// 누르고, 한 번 거부하면 iOS 는 다시 물어볼 방법이 없다(설정에서 직접 켜야 함).
// 그래서 사진을 처음 만들어 본 뒤 — 알림이 왜 필요한지 알게 된 시점 — 에만 묻는다.
export async function initPush({ ask = false } = {}) {
  if (!isNative() || inited) return inited;

  try {
    let perm = await withTimeout(FirebaseMessaging.checkPermissions(), 8000);
    if (perm.receive !== "granted") {
      if (!ask) return false;
      perm = await withTimeout(FirebaseMessaging.requestPermissions(), 60000); // 사용자 응답 대기
    }
    if (perm.receive !== "granted") return false;

    // iOS 는 APNs 등록이 끝나야 FCM 토큰이 나온다.
    const { token } = await withTimeout(FirebaseMessaging.getToken(), 10000);
    fcmToken = token || null;

    // 토큰은 앱 재설치·장기 미사용 등으로 갱신된다. 갱신되면 최신 것을 쓴다.
    FirebaseMessaging.addListener("tokenReceived", (e) => {
      if (e?.token) fcmToken = e.token;
    }).catch(() => {});

    // 드롭 원격 푸시용 시간대 토픽 구독 (서버 크론이 매일 20:00 현지시각 대상으로 발송).
    // 로컬 예약이 1차 수단이고 이건 이중 안전망이다 — 실패해도 무시.
    if (fcmToken) {
      withTimeout(FirebaseMessaging.subscribeToTopic({ topic: dropTopicFor() }), 8000).catch(() => {});
    }

    inited = true;
    // 완료 알림은 토큰이 있어야 서버가 이 기기로 쏠 수 있다. 토큰을 못 받았으면
    // 로컬 알림을 그대로 살려둔다 — 안 그러면 둘 다 꺼져 아무것도 안 온다.
    setRemotePushActive(!!fcmToken);
    return true;
  } catch (_) {
    // 푸시가 안 되는 것과 앱 동작은 무관하다. 조용히 실패하고 로컬 알림에 맡긴다.
    return false;
  }
}

// 알림을 눌러서 앱이 열렸을 때. 지금은 별도 화면 이동 없이 앱만 열리면
// 되므로(열면 새 컨셉이 목록 맨 앞에 있다) 배지만 정리한다.
export async function attachPushHandlers() {
  if (!isNative()) return;
  try {
    await FirebaseMessaging.addListener("notificationActionPerformed", () => {
      FirebaseMessaging.removeAllDeliveredNotifications().catch(() => {});
    });
  } catch (_) { /* 무시 */ }
}
