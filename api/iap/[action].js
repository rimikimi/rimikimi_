// ============================================================
// /api/iap/:action  — 인앱결제(RevenueCat) 단일 함수
//   - /api/iap/grant   (POST, 로그인): 구매 직후 즉시 적립 (RC v2 재검증)
//   - /api/iap/webhook (POST, RC 호출): 백업 적립 (NON_RENEWING_PURCHASE)
//
// 하나의 서버리스 함수로 합침 (Hobby 플랜 12개 함수 제한 회피).
// 두 경로 모두 같은 iap_events(거래ID UNIQUE) 멱등 테이블을 공유한다. 단, 그것만으로는
// 부족하다 — 두 경로가 서로 다른 거래ID 를 쓰면 UNIQUE 를 빠져나간다. 이중적립 방어는
// iapGrant.js 상단 "2026-09-16 실측 사고" 주석의 3중 방어를 함께 봐야 한다.
// ============================================================

import { getAuthedUser, makeAdmin } from "../_lib/auth.js";
import {
  PRODUCT_CREDITS,
  fetchCustomerPurchases,
  fetchCustomerSubscriptions,
  fetchProductMap,
  purchaseStoreId,
  purchaseTxId,
  purchaseTime,
  grantCreditsForTransaction,
  isSandboxPurchase,
  PRODUCT_META,
} from "../_lib/iapGrant.js";

// 샌드박스 크레딧 팩 적립은 사용자당 24시간에 이 횟수까지만.
const SANDBOX_DAILY_GRANTS = 3;

async function sandboxGrantsToday(admin, userId) {
  const since = new Date(Date.now() - 86400 * 1000).toISOString();
  const { count, error } = await admin
    .from("iap_events")
    .select("transaction_id", { count: "exact", head: true })
    .eq("user_id", userId)
    .like("store", "sandbox:%")
    .gte("created_at", since);
  // 집계 실패 시엔 적립하지 않는다(무한 발급보다 0 이 낫다).
  if (error) {
    console.error("sandbox grant count error", error);
    return Infinity;
  }
  return count || 0;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Methods","GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","authorization,content-type");
  if (req.method === "OPTIONS") return res.status(204).end();
  const action = req.query.action;
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "POST 만 허용됩니다." });
  }
  if (action === "grant") return handleGrant(req, res);
  if (action === "webhook") return handleWebhook(req, res);
  return res.status(404).json({ error: "not found" });
}

// ── 1) 클라이언트 즉시 적립 (RC v2 재검증) ──
async function handleGrant(req, res) {
  const { user, admin, error, status } = await getAuthedUser(req);
  if (error) return res.status(status).json({ error });

  const { productId, transactionId } = req.body || {};
  if (!productId || !(productId in PRODUCT_CREDITS)) {
    return res.status(400).json({ error: "유효하지 않은 상품입니다." });
  }

  let purchases;
  let productMap = null;
  try {
    // 상품 맵: RC 내부 product_id → 스토어 상품ID. 실패해도 치명적이지 않다
    // (구매 객체가 store_identifier 를 직접 주면 맵 없이도 매칭된다).
    productMap = await fetchProductMap().catch((e) => {
      console.error("revenuecat product map error", e);
      return null;
    });
    purchases = await fetchCustomerPurchases(user.id);
    // /purchases 는 비구독만 준다 — 구독이거나 여기서 못 찾으면 /subscriptions 도 본다.
    const isSub = /^rimikimi\.sub\.|^(rimikimi_)?plus_/.test(productId);
    if (isSub || !(purchases || []).some((p) => purchaseStoreId(p, productMap) === productId)) {
      const subs = await fetchCustomerSubscriptions(user.id).catch((e) => {
        console.error("revenuecat subs fetch error", e);
        return [];
      });
      purchases = [...(purchases || []), ...(subs || [])];
    }
  } catch (e) {
    console.error("revenuecat fetch error", e);
    return res.status(502).json({ error: "결제 검증 실패. 잠시 후 다시 시도해 주세요." });
  }

  const mine = (purchases || []).filter((p) => purchaseStoreId(p, productMap) === productId);
  if (!mine.length) {
    return res.status(202).json({ pending: true, error: "구매 확인 중이에요. 잠시만요." });
  }

  let entry = null;
  if (transactionId) {
    entry = mine.find((p) => String(purchaseTxId(p)) === String(transactionId));
  }
  if (!entry) {
    entry = mine.slice().sort((a, b) => purchaseTime(a) - purchaseTime(b)).pop();
  }

  // 샌드박스(테스트) 결제: 구독은 적립하지 않는다 — 2026-09-16 사고는 샌드박스 **구독
  // 가속 갱신**이었다(iapGrant.js isSandboxPurchase 주석). 1회성 크레딧 팩은 갱신이 없으니
  // 적립하되, 샌드박스 애플 ID 로 팩을 무한 구매해 찍어내지 못하게 하루 한도를 건다.
  // (App Review 가 샌드박스로 결제해 보고 크레딧이 0 이면 2.1 반려 위험 — 9/23 오너 결정)
  const sandbox = isSandboxPurchase(entry);
  if (sandbox) {
    const isConsumable = PRODUCT_META[productId]?.kind === "consumable";
    const used = isConsumable ? await sandboxGrantsToday(admin, user.id) : Infinity;
    if (used >= SANDBOX_DAILY_GRANTS) {
      console.warn(
        `[iap] 샌드박스 결제 적립 거부 user=${user.id} product=${productId} ` +
          (isConsumable ? `오늘 ${used}회` : "구독")
      );
      return res.status(200).json({ ok: true, sandbox: true, credits: 0, alreadyGranted: true });
    }
  }

  const txKey = purchaseTxId(entry);
  if (!txKey) {
    // 스토어 거래ID 가 없다(RC 구독 객체 등). 웹훅이 진짜 거래ID 로 적립하도록 넘긴다.
    return res.status(202).json({ pending: true, error: "구매 확인 중이에요. 잠시만요." });
  }

  const result = await grantCreditsForTransaction(admin, {
    userId: user.id,
    productId,
    transactionId: txKey,
    // 샌드박스 적립은 store 를 "sandbox:…" 로 남겨 하루 한도 집계에 쓴다.
    store: sandbox ? `sandbox:${entry?.store || "unknown"}` : entry?.store || null,
  });
  if (result.error) {
    return res.status(result.status || 500).json({ error: result.error });
  }

  return res.status(200).json({
    ok: true,
    credits: result.credits,
    alreadyGranted: !!result.alreadyGranted,
    totalPurchased: result.totalPurchased,
    totalUsed: result.totalUsed,
  });
}

