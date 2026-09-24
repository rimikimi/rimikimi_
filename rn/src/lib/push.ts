import { Platform } from "react-native";
import { isKo } from "./locale";
import { fetchDrops, type Drop } from "./api";
import { copy } from "./copy";
import { NOTIFY_ON_KEY, getFlag, setFlag } from "./prefs";

// ============================================================================
// 푸시 — 1.x src/push.js + src/notify.js 와 같은 구조:
//   · 생성 완료 → 원격 푸시(FCM). 기기 토큰을 서버에 "등록"하지 않는다 — /api/generate 요청에
//     `pushToken` 으로 실어 보내면 서버가 완료 시 이 기기로 쏜다(등록 API 없음).
//   · 새 컨셉 드롭 → ① 로컬 예약(/api/drops 일정, 현지 20:00) ② FCM 토픽 drop_p540 구독(이중 안전망).
//     토픽 규칙은 서버 api/_lib/dropNotice.js dropTopicFor 와 같다.
//   · 권한은 프로필 "새 컨셉 알림 켜기" 토글에서만 묻는다(SPEC §3). 앱 시작 시엔 이미 허용된
//     경우에만 조용히 설정한다(ask=false).
// 네이티브 모듈은 지연 require — 모듈이 없는 빌드에서 앱이 죽지 않게(Justin push.ts 교훈).
// ============================================================================

type NotificationsModule = typeof import("expo-notifications");
let notifMod: NotificationsModule | null | undefined;
/** pushRouting.tsx 도 같은 지연 로드 모듈을 쓴다(응답 리스너 등록용). */
export function notifications(): NotificationsModule | null {
  if (notifMod !== undefined) return notifMod;
  notifMod = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const core = require("expo-modules-core") as { requireOptionalNativeModule?: (n: string) => unknown };
    if (core.requireOptionalNativeModule?.("ExpoPushTokenManager")) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      notifMod = require("expo-notifications") as NotificationsModule;
    }
  } catch {
    notifMod = null;
  }
  return notifMod;
}

// RN Firebase v26 모듈러 API — 토픽 구독(drop_pXXX)에만 쓴다. 토큰/권한/표시는 expo-notifications.
type MessagingModule = typeof import("@react-native-firebase/messaging");
let fbMod: MessagingModule | null | undefined;
function messaging(): { subscribeToTopic: (t: string) => Promise<void>; unsubscribeFromTopic: (t: string) => Promise<void>; onTokenRefresh: (cb: (t: string) => void) => () => void } | null {
  if (fbMod === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      fbMod = require("@react-native-firebase/messaging") as MessagingModule;
    } catch {
      fbMod = null;
    }
  }
  if (!fbMod) return null;
  try {
    const m = fbMod.getMessaging();
    const mod = fbMod;
    return {
      subscribeToTopic: (t) => mod.subscribeToTopic(m, t),
      unsubscribeFromTopic: (t) => mod.unsubscribeFromTopic(m, t),
      onTokenRefresh: (cb) => mod.onTokenRefresh(m, cb),
    };
  } catch {
    return null;
  }
}

const withTimeout = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("bridge timeout")), ms))]);

let inited = false;
let fcmToken: string | null = null;

/** 이 기기로 완료 알림을 보낼 때 쓰는 토큰 — /api/generate `pushToken`. */
export function getPushToken(): string | null {
  return fcmToken;
}

// 서버 api/_lib/dropNotice.js 의 dropTopicFor 와 규칙이 같아야 한다 (drop_p540 = UTC+9).
// 영어 기기는 "_en" 토픽(영어 문구)을 구독한다 — 서버가 두 토픽에 각 언어로 보낸다.
export function dropTopicFor(ko: boolean = isKo): string {
  const off = -new Date().getTimezoneOffset();
  return `drop_${off < 0 ? "m" : "p"}${Math.abs(off)}${ko ? "" : "_en"}`;
}

export type PermState = "granted" | "denied" | "prompt" | "unknown";

export async function getPermissionState(): Promise<PermState> {
  const N = notifications();
  if (!N) return "unknown";
  try {
    const p = await N.getPermissionsAsync();
    if (p.granted) return "granted";
    return p.canAskAgain ? "prompt" : "denied";
  } catch {
    return "unknown";
  }
}

/**
 * 앱이 떠 있는 동안 알림이 오면 배너로 보여준다 + 활성화 시 알림 센터를 비운다.
 * 알림 탭 → 결과 화면 라우팅은 `pushRouting.tsx` 의 `usePushResultRouting()` 이 맡는다
 * (galleryId 룩업에 useAuth/useGeneration 이 필요해서 훅으로 분리했다).
 */
export function installPushHandlers(): () => void {
  const N = notifications();
  if (!N) return () => undefined;
  N.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
  if (Platform.OS === "android") {
    N.setNotificationChannelAsync("default", { name: copy.ui.notifChannel, importance: N.AndroidImportance.DEFAULT }).catch(() => undefined);
  }
  N.dismissAllNotificationsAsync().catch(() => undefined);
  return () => undefined;
}

