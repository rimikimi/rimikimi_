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
