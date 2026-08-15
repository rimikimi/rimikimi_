// ============================================================
// 크레딧팩 "장당 가격"·할인율 계산 — claire/rimikimi/josephine/brooklyn 4앱 공용 로직.
// 동일한 파일을 4개 앱 각각 src/packPricing.js 에 그대로 넣는다 — 앱마다 계산 결과가
// 달라지면 안 되므로, 여길 고치면 4곳 다 같이 고칠 것.
//
// 계산 기준은 항상 표시가(pack.krw = 원화 확정가, pack.usd = 달러 확정가) — 라이브
// 스토어 가격이 아니다. 절대 하드코딩하지 말 것: 팩 배열의 실제 krw/credits 로 매번
// 런타임 계산해야 가격이 바뀌어도 표시가 자동으로 따라간다.
//
// 기준팩(base) = "mini"(정상가 최소 팩). id 컨벤션 "<app>.pack.mini" 로 자동 탐색한다.
// ⚠️ intro 를 기준으로 잡지 말 것 — intro 는 첫 구매 특가라 장당가가 mini 보다 싸서,
// intro 를 기준으로 하면 mini 가 "할인"처럼 보이는 오류가 생긴다(오너 지시, 2026-08-14).
//
// pack 모양: { id, krw:Number, usd:String, credits:Number } (또는 count 필드 사용 앱도 있음)
// ============================================================

// 팩 배열에서 기준팩(mini) 탐색.
export function findBasePack(packs) {
  return packs.find((p) => /\.pack\.mini$/.test(p.id)) || packs[0] || null;
}

function creditsOf(pack) {
  return pack.credits ?? pack.count ?? 1;
}

// 장당 가격(원) — 반올림 정수.
export function perUnitKrw(pack) {
  return Math.round(pack.krw / creditsOf(pack));
}

// 장당 가격(달러) — 숫자 반환(소수점 둘째 자리 표시는 호출부에서 .toFixed(2)).
export function perUnitUsd(pack) {
  return Number(pack.usd) / creditsOf(pack);
}

// 3% 미만 할인은 배지를 안 붙인다. 두 계산 경로(krw 기준·실결제가 기준) 공용.
export function applyDiscountFloor(pct) {
  return Number.isFinite(pct) && pct >= 3 ? pct : null;
}

// 할인율(%) — 기준팩(mini) 대비, 원화 확정가 기준으로 계산(언어/통화와 무관한 고정값).
// 3% 미만이면 배지를 안 붙이므로 null.
export function packDiscountPercent(pack, packs) {
  const base = findBasePack(packs);
  if (!base || pack.id === base.id) return null;
  const basePer = perUnitKrw(base);
  if (!basePer) return null;
  const pct = Math.round(((basePer - perUnitKrw(pack)) / basePer) * 100);
  return applyDiscountFloor(pct);
}
