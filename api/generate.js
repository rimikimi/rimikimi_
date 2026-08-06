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
import { getCreditInfo, consumeCredit, getProSampleUsed, markProSampleUsed } from "./_lib/credits.js";
import { saveToGallery } from "./_lib/gallery.js";

// Pro 모델(gemini-3-pro-image)이 느릴 때(~25s) 함수가 타임아웃되지 않도록 상향.
// (Vercel Hobby 최대 60s)
export const config = { maxDuration: 60 };

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
            "오늘의 무료 한도를 모두 사용했어요.\n친구 2명을 초대하면 크레딧 1개가 생겨요!",
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
    // 커플: 두 번째 참조 사진(상대). 프롬프트가 "first/second reference image" 를
    // 지칭하므로 반드시 base64 → base64_2 순서로 넣는다.
    mimeType2, base64_2,
  } = req.body || {};
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

  const conceptInstruction = isFourcut
    ? fourcutInstruction
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
      "while transforming the medium/style. Apply the following style:\n" + prompt
    : hasSecond
    ? "Using the TWO people in the two provided reference photos, generate a single new photograph " +
      "containing BOTH of them together. The FIRST reference image is the first person and the " +
      "SECOND reference image is the second person — keep each person's own face, identity and " +
      "facial features clearly recognizable, and never merge, swap or blend the two faces. " +
      "Exactly two people in frame. Apply the following concept:\n" + prompt
    : "Using the person in the provided photo, generate a new portrait. " +
      "Keep the same face, identity, and facial features clearly recognizable. " +
      "Apply the following concept:\n" + prompt;

  // PHOTOREALISM(AI 티 억제)은 아트 스타일 변환 모드(skipFacePrecheck)만 제외하고 전 모드에 적용.
  //   제외 이유: 그 모드는 "일러스트/회화 등 다른 매체로 재해석"이 목적이라 "반드시 실제 사진처럼
  //   보여야 한다(not an illustration, not a digital painting)"는 지시와 정면 충돌한다.
  const instruction = skipFacePrecheck ? conceptInstruction : PHOTOREALISM + conceptInstruction;

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
        ],
      },
    ],
    // Pro 는 2K 고해상도로. (기본 모델은 편집모드 비율보존 위해 설정 생략 — 기존 동작 유지)
    ...(isPro ? { generationConfig: { imageConfig: { imageSize: "2K" } } } : {}),
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
    return up.status === 404 || (up.status >= 500 && up.status <= 599);
  }

  // 남은 시간 예산. Vercel maxDuration 60s 안에서 (여러 번의 생성 시도 +
  // precheck·갤러리저장 여유)가 전부 끝나야 한다.
  // ⚠️ 함수 전체가 60s(maxDuration) 안에 끝나야 한다. 여기 도달하기 전에 이미
  //    얼굴 사전검사(~2~4s)를 썼고, 이후에도 축소·갤러리 저장이 남는다.
  //    50s 로 뒀다가 실측에서 "Task timed out after 60 seconds" 가 나서 40s 로 낮춘다.
  //    (타임아웃되면 응답 자체가 없어 클라가 "네트워크 요청 실패" 를 띄운다 — 최악)
  const DEADLINE = Date.now() + 46000;
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

  if (useProEngine) {
    // 1) Vertex 로 나노바나나 프로 (1순위).
    //    실측 ~29s 로 느리므로 넉넉히 주되, 실패 시 AI Studio 몫을 남겨둔다.
    if (vertexSA()) {
      result = await callVertex(PRO_MODEL, true, budget(42000));
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
  if (!unlimited && !busyFallback) {
    if (freeProSample) {
      // 무료 Pro 체험: 차감·한도기록 없이 "1회 소진"만 표시
      await markProSampleUsed(admin, user.id);
    } else if (useCredit) {
      await consumeCredit(admin, user.id);
      creditsLeft = Math.max(0, creditsLeft - 1);
    } else {
      await admin
        .from("usage_log")
        .insert({ user_id: user.id })
        .then(() => {})
        .catch((e) => console.error("usage_log insert 실패:", e));
    }
  }

  const inline = imgPart.inlineData || imgPart.inline_data;
  const rawMime = inline.mimeType || inline.mime_type || "image/png";

  // 6.4) 사진 복원: 결과를 "올린 사진과 똑같은 비율"로 가운데 크롭.
  //      Gemini 가 편집 모드에서 입력 비율을 대체로 유지하지만 프리셋으로 스냅되는
  //      경우가 있어 원본 구도가 틀어진다. 여기서 맞춰 두면 응답·갤러리 원본이
  //      모두 정확해지고, 구버전 앱에서도 저장본은 제대로 나온다.
  let rawData = inline.data;
  if (isRestore) {
    rawData = await cropToRatio(rawData, srcAspect(base64, mimeType));
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
