// 필터 이용권 접근 상태 (2026-10-10 오너 결정 — 계약서: scratchpad filterpass_spec.md)
//   · 처음 3일: 모든 필터 무료(원본이 아닌 필터를 처음 적용한 때부터)
//   · 그 뒤: 원본만 무료, 유료 필터는 미리보기만 — 저장·공유하려면 이용권(평생/연/월) 또는 rimikimi+ 구독
// 앱(WebView): 네이티브가 init payload 로 {filtersUnlocked, trialEndsAt} 를 주고, 구매하면
//   window.__rimikimiFilterAccess({unlocked:true}) 로 알려 준다. 3일 시작은 네이티브가 기록(Keychain/SecureStore).
// 웹 단독(결제 없음): localStorage 로 3일을 재고, 그 뒤엔 "앱에서 이용권" 안내.
import { useEffect, useState } from "react";
import { isRimikimiWebView, nativeFilterUsed } from "./nativeBridge";

const TRIAL_MS = 3 * 24 * 60 * 60 * 1000;
const LS_KEY = "rimikimi_filter_trial_start";

let state = { unlocked: false, trialEndsAt: null, native: false, known: false };
// 서버 스위치 — public/labels.json `filterPass.enabled`(문자열 "true"/"false" — 구버전 iOS 가 labels 를 [String:[String:String]] 으로만
// 읽어서 bool 하나만 섞여도 라벨 전체가 깨진다. 기본 "false" = 개편 기념 무료). 꺼져 있으면 아무것도 잠그지 않는다.
// 앱(WebView)은 네이티브가 이 값을 반영한 filtersUnlocked 를 준다. 웹 단독은 여기서 직접 읽는다.
let passEnabled = false;
if (typeof window !== "undefined" && typeof fetch === "function") {
  fetch("/labels.json", { cache: "no-store" }).then((r) => r.ok ? r.json() : null)
    .then((j) => { passEnabled = (j && j.filterPass && String(j.filterPass.enabled) === "true") || /[?&]filterpass=on\b/.test(location.search); emit(); })
    .catch(() => {});
}
const subs = new Set();
const emit = () => subs.forEach((f) => f(state));

function readLocalTrial() {
  try { const v = Number(localStorage.getItem(LS_KEY)); return v > 0 ? v + TRIAL_MS : null; } catch (_) { return null; }
}

/** 앱이 준 초기 상태(없으면 웹 단독 규칙). ToolEntry 가 init payload 를 받을 때 부른다. */
export function initFilterAccess(init) {
  const native = isRimikimiWebView();
  if (native && init && (typeof init.filtersUnlocked === "boolean" || init.trialEndsAt !== undefined)) {
    const t = init.trialEndsAt ? Date.parse(init.trialEndsAt) : null;
    state = { unlocked: !!init.filtersUnlocked, trialEndsAt: Number.isFinite(t) ? t : null, native: true, known: true };
  } else if (native) {
    // 구버전 앱(이 필드를 모름) — 잠그지 않는다(결제 시트를 못 여는 앱에서 막으면 저장이 그냥 안 된다)
    state = { unlocked: true, trialEndsAt: null, native: true, known: false };
  } else {
    state = { unlocked: false, trialEndsAt: readLocalTrial(), native: false, known: true };
  }
  emit();
}

if (typeof window !== "undefined") {
  window.__rimikimiFilterAccess = (v) => {
    if (!v) return;
    const t = v.trialEndsAt ? Date.parse(v.trialEndsAt) : state.trialEndsAt;
    state = { ...state, unlocked: !!v.unlocked || state.unlocked, trialEndsAt: Number.isFinite(t) ? t : state.trialEndsAt };
    emit();
  };
}

export const isPaidPreset = (key) => !!key && key !== "none";
export function inTrial(s = state) { return !!s.trialEndsAt && Date.now() < s.trialEndsAt; }
export function isLocked(s = state) { if (!s.native && !passEnabled) return false; return !s.unlocked && !inTrial(s); }
export function trialDaysLeft(s = state) {
  if (s.unlocked || !inTrial(s)) return 0;
  return Math.max(1, Math.ceil((s.trialEndsAt - Date.now()) / (24 * 60 * 60 * 1000)));
}
export function getFilterAccess() { return state; }

/** 유료 필터를 적용할 때 — 3일 무료 이용이 아직 안 시작됐으면 시작. */
export function markFilterUsed(key) {
  if (!isPaidPreset(key) || state.unlocked || state.trialEndsAt) return;
  if (!state.native && !passEnabled) return; // 스위치 꺼짐 — 3일도 아직 안 센다
  if (state.native) {
    if (!state.known) return;
    nativeFilterUsed();
    state = { ...state, trialEndsAt: Date.now() + TRIAL_MS }; // 네이티브와 같은 규칙 — 다음 실행부턴 네이티브 값이 온다
  } else {
    try { localStorage.setItem(LS_KEY, String(Date.now())); } catch (_) {}
    state = { ...state, trialEndsAt: Date.now() + TRIAL_MS };
  }
  emit();
}

export function useFilterAccess() {
  const [s, setS] = useState(state);
  useEffect(() => { subs.add(setS); setS(state); return () => subs.delete(setS); }, []);
  return s;
}
