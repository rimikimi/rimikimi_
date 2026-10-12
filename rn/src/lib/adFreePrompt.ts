// "광고 없이 쓰고 싶다면" 안내 시트 — 무료 사용자가 만들기를 눌러 요청을 보내기 직전에 묻는다(iOS 와 같다).
// 앱 흐름(app21.tsx)이 `await askAdFree()` 로 부르고, 루트의 <AdFreePrompt /> 가 받아 시트를 연다.
// 받는 쪽이 없으면(마운트 전) 묻지 않고 "continue" — 예전 그대로 생성한다.

export type AdFreeChoice = "buy" | "continue";
type Listener = (resolve: (c: AdFreeChoice) => void) => void;
let listener: Listener | null = null;

export function subscribeAdFreePrompt(fn: Listener): () => void {
  listener = fn;
  return () => { if (listener === fn) listener = null; };
}

export function askAdFree(): Promise<AdFreeChoice> {
  return new Promise((resolve) => {
    if (listener) listener(resolve);
    else resolve("continue");
  });
}
