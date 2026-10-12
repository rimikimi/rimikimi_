// "광고 없이 만들고 싶다면" 안내 시트 — 무료 사용자가 만들기를 눌러 요청을 보내기 직전에 묻는다(iOS 와 같다).
// 앱 흐름(app21.tsx)이 `await askAdFree()` 로 부르고, 루트의 <AdFreePrompt /> 가 받아 시트를 연다.
//   buy   = "광고 없애기" → 생성 안 하고 충전 시트
//   watch = "광고 보고 만들기" → 호출부가 보상형 광고(showRewardedForCreate)를 띄우고 결과대로 생성
//   cancel = 끌어내림·바깥 누름·뒤로가기 → 생성 안 함(오너 결정 2026-10-12)
// 받는 쪽이 없으면(마운트 전) 묻지 않고 "watch" — 광고 보고 만들기로 진행한다.

export type AdFreeChoice = "buy" | "watch" | "cancel";
/** guest = 로그인 전 첫 1장 — 충전할 수 없으니 "광고 보고 만들기"만 보인다(오너 2026-10-12). */
export type AdFreeMode = "member" | "guest";
type Listener = (resolve: (c: AdFreeChoice) => void, mode: AdFreeMode) => void;
let listener: Listener | null = null;

export function subscribeAdFreePrompt(fn: Listener): () => void {
  listener = fn;
  return () => { if (listener === fn) listener = null; };
}

export function askAdFree(mode: AdFreeMode = "member"): Promise<AdFreeChoice> {
  return new Promise((resolve) => {
    if (listener) listener(resolve, mode);
    else resolve("watch");
  });
}
