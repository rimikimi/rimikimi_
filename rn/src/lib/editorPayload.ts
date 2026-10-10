import { getFilterAccess } from "./iap";

// 편집기(웹뷰)에 실어 보낼 초기 데이터 — 라우트 파라미터로 넘기기엔 크다(사진 data URL).
// 화면을 열기 직전에 넣고, 편집기가 열리면서 한 번 꺼내 간다(iOS `WebTool.initialPayload`).
let pending: Record<string, unknown> | null = null;
export function setEditorPayload(p: Record<string, unknown> | null) { pending = p; }
export function takeEditorPayload(): Record<string, unknown> | null { const p = pending; pending = null; return p; }

/**
 * 편집기 `__rimikimiInit` 에 필터 이용권 상태를 얹는다(scratchpad filterpass_spec.md):
 * filtersUnlocked(스위치가 꺼져 있으면 늘 true) · trialEndsAt(ISO | null). WebTool 이 ready 때 부른다 —
 * 화면을 연 뒤에 상태가 바뀔 수 있어 열 때가 아니라 보내는 순간 계산한다.
 */
export function withFilterAccess(p: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const a = getFilterAccess();
  return { ...(p ?? {}), filtersUnlocked: a.unlocked, trialEndsAt: a.trialEndsAt };
}
