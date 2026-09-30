// ============================================================
// Play 상품·가격 반영 — 2026-09-30 가격 개편 (iOS 와 같은 가격표, api/_lib/payments/packages.js 가 원본)
//
//   PLAY_SA_JSON=~/Downloads/rimikimi-e04b6cd78c43.json node scripts/play-products.mjs --list   # 조회만
//   PLAY_SA_JSON=... node scripts/play-products.mjs --dry    # 무엇을 바꿀지 출력만(쓰기 없음)
//   PLAY_SA_JSON=... node scripts/play-products.mjs          # 실제 반영 — auto 모드 분류기가 막으므로 오너가 `!` 로 실행
//
// 하는 일
//  1) 크레딧팩(관리형 상품): 미니·스탠다드·프로 새 가격, 1장·인트로(3장) + 첫 구매 30% 전용 팩(.first 5개) 새로 만들기
//     (옛 rimikimi.pack.intro 6장은 비활성화)
//  2) 구독 기본 요금제: 주 ₩9,900 · 월 ₩29,900 · 연 ₩299,000 (기존 구독자는 옛 가격 유지 — Play 기본 동작)
//  3) 구독 첫 결제 30% 할인 오퍼(first30): 신규 구독자 첫 1기간
// 가격은 KRW·USD 를 직접 넣고 나머지 나라는 Play 자동 환산.
// ============================================================
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { createSign } from "node:crypto";

