// 평생 이용권(rimikimi.filter.lifetime) 기본가 변경. 사용: node play-lifetime-price.mjs 4900 [--dry]   (11/14 원복: node play-lifetime-price.mjs 9900)
import { g, money, PKG } from "./play-lib.mjs";
const krw = Number(process.argv[2]); const dry = process.argv.includes("--dry");
if (!krw) { console.error("KRW 금액 필요"); process.exit(1); }
const ID = "rimikimi.filter.lifetime";
const p = await g("GET", `/oneTimeProducts/${ID}`);
const prev = p.purchaseOptions.find((o) => o.purchaseOptionId === "buy");
const conv = await g("POST", "/pricing:convertRegionPrices", { price: money("KRW", krw) });
const regional = Object.values(conv.convertedRegionPrices).map((r) => ({ regionCode: r.regionCode, price: r.regionCode === "KR" ? money("KRW", krw) : r.price, availability: "AVAILABLE" }));
const prevCodes = new Set(prev.regionalPricingAndAvailabilityConfigs.map((r) => r.regionCode));
const newCodes = new Set(regional.map((r) => r.regionCode));
console.log("regions prev", prevCodes.size, "new", newCodes.size, "missing", [...prevCodes].filter((c) => !newCodes.has(c)), "added", [...newCodes].filter((c) => !prevCodes.has(c)), "version", conv.regionVersion?.version);
const us = regional.find((r) => r.regionCode === "US").price; console.log("US", us.units, us.nanos, "other", JSON.stringify(conv.convertedOtherRegionsPrice));
const po = { ...prev, regionalPricingAndAvailabilityConfigs: regional,
  newRegionsConfig: { ...prev.newRegionsConfig, usdPrice: conv.convertedOtherRegionsPrice.usdPrice, eurPrice: conv.convertedOtherRegionsPrice.eurPrice } };
delete po.state;
if (dry) process.exit(0);
await g("POST", "/oneTimeProducts:batchUpdate", { requests: [{ oneTimeProduct: { packageName: PKG, productId: ID, purchaseOptions: [po] }, updateMask: "purchaseOptions",
  regionsVersion: { version: conv.regionVersion?.version }, allowMissing: false, latencyTolerance: "PRODUCT_UPDATE_LATENCY_TOLERANCE_LATENCY_TOLERANT" }] });
const after = (await g("GET", `/oneTimeProducts/${ID}`)).purchaseOptions.find((o) => o.purchaseOptionId === "buy");
const kr = after.regionalPricingAndAvailabilityConfigs.find((r) => r.regionCode === "KR"), u = after.regionalPricingAndAvailabilityConfigs.find((r) => r.regionCode === "US");
console.log("AFTER", after.state, "KR", kr.price.units, kr.price.currencyCode, "US", u.price.units, u.price.nanos, after.regionalPricingAndAvailabilityConfigs.length, "regions", JSON.stringify(after.newRegionsConfig));
