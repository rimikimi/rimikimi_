// ============================================================
// 중간 창구 (Vercel 서버리스 함수)
//
// 1. 사용자 토큰 검증 (Supabase)
// 2. 오늘 사용량 조회 → 한도 초과 시 거절
// 3. Gemini 호출
// 4. 성공 시 usage_log 에 한 줄 추가
// 5. 결과 + 갱신된 quota 반환
// ============================================================

import { getAuthedUser, countTodayUsage, FREE_DAILY, dailyLimitFor, isUnlimited, isTester } from "./_lib/auth.js";
import { precheckHasFace } from "./_lib/precheck.js";
import { getCreditInfo, consumeCredit, consumeCredits, refundCredits, getProSampleUsed, markProSampleUsed } from "./_lib/credits.js";
import { saveToGallery } from "./_lib/gallery.js";

// Vertex 의 나노바나나 프로는 2K 요청이 ~42s 걸리고, 묶음 생성(3/6/12장)은 그보다
// 훨씬 오래 걸린다. 팀 플랜이 Pro 라 300s 까지 쓸 수 있다(picbox·claire 와 동일).
// 60s 로 묶어두는 바람에 그동안 Vertex 를 쥐어짜고 있었다.
export const config = { maxDuration: 300 };

// 묶음 생성 요금표 — 많이 만들수록 장당 단가가 싸진다 (picbox·claire 와 동일).
// 1장=1, 3장=3, 6장=5(1장 이득), 12장=9(3장 이득)
export const BATCH_COST = { 1: 1, 3: 3, 6: 5, 12: 9 };

// Gemini 원본 이미지는 클 수 있음(>4.5MB → Vercel 응답 한도 초과로 본문 잘림 = 클라 "오류 200").
// 응답 전에 최대 1024×1365, JPEG q82 로 줄여서 항상 작고 빠르게.
// sharp 동적 로드 + try/catch → 로드/처리 실패해도 원본 그대로 반환(생성 자체는 안 깨짐).
async function shrinkOutput(base64, mime) {
  try {
    const sharp = (await import("sharp")).default;
    const buf = Buffer.from(base64, "base64");
    const out = await sharp(buf)
      .rotate()
      .resize(1024, 1365, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
    return { base64: out.toString("base64"), mime: "image/jpeg" };
  } catch (e) {
    console.error("[shrinkOutput failed, using original]", e?.message || e);
    return { base64, mime };
  }
}

// ── 워터마크 ────────────────────────────────────────────────────────────────
// 결제(크레딧)로 만든 이미지에만 워터마크가 없다. 무료 하루 1장도, 무제한 계정도
// 크레딧을 쓰지 않으므로 붙는다.
//
// ⚠️ 반드시 **원본(raw)** 에 찍는다. 화면용 축소본에만 찍으면 "내 사진"에서 원본을
//    내려받아 그냥 우회된다(갤러리는 서명 URL 직접 다운로드다).
// ⚠️ 실패해도 원본을 그대로 돌려준다 — 워터마크 실패가 생성 자체를 깨뜨리면 안 된다.
let WORDMARK_SVG = null;
async function applyWatermark(base64, mime) {
  try {
    const sharp = (await import("sharp")).default;
    if (WORDMARK_SVG === null) {
      const { readFileSync } = await import("node:fs");
      const { fileURLToPath } = await import("node:url");
      const path = fileURLToPath(new URL("./_lib/wordmark.svg", import.meta.url));
      WORDMARK_SVG = readFileSync(path, "utf8");
    }
    const img = sharp(Buffer.from(base64, "base64")).rotate();
    const meta = await img.metadata();
    const W = meta.width, H = meta.height;
    if (!W || !H) return { base64, mime };

    // 가로폭의 18% — 작은 썸네일에서도 읽히고 큰 원본에서 과하지 않은 크기
    const markW = Math.max(90, Math.round(W * 0.18));
    const markH = Math.round(markW * (400 / 1200)); // 원본 뷰박스 비율
    const pad = Math.round(W * 0.035);

    const left = W - markW - pad;
    const top = H - markH - pad;

    // 배경 밝기에 맞춰 워드마크 색을 뒤집는다.
    // 흰 워드마크 고정이면 흰 옷·하이키 배경 위에서 거의 안 보인다(실측: 흰 티셔츠 위에서
    // 읽히긴 하나 흐림). 그 자리 평균 밝기를 재서 밝으면 잉크색, 어두우면 흰색을 쓴다.
    let bright = false;
    try {
      const stat = await sharp(Buffer.from(base64, "base64"))
        .rotate()
        .extract({ left, top, width: markW, height: markH })
        .greyscale()
        .stats();
      bright = (stat.channels?.[0]?.mean ?? 0) > 140;
    } catch (_) { /* 못 재면 흰색(기본) */ }

    const svg = bright ? WORDMARK_SVG.replace(/#ffffff/g, "#231f20") : WORDMARK_SVG;
    const mark = await sharp(Buffer.from(svg))
      .resize(markW, markH, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    // 반대색 번짐을 뒤에 깔아 경계를 살린다 (밝은 배경엔 밝은 번짐, 어두운 배경엔 어두운 번짐)
    const halo = await sharp(mark)
      .blur(7)
      .negate({ alpha: false })
      .png()
      .toBuffer();

    const out = await img
      .composite([
        { input: halo, left, top, blend: "over", opacity: 0.35 },
        { input: mark, left, top, blend: "over", opacity: 0.9 },
      ])
      .toBuffer();
    return { base64: out.toString("base64"), mime: mime || "image/png" };
  } catch (e) {
    console.error("[watermark failed, using original]", e?.message || e);
    return { base64, mime };
  }
}

// 페이스 프로필 앵커 전용 축소.
// 일반 결과물(1024/q82)보다 크고 곱게 남긴다 — 앵커는 사용자가 화질을 직접 확인하고,
// 이후 모든 생성에 얼굴 참조로 다시 올라가는 원본이기 때문이다.
// 4:4:4(색 서브샘플링 없음) = 피부/입술 경계 색번짐 방지, mozjpeg = 같은 화질에 더 작은 용량.
// 1536 은 매 생성 요청에 다시 실려도 본문 용량이 안전한 상한선이다.
async function shrinkAnchor(base64, mime) {
  try {
    const sharp = (await import("sharp")).default;
    const out = await sharp(Buffer.from(base64, "base64"))
      .rotate()
      .resize(1536, 2048, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 92, mozjpeg: true, chromaSubsampling: "4:4:4" })
      .toBuffer();
    return { base64: out.toString("base64"), mime: "image/jpeg", bytes: out.length };
  } catch (e) {
    console.error("[shrinkAnchor failed, using original]", e?.message || e);
    return { base64, mime, bytes: 0 };
  }
}

// 입력 사진의 가로세로 비율(w/h). 헤더 파싱 실패 시 null.
function srcAspect(base64, mime) {
  try {
    const d = imageSize(Buffer.from(base64, "base64"), mime);
    if (d && d.w > 0 && d.h > 0) return d.w / d.h;
  } catch (_) {}
  return null;
}

// 결과를 지정한 비율로 가운데 크롭 (사진 복원 전용). 실패하면 원본 그대로 반환.
async function cropToRatio(base64, ratio) {
  if (!ratio || !isFinite(ratio)) return base64;
  try {
    const sharp = (await import("sharp")).default;
    const buf = Buffer.from(base64, "base64");
    const img = sharp(buf).rotate();
    const meta = await img.metadata();
    const w = meta.width, h = meta.height;
    if (!w || !h) return base64;
    // 이미 같은 비율이면 건드리지 않는다 (재인코딩 손실 방지)
    if (Math.abs(w / h - ratio) < 0.01) return base64;
    let cw, ch;
    if (w / h > ratio) { ch = h; cw = Math.round(h * ratio); }
    else { cw = w; ch = Math.round(w / ratio); }
    const out = await img
      .extract({
        left: Math.max(0, Math.round((w - cw) / 2)),
        top: Math.max(0, Math.round((h - ch) / 2)),
        width: Math.min(cw, w),
        height: Math.min(ch, h),
      })
      .toBuffer();
    return out.toString("base64");
  } catch (e) {
    console.error("[cropToRatio failed, using original]", e?.message || e);
    return base64;
  }
}

// 입력 이미지의 픽셀 크기를 헤더에서 파싱 (JPEG/PNG/WebP). 실패 시 null.
function imageSize(buf, mime) {
  try {
    if (/png/i.test(mime) || (buf[0] === 0x89 && buf[1] === 0x50)) {
      return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    }
    if (/jpe?g/i.test(mime) || (buf[0] === 0xff && buf[1] === 0xd8)) {
      let o = 2;
      while (o + 9 < buf.length) {
        if (buf[o] !== 0xff) { o++; continue; }
        const m = buf[o + 1];
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
          return { h: buf.readUInt16BE(o + 5), w: buf.readUInt16BE(o + 7) };
        }
        o += 2 + buf.readUInt16BE(o + 2);
      }
    }
    if (/webp/i.test(mime) || (buf[8] === 0x57 && buf[9] === 0x45)) {
      const fmt = buf.toString("ascii", 12, 16);
      if (fmt === "VP8 ") return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
      if (fmt === "VP8L") {
        const b = buf.readUInt32LE(21);
        return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 };
      }
      if (fmt === "VP8X") {
        return {
          w: (buf[24] | (buf[25] << 8) | (buf[26] << 16)) + 1,
          h: (buf[27] | (buf[28] << 8) | (buf[29] << 16)) + 1,
        };
      }
    }
  } catch (_) {}
  return null;
}

// gemini-3.1-flash-image 가 지원하는 비율 중 입력에 가장 가까운 것 선택.
function nearestAspect(w, h) {
  const presets = [
    ["1:1", 1], ["2:3", 2 / 3], ["3:2", 3 / 2], ["3:4", 3 / 4], ["4:3", 4 / 3],
    ["4:5", 4 / 5], ["5:4", 5 / 4], ["9:16", 9 / 16], ["16:9", 16 / 9], ["21:9", 21 / 9],
  ];
  const r = w / h;
  let best = "1:1", bd = Infinity;
  for (const [name, val] of presets) {
    const d = Math.abs(Math.log(r / val));
    if (d < bd) { bd = d; best = name; }
  }
  return best;
}

