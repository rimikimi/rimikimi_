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