// ── 2) RevenueCat 웹훅 (백업 적립) ──
async function handleWebhook(req, res) {
  const secret = process.env.RC_WEBHOOK_SECRET;
  const auth = req.headers.authorization || req.headers.Authorization || "";
  const got = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
  if (!secret || got !== secret) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const ev = req.body?.event || {};
  const type = ev.type;
  // 소비형(NON_RENEWING) + 구독 최초/갱신(INITIAL/RENEWAL) 모두 크레딧 지급.
  // 구독 갱신은 매 주기 새 store_transaction_id → iap_events UNIQUE 로 주기당 1회만 적립.
  const GRANT_TYPES = ["NON_RENEWING_PURCHASE", "INITIAL_PURCHASE", "RENEWAL"];
  if (!GRANT_TYPES.includes(type)) {
    return res.status(200).json({ ok: true, ignored: type || "unknown" });
  }

  // 샌드박스 이벤트는 적립하지 않는다. RevenueCat 은 샌드박스 갱신도 그대로 쏘는데,
  // 샌드박스는 연간 구독을 하루/한 시간 단위로 가속 갱신한다. 이걸 막지 않으면
  // 샌드박스 애플 ID 하나로 크레딧을 무한정 찍을 수 있다(2026-09-16 실측 3,120장).
  if (String(ev.environment || "").toUpperCase() === "SANDBOX") {
    console.warn(
      `[iap] 샌드박스 웹훅 무시 type=${type} user=${ev.app_user_id} product=${ev.product_id}`
    );
    return res.status(200).json({ ok: true, ignored: "sandbox" });
  }

  const userId = ev.app_user_id;
  const productId = ev.product_id;
  // ⚠️ ev.id(RC 내부 이벤트 id) 폴백 금지 — grant 쪽과 키 네임스페이스가 달라져
  //    같은 구매가 두 번 적립된다. 진짜 거래ID 가 없으면 적립하지 않는다.
  const txId = ev.store_transaction_id || ev.transaction_id || null;

  if (!userId || !productId || !(productId in PRODUCT_CREDITS) || !txId) {
    return res.status(200).json({ ok: true, skipped: true });
  }

  try {
    const admin = makeAdmin();
    const result = await grantCreditsForTransaction(admin, {
      userId,
      productId,
      transactionId: txId,
      store: ev.store || null,
    });
    if (result.error) {
      console.error("webhook grant error", result.error);
      return res.status(500).json({ error: result.error });
    }
    return res.status(200).json({ ok: true, granted: result.credits });
  } catch (e) {
    console.error("webhook handler error", e);
    return res.status(500).json({ error: "internal" });
  }
}