// 2026-07-28: picbox 커밋 c80f986 이식 — 사진 같은 결과를 위한 공통 문구 ("AI 티" 억제).
//   원인: 매끈한 피부/완벽한 대칭/과한 샤프닝이 전형적인 생성형 룩을 만든다.
//   → 피부 질감(모공·잔주름·점·주근깨)과 자연스러운 비대칭을 "보존"하라고 명시하고,
//     실제 카메라 특성(85mm, 얕은 심도, 미세 그레인)을 요구한다. 전 모드 공통 적용.
const PHOTOREALISM =
  "CRITICAL — the output must look like a REAL PHOTOGRAPH taken by a professional photographer, " +
  "not an AI image, not a 3D render, not an illustration, not a digital painting. " +
  // ⚠️ 예전엔 여기서 "잡티·주근깨·점을 있는 그대로 보존, 리터칭하지 말 것" 이라고 지시했다.
  //    AI 티(밀랍 피부)를 막으려던 건데, 그 결과 여드름·홍조·잡티가 그대로 살아나
  //    "사진관에서 찍은 인생사진" 이라는 제품의 목적과 정면으로 어긋났다.
  //    → 실제 화보 리터처가 하는 일을 그대로 시킨다: 결점은 지우되 피부 결(모공)은 남긴다.
  "SKIN — ULTRA-REALISTIC SOFT SKIN. Retouch it the way a professional beauty/editorial retoucher would: " +
  "cleanly remove acne, pimples, spots, blemishes, blotchy redness, irritation, dark under-eye circles " +
  "and uneven patches, and even out the overall skin tone into soft, clear, healthy skin with a natural glow. " +
  "BUT keep it photographic: pore texture stays visible though softened, fine skin detail and the natural " +
  "highlights and shadows of the face remain, and the person's real skin tone and undertone are unchanged. " +
  "Aim for 'she has really good skin in this photo', NOT porcelain-doll or mannequin skin — " +
  "never blurred, smudged, plastic, waxy, or airbrushed flat. " +
  "Do NOT change the person's face shape, features, proportions or identity while doing this. " +
  "Keep natural facial asymmetry (eyes, brows and mouth are never perfectly symmetrical on a real face). " +
  "Keep real hair detail: individual strands, natural flyaways, a real hairline that is not painted-on. " +
  // 아래 금지 목록은 "AI 티" 에 대한 것이지 피부 결점에 대한 게 아니다.
  // 예전엔 여기 "too-perfect flawless appearance 금지" 가 있어서 위 리터칭 지시와 싸웠다.
  "STRICTLY AVOID the typical AI/CGI look: waxy or plastic skin, blurred or melted-looking faces, " +
  "doll-like or reshaped features, exaggerated symmetry, glassy or over-bright eyes, over-sharpened edges, " +
  "halo outlines, unnatural glow or bloom, and oversaturated colors. " +
  "Camera: full-frame DSLR with an 85mm lens at around f/2.8 — natural, believable depth of field, " +
  "true-to-life color, natural micro-contrast and a faint, fine sensor grain like a real photograph. ";

// 사실적 의상 렌더링 공통 문구 (플라스틱/붙인 듯한 느낌 방지) — 의상이 관여하는 모드에만 적용.
const REALISTIC_GARMENT =
  "The clothing must look like REAL, photographed garments with a bespoke, made-to-measure " +
  "tailored fit precisely following the person's own frame — natural fabric texture and weave, " +
  "subtle natural creases and soft fabric shadows, collars and lapels that lie flat and sit " +
  "naturally and symmetrically. STRICTLY AVOID any artificial look: no plastic/glossy/rubbery " +
  "fabric, no painted or illustrated appearance, no stiff cardboard collar, no floating or " +
  "pasted-on garment, no costume-like styling, no AI artifacts. ";

/* ============================================================
   Vertex AI 경로
   AI Studio API(generativelanguage)와 "같은 모델, 다른 인프라" 다.
   2026-08-06: AI Studio 쪽 이미지 모델이 종일 503(high demand) 인 상태에서
   Vertex 로는 gemini-3-pro-image 가 정상 생성됐다(200, 29s). 그래서 Vertex 를
   1순위로 쓰고 AI Studio 를 폴백으로 둔다.
   ⚠️ location 은 반드시 global — us-central1 은 404 (모델 미배포).
   ============================================================ */
const VERTEX_LOCATION = "global";
let vertexTokenCache = { token: null, exp: 0 };

function b64url(buf) {
  return Buffer.from(buf).toString("base64")
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

// 서비스 계정 → OAuth 액세스 토큰. 1시간짜리라 람다가 살아있는 동안 재사용한다.
async function getVertexToken(sa) {
  if (vertexTokenCache.token && Date.now() < vertexTokenCache.exp) {
    return vertexTokenCache.token;
  }
  const { createSign } = await import("node:crypto");
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token",
    iat: now, exp: now + 3600,
  }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const jwt = `${header}.${claims}.${b64url(signer.sign(sa.private_key))}`;

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error("vertex token 실패: " + JSON.stringify(j).slice(0, 150));
  // 실제 만료(3600s)보다 5분 일찍 버려서 경계에서 만료된 토큰을 쓰지 않게 한다
  vertexTokenCache = { token: j.access_token, exp: Date.now() + 55 * 60 * 1000 };
  return j.access_token;
}

// 생성 완료 알림. 서버리스는 응답을 보내고 나면 얼어붙을 수 있어서
// fire-and-forget 이 아니라 응답 전에 await 한다(FCM 왕복 ~200ms).
// 실패해도 생성 결과와는 무관하므로 삼킨다.
async function notifyDone(pushToken, count, conceptTitle) {
  // 발송 결과를 반드시 남긴다. 이게 없어서 "완료 알림이 원격(FCM→APNs)으로 가는지,
  // 로컬 예비 경로로 뜨는지"를 신고를 받고도 판별할 수 없었다 (2026-08-25).
  //   · pushToken 없음  → 앱이 FCM 토큰을 못 얻었다는 뜻 (initPush 실패/행)
  //   · 실패: 401 third-party auth → Firebase 에 APNs 키가 없거나 무효
  if (!pushToken) {
    console.log("[push] genDone: pushToken 없음 — 원격 미발송(웹이거나 앱 initPush 실패)");
    return;
  }
  try {
    const { sendToToken } = await import("./_lib/push.js");
    const r = await sendToToken(pushToken, {
      title: "사진이 완성됐어요 ✨",
      body: conceptTitle
        ? `'${conceptTitle}' ${count > 1 ? count + "장 " : ""}확인해 보세요`
        : "앱을 열어 확인해 보세요",
      data: { kind: "genDone", count },
    });
    if (r?.ok) console.log("[push] genDone 발송 ok:", r.name || "");
    else console.error("[push] genDone 실패:", r?.status || "", String(r?.error || "").slice(0, 200));
  } catch (e) { console.error("[push] genDone 예외:", e?.message || e); }
}

