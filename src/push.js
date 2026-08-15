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

// 서버(api/_lib/dropNotice.js)의 DROP_TOPIC 과 반드시 같아야 한다.
const DROP_TOPIC = "concepts";

let inited = false;

// 원격 푸시 준비. 성공하면 true — 호출부는 이 값을 보고 로컬 예약을
// 건너뛴다(둘 다 켜두면 같은 알림이 두 번 뜬다).
export async function initPush() {
  if (!isNative() || inited) return inited;

  try {
    let perm = await FirebaseMessaging.checkPermissions();
    if (perm.receive !== "granted") {
      perm = await FirebaseMessaging.requestPermissions();
    }
    if (perm.receive !== "granted") return false;

    // iOS 는 APNs 등록이 끝나야 FCM 토큰이 나오고, 토큰이 있어야 토픽 구독이
    // 된다. getToken() 이 그 순서를 보장해 주므로 먼저 부른다.
    await FirebaseMessaging.getToken();
    await FirebaseMessaging.subscribeToTopic({ topic: DROP_TOPIC });

    inited = true;
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