/**
 * 원격 푸시 준비(1.x initPush). ask=false 면 이미 허용된 경우에만 조용히 설정한다.
 * 성공하면 true. 실패해도 던지지 않는다 — 알림은 부가 기능이다.
 */
export async function initPush({ ask = false }: { ask?: boolean } = {}): Promise<boolean> {
  if (Platform.OS !== "android" && Platform.OS !== "ios") return false;
  if (inited) return true;
  const N = notifications();
  if (!N) return false;
  try {
    let perm = await withTimeout(N.getPermissionsAsync(), 8000);
    if (!perm.granted) {
      if (!ask || !perm.canAskAgain) return false;
      perm = await withTimeout(N.requestPermissionsAsync(), 60000);
    }
    if (!perm.granted) return false;

    const { data } = await withTimeout(N.getDevicePushTokenAsync(), 10000);
    fcmToken = typeof data === "string" ? data : data ? String(data) : null;

    // 드롭 토픽 구독(시간대별) — 서버 크론이 매일 20:00 현지시각 대상으로 발송. 실패해도 무시.
    const m = messaging();
    if (m && fcmToken) {
      withTimeout(m.subscribeToTopic(dropTopicFor()), 8000).catch(() => undefined);
      // 기기 언어를 바꿨으면 반대 언어 토픽은 끊는다(두 번 받지 않게)
      m.unsubscribeFromTopic(dropTopicFor(!isKo)).catch(() => undefined);
      m.onTokenRefresh((t) => { if (t) fcmToken = t; });
    }
    inited = true;
    return true;
  } catch {
    return false;
  }
}

const DROP_ID_PREFIX = "drop_";
const DROP_ID_MAX = 30;
const DROP_HOUR_LOCAL = 20;

function localDropTime(publishMs: number): number {
  const d = new Date(publishMs);
  d.setHours(DROP_HOUR_LOCAL, 0, 0, 0);
  if (d.getTime() < publishMs) d.setDate(d.getDate() + 1);
  return d.getTime();
}

/** 서버 드롭 일정으로 로컬 알림을 다시 깐다(1.x syncConceptDropNotifications). 예약 수 반환. */
export async function syncDropNotifications(drops: Drop[]): Promise<number> {
  const N = notifications();
  if (!N) return 0;
  const perm = await N.getPermissionsAsync();
  if (!perm.granted) return 0;
  const now = Date.now();
  // 이전 예약 전부 제거 후 다시 깔기
  const scheduled = await N.getAllScheduledNotificationsAsync();
  await Promise.all(scheduled.filter((s) => s.identifier.startsWith(DROP_ID_PREFIX)).map((s) => N.cancelScheduledNotificationAsync(s.identifier)));
  let n = 0;
  for (const [i, d] of drops.slice(0, DROP_ID_MAX).entries()) {
    const at = Date.parse(d?.at);
    if (!Number.isFinite(at)) continue;
    const fireAt = localDropTime(at);
    if (fireAt <= now) continue;
    const titles = (d.titles || []).slice(0, 3).join(", ");
    await N.scheduleNotificationAsync({
      identifier: DROP_ID_PREFIX + i,
      content: { title: copy.notify.dropTitle, body: copy.notify.dropBody(d.count, titles) },
      trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: new Date(fireAt) },
    });
    n++;
  }
  return n;
}

/**
 * 알림 설정 전체(1.x setupNotifications): ① 드롭 로컬 예약 ② 원격 푸시 초기화. 각각 자기 try.
 * ask=true 는 프로필 토글에서만.
 */
export async function setupNotifications(ask = false): Promise<boolean> {
  if (!ask && !(await getFlag(NOTIFY_ON_KEY))) return false;
  let ok = false;
  try {
    ok = await withTimeout(initPush({ ask }), ask ? 90000 : 20000);
  } catch { /* 무시 */ }
  if (ok) {
    await setFlag(NOTIFY_ON_KEY, true);
    try {
      const drops = await withTimeout(fetchDrops(30), 10000);
      await withTimeout(syncDropNotifications(drops), 15000);
    } catch { /* 무시 */ }
  }
  return ok;
}

/** 토글 끄기 — 로컬 예약 제거 + 토픽 해제. OS 권한은 못 끈다(설정 앱). */
export async function disableNotifications(): Promise<void> {
  await setFlag(NOTIFY_ON_KEY, false);
  const N = notifications();
  if (N) {
    try {
      const scheduled = await N.getAllScheduledNotificationsAsync();
      await Promise.all(scheduled.filter((s) => s.identifier.startsWith(DROP_ID_PREFIX)).map((s) => N.cancelScheduledNotificationAsync(s.identifier)));
    } catch { /* 무시 */ }
  }
  const m = messaging();
  if (m) {
    m.unsubscribeFromTopic(dropTopicFor(true)).catch(() => undefined);
    m.unsubscribeFromTopic(dropTopicFor(false)).catch(() => undefined);
  }
  fcmToken = null;
  inited = false;
}