function vertexSA() {
  const raw = process.env.VERTEX_SA_JSON;
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (_) { return null; }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Methods","GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","authorization,content-type");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST 만 받습니다." });
  }

  // 1) 사용자 인증
  const auth = await getAuthedUser(req);
  if (auth.error) {
    return res.status(auth.status).json({ error: auth.error });
  }
  const { user, admin } = auth;
  const unlimited = isUnlimited(user);
  const dailyLimit = dailyLimitFor(user); // 테스터 3 / 일반 1

  // ── 페이스 프로필 품질 게이트 2차(서버) ──────────────────────────────
  // face-profile-v1.md §1: "품질 게이트(클라 1차 + 서버 2차) … 미달 컷은 그 자리에서
  // 사유와 함께 재촬영 요구". 클라는 밝기·블러·해상도만 보고, 얼굴이 실제로 한 명
  // 잡히는지는 여기서 판정한다.
  //
  // ⚠️ 별도 엔드포인트를 만들지 않고 generate 안의 분기로 둔다. Vercel Hobby 의
  //    서버리스 함수 상한이 12개인데 지금 정확히 12개라, 파일을 하나라도 더 만들면
  //    배포가 통째로 실패한다(api/concepts.js 의 drops 합침과 같은 이유).
  //
  // 생성이 아니므로 한도·크레딧·차감 로직에 닿기 전에 반환한다. 사진은 검사에만
  // 쓰이고 저장하지 않는다.
  if (req.body && req.body.faceCheck) {
    const key = process.env.GEMINI_API_KEY;
    const { mimeType: fcMime, base64: fcData } = req.body;
    if (!key) return res.status(500).json({ error: "서버에 GEMINI_API_KEY 가 없습니다." });
    if (!fcData || !/^image\//.test(fcMime || "")) {
      return res.status(400).json({ error: "mimeType, base64 가 필요합니다." });
    }
    const r = await precheckHasFace(key, fcMime, fcData);
    return res.status(200).json({ ok: !!r.hasFace, reason: r.hasFace ? null : "no_face" });
  }

  // ── 페이스 프로필 앵커 생성 (v1.1 개정: 2026-08-24 오너 지시) ──────────────
  // 사용자가 올린 셀카 1~5장으로 "기준 정면 사진"(앵커) 한 장을 생성해 돌려준다.
  // 클라는 앵커를 사용자에게 확인받은 뒤("이 얼굴이 맞아요?") 기기에만 저장하고,
  // 이후 모든 생성의 얼굴 참조로 앵커 1장을 쓴다.
  //   근거(docs/face-profile-ab.md 실측): 참조 3장은 1장 대비 정확도 이득이 없고
  //   포즈 누출(3/4측면)만 생겼다 → 깨끗한 정면 1장으로 수렴시키는 게 맞다.
  // 셀카는 이 요청에서만 쓰고 저장하지 않는다(§2-3 비보관 원칙 동일).
  // 크레딧 차감 없음. 대신 계정당 24시간 6회 캡 — 클라 UX는 재생성 2회로 묶지만
  // 서버 캡이 없으면 공짜 Pro 생성 루프가 된다.
  if (req.body && req.body.faceAnchor) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return res.status(500).json({ error: "서버에 GEMINI_API_KEY 가 없습니다." });
    const shots = (Array.isArray(req.body.shots) ? req.body.shots : [])
      .filter((s) => s && typeof s.base64 === "string" && /^image\//.test(s.mimeType || ""))
      .slice(0, 5);
    if (!shots.length) {
      return res.status(400).json({ error: "shots(셀카 1~5장)가 필요합니다." });
    }

    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count: anchorCount, error: cntErr } = await admin
      .from("usage_log")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id).eq("kind", "face_anchor").gte("created_at", since);
    if (!cntErr && (anchorCount || 0) >= 6 && !unlimited) {
      return res.status(429).json({
        error: "얼굴 등록 생성을 오늘은 다 사용했어요. 내일 다시 시도해 주세요 🙂",
        anchorLimit: true,
      });
    }

    const n = shots.length;
    const anchorPrompt =
      (n > 1
        ? `The ${n} reference photos show the SAME person from different angles. `
        : "The reference photo shows a person. ") +
      "Create ONE neutral front-facing portrait of this person, like a casual ID reference photo: " +
      "facing the camera directly, neutral relaxed expression, shoulders-up framing, " +
      "plain light neutral wall background, soft even indoor light. " +
      // 정체성(=골격/이목구비 배치)은 절대 건드리지 않고, 피부는 화보 리터처가 하는
      // 수준으로 정리한다. 앵커는 이후 모든 생성의 얼굴 원본이 되기 때문에, 여기에
      // 여드름·잡티가 박히면 만드는 사진마다 그대로 따라간다. (본문 SKIN 규칙과 동일 기준)
      "CRITICAL — reproduce this person's real facial identity EXACTLY as seen in the " +
      (n > 1 ? "references" : "reference") + ": same bone structure, eye shape and spacing, nose, " +
      "lips, jawline, face width and proportions, hairline, and their real skin tone and undertone. " +
      "Do NOT slim the face, do NOT enlarge the eyes, do NOT change any facial proportion, " +
      "do NOT add makeup, do NOT turn it into a glamour shot. " +
      "SKIN — retouch it the way a professional retoucher would: cleanly remove acne, pimples, " +
      "temporary spots, blemishes, blotchy redness and dark under-eye circles, and even out the " +
      "skin tone into clear healthy skin. Keep pore texture and fine skin detail visible — " +
      "never blurred, plastic, waxy or airbrushed flat. " +
      "It must look like this exact person on a good skin day, in plain honest lighting.";

    const anchorBody = {
      contents: [{
        role: "user",
        parts: [
          { text: anchorPrompt },
          ...shots.map((s) => ({ inline_data: { mime_type: s.mimeType, data: s.base64 } })),
        ],
      }],
      generationConfig: { imageConfig: { imageSize: "2K" } },
    };
    const callAnchor = async (model, timeoutMs, cfg = anchorBody) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const up = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent",
          { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key },
            body: JSON.stringify(cfg), signal: controller.signal }
        );
        if (!up.ok) return null;
        const j = await up.json().catch(() => null);
        const part = (j?.candidates?.[0]?.content?.parts || [])
          .find((x) => x.inlineData || x.inline_data);
        return part ? (part.inlineData || part.inline_data) : null;
      } catch (_) { return null; } finally { clearTimeout(timer); }
    };

    // 앵커는 이후 모든 생성의 기준이라 품질이 중요 → Pro 우선, 실패 시 base 폴백.
    // (base 는 2K 설정을 안 받으므로 generationConfig 를 뺀 본문으로 호출)
    let anchorModel = "gemini-3-pro-image";
    let inline = await callAnchor("gemini-3-pro-image", 60000);
    if (!inline) inline = await callAnchor("gemini-3-pro-image", 40000);
    if (!inline) {
      const { generationConfig, ...baseBody } = anchorBody;
      anchorModel = "gemini-3.1-flash-image";
      inline = await callAnchor("gemini-3.1-flash-image", 30000, baseBody);
    }
    if (!inline) {
      return res.status(503).json({
        error: "지금 이미지 서버가 붐비고 있어요.\n잠시 뒤 다시 시도해 주세요 🙂",
        busy: true,
      });
    }

    admin.from("usage_log").insert({ user_id: user.id, kind: "face_anchor" })
      .then(() => {}).catch(() => {});
    // ⚠️ 앵커에는 일반 결과물용 shrinkOutput(1024/q82)을 쓰면 안 된다.
    //    앵커는 (1) 사용자가 "이 얼굴 맞아요?" 로 화질을 직접 판단하는 이미지이고
    //    (2) 이후 모든 생성의 얼굴 원본이라, 여기서 뭉개면 만드는 사진마다 뭉개진다.
    //    실제로 2K 로 만들어 놓고 1024/q82 로 깎아 돌려주고 있었다.
    const anchorOut = await shrinkAnchor(inline.data, inline.mimeType || inline.mime_type || "image/png");
    // 비보관 증명 로그 — 장수와 모델만 남긴다 (§2-3).
    console.log(`[generate] faceAnchor shots=${n} model=${anchorModel} bytes=${anchorOut.bytes} stored=never`);
    return res.status(200).json({ ok: true, mimeType: anchorOut.mime, base64: anchorOut.base64 });
  }

  // (정식 오픈: 베타 차단 제거 — 모든 로그인 사용자가 하루 무료 1장 + 크레딧 사용 가능)

  // 무료 Pro 체험(계정당 1회): 결과화면에서 "같은 사진 Pro로 무료 1회" 버튼이 보냄.
  //  → 하루한도/크레딧 게이트를 우회하고, 차감 없이 Pro 엔진으로 1장 생성 후 소진 기록.
  const wantProSample = !!(req.body && req.body.proSample);

  // 2) 오늘 사용량 + 크레딧 (무제한 사용자는 건너뜀)
  //    하루 한도 남으면 그걸 쓰고, 다 썼으면 크레딧으로 대체.
  let usage = { count: 0 };
  let useCredit = false;
  let creditsLeft = 0;
  let freeProSample = false;
  if (!unlimited) {
    usage = await countTodayUsage(admin, user.id);
    if (usage.error) {
      return res.status(500).json({ error: "사용 기록 조회 실패: " + usage.error });
    }

    if (wantProSample) {
      // 무료 Pro 체험 경로: 계정당 1회만
      const already = await getProSampleUsed(admin, user.id);
      if (already) {
        return res.status(403).json({
          error: "무료 Pro 체험은 이미 사용했어요. 크레딧을 충전하면 계속 Pro로 만들 수 있어요.",
          proSampleUsed: true,
        });
      }
      freeProSample = true; // 게이트 우회 (아래 한도 체크 스킵)
    } else if (usage.count >= dailyLimit) {
      // 하루 한도 소진 → 크레딧 확인
      const credit = await getCreditInfo(admin, user.id);
      creditsLeft = credit.error ? 0 : credit.creditsAvailable;
      if (creditsLeft > 0) {
        useCredit = true; // 크레딧으로 진행
      } else {
        return res.status(429).json({
          error:
            "오늘의 무료 한도를 모두 사용했어요.\n친구를 초대하면 1명당 크레딧 3개가 생겨요!",
          quotaUsed: usage.count,
          quotaLimit: dailyLimit,
          credits: 0,
        });
      }
    }
  }

  // 3) 요청 본문 확인
  const {
    mimeType, base64, prompt, conceptId, conceptTitle,
    // 아트 변환처럼 풍경/물건 사진을 받는 컨셉은 얼굴 검사 우회
    skipFacePrecheck,
    // 증명사진: 사용자가 고른 정장색/배경색 (서버에서 프롬프트 조립)
    idSuit, idBg, idBgName,
    // 인생네컷: 스타일 + 컷 인덱스 (서버가 컷별 포즈/악세서리 프롬프트 조립)
    fourcutStyle, cutIndex,
    // 인생네컷 스트립 한 장 생성 (신버전 앱). 없으면 구버전(컷별 생성) 경로.
    cutCount,
    // 커플: 두 번째 참조 사진(상대). 프롬프트가 "first/second reference image" 를
    // 지칭하므로 반드시 base64 → base64_2 순서로 넣는다.
    mimeType2, base64_2,
    // 드레스룸: 의상 사진 1~5장 [{mimeType,base64}] + 스타일("mirror"|"model").
    // 프롬프트는 전부 서버가 조립한다 — 폴라로이드처럼 반복 튜닝할 게 많아서,
    // 문구를 서버에 두면 앱 빌드 없이 고칠 수 있다.
    garments, dressStyle,
    // 묶음 생성 장수 (1/3/6/12). 요금표 밖의 값은 1장으로 취급.
    count,
    // 이 기기의 FCM 토큰(네이티브만). 생성이 끝나면 여기로 "완성됐어요"를 쏜다.
    // 앱이 완전히 종료돼도 도착한다 — 로컬 알림으로는 안 되던 부분.
    pushToken,
    // 페이스 프로필 v1.1 — 같은 사람의 얼굴을 여러 각도로 담은 참조 사진 3~5장.
    // [{ mimeType, base64, angle }] 형태이며 angle 은 로깅·정렬용 메타다.
    //
    // ⚠️ 서버는 이것을 절대 저장하지 않는다. 프로필의 정본은 사용자 기기이고
    //    (face-profile-v1.md §2-3, v1.1 오너 개정), 서버는 이 요청 한 번의
    //    참조로만 받아 응답 후 폐기한다 — 기존 1회 셀카 경로와 같은 데이터 경로다.
    //    DB 테이블도, 스토리지 업로드도 없다. 이 함수 밖으로 나가는 곳은
    //    Gemini/Vertex 호출뿐이며 그건 방침에 고지된 국외이전 경로다.
    faceRefs,
  } = req.body || {};

  // 얼굴 참조 정규화 — 최대 5장(스펙 §1: 필수 3 + 선택 2), 형식 불량은 조용히 버린다.
  // 조용히 버리는 이유: 프로필이 깨져도 생성 자체는 1회 셀카로 성공해야 한다.
  const FACE_REF_MAX = 5;
  const faceRefList = (Array.isArray(faceRefs) ? faceRefs : [])
    .filter((r) => r && typeof r.base64 === "string" && /^image\//.test(r.mimeType || ""))
    .slice(0, FACE_REF_MAX);

  const batchCount = BATCH_COST[Number(count)] ? Number(count) : 1;
  const batchCost = BATCH_COST[batchCount];
  if (!mimeType || !base64 || !prompt) {
    return res
      .status(400)
      .json({ error: "mimeType, base64, prompt 가 모두 필요합니다." });
  }

  // 커플 컨셉 가드 — 프롬프트가 "두 번째 참조 이미지"를 지칭하는데 사진이 한 장만 왔으면
  // 구버전 앱(사진 2장 UI가 없는 빌드)이다. 그대로 생성하면 없는 사람을 지어내므로
  // 차감 전에 업데이트를 안내한다. (웹은 항상 최신이라 해당 없음)
  // ⚠️ 프롬프트마다 표현이 다르다. "second reference image" 외에
  //    "two attached reference images", "the second is the man" 형태도 커플이다.
  const NEEDS_TWO =
    /second reference image|two attached reference images|the second is the man/i;
  if (!base64_2 && NEEDS_TWO.test(prompt)) {
    return res.status(426).json({
      error:
        "이 컨셉은 두 사람의 사진이 필요해요.\n앱을 최신 버전으로 업데이트하면 사용할 수 있어요 🙂",
      needsUpdate: true,
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res
      .status(500)
      .json({ error: "서버에 GEMINI_API_KEY 가 설정돼 있지 않습니다." });
  }

  // 3.5) 사전 얼굴 검사 (Flash Lite, ~$0.002, 1~2초)
  //      얼굴 없으면 본 모델 호출 안 함 → 차감 X
  //      단, skipFacePrecheck (아트 변환 등) 면 검사 우회
  const hasSecond = !!(base64_2 && mimeType2);
  if (!skipFacePrecheck) {
    // 커플이면 두 장 다 검사한다 — 한 장만 통과시키면 상대 얼굴이 없는 채로
    // 본 모델을 호출해 크레딧만 나간다.
    const checks = await Promise.all([
      precheckHasFace(apiKey, mimeType, base64),
      hasSecond ? precheckHasFace(apiKey, mimeType2, base64_2) : Promise.resolve({ hasFace: true }),
    ]);
    const pre = checks.find((c) => !c.hasFace) || checks[0];
    if (!pre.hasFace) {
      return res.status(422).json({
        error:
          "사진에 얼굴이 인식되지 않아 이미지를 생성할 수 없습니다.\n사진을 다시 선택해 주세요.\n크레딧은 차감되지 않았으니 안심하세요🙂",
        noFace: true,
        quotaUsed: unlimited ? 0 : usage.count, // 차감 안 됨
        quotaLimit: unlimited ? null : dailyLimit,
        unlimited,
      });
    }
    // pre.error 있는 경우는 fail-open — 본 모델 호출로 진행
  }

  // 4) Gemini 호출
  // 일반 컨셉: "사진 속 사람으로 인물 사진 만들기"
  // 아트 변환: "사진을 다른 스타일로 다시 그리기 (인물일 필요 없음)"
  // 사진 복원 컨셉: 스타일 입히기 금지, 같은 사진을 고화질로 되살리기만.
  // (conceptId 408 또는 제목에 복원/restore 포함 → 서버에서 자동 감지)
  const isRestore =
    Number(conceptId) === 408 || /복원|restor/i.test(conceptTitle || "");

  // 증명사진: 사용자가 고른 정장색/배경색으로 서버가 프롬프트 조립 (자연스러운 정장)
  const isIdPhoto =
    (Number(conceptId) === 409 || /증명사진|id ?photo/i.test(conceptTitle || "")) && !!idSuit;
  const idInstruction =
    "Create a clean, professional ID / passport-style photograph using the person in the provided photo. " +
    "Keep their exact face, identity, facial features, skin tone and natural likeness — do not beautify, slim, smooth, or change who they are. " +
    "Composition: front-facing head-AND-SHOULDERS portrait, looking straight at the camera, neutral relaxed expression, mouth closed, eyes open and clearly visible, face and both ears visible, hair tidy, no hat, no sunglasses. " +
    "FRAMING (important): zoom OUT a little — do NOT crop tightly on the face/head. Frame it like a standard ID/passport photo so that the whole head with a small margin of empty space above the hair AND the entire shoulder line down to roughly the upper chest are clearly visible. Both shoulders and the top of the suit must be fully in frame; never cut off the shoulders. " +
    "Dress the person in a business-formal " + (idSuit || "dark navy") + " suit jacket and a clean white collared shirt, styled appropriately for the person's apparent gender and build (a women's blazer for women, a men's suit for men). " +
    "The suit must have a BESPOKE, made-to-measure tailored fit — precisely tailored to the person's own frame: clean tailored shoulders that follow their natural shoulder line, a trim but comfortable body, smooth lapels with no bunching or gaping, the look of a high-end custom-tailored garment. " +
    REALISTIC_GARMENT +
    "Keep the person's real shoulder width, neck and posture — do NOT broaden, square off, or enlarge the shoulders, and do NOT widen the neck. The jacket should follow the body's actual contour and connect to the neck and shoulders with seamless, anatomically-correct, photorealistic transitions. " +
    "It must look exactly like normal business attire captured in a real studio photograph, with the suit's lighting and color temperature matched to the face. " +
    "Background: a clean, BRIGHT, light solid " + (idBgName || "neutral") + " (" + (idBg || "#FFFFFF") + ") studio backdrop with a very subtle, smooth gradient (slightly brighter just behind the head). Keep the background light, fresh and airy — never dark, muddy, or heavy. " +
    "LIGHTING: bright, clean, evenly diffused HIGH-KEY studio lighting exactly like a professional Korean ID-photo studio — the face, clothing and background are all brightly and evenly lit and well-exposed, giving a bright, fresh, crisp, airy look, while KEEPING natural skin texture (do not smooth or airbrush the skin). ABSOLUTELY NO dark, dim, moody, underexposed, gloomy, or dramatic/heavy shadows anywhere. " +
    "Sharp focus, high resolution, photorealistic and true-to-life — like a bright official ID photo taken at a professional photo studio.";

  // 인생네컷: 스타일별 무드/악세서리 + 컷별 포즈로 단일 컷 포트레이트 생성
  const isFourcut = !!fourcutStyle;
  const FC_STYLE = {
    cute:     { mood: "soft dreamy CUTE aesthetic, pastel pink and cream tones, gentle soft lighting, sweet adorable vibe", acc: "a cute ribbon hairband" },
    luxury:   { mood: "LUXURY editorial fashion aesthetic, elegant black and gold tones, glossy premium studio lighting, sophisticated chic vibe", acc: "an elegant pearl hairpin" },
    funky:    { mood: "FUNKY Y2K retro aesthetic, bold saturated neon colors, high-contrast on-camera flash look, edgy playful vibe", acc: "fun colorful hair clips" },
    playful:  { mood: "PLAYFUL vibrant party aesthetic, bright cheerful colors, joyful energetic vibe", acc: "a fun colorful party headband" },
    birthday: { mood: "festive BIRTHDAY party aesthetic, warm celebratory tones with balloon and confetti accents, happy celebratory vibe", acc: "a cute party-hat headband" },
    film:     { mood: "nostalgic 90s FILM photography aesthetic, warm faded beige tones, soft grain and gentle halation, timeless analog vibe", acc: "a simple thin hair ribbon" },
    summer:   { mood: "fresh SUMMER vacation aesthetic, bright aqua and sky-blue tones, sunlit airy highlights, breezy cheerful vibe", acc: "a woven straw sun visor" },
    mono:     { mood: "clean MONOCHROME editorial aesthetic, crisp black-and-white tones with soft gray gradients, minimal timeless vibe", acc: "a sleek minimal hair clip" },

    // ── 테마 프리셋: 프레임 색이 아니라 "찍히는 사진"(의상·배경·무드)이 달라진다 ──
    school:    { mood: "youthful SCHOOL-UNIFORM photo-booth aesthetic, clean navy-and-white palette, bright classroom daylight, fresh nostalgic student vibe",
                 acc: "a neat school uniform with a navy blazer and ribbon tie", extra: "wearing a crisp school uniform, tidy collar and ribbon" },
    couple:    { mood: "warm ROMANTIC couple photo-booth aesthetic, soft blush and cream tones, cozy intimate lighting, sweet affectionate vibe",
                 acc: "a delicate heart hairpin", extra: "styled for a romantic date look, soft knit or neat blouse" },
    wedding:   { mood: "elegant WEDDING photo-booth aesthetic, ivory and champagne tones, luminous soft studio light, graceful bridal vibe",
                 acc: "a fine pearl-and-crystal hairpiece", extra: "wearing an elegant ivory bridal dress with a clean neckline" },
    party:     { mood: "glamorous NIGHT PARTY photo-booth aesthetic, deep jewel tones with sparkling bokeh lights, on-camera flash look, lively festive vibe",
                 acc: "sparkling drop earrings", extra: "wearing a chic sequin or satin party dress" },
    beach:     { mood: "sunny BEACH VACATION photo-booth aesthetic, turquoise and sand tones, bright sunlit highlights, breezy carefree vibe",
                 acc: "a woven straw hat", extra: "wearing a light summer dress or resort top, sun-kissed glow" },
    vintage:   { mood: "retro VINTAGE 70s photo-booth aesthetic, warm amber and mustard tones, soft film grain, nostalgic analog vibe",
                 acc: "a patterned silk headscarf", extra: "wearing retro-styled clothing with vintage patterns" },
    christmas: { mood: "cozy CHRISTMAS photo-booth aesthetic, deep red and evergreen tones with warm string-light bokeh, festive holiday vibe",
                 acc: "a soft red santa-hat headband", extra: "wearing a cozy knit sweater in holiday colors" },
    newtro:    { mood: "bold NEWTRO 90s Korean photo-booth aesthetic, saturated primary colors with grainy flash, playful retro-modern vibe",
                 acc: "colorful retro hair clips", extra: "wearing bold 90s-style streetwear with color-blocking" },
  };
  // 컷별 포즈 — 과장된 연출(V사인·윙크·놀란표정)은 뺐다. 실제로 연속 촬영한 것처럼
  // 표정·시선·각도만 미묘하게 다른 자연스러운 프레임들.
  const FC_POSES = [
    "looking straight into the lens with a soft, relaxed closed-lip smile, shoulders at ease",
    "caught mid-laugh in a natural unposed moment, eyes softly crinkled, looking slightly off to the side",
    "head tilted just a little, calm gentle smile, chin lowered a touch",
    "looking softly away from the camera with a faint, easy smile, as if glancing at something nearby",
    "a quiet natural expression with soft eyes and lips barely parted, no forced smile",
    "one hand resting lightly near the collarbone or jaw, unforced warm smile",
    "shoulders turned slightly away with the face brought back toward the lens, natural relaxed smile",
    "a warm genuine smile straight to camera, eyes bright and calm",
  ];
  const fc = FC_STYLE[fourcutStyle] || FC_STYLE.cute;
  const fcPose = FC_POSES[(Number(cutIndex) || 0) % FC_POSES.length];

  // ── 스트립 한 장 생성 (2026-08-13) ──
  // 예전엔 컷 수만큼 따로 뽑아 앱에서 붙였다. 문제가 둘이었다:
  //   1) 컷마다 독립 생성이라 옷 주름·머리카락이 미묘하게 달라진다
  //   2) 앱이 /api/generate 를 컷 수만큼 동시에 불러 Vertex 429 를 유발
  // 나노바나나 프로는 한 장에 N분할을 일관되게 그린다(실측: 옷·귀걸이·머리까지 동일).
  // → 한 번의 호출로 스트립 전체를 만든다. 크레딧도 1장.
  const STRIP_GRID = { 2: "1 column x 2 rows", 3: "1 column x 3 rows",
                       4: "2 columns x 2 rows", 6: "2 columns x 3 rows" };
  const STRIP_RATIO = { 2: "3:4", 3: "9:16", 4: "3:4", 6: "3:4" };
  const stripN = STRIP_GRID[Number(cutCount)] ? Number(cutCount) : 4;
  const stripInstruction =
    `Create a Korean photo-booth (인생네컷) PHOTO STRIP as ONE single image, using the person in the provided photo.\n\n` +
    `LAYOUT: exactly ${stripN} photo cells arranged in ${STRIP_GRID[stripN]} on one clean strip. ` +
    `Even gutters between cells, a wider margin at the bottom. Each cell has slightly rounded corners. ` +
    `All ${stripN} cells fully inside the frame, none cropped.\n\n` +
    `THE PERSON: the SAME person in every cell — keep their exact face, identity and natural likeness from the provided photo. ` +
    `Identical hairstyle, outfit, accessories and makeup across all cells. Only pose, head angle and expression differ slightly, ` +
    `like ${stripN} consecutive frames from one photo-booth session. Head-and-shoulders framing, centered in each cell.\n\n` +
    `POSES (one per cell, in order): ` +
    FC_POSES.slice(0, stripN).map((p, i) => `cell ${i + 1} — ${p}`).join("; ") + ".\n" +
    `Expressions must look NATURAL and unforced, like candid frames from a real session. ` +
    `No exaggerated grins, no stiff or theatrical posing, no cheesy hand gestures.\n\n` +
    `The person is naturally wearing ${fc.acc}, tastefully styled to suit them (a real worn accessory, not a sticker). ` +
    (fc.extra ? `Wardrobe & styling: ${fc.extra}. ` : "") +
    `Overall aesthetic: ${fc.mood}. Simple, clean, uniform background behind the person in every cell.\n\n` +
    `Bright, clean, flattering lighting. Sharp focus, photorealistic, true-to-life skin. Exactly one person per cell.\n\n` +
    `STRICTLY: no text, no letters, no numbers, no date stamp, no logo, no watermark anywhere.`;

  const fourcutInstruction =
    "Create a single Korean photo-booth (인생네컷) style portrait CUT using the person in the provided photo. " +
    "Keep their exact face, identity, facial features and natural likeness — clearly recognizable; do not change who they are or beautify them unnaturally. " +
    "Framing: a head-and-shoulders / upper-body portrait, the person centered and photogenic, filling the frame nicely for a photo-strip cut. " +
    "Pose & expression for THIS cut: " + fcPose + ". " +
    "The expression and posture must look NATURAL and unforced — like a candid frame from a real " +
    "photo session, not a posed studio shot. No exaggerated grins, no stiff or theatrical posing, " +
    "no cheesy hand gestures unless explicitly described above. Subtle, believable, everyday. " +
    "The person is naturally wearing " + fc.acc + ", tastefully styled to suit them and matching the theme (it must look like a real worn accessory, not a sticker). " +
    // 테마 프리셋(교복/웨딩/파티 등)은 의상까지 바뀐다 — 프레임 색이 아니라 사진 자체가 달라지는 지점.
    (fc.extra ? "Wardrobe & styling for this theme: " + fc.extra + ". " : "") +
    "Overall aesthetic: " + fc.mood + ". " +
    "Background: a simple, clean, fairly uniform studio-style background that fits the theme, so the cut composites cleanly into a photo strip. " +
    "Bright, clean, flattering lighting. Sharp focus, photorealistic, true-to-life skin. Exactly one person in frame.";

  // ── 드레스룸 (2026-08-25) ─────────────────────────────────────────────
  // 의상 사진(최대 5장)을 입은 내 모습을 만든다. Higgsfield 로 케이스별(상의만/
  // 상+하/3장 레이어드/신발 포함 4장) 실측해 확정한 프롬프트를 서버에서 조립한다.
  // 확정 사양: 최대 5장(아우터·상의·하의·신발·가방) / 확인 질문 없음(빠진 의상은
  // 모델이 판단) / 거울셀카=토프 스웨이드 커튼 피팅룸 / 모델컷=오프화이트 무지.
  const GARMENT_MAX = 5;
  const garmentList = (Array.isArray(garments) ? garments : [])
    .filter((g) => g && typeof g.base64 === "string" && /^image\//.test(g.mimeType || ""))
    .slice(0, GARMENT_MAX);
  const isDressroom = garmentList.length > 0;
  const dressMirror = dressStyle !== "model"; // 기본 = 거울셀카

  // 참조 순서: [본인 사진] + [의상 1..N]. 서수(SECOND, THIRD…)가 이 순서를 가리킨다.
  const ORDINALS = ["SECOND", "THIRD", "FOURTH", "FIFTH", "SIXTH"];
  const garmentListing = garmentList
    .map((_, i) => `the ${ORDINALS[i]} reference image is one of the garments/items`)
    .join(", ");

  const dressroomInstruction =
    "Virtual fitting-room photo. The FIRST reference image shows a person — reproduce this " +
    "person's exact facial identity: same face, bone structure, eyes, nose, lips, same hair, " +
    "same natural body proportions. " +
    // "remaining" 이라 쓰면 안 된다 — 맨 뒤에 얼굴 참조가 더 붙는다(faceClause 참고)
    `The NEXT ${garmentList.length} reference image(s) show clothing/fashion items: ` +
    garmentListing + ". " +
    "The person is WEARING ALL of these EXACT items together as one outfit. First identify what " +
    "each item is (top, bottom, dress, outerwear, shoes, bag, accessory), then dress the person " +
    "in all of them with a natural, correct layering order (outerwear over tops, shoes on feet, " +
    "a bag carried or held naturally). Reproduce EVERY item exactly — same colours, same pattern, " +
    "same buttons and hardware, same fabric, same fit and length. Do not redesign, recolour or " +
    "simplify any item.\n\n" +
    // 빠진 부위는 묻지 않고 모델이 채운다 (오너 확정: 확인 단계 없음)
    "If the uploaded items do not make a complete outfit (e.g. only a top, or only shoes), " +
    "complete the look yourself with simple, well-matching neutral pieces that let the uploaded " +
    "items be the focus. If a dress or a full set is uploaded, no extra garments are needed.\n\n" +
    (dressMirror
      ? "SCENE — full-body MIRROR SELFIE in a clothing-store fitting room. The picture IS the " +
        "view in the single mirror the person is shooting into — the frame shows ONLY three " +
        "things: the person, the taupe curtain behind them, and the wooden floor. THERE IS NO " +
        "OTHER MIRROR IN THE ROOM. Nothing reflective appears at either side edge of the " +
        "picture: no mirror frame, no glass panel, no metal trim, no second reflection, no " +
        "repeated copy of the person, no infinite-mirror effect. The side walls are plain. " +
        "BEHIND: a floor-length TAUPE SUEDE fitting-room curtain — soft greige-taupe, heavy " +
        "matte suede texture with soft vertical folds, drawn mostly closed, filling the " +
        "background — and a light wooden floor. The person holds their phone at chest height, " +
        "phone visible but NOT covering the face. FULL BODY head to shoes, natural relaxed " +
        "mirror-selfie stance.\n" +
        "LIGHTING — bright, soft and flattering like a well-lit modern retail fitting room: " +
        "overall bright neutral-warm ambience, only a GENTLE hint of warm downlight from above. " +
        "NO dramatic spotlight, NO strong pool of light, NO visible light fixtures. " +
        "Real phone mirror-selfie feel, natural handheld framing."
      // 오너 지시(2026-08-26): 스튜디오 무지 배경 → 일상 배경. 포즈는 모델, 시선은 자유.
      : "SCENE — full-body STREET-STYLE MODEL CUT in an everyday real-world setting: the " +
        "person stands in a casual daily location that complements the outfit — for example a " +
        "quiet city sidewalk, a café exterior, a tree-lined residential street, a clean urban " +
        "corner or a bright pedestrian alley. The background is a believable ordinary place " +
        "with natural depth, softly blurred (shallow depth of field) so the person and the " +
        "clothes remain the clear subject.\n" +
        // "모델 포즈" 라고 쓰면 각 잡힌 화보가 나온다(오너: 너무 모델같음 → candid moment 로).
        // 포즈를 "취한" 게 아니라 "순간을 잡은" 사진으로 장면 자체를 재정의한다.
        "POSE — a CANDID MOMENT, not a pose: the person is caught in a natural unposed " +
        "instant, as if photographed without warning — mid-step down the sidewalk, brushing " +
        "hair from their face, glancing at something across the street, adjusting a sleeve, " +
        "a soft genuine in-between expression or an unguarded small smile. Relaxed shoulders, " +
        "natural weight shift, hands doing something ordinary (in a pocket, holding the bag, " +
        "at their side). ABSOLUTELY NOT a stiff editorial model pose, not posing for the " +
        "camera at all. The GAZE IS FREE and usually off-camera, like a street snap taken by " +
        "a friend. FULL BODY head to shoes, generous headroom.\n" +
        "LIGHTING — natural daylight belonging to the scene: soft, flattering, gently " +
        "directional, true-to-life colours. NO photography equipment anywhere in the frame. " +
        "Professional street-style lookbook photography, 50mm at f/2.8.") +
    "\n\nOUTPUT FORMAT: a VERTICAL PORTRAIT photograph in 3:4 aspect ratio (taller than wide, " +
    "like a standard phone portrait photo). Do NOT copy the aspect ratio of any reference image — " +
    "reference images may be tall phone screenshots; the output is always 3:4.\n" +
    "Photorealistic skin and fabric texture, true-to-life garment colours. " +
    "One person only — no other people. No text, no logo, no watermark, no border or overlay.";

  // cutCount 가 오면 스트립 한 장, 아니면 구버전(컷별) — 구버전 앱 호환
  const isStrip = isFourcut && !!STRIP_GRID[Number(cutCount)];
  const conceptInstruction = isDressroom
    ? dressroomInstruction
    : isFourcut
    ? (isStrip ? stripInstruction : fourcutInstruction)
    : isIdPhoto
    ? idInstruction
    : isRestore
    ? "Re-photograph this old photo as if the very same person, in the very same pose and outfit, " +
      "were photographed TODAY with a professional modern digital camera. The output must look like a " +
      "brand-new photograph taken this year — NOT like a repaired old photo.\n\n" +
      "KEEP EXACTLY THE SAME (identity must be unmistakable):\n" +
      "- The person's face, bone structure, eyes, nose, mouth, facial proportions and age\n" +
      "- Hairstyle, clothing, accessories and how they are worn\n" +
      "- Pose, head angle, gaze direction, expression\n" +
      "- Composition, crop and framing\n\n" +
      "MAKE IT A MODERN PHOTOGRAPH:\n" +
      "- Full natural color. If the original is black-and-white or sepia, render it in true, lifelike " +
      "color with healthy warm skin tones — absolutely NO sepia cast, NO yellow/brown tint, NO faded look.\n" +
      "- Clean neutral white balance and modern color grading, like a current studio portrait.\n" +
      "- Crisp modern studio or soft daylight lighting with gentle falloff; bright, clean exposure.\n" +
      "- Ultra-sharp focus with fine real detail: individual hair strands, natural skin texture with " +
      "visible pores, fabric weave. Realistic depth of field with a smoothly rendered background.\n" +
      "- Remove ALL age artifacts completely: film grain, noise, blur, scratches, creases, folds, tears, " +
      "stains, dust, halation, vignetting, paper texture, borders and any print edges. None may remain.\n" +
      "- Reconstruct damaged or missing areas naturally from context.\n\n" +
      "STRICTLY AVOID anything that reads as 'old': no vintage filter, no film emulation, no muted or " +
      "washed-out palette, no low resolution, no soft focus, no paper/print artifacts, no antique framing.\n\n" +
      "If several people are in the photo, every person must be restored with equal fidelity and keep " +
      "their own identity.\n\n" +
      "Result: a high-resolution, photorealistic portrait indistinguishable from one shot today on a " +
      "full-frame mirrorless camera with an 85mm f/1.4 lens — same person, same moment, modern photo."
    : skipFacePrecheck
    ? "Re-render the provided image in a new artistic style. " +
      "The subject can be a person, landscape, animal, object, or anything else. " +
      "Preserve the overall composition, subject identity, and recognizable features " +
      "while transforming the medium/style. " +
      // 프레이밍 규칙은 매직 부스 전체에 공통이라 컨셉 프롬프트가 아니라 여기에 둔다
      // (컨셉 14개에 각각 적어 넣으면 새 컨셉을 추가할 때마다 빠뜨린다).
      // 실측 2026-08-20: 405 소프트 클레이 3D 가 머리·가슴 사진을 전신 인형으로
      // 바꿔 내놔서 원본과 결과의 프레이밍이 어긋났다.
      // ⚠️ 예외 조항이 필요하다. 여백을 크게 두는 스타일(787 여백 드로잉)은 피사체를
      //    일부러 작게 그리는 게 핵심인데, 이 규칙이 그대로면 정면 충돌한다.
      "Keep the same framing and crop as the provided image — a head-and-shoulders photo stays " +
      "head-and-shoulders, a full-body photo stays full-body. Do not zoom in or out, and do not " +
      "re-pose the subject, unless the style below explicitly asks for different framing, " +
      "scale or negative space. Apply the following style:\n" + prompt
    : hasSecond
    ? "Using the TWO people in the two provided reference photos, generate a single new photograph " +
      "containing BOTH of them together. The FIRST reference image is the first person and the " +
      "SECOND reference image is the second person — keep each person's own face, identity and " +
      "facial features clearly recognizable, and never merge, swap or blend the two faces. " +
      "Exactly two people in frame. Apply the following concept:\n" + prompt
    : "Using the person in the provided photo, generate a new portrait. " +
      "Keep the same face, identity, and facial features clearly recognizable. " +
      "Apply the following concept:\n" + prompt;

  // ── 페이스 프로필: 얼굴 참조 절 (face-profile-v1.md §3) ──
  //
  // ⚠️ 개수 기반으로 서술하고 고정 서수("the second reference")를 쓰지 않는다.
  //    커플이면 앞에 사진이 2장, 아니면 1장이라 얼굴 참조의 시작 위치가 달라지는데,
  //    위치를 못박으면 한쪽에서 반드시 틀린 말이 된다. justin gemini.ts
  //    buildGenEditPrompt 가 같은 이유로 참조 수 기반 서술을 쓴다(스튜디오 실증본).
  //    이 문자열은 아래 bodyFor 가 실제로 붙이는 배열과 같은 값에서 계산되므로
  //    프롬프트와 이미지 순서가 어긋날 수 없다.
  //
  // 매직 부스(skipFacePrecheck)에는 붙이지 않는다 — 사람이 아닌 사진도 받는 모드라
  // "이 사람의 얼굴" 지시가 오히려 방해가 된다.
  // 표준 경로는 앵커 1장(angle="anchor")이지만, 혹시 여러 장이 와도 문장이 성립해야 한다.
  //
  // 드레스룸도 붙인다 (2026-08-26 — 오너 신고 "인물유지가 왜 이러냐"). 처음엔 의상
  // 서수(SECOND..SIXTH)와 "final N" 서수가 꼬일까 봐 뺐는데, 그게 바로 유지력 하락의
  // 원인이었다(본인 사진 1장에만 의존). 대신 드레스룸 전용 문구로 "의상이 아니다 /
  // 그 사진들 속 옷은 무시해라"를 명시해 두 서수 체계를 갈라준다.
  const faceClause =
    faceRefList.length && !skipFacePrecheck
      ? (isDressroom
          ? `\n\nAfter the garment references, the final ${faceRefList.length} reference ` +
            `image(s) at the very END are FACE REFERENCES of the same person from the FIRST ` +
            `image — they are NOT garments and NOT part of the outfit. Use them ONLY to ` +
            `reproduce this person's facial identity exactly (face, bone structure, eyes, nose, ` +
            `lips, skin tone). IGNORE the clothing, pose and background inside these face ` +
            `references — the outfit comes ONLY from the garment references listed above.`
          : faceRefList.length > 1
          ? `\n\nThe final ${faceRefList.length} reference images are ` +
            `the SAME person's face from multiple angles — reproduce this person's facial identity exactly. ` +
            `They are provided only to fix the face; they never change the composition, framing, pose, ` +
            `clothing or background decided above.`
          : `\n\nThe final reference image shows this person's face — reproduce this person's ` +
            `facial identity exactly. It is provided only to fix the face; it never changes the ` +
            `composition, framing, pose, clothing or background decided above.`)
      : "";

  // 비보관 증명용 로그 (face-profile-v1.md §2-3: "서버 코드로 비보관을 보장하고 로그로 증명").
  // 장수와 각도만 남긴다 — 이미지 바이트도, 사용자 식별자도 찍지 않는다.
  if (faceRefList.length) {
    console.log(
      `[generate] faceProfile refs=${faceRefList.length} ` +
        `angles=${faceRefList.map((r) => r.angle || "?").join(",")} ` +
        `used=${faceClause ? "yes" : "no(skipFacePrecheck)"} stored=never`
    );
  }

  // PHOTOREALISM(AI 티 억제)은 아트 스타일 변환 모드(skipFacePrecheck)만 제외하고 전 모드에 적용.
  //   제외 이유: 그 모드는 "일러스트/회화 등 다른 매체로 재해석"이 목적이라 "반드시 실제 사진처럼
  //   보여야 한다(not an illustration, not a digital painting)"는 지시와 정면 충돌한다.
  const instruction =
    (skipFacePrecheck ? conceptInstruction : PHOTOREALISM + conceptInstruction) + faceClause;

  // usePro: 과금/쿼터/CTA 판정 전용 플래그(그대로 유지) — 유료(크레딧 사용) / 무제한(어드민) /
  //   무료 Pro 체험일 때 true. ⚠️ 아래 로직에서 참조하지 않는다(과금 3경로 불변 유지) — "어떤
  //   모델로 호출할지"는 useProEngine 으로 완전히 분리한다.
  const usePro = unlimited || useCredit || freeProSample;

  // 엔진 정책 (2026-07-28 오너 지시): 현재는 전 티어 Pro 2K 통일.
  //   무료·유료 화질 차별을 없애는 대신 첫 결과물 품질을 올리는 실험.
  //   규모가 커져 원가가 부담되면 티어별 분기로 되돌린다 — 그때는 Vercel 환경변수
  //   ENGINE_POLICY=tiered 만 설정하면 코드 수정 없이 기존(무료=base / 유료=Pro) 동작으로 복귀.
  // 값: "all_pro"(기본) | "tiered"
  // 과금·체험 CTA 판정은 어느 정책이든 기존 usePro(= 유료 경로 여부)를 그대로 쓴다 — 위 참조.
  const ENGINE_POLICY = process.env.ENGINE_POLICY || "all_pro";
  const useProEngine = ENGINE_POLICY === "tiered" ? usePro : true;

  // 편집(image-to-image) 모드에선 Gemini가 generationConfig.imageConfig.aspectRatio 를 무시하고
  // 오히려 출력을 세로로 크롭하는 정황 → 설정을 빼고 편집 기본동작(입력 비율 유지)에 맡긴다.
  const bodyFor = (isPro) => ({
    contents: [
      {
        // ⚠️ role 은 Vertex 에서 필수다 (없으면 400 "Please use a valid role: user, model").
        //    AI Studio 는 생략해도 받아주므로 예전엔 빠져 있었다. 양쪽 다 이 형태로 동작한다.
        role: "user",
        parts: [
          { text: instruction },
          { inline_data: { mime_type: mimeType, data: base64 } },
          // 커플: 두 번째 참조 사진 (순서가 곧 "first/second reference image")
          ...(hasSecond
            ? [{ inline_data: { mime_type: mimeType2, data: base64_2 } }]
            : []),
          // 드레스룸: 의상 1~5장 — 서수(SECOND..SIXTH)가 이 순서를 가리킨다
          ...(isDressroom
            ? garmentList.map((g) => ({
                inline_data: { mime_type: g.mimeType, data: g.base64 },
              }))
            : []),
          // 페이스 프로필 참조는 항상 맨 뒤 블록 (§3 "얼굴 참조는 항상 마지막 블록").
          // 위 faceClause 의 "The final N reference images" 가 이 위치를 가리킨다.
          ...(faceClause
            ? faceRefList.map((r) => ({
                inline_data: { mime_type: r.mimeType, data: r.base64 },
              }))
            : []),
        ],
      },
    ],
    // Pro 는 2K 고해상도로. (기본 모델은 편집모드 비율보존 위해 설정 생략 — 기존 동작 유지)
    // 스트립은 분할 수에 맞는 비율을 명시해야 칸이 잘리지 않는다.
    // 드레스룸도 3:4 를 명시한다 — 편집 모드는 입력 비율을 따라가는데, 의상이 쇼핑몰
    // 풀스크린 캡처(아이폰 화면비 1:2.16)면 출력이 그 비율로 늘어났다(실측 1408×3040).
    ...(isPro
      ? { generationConfig: { imageConfig: { imageSize: "2K",
          ...(isStrip ? { aspectRatio: STRIP_RATIO[stripN] }
            : isDressroom ? { aspectRatio: "3:4" } : {}) } } }
      : {}),
  });

  // Gemini 한 번 호출(타임아웃 포함). 네트워크 예외(hang/AbortError 포함)는 upstream 없이 반환.
  async function callGemini(model, isPro, timeoutMs) {
    const endpoint =
      "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const upstream = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(bodyFor(isPro)),
        signal: controller.signal,
      });
      return { upstream };
    } catch (e) {
      return { networkError: e };
    } finally {
      clearTimeout(timer);
    }
  }

  // Pro 서버 혼잡 판정: 네트워크 예외(타임아웃/hang 포함) · 404(빈 응답) · 5xx.
  // (2026-07-21 실측: 같은 키로 8/8 404 → 몇 분 뒤 15/15 성공 — 일시적 혼잡이지 우리 요청 문제가 아님.)
  // ⚠️ null/undefined 도 "실패" 로 본다 — 예산이 없어 시도조차 못 한 경로가 있어서,
  //    그대로 두면 구조분해에서 TypeError 가 나 500 이 떨어진다.
  function isBusyFailure(r) {
    if (!r) return true;
    if (r.networkError) return true;
    const up = r.upstream;
    if (!up) return true;
    // ⚠️ 429(RESOURCE_EXHAUSTED)도 "잠시 후 되는" 실패다. 빠져 있어서 폴백도
    //    재시도도 안 타고 원문 JSON 이 그대로 화면에 떴다(실측 2026-08-13).
    return up.status === 404 || up.status === 429 ||
      (up.status >= 500 && up.status <= 599);
  }

  // 남은 시간 예산. maxDuration(300s) 안에서 생성 시도 + precheck·축소·갤러리저장이
  // 모두 끝나야 한다. 예전엔 60s 라 Vertex(2K, ~42s)를 쥐어짜다 자주 잘렸다.
  //  → 200s 로 넉넉히 잡되, 롤백/응답 시간을 위해 300s 는 다 쓰지 않는다.
  const DEADLINE = Date.now() + 200000;
  const left = () => DEADLINE - Date.now();
  const budget = (want) => Math.min(want, left());
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const PRO_MODEL = "gemini-3-pro-image";
  const BASE_MODEL = "gemini-3.1-flash-image";
  // 최후 폴백 — 검증된 구세대 모델.
  // gemini-3 계열 이미지 모델이 종일 503("high demand")을 뱉는 날이 있는데,
  // 같은 키의 2.5 계열(precheck 의 gemini-2.5-flash-lite)은 멀쩡히 돌아간다.
  // 즉 키·쿼터 문제가 아니라 3 계열 용량 문제라, 계열을 바꾸는 게 같은 모델을
  // 재시도하는 것보다 훨씬 잘 먹는다.
  const LEGACY_MODEL = "gemini-2.5-flash-image";

  let engineUsed = useProEngine ? "pro" : "base";
  let busyFallback = false;
  let result;

  // Vertex 로 호출 (AI Studio 와 요청/응답 본문 형태가 같아 bodyFor 를 그대로 쓴다)
  async function callVertex(model, isPro, timeoutMs) {
    const sa = vertexSA();
    if (!sa) return { networkError: new Error("VERTEX_SA_JSON 미설정") };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const token = await getVertexToken(sa);
      const url =
        `https://aiplatform.googleapis.com/v1/projects/${sa.project_id}` +
        `/locations/${VERTEX_LOCATION}/publishers/google/models/${model}:generateContent`;
      const upstream = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify(bodyFor(isPro)),
        signal: controller.signal,
      });
      return { upstream };
    } catch (e) {
      return { networkError: e };
    } finally {
      clearTimeout(timer);
    }
  }

  // 429(RESOURCE_EXHAUSTED) 전용 백오프 재시도.
  // ⚠️ 인생네컷은 앱이 컷 수만큼 /api/generate 를 "동시에" 부른다(8컷 = 8동시).
  //    그러면 Vertex 분당 한도에 걸려 429 가 쏟아진다. 429 는 몇 초만 쉬면
  //    대개 풀리므로 폴백보다 "기다렸다 다시 던지기" 가 맞다.
  //    (maxDuration 300s / 예산 200s 라 여유가 있다)
  async function callVertexBackoff(model, isPro, timeoutMs) {
    const waits = [2500, 6000, 12000];
    for (let i = 0; ; i++) {
      const r = await callVertex(model, isPro, Math.min(timeoutMs, Math.max(8000, left() - 4000)));
      if (r?.upstream?.status !== 429) return r;
      if (i >= waits.length || left() < waits[i] + 15000) {
        console.error("[generate] Vertex 429 — 재시도 여력 없음");
        return r;
      }
      console.error(`[generate] Vertex 429 → ${waits[i]}ms 후 재시도 (${i + 1}/${waits.length})`);
      await sleep(waits[i]);
    }
  }

  // ── 나노바나나 프로(3-pro)를 최대한 살린다 ──
  // 오너 방침: 기본 모델은 무조건 gemini-3-pro-image.
  // ⚠️ "더 오래 기다리기" 는 통하지 않는다 — 진단 실측상 45s 를 줘도 16s 에 503 이 온다.
  //    거절이 빠르므로 유일한 레버는 "예산이 남는 한 계속 다시 던지는 것" 이다.
  //    한 번 시도에 ~17s 가 걸려 60s 안에서 2~3회가 한계.
  async function proWithRetries(reserveForFallback) {
    let r = null;
    for (let attempt = 1; ; attempt++) {
      // 마지막 폴백 몫을 남겨두고, 한 번 더 던질 시간이 있는지 본다
      const usable = left() - reserveForFallback;
      if (usable < 9000) break;
      r = await callGemini(PRO_MODEL, true, Math.min(20000, usable));
      if (!isBusyFailure(r)) {
        if (attempt > 1) console.log(`[generate] 3-pro ${attempt}번째 시도에서 성공`);
        return r;
      }
      console.error(`[generate] 3-pro ${attempt}번째 실패:`,
        r.networkError?.message || `HTTP ${r.upstream?.status}`);
      await sleep(600); // 짧게만 — 거절 자체가 이미 오래 걸린다
    }
    return r;
  }

  // base(3.1) → 안 되면 구세대(2.5) 로 갈아탄다.
  // ⚠️ 같은 모델을 재시도하는 건 효과가 없었다 (실측: 재시도까지 3번 연속 같은 503).
  //    혼잡한 건 모델 자체라, 다른 계열로 넘어가야 뚫린다.
  async function baseThenLegacy(first) {
    let r = await callGemini(BASE_MODEL, false, budget(first));
    if (isBusyFailure(r) && left() > 6000) {
      console.error("[generate] base 실패 → 구세대(2.5) 폴백:",
        r.networkError?.message || `HTTP ${r.upstream?.status}`);
      r = await callGemini(LEGACY_MODEL, false, budget(left() - 1500));
      if (isBusyFailure(r)) {
        console.error("[generate] 구세대(2.5)도 실패:",
          r.networkError?.message || `HTTP ${r.upstream?.status}`);
      } else {
        console.log("[generate] 구세대(2.5) 로 성공");
      }
    }
    return r;
  }

  // ── 묶음 생성 (3/6/12장) — 유료 전용 ──
  // picbox/claire 와 동일한 요금표. 많이 만들수록 장당 단가가 싸진다.
  // 무료 한도(하루 1장)로는 애초에 불가능하므로 크레딧/무제한만 허용한다.
  if (batchCount > 1) {
    if (!unlimited && !useCredit) {
      return res.status(402).json({
        error: `${batchCount}장 만들기는 크레딧이 필요해요.\n크레딧을 충전하면 한 번에 여러 장을 만들 수 있어요.`,
        credits: creditsLeft,
        needed: batchCost,
      });
    }
    // ⚠️ 비싼 생성 호출 전에 원자적으로 예약한다. 나중에 차감하면 동시 요청이
    //    같은 잔액을 두 번 쓰는 레이스가 생긴다. 실패분은 아래에서 환불.
    if (!unlimited) {
      const reserved = await consumeCredits(admin, user.id, batchCost);
      if (!reserved) {
        return res.status(429).json({
          error: `크레딧이 부족해요. ${batchCount}장 만들기엔 ${batchCost}개가 필요해요.`,
          credits: creditsLeft,
          needed: batchCost,
        });
      }
      creditsLeft = Math.max(0, creditsLeft - batchCost);
    }

    // 한 장 생성 = Vertex 우선, 실패 시 AI Studio. (단건 경로와 같은 순서)
    async function oneShot() {
      if (vertexSA()) {
        const r = await callVertexBackoff(PRO_MODEL, true, budget(90000));
        if (!isBusyFailure(r)) return r;
      }
      const r2 = await callGemini(PRO_MODEL, true, budget(40000));
      if (!isBusyFailure(r2)) return r2;
      return await callGemini(BASE_MODEL, false, budget(30000));
    }

    // ⚠️ 예전엔 batchCount 를 전부 동시에 던졌는데, 12장이면 Vertex 분당 한도에
    //    걸려 429 가 쏟아진다(실측 2026-08-13). 4개씩 나눠 보낸다.
    //    장당 ~42s 이므로 12장 = 3파 × 42s ≈ 126s — 예산 200s 안에 들어온다.
    const CONCURRENCY = 4;
    const settled = [];
    for (let i = 0; i < batchCount; i += CONCURRENCY) {
      const n = Math.min(CONCURRENCY, batchCount - i);
      const wave = await Promise.all(
        Array.from({ length: n }, () => oneShot().catch(() => null))
      );
      settled.push(...wave);
      // 다음 파 전에 잠깐 쉬어 분당 한도에 여유를 준다
      if (i + CONCURRENCY < batchCount && left() > 20000) await sleep(1200);
    }

    const images = [];
    for (const r of settled) {
      if (isBusyFailure(r) || !r?.upstream?.ok) continue;
      let j = null;
      try { j = await r.upstream.json(); } catch (_) { continue; }
      const part = (j?.candidates?.[0]?.content?.parts || [])
        .find((x) => x.inlineData || x.inline_data);
      if (!part) continue;
      const inline = part.inlineData || part.inline_data;
      let rawMime = inline.mimeType || inline.mime_type || "image/png";
      let rawOut = inline.data;
      // 결제로 만든 것만 깨끗하다 — 원본에 찍어야 갤러리 다운로드로 우회되지 않는다
      if (!useCredit) {
        const wm = await applyWatermark(rawOut, rawMime);
        rawOut = wm.base64; rawMime = wm.mime;
      }
      const small = await shrinkOutput(rawOut, rawMime);
      let gId = null, gExp = null;
      try {
        const saved = await saveToGallery(admin, user, {
          conceptId: conceptId || 0, conceptTitle: conceptTitle || null,
          base64: rawOut, mimeType: rawMime,
        });
        if (saved.ok) { gId = saved.id; gExp = saved.expiresAt; }
      } catch (_) { /* 갤러리 저장 실패가 응답을 막지 않는다 */ }
      images.push({
        base64: small.base64, mimeType: small.mime,
        galleryId: gId, galleryExpiresAt: gExp,
      });
    }

    // 부분 실패 환불 — 만들어진 만큼만 받는다.
    if (!unlimited && images.length < batchCount) {
      const refundUnits = images.length === 0
        ? batchCost
        : batchCost - Math.ceil((batchCost * images.length) / batchCount);
      if (refundUnits > 0) {
        await refundCredits(admin, user.id, refundUnits).catch(() => {});
        creditsLeft += refundUnits;
      }
    }
    console.log(`[generate] batch ${batchCount}장 요청 → 성공 ${images.length} | cost=${batchCost}`);

    if (images.length === 0) {
      return res.status(503).json({
        error: "지금 이미지 서버가 많이 붐비고 있어요.\n1~2분 뒤에 다시 시도해 주세요.\n크레딧은 차감되지 않았어요 🙂",
        busy: true, credits: creditsLeft,
      });
    }
    if (images.length > 0) {
      admin.from("usage_log").insert({ user_id: user.id }).then(() => {}).catch(() => {});
    }
    await notifyDone(pushToken, images.length, conceptTitle);
    return res.status(200).json({
      images,
      requested: batchCount,
      produced: images.length,
      credits: creditsLeft,
      unlimited,
      // 구버전 앱 호환 — images 를 모르는 클라이언트도 첫 장은 받는다
      base64: images[0].base64,
      mimeType: images[0].mimeType,
      galleryId: images[0].galleryId,
      galleryExpiresAt: images[0].galleryExpiresAt,
      engine: "pro",
    });
  }

  if (useProEngine) {
    // 1) Vertex 로 나노바나나 프로 (1순위).
    //    실측 ~29s 로 느리므로 넉넉히 주되, 실패 시 AI Studio 몫을 남겨둔다.
    if (vertexSA()) {
      result = await callVertexBackoff(PRO_MODEL, true, budget(90000));
      if (!isBusyFailure(result)) {
        console.log("[generate] Vertex 3-pro 성공");
      } else {
        console.error("[generate] Vertex 3-pro 실패:",
          result.networkError?.message || `HTTP ${result.upstream?.status}`);
      }
    }

    // 2) Vertex 가 없거나 실패하면 AI Studio 로 같은 모델 재시도.
    if (!result || isBusyFailure(result)) {
      const r2 = await proWithRetries(10000);
      if (r2) result = r2;
    }

    // 3) 그래도 안 되면 하위 모델 폴백. 유저는 에러 대신 사진을 받는다.
    //    폴백으로 나간 요청은 크레딧/무료체험/하루한도를 전혀 차감하지 않는다(아래 6번 참고).
    if (isBusyFailure(result)) {
      console.error("[generate] 3-pro 전 경로 실패 → 하위 모델 폴백");
      engineUsed = "base";
      busyFallback = true;
      result = await baseThenLegacy(Math.max(6000, left() - 3000));
    }
  } else {
    result = await baseThenLegacy(24000);
  }

  // ⚠️ 여기까지 왔다는 건 폴백·재시도까지 전부 실패했다는 뜻이다.
  //    예전엔 Gemini 원문 JSON("503 UNAVAILABLE...", "This operation was aborted")을
  //    그대로 화면에 뿌려서, 사용자는 무슨 일인지도 모르고 차감됐는지도 알 수 없었다.
  //    → 사람이 읽을 수 있는 안내 + "차감 안 됨" 을 명시한다. (실제로 차감은 이 아래에서 일어난다)
  const BUSY_MSG =
    "지금 이미지 서버가 많이 붐비고 있어요.\n1~2분 뒤에 다시 시도해 주세요.\n크레딧은 차감되지 않았어요 🙂";

  if (!result || result.networkError || !result.upstream) {
    console.error("[generate] 최종 실패(네트워크):",
      result?.networkError?.message || result?.networkError || "시도 없음");
    return res.status(503).json({
      error: BUSY_MSG,
      busy: true,
      quotaUsed: unlimited ? 0 : usage.count,
      quotaLimit: unlimited ? null : dailyLimit,
      unlimited,
    });
  }
  const upstream = result.upstream;

  if (!upstream.ok) {
    const raw = await upstream.text().catch(() => "");
    console.error("[generate] 최종 실패:", upstream.status, raw.slice(0, 300));
    // 혼잡 계열(5xx/404)은 사용자 잘못이 아니므로 안내 문구로, 그 외(400 등)만 원문을 보여준다.
    if (upstream.status === 404 || upstream.status >= 500) {
      return res.status(503).json({
        error: BUSY_MSG,
        busy: true,
        quotaUsed: unlimited ? 0 : usage.count,
        quotaLimit: unlimited ? null : dailyLimit,
        unlimited,
      });
    }
    return res.status(upstream.status).json({
      error: "이미지를 만들지 못했어요 (오류 " + upstream.status + ")\n크레딧은 차감되지 않았어요.",
      detail: raw.slice(0, 500),
    });
  }

  const json = await upstream.json();
  const parts = json?.candidates?.[0]?.content?.parts || [];
  const imgPart = parts.find((p) => p.inlineData || p.inline_data);

  // 5) 이미지가 안 왔으면 (pre-check 통과했는데 본 모델이 거절/실패 — 드뭄)
  //    → 차감 X (우리가 OK 라고 했으니 책임 우리쪽)
  if (!imgPart) {
    const textPart = parts.find((p) => p.text);
    return res.status(502).json({
      error: textPart?.text
        ? "이미지 생성에 실패했어요: " + textPart.text.slice(0, 120)
        : "이미지를 만들지 못했어요. 다른 컨셉으로 시도해 주세요.",
      quotaUsed: unlimited ? 0 : usage.count,
      quotaLimit: unlimited ? null : dailyLimit,
      unlimited,
    });
  }

  // 6) 성공 → 사용 기록 (크레딧 사용 시 크레딧 차감, 아니면 오늘 한도 차감)
  //    Pro 혼잡 폴백(busyFallback)이면 무과금 — 크레딧/무료체험/하루한도 아무 것도 차감하지 않는다.
  if (!unlimited) {
    if (freeProSample) {
      // 무료 Pro 체험: 차감·한도기록 없이 "1회 소진"만 표시.
      // 폴백(base 로 나감)이면 체험을 안 쓴 것이므로 소진 처리하지 않는다.
      if (!busyFallback) await markProSampleUsed(admin, user.id);
    } else if (useCredit) {
      // 크레딧은 폴백이면 면제 — 사용자에게 "차감되지 않았어요"라고 고지한다.
      if (!busyFallback) {
        await consumeCredit(admin, user.id);
        creditsLeft = Math.max(0, creditsLeft - 1);
      }
    } else {
      // ⚠️ 무료 한도는 폴백이어도 차감한다. 예전엔 busyFallback 이면 이 insert 까지
      //    건너뛰어서, Pro 가 혼잡한 동안(재시도 계층이 3겹일 만큼 흔하다) 무료
      //    사용자가 하루 한도 없이 무제한 생성할 수 있었다 — 이미지는 실제로
      //    나가므로 API 비용은 그대로 발생한다. 크레딧 면제와 한도 기록은 별개다.
      await admin
        .from("usage_log")
        .insert({ user_id: user.id })
        .then(() => {})
        .catch((e) => console.error("usage_log insert 실패:", e));
    }
  }

  const inline = imgPart.inlineData || imgPart.inline_data;
  // let — 아래 워터마크 단계에서 mime 이 바뀔 수 있다
  let rawMime = inline.mimeType || inline.mime_type || "image/png";

  // 6.4) 사진 복원: 결과를 "올린 사진과 똑같은 비율"로 가운데 크롭.
  //      Gemini 가 편집 모드에서 입력 비율을 대체로 유지하지만 프리셋으로 스냅되는
  //      경우가 있어 원본 구도가 틀어진다. 여기서 맞춰 두면 응답·갤러리 원본이
  //      모두 정확해지고, 구버전 앱에서도 저장본은 제대로 나온다.
  let rawData = inline.data;
  if (isRestore) {
    rawData = await cropToRatio(rawData, srcAspect(base64, mimeType));
  }

  // 6.4) 워터마크 — 결제(크레딧)로 만든 것만 깨끗하다.
  //      축소 전 원본에 찍어야 아래 갤러리 저장분에도 함께 들어간다.
  if (!useCredit) {
    const wm = await applyWatermark(rawData, rawMime);
    rawData = wm.base64; rawMime = wm.mime;
  }

  // 6.5) 응답 전 이미지 축소 (Vercel 4.5MB 한도 초과로 본문 잘리는 "오류 200" 방지 + 전송 속도↑)
  //      응답(화면 표시)만 축소. 갤러리/다운로드는 아래에서 원본 그대로 저장.
  const small = await shrinkOutput(rawData, rawMime);
  const outMime = small.mime;
  const outData = small.base64;

  // 7) 결과를 갤러리에 1시간 보관 — ⚠️ 원본 화질로 저장 (갤러리 다운로드 = 원본).
  //    갤러리는 Supabase signed URL 직접 다운로드라 Vercel 응답 한도와 무관.
  let galleryId = null;
  let galleryExpiresAt = null;
  try {
    const saved = await saveToGallery(admin, user, {
      conceptId: conceptId || 0,
      conceptTitle: conceptTitle || null,
      base64: rawData,
      mimeType: rawMime,
    });
    if (saved.ok) {
      galleryId = saved.id;
      galleryExpiresAt = saved.expiresAt;
    } else {
      console.error("[gallery save failed]", saved.error);
    }
  } catch (e) {
    console.error("[gallery save throw]", e?.message || e);
  }

  // 무료 유저가 아직 무료 Pro 체험을 쓸 수 있는지 (결과화면 CTA 노출용).
  //  - 방금 생성이 Pro로 실제로 완료된 게 아닐 때만 의미(폴백으로 base가 나간 경우도 포함 — 안 썼으니 여전히 가능).
  let proSampleAvailable = false;
  if (!unlimited && engineUsed !== "pro") {
    proSampleAvailable = !(await getProSampleUsed(admin, user.id));
  }

  await notifyDone(pushToken, 1, conceptTitle);
  return res.status(200).json({
    mimeType: outMime,
    base64: outData,
    quotaUsed: unlimited ? 0 : (useCredit || freeProSample) ? usage.count : usage.count + 1,
    quotaLimit: unlimited ? null : dailyLimit,
    usedCredit: useCredit,
    credits: unlimited ? null : creditsLeft,
    unlimited,
    engine: engineUsed,
    // Pro 혼잡으로 base 로 대체된 경우만 true — 클라가 "크레딧 안 썼어요" 고지에 사용.
    busyFallback,
    proSample: freeProSample,
    proSampleAvailable,
    galleryId,
    galleryExpiresAt,
  });
}
