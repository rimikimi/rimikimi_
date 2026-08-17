// ============================================================
// 저장 표시 + 만료 알림(로컬 푸시)
//
//  1) 저장 표시: 사용자가 "저장" 누른 갤러리 항목 id 를 localStorage 에 기록
//     → 다음에 와도 "저장됨" 으로 표시
//  2) 만료 알림: 저장 안 한 항목은 만료 10분 전에 로컬 푸시 알림
//     (네이티브 앱에서만 동작 — @capacitor/local-notifications)
// ============================================================

import { isNative } from "./nativeBridge";
// ⚠️ 정적 import 필수 (nativeBridge/ads/iap 와 같은 이유) — 네이티브 WKWebView 에서
//    동적 import() 가 영원히 pending 되는 버그가 있다. 여기만 동적으로 남아 있었고,
//    실제로 생성 성공 직후 await cancelGenDoneNotice() 가 반환되지 않아 finally 의
//    setGenerating(false) 까지 못 가서 로딩 화면에 갇히는 사고가 났다(2026-08-17).
//    registerPlugin 은 동기이고 웹에선 호출할 때까지 아무 일도 안 하므로 안전하다.
import { LocalNotifications } from "@capacitor/local-notifications";

const SAVED_KEY = "rimikimi_saved_gallery";
const LEAD_MS = 10 * 60 * 1000; // 만료 10분 전

/* ---------- 저장 표시 (localStorage) ---------- */

export function getSavedSet() {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

export function markSaved(id) {
  const s = getSavedSet();
  s.add(id);
  // 무한정 쌓이지 않게 최근 300개만 유지
  const arr = [...s].slice(-300);
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(arr));
  } catch {
    /* 저장 실패는 무시 */
  }
  return new Set(arr);
}

/* ---------- 로컬 푸시 알림 ---------- */

let permAsked = false;

function getPlugin() {
  return isNative() ? LocalNotifications : null;
}

// ask=false 면 이미 허용된 경우에만 true 를 주고 팝업은 띄우지 않는다.
// (앱 첫 화면에서 맥락 없이 묻지 않기 위해 — push.js 의 같은 이유)
export async function ensureNotifyPermission(ask = true) {
  const LN = await getPlugin();
  if (!LN) return false;
  try {
    let p = await LN.checkPermissions();
    if (p.display !== "granted") {
      if (!ask || permAsked) return false;
      permAsked = true;
      p = await LN.requestPermissions();
    }
    return p.display === "granted";
  } catch {
    return false;
  }
}

// 갤러리 항목 목록을 받아 → 저장 안 한 것만 만료 10분 전 알림 예약,
// 저장했거나 이미 10분 이내로 남은 것은 예약 취소.
export async function syncExpiryNotifications(items, savedSet) {
  const LN = await getPlugin();
  if (!LN) return;
  const ok = await ensureNotifyPermission();
  if (!ok) return;

  const now = Date.now();
  const toSchedule = [];
  const toCancel = [];

  for (const it of items || []) {
    const idNum = Number(it.id);
    if (!Number.isInteger(idNum) || idNum <= 0) continue;
    const fireAt = new Date(it.expiresAt).getTime() - LEAD_MS;
    // 이미 저장했거나 / 알림 시점이 지났으면 예약하지 않음
    if (savedSet.has(it.id) || !(fireAt > now)) {
      toCancel.push({ id: idNum });
      continue;
    }
    toSchedule.push({
      id: idNum,
      title: "리미키미",
      body: `'${it.conceptTitle || "사진"}' 이미지가 10분 뒤 사라져요. 저장 안 하면 없어집니다!`,
      schedule: { at: new Date(fireAt), allowWhileIdle: true },
    });
  }

  try {
    if (toCancel.length) await LN.cancel({ notifications: toCancel });
    if (toSchedule.length) await LN.schedule({ notifications: toSchedule });
  } catch {
    /* 예약 실패는 조용히 무시 */
  }
}

/* ---------- 새 컨셉 드롭 알림 ---------- */

// 갤러리 만료 알림은 갤러리 row id(작은 정수)를 그대로 쓰므로,
// 드롭 알림은 절대 겹치지 않는 높은 번호대를 따로 쓴다.
const DROP_ID_BASE = 900001;
const DROP_ID_MAX = 30; // 최대 30일치 예약 (iOS 대기 알림 64개 한도 안쪽)
const DROP_HOUR_LOCAL = 20; // 현지 저녁 8시

// 드롭은 매일 11:00 UTC 에 열린다. 그 시각에 알리면 한국은 20시지만 LA 는
// 새벽 4시다. 그래서 "공개된 뒤 처음 오는 현지 저녁 8시"에 띄운다.
// setHours 는 기기 현지시각 기준이라 시간대·서머타임을 OS 가 알아서 처리한다.
function localDropTime(publishMs) {
  const d = new Date(publishMs);
  d.setHours(DROP_HOUR_LOCAL, 0, 0, 0);
  if (d.getTime() < publishMs) d.setDate(d.getDate() + 1);
  return d.getTime();
}

