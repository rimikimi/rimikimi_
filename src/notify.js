// ============================================================
// 저장 표시 + 만료 알림(로컬 푸시)
//
//  1) 저장 표시: 사용자가 "저장" 누른 갤러리 항목 id 를 localStorage 에 기록
//     → 다음에 와도 "저장됨" 으로 표시
//  2) 만료 알림: 저장 안 한 항목은 만료 10분 전에 로컬 푸시 알림
//     (네이티브 앱에서만 동작 — @capacitor/local-notifications)
// ============================================================

import { isNative } from "./nativeBridge";

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

async function getPlugin() {
  if (!isNative()) return null;
  try {
    const mod = await import("@capacitor/local-notifications");
    return mod.LocalNotifications;
  } catch {
    return null;
  }
}

export async function ensureNotifyPermission() {
  const LN = await getPlugin();
  if (!LN) return false;
  try {
    let p = await LN.checkPermissions();
    if (p.display !== "granted" && !permAsked) {
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
const DROP_ID_MAX = 30; // 최대 30일치 예약

// 서버가 알려준 드롭 일정으로 로컬 알림을 예약한다.
// 드롭 시각이 고정(매일 20시)이라 원격 푸시 없이도 제때 뜬다.
// 일정이 바뀔 수 있으므로 예약을 매번 통째로 다시 깐다.
export async function syncConceptDropNotifications(drops) {
  const LN = await getPlugin();
  if (!LN) return;
  const ok = await ensureNotifyPermission();
  if (!ok) return;

  const now = Date.now();
  const notifications = [];
  (drops || []).slice(0, DROP_ID_MAX).forEach((d, i) => {
    const at = Date.parse(d?.at);
    if (!Number.isFinite(at) || at <= now) return;
    const titles = (d.titles || []).slice(0, 3).join(", ");
    notifications.push({
      id: DROP_ID_BASE + i,
      title: "새로운 컨셉이 도착했어요 ✨",
      body: titles
        ? `오늘의 새 컨셉 ${d.count}종 · ${titles}`
        : `오늘의 새 컨셉 ${d.count}종이 올라왔어요`,
      schedule: { at: new Date(at), allowWhileIdle: true },
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

export async function scheduleGenDoneNotice(count = 1, conceptTitle = "") {
  const LN = await getPlugin();
  if (!LN) return;
  const ok = await ensureNotifyPermission();
  if (!ok) return;
  // 여러 장은 동시에 만들어서 시간이 크게 늘지는 않지만 여유를 조금 더 준다
  const waitMs = (count > 1 ? 100 : 70) * 1000;
  try {
    await LN.cancel({ notifications: [{ id: GEN_DONE_ID }] });
    await LN.schedule({
      notifications: [{
        id: GEN_DONE_ID,
        title: "사진이 완성됐어요 ✨",
        body: conceptTitle
          ? `'${conceptTitle}' ${count > 1 ? count + "장 " : ""}확인해 보세요`
          : "앱을 열어 확인해 보세요",
        schedule: { at: new Date(Date.now() + waitMs), allowWhileIdle: true },
      }],
    });
  } catch { /* 예약 실패는 생성과 무관 */ }
}

// 앱이 살아있는 채로 결과(성공/실패)를 받았으면 예약된 알림은 필요 없다.
export async function cancelGenDoneNotice() {
  const LN = await getPlugin();
  if (!LN) return;
  try { await LN.cancel({ notifications: [{ id: GEN_DONE_ID }] }); } catch { /* 무시 */ }
}

// 실제로 생성이 끝난 그 순간 알림을 띄운다 (앱이 백그라운드에 있을 때).
// 화면을 보고 있으면 결과가 이미 떠 있으므로 알림은 띄우지 않는다.
export async function notifyGenDoneNow(count = 1, conceptTitle = "") {
  const LN = await getPlugin();
  if (!LN) return;
  // 포그라운드면 알림 대신 화면으로 보여주면 된다
  if (typeof document !== "undefined" && !document.hidden) return;
  const ok = await ensureNotifyPermission();
  if (!ok) return;
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
