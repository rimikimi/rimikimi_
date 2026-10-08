// ============================================================
// 게스트 첫 1장 — 로그인 없이 기기당 1회(2026-10-09 C안, 오너 결정 "1. 이대로 ㄱㄱ").
//   · 기기: 앱이 키체인 UUID 를 보낸다(지웠다 깔아도 같은 값). 서버는 HMAC 해시만 저장한다.
//   · IP: 하루 GUEST_IP_DAILY 회까지(웹·탈옥 등 기기 ID 를 바꾸는 우회를 막는 둘째 방어선). 원본 IP 저장 안 함.
//   · 해시 키는 서비스 롤 키로 만든다 — 새 비밀값 없이, 서버 밖에서는 같은 해시를 만들 수 없다.
//   · 생성이 실패하면 release() 로 그 1회를 되돌린다.
// 브루클린 guest.js 의 dh 설계를 따랐다(토큰·계정 없이, DB 행 하나로 판정).
// ============================================================
import crypto from "node:crypto";

const DEVICE_ID_RE = /^[0-9A-Za-z-]{8,64}$/;
const PLATFORMS = new Set(["ios", "android", "web"]);
const GUEST_IP_DAILY = 3;

function key() {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return k.length >= 32 ? k : null;
}
const hmac = (s) => crypto.createHmac("sha256", key()).update(s).digest("hex");

function clientIp(req) {
  const xf = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return xf || String(req.headers["x-real-ip"] || "") || "";
}

/**
 * @returns {Promise<{ok:true, dh:string, release:()=>Promise<void>} | {ok:false, status:number, body:object}>}
 */
export async function claimGuest(req, admin, guest) {
  if (!key()) return { ok: false, status: 500, body: { error: "서버 설정이 필요해요." } };
  const plat = guest?.platform, id = guest?.deviceId;
  if (!PLATFORMS.has(plat) || typeof id !== "string" || !DEVICE_ID_RE.test(id)) {
    return { ok: false, status: 401, body: { error: "로그인이 필요해요." } };
  }
  const dh = hmac(`guest:${plat}:${id}`);
  const ip = clientIp(req);
  const ipHash = ip ? hmac(`ip:${ip}`) : null;
  if (ipHash) {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count } = await admin.from("guest_devices").select("dh", { count: "exact", head: true })
      .eq("ip_hash", ipHash).gte("created_at", since);
    if ((count || 0) >= GUEST_IP_DAILY) {
      return { ok: false, status: 403, body: { error: "로그인하고 만들어 주세요.", guestUsed: true } };
    }
  }
  // 기본키 충돌 = 이 기기는 이미 첫 1장을 썼다.
  const ins = await admin.from("guest_devices").insert({ dh, ip_hash: ipHash });
  if (ins.error) {
    const dup = ins.error.code === "23505" || /duplicate/i.test(ins.error.message || "");
    return dup
      ? { ok: false, status: 403, body: { error: "첫 1장은 이미 만들었어요. 로그인하면 이어서 만들 수 있어요.", guestUsed: true } }
      : { ok: false, status: 500, body: { error: "잠시 후 다시 시도해 주세요." } };
  }
  return {
    ok: true, dh,
    release: async () => { await admin.from("guest_devices").delete().eq("dh", dh).then(() => {}, () => {}); },
  };
}