// 서버가 알려준 드롭 일정으로 로컬 알림을 예약한다.
// 드롭 시각이 고정(매일 20시)이라 원격 푸시 없이도 제때 뜬다.
// 일정이 바뀔 수 있으므로 예약을 매번 통째로 다시 깐다.
export async function syncConceptDropNotifications(drops, { ask = true } = {}) {
  const LN = await getPlugin();
  if (!LN) return;
  const ok = await ensureNotifyPermission(ask);
  if (!ok) return;

  const now = Date.now();
  const notifications = [];
  (drops || []).slice(0, DROP_ID_MAX).forEach((d, i) => {
    const at = Date.parse(d?.at);
    if (!Number.isFinite(at)) return;
    const fireAt = localDropTime(at);
    if (fireAt <= now) return;
    const titles = (d.titles || []).slice(0, 3).join(", ");
    notifications.push({
      id: DROP_ID_BASE + i,
      title: "새로운 컨셉이 도착했어요 ✨",
      body: titles
        ? `오늘의 새 컨셉 ${d.count}종 · ${titles}`
        : `오늘의 새 컨셉 ${d.count}종이 올라왔어요`,
      schedule: { at: new Date(fireAt), allowWhileIdle: true },
    });
  });

  try {
    // 이전 예약 전부 제거 후 다시 깔기 (일정 변경·이미 지난 건 정리)
    await LN.cancel({
      notifications: Array.from({ length: DROP_ID_MAX }, (_, i) => ({ id: DROP_ID_BASE + i })),
    });
    if (notifications.length) await LN.schedule({ notifications });
  } catch {
    /* 예약 실패는 조용히 무시 — 컨셉 공개 자체와는 무관 */
  }
}

/* ---------- 생성 완료 알림 ---------- */

// 생성은 서버(Vercel 함수)에서 끝까지 돌기 때문에 앱을 닫아도 결과는 갤러리에 남는다.
// 문제는 "다 됐다"고 알려줄 방법인데, 원격 푸시가 없으므로 생성을 시작할 때
// 예상 완료 시각에 로컬 알림을 걸어두고, 앱이 살아서 결과를 받으면 취소한다.
//   · 앱을 닫았다 → 알림이 뜬다 → 열면 갤러리에서 결과를 찾아 보여준다
//   · 앱을 켜두고 있었다 → 결과가 화면에 바로 뜨고 알림은 취소된다
const GEN_DONE_ID = 910001;

// 원격 푸시(FCM)가 살아 있으면 서버가 실제 완료 시점에 직접 쏘므로 로컬 쪽은
// 통째로 끈다. 둘 다 켜두면 같은 내용이 두 번 뜨고, 로컬은 "예상 시각" 이라
// 실제 완료보다 이르거나 늦다. push.js 가 초기화에 성공하면 켜준다.
let remotePushOn = false;
export function setRemotePushActive(on) { remotePushOn = !!on; }

// ❌ scheduleGenDoneNotice(예상 완료 시각에 미리 예약) 는 제거했다.
//
// "70초 뒤에 완성됐다고 알린다"는 타이머였고, 생성이 실제로 끝났는지 성공했는지
// 전혀 모른 채 떴다. maxDuration 을 60s→300s 로 올린 뒤로는 생성이 70초를 넘는
// 일이 흔해져서, 아직 만드는 중인데 "완성됐어요"가 뜨고 실패해도 그대로 떴다.
// (사용자 신고 2026-08-17: "이미지 생성이 안 됐는데 왜 푸시알림이 옴?")
//
// 완료 통지는 실제 완료를 아는 쪽만 한다:
//   · 앱이 살아 있음 → notifyGenDoneNow (결과를 받은 그 순간)
//   · 앱이 완전히 종료 → 서버 원격 푸시 (api/generate.js notifyDone)
// 원격 푸시를 못 쓰는 기기는 완료 알림이 없다 — 거짓 알림보다 낫다.

// 예약을 쓰던 구버전에서 올라온 경우 남아 있는 알림을 지우는 용도로 남긴다.
export async function cancelGenDoneNotice() {
  const LN = await getPlugin();
  if (!LN) return;
  try { await LN.cancel({ notifications: [{ id: GEN_DONE_ID }] }); } catch { /* 무시 */ }
}

// 실제로 생성이 끝난 그 순간 알림을 띄운다 (앱이 백그라운드에 있을 때).
// 화면을 보고 있으면 결과가 이미 떠 있으므로 알림은 띄우지 않는다.
export async function notifyGenDoneNow(count = 1, conceptTitle = "") {
  if (remotePushOn) return;
  const LN = await getPlugin();
  if (!LN) return;
  // 포그라운드면 알림 대신 화면으로 보여주면 된다
  if (typeof document !== "undefined" && !document.hidden) return;
  const ok = await ensureNotifyPermission();
  if (!ok) return;
  // 구버전에서 남은 예약분이 있으면 먼저 지운다. 호출부가 순서를 지키느라
  // await 를 걸었다가 UI 가 멈춘 적이 있어서, 순서를 여기 안으로 넣었다.
  await cancelGenDoneNotice();
  try {
    await LN.schedule({
      notifications: [{
        id: GEN_DONE_ID,
        title: "사진이 완성됐어요 ✨",
        body: conceptTitle
          ? `'${conceptTitle}' ${count > 1 ? count + "장 " : ""}확인해 보세요`
          : "앱을 열어 확인해 보세요",
        // at 을 주지 않으면 즉시 표시된다
      }],
    });
  } catch { /* 무시 */ }
}

export async function cancelExpiryNotice(id) {
  const LN = await getPlugin();
  if (!LN) return;
  const idNum = Number(id);
  if (!Number.isInteger(idNum)) return;
  try {
    await LN.cancel({ notifications: [{ id: idNum }] });
  } catch {
    /* 무시 */
  }
}
