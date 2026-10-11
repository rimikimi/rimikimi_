import { useSyncExternalStore } from "react";
import { Appearance } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ============================================================================
// 화면 모드 — 시스템 설정 / 라이트 / 다크 (iOS 설정의 같은 행, 오너 지시 2026-10-11).
// 저장은 시작 화면(`ui.startTab`)과 같은 AsyncStorage. 바꾸면 즉시 반영:
//   1) Appearance.setColorScheme — 네이티브(상태바·시스템 대화상자·WebView prefers-color-scheme)
//   2) 리스너 알림 → 루트(_layout.tsx)가 다시 렌더하며 applyScheme(유효 스킴)
// ============================================================================

export type AppearancePref = "system" | "light" | "dark";
export const APPEARANCE_KEY = "appearance.v1";

let pref: AppearancePref = "system";
const listeners = new Set<() => void>();

function applyNative(p: AppearancePref) {
  try { Appearance.setColorScheme(p === "system" ? "unspecified" : p); } catch { /* 무시 */ }
}

function set(p: AppearancePref) {
  if (p === pref) return;
  pref = p;
  // 네이티브를 먼저 바꿔야 루트가 다시 렌더될 때 useColorScheme 이 새 값을 읽는다.
  applyNative(p);
  listeners.forEach((f) => f());
}

/** 앱 시작 시 1회 — 저장된 값을 읽어 적용한다. */
export async function loadAppearancePref(): Promise<void> {
  try {
    const v = await AsyncStorage.getItem(APPEARANCE_KEY);
    if (v === "light" || v === "dark") set(v);
  } catch { /* 무시 — 시스템 설정 유지 */ }
}

export function setAppearancePref(p: AppearancePref): void {
  set(p);
  void AsyncStorage.setItem(APPEARANCE_KEY, p).catch(() => undefined);
}

export function getAppearancePref(): AppearancePref { return pref; }

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function useAppearancePref(): AppearancePref {
  return useSyncExternalStore(subscribe, getAppearancePref, getAppearancePref);
}
