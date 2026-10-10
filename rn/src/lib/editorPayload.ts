// 편집기(웹뷰)에 실어 보낼 초기 데이터 — 라우트 파라미터로 넘기기엔 크다(사진 data URL).
// 화면을 열기 직전에 넣고, 편집기가 열리면서 한 번 꺼내 간다(iOS `WebTool.initialPayload`).
let pending: Record<string, unknown> | null = null;
export function setEditorPayload(p: Record<string, unknown> | null) { pending = p; }
export function takeEditorPayload(): Record<string, unknown> | null { const p = pending; pending = null; return p; }
