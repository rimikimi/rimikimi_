// ============================================================
// 결제 어댑터 레지스트리
// 새 PG사 추가 시: ① 어댑터 파일 만들고 ② 여기 한 줄만 등록.
// ============================================================

import * as paypal from "./paypal.js";
import * as inicis from "./inicis.js";

const ADAPTERS = {
  paypal,
  inicis,
};

export const SUPPORTED_PROVIDERS = ["paypal", "inicis"];

export function getAdapter(provider) {
  const a = ADAPTERS[provider];
  if (!a) throw new Error(`알 수 없는 결제수단: ${provider}`);
  return a;
}