const PKG = "com.rimikimi.app";
const MODE = process.argv.includes("--list") ? "list" : process.argv.includes("--dry") ? "dry" : "apply";
const keyPath = (process.env.PLAY_SA_JSON || "").replace(/^~/, homedir());
if (!keyPath) { console.error("PLAY_SA_JSON 에 서비스 계정 JSON 경로가 필요합니다."); process.exit(1); }
const sa = JSON.parse(readFileSync(keyPath, "utf8"));
const b64url = (b) => Buffer.from(b).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  const h = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const c = b64url(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/androidpublisher", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const s = createSign("RSA-SHA256"); s.update(`${h}.${c}`);
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${h}.${c}.${b64url(s.sign(sa.private_key))}` }) });
  return (await r.json()).access_token;
}
const TOKEN = await accessToken();
const BASE = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PKG}`;
async function g(method, path, body) {
  const r = await fetch(BASE + path, { method, headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {}
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${t.slice(0, 400)}`);
  return j;
}
const money = (currency, amount) => { const [u, n = "0"] = String(amount).split("."); return { currencyCode: currency, units: u, nanos: Number((n + "000000000").slice(0, 9)) }; };
const micros = (amount) => String(Math.round(Number(amount) * 1e6));

const PACKS = [
  // sku, credits, krw, usd, ko 이름, en 이름
  ["rimikimi.pack.single", 1, 1900, "1.49", "1장", "Single Photo"],
  ["rimikimi.pack.single.first", 1, 1300, "0.99", "1장 · 첫 구매", "Single Photo · First Purchase"],
  ["rimikimi.pack.trial", 3, 3900, "2.99", "인트로 팩", "Intro Pack"],
  ["rimikimi.pack.trial.first", 3, 2700, "1.99", "인트로 팩 · 첫 구매", "Intro Pack · First Purchase"],
  ["rimikimi.pack.mini", 12, 11900, "8.99", "미니 팩", "Mini Pack"],
  ["rimikimi.pack.mini.first", 12, 8300, "5.99", "미니 팩 · 첫 구매", "Mini Pack · First Purchase"],
  ["rimikimi.pack.standard", 24, 22900, "16.99", "스탠다드 팩", "Standard Pack"],
  ["rimikimi.pack.standard.first", 24, 15900, "11.99", "스탠다드 팩 · 첫 구매", "Standard Pack · First Purchase"],
  ["rimikimi.pack.pro", 48, 44900, "32.99", "프로 팩", "Pro Pack"],
  ["rimikimi.pack.pro.first", 48, 31500, "22.99", "프로 팩 · 첫 구매", "Pro Pack · First Purchase"],
];
const SUBS = [
  // productId, 기간(ISO), krw, usd, 첫 결제 krw, 첫 결제 usd
  ["rimikimi.sub.plus.weekly", "P1W", 9900, "6.99", 6900, "4.99"],
  ["rimikimi.sub.plus.monthly", "P1M", 29900, "19.99", 20900, "13.99"],
  ["rimikimi.sub.plus.annual", "P1Y", 299000, "199.99", 209000, "139.99"],
];

const iaps = (await g("GET", "/oneTimeProducts?pageSize=100")).oneTimeProducts || [];
const subs = (await g("GET", "/subscriptions?pageSize=50")).subscriptions || [];
if (MODE === "list") {
  for (const p of iaps) {
    const po = p.purchaseOptions?.[0];
    const kr = po?.regionalPricingAndAvailabilityConfigs?.find((r) => r.regionCode === "KR");
    console.log("IAP", p.productId, po?.purchaseOptionId, po?.state, kr?.price?.units, kr?.availability, (po?.regionalPricingAndAvailabilityConfigs || []).length, "regions");
  }
  if (process.argv.includes("--raw")) console.log(JSON.stringify(iaps.find((p) => p.productId === "rimikimi.pack.mini"), null, 1).slice(0, 2500));
  for (const s of subs) for (const bp of s.basePlans || []) {
    const kr = bp.regionalConfigs?.find((r) => r.regionCode === "KR")?.price;
    console.log("SUB", s.productId, bp.basePlanId, bp.state, kr ? `${kr.units} ${kr.currencyCode}` : "");
  }
  process.exit(0);
}
const say = (m) => console.log((MODE === "dry" ? "[dry] " : "") + m);

// 1) 크레딧팩 — 새 게시 API(oneTimeProducts). 구형 inappproducts 는 403 "migrate to the new publishing API".
//    KRW 가격을 Play 환산(pricing:convertRegionPrices)으로 전 지역에 펴고, 한국·미국은 정한 값으로 덮는다.
const convCache = {};
let REGIONS_VERSION = "2022/02";
async function regionConfigs(krw, usd) {
  if (!convCache[krw]) {
    const r = await g("POST", "/pricing:convertRegionPrices", { price: money("KRW", krw) });
    convCache[krw] = r.convertedRegionPrices || {};
    REGIONS_VERSION = r.regionVersion?.version || REGIONS_VERSION;   // 환산 결과와 같은 지역 버전으로 보내야 한다(불가리아 BGN→EUR 등)
  }
  const out = Object.values(convCache[krw]).map((r) => ({ regionCode: r.regionCode, price: r.price, availability: "AVAILABLE" }));
  for (const c of out) {
    if (c.regionCode === "KR") c.price = money("KRW", krw);
    if (c.regionCode === "US") c.price = money("USD", usd);
  }
  return out;
}
const batchState = (productId, kind) => g("POST", `/oneTimeProducts/${productId}/purchaseOptions:batchUpdateStates`, {
  requests: [{ [kind]: { packageName: PKG, productId, purchaseOptionId: "buy", latencyTolerance: "PRODUCT_UPDATE_LATENCY_TOLERANCE_LATENCY_TOLERANT" } }] });
for (const [sku, n, krw, usd, ko, en] of PACKS) {
  const first = sku.endsWith(".first");
  const exists = iaps.find((p) => p.productId === sku);
  say(`${exists ? "가격 변경" : "새로 만들기"} ${sku} ₩${krw} / $${usd}`);
  if (MODE !== "apply") { if (sku === PACKS[0][0]) say(`  (환산 확인: ${(await regionConfigs(krw, usd)).length}개 지역)`); continue; }
  const body = {
    packageName: PKG, productId: sku,
    listings: [
      { languageCode: "ko-KR", title: `${ko} · ${n}장`, description: `사진 ${n}장 생성 크레딧${first ? " · 첫 구매 전용" : ""}` },
      { languageCode: "en-US", title: `${en} · ${n} photo${n > 1 ? "s" : ""}`, description: `Credits for ${n} generated photo${n > 1 ? "s" : ""}${first ? " · first purchase only" : ""}` },
    ],
    purchaseOptions: [{ purchaseOptionId: exists?.purchaseOptions?.[0]?.purchaseOptionId || "buy", buyOption: { legacyCompatible: true }, regionalPricingAndAvailabilityConfigs: await regionConfigs(krw, usd) }],
  };
  if (exists?.taxAndComplianceSettings) body.taxAndComplianceSettings = exists.taxAndComplianceSettings;
  // 단건 PATCH 경로는 404(HTML) — 새 API 는 batchUpdate 로만 만들고 고친다(9/30 실측).
  await g("POST", `/oneTimeProducts:batchUpdate`, { requests: [{ oneTimeProduct: body, updateMask: "listings,purchaseOptions",
    regionsVersion: { version: REGIONS_VERSION }, allowMissing: true, latencyTolerance: "PRODUCT_UPDATE_LATENCY_TOLERANCE_LATENCY_TOLERANT" }] });
  if (!exists) await batchState(sku, "activatePurchaseOptionRequest");
}
if (iaps.some((p) => p.productId === "rimikimi.pack.intro" && p.purchaseOptions?.[0]?.state === "ACTIVE")) {
  say("판매 중단 rimikimi.pack.intro (옛 6장)");
  if (MODE === "apply") await batchState("rimikimi.pack.intro", "deactivatePurchaseOptionRequest");
}

// 2) 구독 가격 + 3) 첫 결제 오퍼 — 기존 요금제의 다른 나라 가격은 2022/02 통화 그대로라 구독은 2022/02 로 보낸다(한국·미국만 바꿈)
for (const [pid, period, krw, usd, ikrw, iusd] of SUBS) {
  const s = subs.find((x) => x.productId === pid);
  if (!s) { say(`!! 구독 없음 ${pid}`); continue; }
  const bp = s.basePlans?.find((b) => b.state === "ACTIVE") || s.basePlans?.[0];
  say(`구독 ${pid}/${bp.basePlanId} 가격 ₩${krw} / $${usd} (기존 구독자 옛 가격 유지)`);
  if (MODE === "apply") {
    const regionalConfigs = (bp.regionalConfigs || []).map((r) =>
      r.regionCode === "KR" ? { ...r, price: money("KRW", krw) } : r.regionCode === "US" ? { ...r, price: money("USD", usd) } : r);
    const next = { ...s, basePlans: s.basePlans.map((b) => (b.basePlanId === bp.basePlanId ? { ...b, regionalConfigs } : b)) };
    await g("PATCH", `/subscriptions/${pid}?updateMask=basePlans&regionsVersion.version=2022%2F02`, next);
  }
  const offers = ((await g("GET", `/subscriptions/${pid}/basePlans/${bp.basePlanId}/offers`)) || {}).subscriptionOffers || [];
  if (offers.some((o) => o.offerId === "first30")) { say(`  첫 결제 오퍼 first30 이미 있음`); continue; }
  say(`  첫 결제 30% 오퍼 first30: 첫 ${period} ₩${ikrw} / $${iusd} (신규 구독자)`);
  if (MODE === "apply") {
    const offer = {
      packageName: PKG, productId: pid, basePlanId: bp.basePlanId, offerId: "first30",
      phases: [{ recurrenceCount: 1, duration: period,
        regionalConfigs: [{ regionCode: "KR", price: money("KRW", ikrw) }, { regionCode: "US", price: money("USD", iusd) }],
        otherRegionsConfig: { otherRegionsPrice: { usdPrice: money("USD", iusd), eurPrice: money("EUR", iusd) } } }],
      targeting: { acquisitionRule: { scope: { thisSubscription: {} } } },
      regionalConfigs: [{ regionCode: "KR", newSubscriberAvailability: true }, { regionCode: "US", newSubscriberAvailability: true }],
    };
    await g("POST", `/subscriptions/${pid}/basePlans/${bp.basePlanId}/offers?offerId=first30&regionsVersion.version=2022%2F02`, offer);
    await g("POST", `/subscriptions/${pid}/basePlans/${bp.basePlanId}/offers/first30:activate`, {});
  }
}
say("끝");
