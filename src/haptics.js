// 햅틱 — 손끝 반응.
//
// 왜 필요했나
//   화면 전환·이징을 아무리 다듬어도 누른 순간 손에 아무 반응이 없으면 웹으로 읽힌다.
//   이 앱에는 햅틱이 **하나도 없었다**(@capacitor/haptics 가 의존성에도 없었음).
//   네이티브 앱과 가장 크게 벌어져 있던 지점이 이거였다.
//
// 규칙 (저스틴 프로젝트에서 가져옴)
//   ① **커밋 시점에만** 울린다. 누르는 순간(pressIn)이 아니라 실제로 동작이 실행될 때.
//      누를 때마다 울리면 스크롤하다 스친 것까지 울려서 싸구려로 느껴진다.
//   ② 절대 던지지 않는다. 햅틱 실패가 탭 핸들러를 죽이면 안 된다 — 전부 catch 무시.
//   ③ 웹에서는 no-op. navigator.vibrate 로 흉내내지 않는다 — 데스크톱 브라우저에서
//      의미 없고, 모바일 웹의 진동은 햅틱과 질감이 완전히 달라서 오히려 어색하다.
//   ④ 시스템 "동작 줄이기"를 켠 사용자에게는 울리지 않는다.
//
// 세기 가이드
//   tap()    선택·이동·탭 전환·칩 고르기 — 가장 자주 쓰는 기본값
//   bump()   촬영/생성 시작처럼 "무거운 동작이 시작됐다"
//   done()   생성 완료·저장 완료 같은 성공 통지
//   warn()   한도 초과·실패 통지

import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { isNative } from "./nativeBridge";

function allowed() {
  if (!isNative()) return false;
  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  } catch (_) { /* matchMedia 없는 환경 — 그냥 진행 */ }
  return true;
}

export function tap() {
  if (!allowed()) return;
  Haptics.selectionStart?.().catch(() => {});
  Haptics.selectionChanged?.().catch(() => {});
  Haptics.selectionEnd?.().catch(() => {});
}

export function bump(style = ImpactStyle.Medium) {
  if (!allowed()) return;
  Haptics.impact({ style }).catch(() => {});
}

export function light() {
  bump(ImpactStyle.Light);
}

export function done() {
  if (!allowed()) return;
  Haptics.notification({ type: NotificationType.Success }).catch(() => {});
}

export function warn() {
  if (!allowed()) return;
  Haptics.notification({ type: NotificationType.Warning }).catch(() => {});
}
