// ============================================================
// 커스텀 보정 (매직 부스, 컨셉 mode "retouch") — 서버 쪽 · 2026-09-30
//
// 사용자가 사진 + 고치고 싶은 내용을 **아무 언어로 자유롭게** 쓰면:
//   1) flash — 의도 파악 + 안전 판정 + 고칠 영역·보호할 얼굴 박스를 한 번에 (사진을 보면서)
//   2) Pro 이미지 — 말한 부분만 고치라는 지시로 편집(2K, 원본 비율)
//   3) 합성 — **고친 부분만** 원본에 붙인다. 영역 밖·얼굴(요청이 얼굴을 바꾸는 게 아니면)은 원본 픽셀 그대로.
// 프로토타입: scripts/retouch-proto (composite.py) — 여기는 그 JS 이식판이다(서버에 OpenCV 없음).
// SIFT 정렬은 뺐다: 같은 비율로 늘여 맞추면 실측 평균 1~2px 어긋나고, 붙이는 경계는 페더로 덮인다.
//
// 사진은 이 요청에서만 쓰고 여기서는 저장하지 않는다(갤러리 저장은 generate.js 가 다른 컨셉과 똑같이).
// ============================================================

const PLAN_SCHEMA = {
  type: "OBJECT",
  required: ["allowed", "lang", "summary", "scope", "keep_detail", "edits", "keep", "regions", "protect"],
  properties: {
    allowed: { type: "BOOLEAN" },
    scope: { type: "STRING" },
    keep_detail: { type: "BOOLEAN" },
    refusal: { type: "STRING" },
    lang: { type: "STRING" },
    summary: { type: "STRING" },
    edits: { type: "ARRAY", items: { type: "STRING" } },
    keep: { type: "ARRAY", items: { type: "STRING" } },
    regions: { type: "ARRAY", items: { type: "OBJECT", required: ["label", "box_2d"], properties: { label: { type: "STRING" }, box_2d: { type: "ARRAY", items: { type: "INTEGER" } } } } },
    protect: { type: "ARRAY", items: { type: "OBJECT", required: ["label", "box_2d"], properties: { label: { type: "STRING" }, box_2d: { type: "ARRAY", items: { type: "INTEGER" } } } } },
  },
};

function planPrompt(text) {
  return `You are a professional photo retoucher. A customer sent this photo with the request below.
It may be written casually and in any language. Read the context and intent, not just the literal words.

Customer request:
"""${String(text).slice(0, 1000)}"""

1) SAFETY — set "allowed": false (and write "refusal": one polite sentence in the customer's language) if the request asks to:
   remove or reduce clothing, make anyone nude or sexual, sexualize anyone, alter a minor's body; make a person look like a different
   or specific real person (face swap); add weapons, blood, injuries or violence; add hateful symbols; create or alter official
   documents, IDs or text meant to deceive. Otherwise "allowed": true and "refusal": "".
2) PLAN — "edits": precise English edit instructions tied to what is visible in THIS photo (only what was asked or clearly implied,
   no extra "improvements"); "keep": what must stay exactly the same; "summary": one or two polite sentences in the SAME language as
   the request saying what will be fixed; "lang": language code of the request.
   "scope": "global" if the request changes the look of the WHOLE photo — time of day (e.g. night, sunset), weather, season, overall
   lighting or mood, color grade/filter look, or the entire background; otherwise "local" (specific people, objects or areas).
   "keep_detail": true when a "global" change only changes light, time of day, color or mood and adds or removes nothing
   (e.g. make it daytime/night/sunset, warmer, film look); false when it adds or removes things or textures
   (rain, snow, fog, new objects, removing a person, a new background). For "local" requests set false.
3) REGIONS — "regions": tight boxes around the areas the edits touch (including where changed things will end up), and nothing else.
   "protect": a tight box around every person's face (forehead to chin, ear to nose tip) that the edits do NOT explicitly change.
   Boxes are [ymin, xmin, ymax, xmax] normalized 0-1000.
Return JSON only.`;
}

export function editPrompt(plan) {
  if (plan.scope === "global") {
    return `Edit this exact photograph. This is an edit of the provided photo, not a new photo.

Apply these changes to the WHOLE photo, clearly and convincingly — the change must be obvious at first glance (for weather: clearly visible
rain streaks or falling snow, wet or snowy surfaces; for time of day: the sky, light and shadows all match), not a subtle tweak:
${plan.edits.map((e) => "- " + e).join("\n")}

Keep:
${(plan.keep || []).map((e) => "- " + e).join("\n")}
- The same framing, crop, camera angle and composition; everyone the changes above do not remove stays in the same pose and position
- The same faces and identities (same face shape, eyes, nose, mouth, age), same body shapes and the same clothing
- Relight the people naturally to match the new light and atmosphere (it must look like one real photo, not a pasted cut-out)
(Each "same" rule above yields only where a change above explicitly asks for it — every listed change must be done, including removals.)
When removing someone or something, fill the space only with the background that would naturally be behind it — never put a new person, animal or object in its place.
Photorealistic, like the same real photo re-shot or re-graded by a skilled photographer. No added objects, no text, no watermark, no frame or border.`;
  }
  return `Retouch this exact photograph. This is an edit of the provided photo, not a new photo.

Apply ONLY these changes:
${plan.edits.map((e) => "- " + e).join("\n")}

Keep everything else exactly as it is in the original:
${(plan.keep || []).map((e) => "- " + e).join("\n")}
- Same framing, crop, camera angle and composition; the same people in the same poses and positions
- Same faces and identities (same face shape, eyes, nose, mouth, age), same body shapes, same clothing
- Same lighting direction, exposure, white balance, color grading, contrast and photo texture
- Same background and scenery
(Each "same" rule above yields only where an edit above explicitly asks for that change.)
When removing something, fill the space only with the background that would naturally be behind it — never put a new person, animal or object in its place.
The result must look like the same real photo after a skilled human retoucher's careful work: photorealistic, no painted or AI look, no added objects, no text, no watermark, no frame or border.`;
}

const ASPECTS = [["1:1", 1], ["2:3", 2 / 3], ["3:2", 3 / 2], ["3:4", 3 / 4], ["4:3", 4 / 3], ["4:5", 4 / 5], ["5:4", 5 / 4], ["9:16", 9 / 16], ["16:9", 16 / 9]];
export const nearestAspect = (w, h) =>
  ASPECTS.reduce((b, a) => (Math.abs(Math.log(a[1] / (w / h))) < Math.abs(Math.log(b[1] / (w / h))) ? a : b))[0];

async function gemini(apiKey, model, body, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const up = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body), signal: controller.signal,
    });
    if (!up.ok) return null;
    return await up.json().catch(() => null);
  } catch (_) { return null; } finally { clearTimeout(timer); }
}

const cleanBoxes = (arr) => (Array.isArray(arr) ? arr : [])
  .filter((g) => Array.isArray(g?.box_2d) && g.box_2d.length === 4 && g.box_2d.every((v) => Number.isFinite(v)))
  .map((g) => ({ label: String(g.label || "").slice(0, 40), box_2d: g.box_2d.map((v) => Math.max(0, Math.min(1000, Math.round(v)))) }))
  .filter((g) => g.box_2d[2] > g.box_2d[0] && g.box_2d[3] > g.box_2d[1]);

export async function planRetouch(apiKey, jpegB64, text) {
  const j = await gemini(apiKey, "gemini-3-flash-preview", {
    contents: [{ role: "user", parts: [{ inline_data: { mime_type: "image/jpeg", data: jpegB64 } }, { text: planPrompt(text) }] }],
    generationConfig: { responseMimeType: "application/json", responseSchema: PLAN_SCHEMA, thinkingConfig: { thinkingLevel: "low" } },
  }, 30000);
  if (!j) return null;
  try {
    const p = JSON.parse((j?.candidates?.[0]?.content?.parts || []).map((x) => x.text || "").join(""));
    return {
      allowed: p.allowed !== false,
      refusal: String(p.refusal || ""),
      lang: String(p.lang || ""),
      summary: String(p.summary || "").slice(0, 400),
      scope: p.scope === "global" ? "global" : "local",
      keepDetail: p.scope === "global" && p.keep_detail === true,
      edits: (p.edits || []).map(String).filter(Boolean).slice(0, 12),
      keep: (p.keep || []).map(String).filter(Boolean).slice(0, 12),
      regions: cleanBoxes(p.regions),
      protect: cleanBoxes(p.protect),
    };
  } catch (_) { return null; }
}

export async function editImage(apiKey, jpegB64, aspect, prompt) {
  const body = (cfg) => ({
    contents: [{ role: "user", parts: [{ inline_data: { mime_type: "image/jpeg", data: jpegB64 } }, { text: prompt }] }],
    generationConfig: { responseModalities: ["IMAGE"], ...(cfg ? { imageConfig: { imageSize: "2K", aspectRatio: aspect } } : {}) },
  });
  const pick = (j) => {
    const p = (j?.candidates?.[0]?.content?.parts || []).find((x) => x.inlineData || x.inline_data);
    return p ? (p.inlineData || p.inline_data).data : null;
  };
  // 채워 맞춤(outpaint)과 같은 사다리: Pro 60s → Pro 40s → Flash 이미지 30s
  let out = pick(await gemini(apiKey, "gemini-3-pro-image", body(true), 60000));
  if (!out) out = pick(await gemini(apiKey, "gemini-3-pro-image", body(true), 40000));
  if (!out) out = pick(await gemini(apiKey, "gemini-3.1-flash-image", body(false), 30000));
  return out;
}

/* ---------- 합성 (composite.py 의 JS 이식) ---------- */
function boxSizesForGauss(sigma, n = 3) {
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(wIdeal); if (wl % 2 === 0) wl--;
  const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
  return Array.from({ length: n }, (_, i) => (i < m ? wl : wl + 2));
}
function boxH(src, dst, w, h, r) {
  const div = r * 2 + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w; let s = 0;
    for (let i = -r; i <= r; i++) s += src[row + Math.min(w - 1, Math.max(0, i))];
    for (let x = 0; x < w; x++) { dst[row + x] = s / div; s += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)]; }
  }
}
function boxV(src, dst, w, h, r) {
  const div = r * 2 + 1;
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let i = -r; i <= r; i++) s += src[Math.min(h - 1, Math.max(0, i)) * w + x];
    for (let y = 0; y < h; y++) { dst[y * w + x] = s / div; s += src[Math.min(h - 1, y + r + 1) * w + x] - src[Math.max(0, y - r) * w + x]; }
  }
}
function gauss(src, w, h, sigma) {
  let a = Float32Array.from(src);
  if (sigma < 0.5) return a;
  const b = new Float32Array(a.length);
  for (const size of boxSizesForGauss(sigma)) { const r = (size - 1) >> 1; if (r < 1) continue; boxH(a, b, w, h, r); boxV(b, a, w, h, r); }
  return a;
}
const thresholdPlane = (p, t) => { const o = new Float32Array(p.length); for (let i = 0; i < p.length; i++) o[i] = p[i] > t ? 1 : 0; return o; };
const dilate = (m, w, h, r) => thresholdPlane(gauss(m, w, h, r / 2), 0.08);
const erode = (m, w, h, r) => thresholdPlane(gauss(m, w, h, r / 2), 0.92);

// sRGB → Lab (감마 풀기는 256칸 표로 — 픽셀마다 pow 를 부르면 수 초가 걸린다, 실측 2026-09-30)
const LIN = new Float32Array(256).map((_, v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
const labF = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
function toLab(r, g, b, out) {
  const R = LIN[r], G = LIN[g], B = LIN[b];
  const X = labF((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047);
  const Y = labF(0.2126 * R + 0.7152 * G + 0.0722 * B);
  const Z = labF((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
  out[0] = 116 * Y - 16; out[1] = 500 * (X - Y); out[2] = 200 * (Y - Z);
}

// RGB 를 k×k 평균으로 줄인다(마스크 계산용)
function shrinkRGB(src, w, h, k) {
  const sw = Math.ceil(w / k), sh = Math.ceil(h / k);
  const out = new Float32Array(sw * sh * 3), cnt = new Float32Array(sw * sh);
  for (let y = 0; y < h; y++) {
    const yy = (y / k) | 0;
    for (let x = 0; x < w; x++) {
      const j = yy * sw + ((x / k) | 0), i = (y * w + x) * 3;
      out[j * 3] += src[i]; out[j * 3 + 1] += src[i + 1]; out[j * 3 + 2] += src[i + 2]; cnt[j]++;
    }
  }
  for (let j = 0; j < sw * sh; j++) { const c = cnt[j] || 1; out[j * 3] /= c; out[j * 3 + 1] /= c; out[j * 3 + 2] /= c; }
  return { px: out, sw, sh };
}

/* ---------- 정렬 — AI 가 사진을 다시 잡아(확대·이동) 돌려줄 때 ---------- */
// 9/30 셔츠 테스트: Pro 가 인물을 12% 작게·위로 옮겨 돌려줘서(12가지 중 1가지), 셔츠 박스만 붙이자 머리카락이
// 박스 윗변에서 일자로 잘리고 옷깃이 두 겹이 됐다. 대부분은 1~2px 이라 늘여 맞추기로 충분했지만(SIFT 를 뺀 이유)
// 이런 경우를 잡으려고 배율(가운데 기준)+이동을 거친→고운 탐색으로 찾는다. 윤곽(기울기 크기)의 NCC 라
// AI 가 톤·색을 바꿔도(밤·흑백) 맞출 수 있고, 요청 영역(+4%)은 내용이 바뀌는 곳이라 빼고 잰다.
// 배율·이동이 둘 다 분리 가능(x 는 x 만, y 는 y 만)이라 옮기기도 줄마다 싸다.
function lumaGrad(src, w, h, k) {
  const { px, sw, sh } = shrinkRGB(src, w, h, k);
  const g = new Float32Array(sw * sh);
  for (let j = 0; j < sw * sh; j++) g[j] = 0.299 * px[j * 3] + 0.587 * px[j * 3 + 1] + 0.114 * px[j * 3 + 2];
  const o = new Float32Array(sw * sh);
  for (let y = 1; y < sh - 1; y++) for (let x = 1; x < sw - 1; x++) {
    const i = y * sw + x, gx = g[i + 1] - g[i - 1], gy = g[i + sw] - g[i - sw];
    o[i] = Math.sqrt(gx * gx + gy * gy);
  }
  return { g: gauss(o, sw, sh, 1), sw, sh };
}
function nccAt(A, B, W, H, mask, s, tx, ty, step) {
  const cx = W / 2, cy = H / 2;
  let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
  for (let y = 2; y < H - 2; y += step) {
    let fy = s * (y - cy) + cy + ty;
    if (fy < 0) fy = 0; else if (fy > H - 1.001) fy = H - 1.001;
    const y0 = fy | 0, wy = fy - y0;
    for (let x = 2; x < W - 2; x += step) {
      const i = y * W + x;
      if (!mask[i]) continue;
      let fx = s * (x - cx) + cx + tx;
      if (fx < 0) fx = 0; else if (fx > W - 1.001) fx = W - 1.001;
      const x0 = fx | 0, wx = fx - x0, k = y0 * W + x0;
      const b = (B[k] * (1 - wx) + B[k + 1] * wx) * (1 - wy) + (B[k + W] * (1 - wx) + B[k + W + 1] * wx) * wy;
      const a = A[i];
      n++; sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b;
    }
  }
  if (n < 50) return -1;
  const va = saa - sa * sa / n, vb = sbb - sb * sb / n;
  return (sab - sa * sb / n) / Math.sqrt(Math.max(1e-9, va * vb));
}
/** 반환: null(그대로 두면 됨) 또는 { s, tx, ty } — 원본 좌표 (x,y) 에 놓을 E 의 좌표 = s·(x−cx)+cx+tx (원본 픽셀) */
export function alignEdit(O, E, w, h, regions, scope) {
  const levels = [[160, 0.15, 0.02, 10, 2, 2], [160, 0.02, 0.01, 2, 1, 2], [320, 0.01, 0.004, 3, 1, 2], [640, 0.004, 0.002, 2, 1, 2]];
  let best = { s: 1, tx: 0, ty: 0 }, prevW = 0, gain = 0, W = 0, H = 0;
  for (const [L, sR, sS, tR, tS, step] of levels) {
    const k = Math.max(1, Math.ceil(Math.max(w, h) / L));
    const a = lumaGrad(O, w, h, k), b = lumaGrad(E, w, h, k);
    W = a.sw; H = a.sh;
    const mask = new Uint8Array(W * H).fill(1);
    if (scope !== "global") for (const g of regions) {
      const [y0, x0, y1, x1] = g.box_2d;
      const ya = Math.max(0, Math.floor((y0 / 1000 - 0.04) * H)), yb = Math.min(H, Math.ceil((y1 / 1000 + 0.04) * H));
      const xa = Math.max(0, Math.floor((x0 / 1000 - 0.04) * W)), xb = Math.min(W, Math.ceil((x1 / 1000 + 0.04) * W));
      for (let y = ya; y < yb; y++) mask.fill(0, y * W + xa, y * W + xb);
    }
    const r = prevW ? W / prevW : 1;                     // 이전 단계 이동값을 이 해상도로
    const c = { s: best.s, tx: best.tx * r, ty: best.ty * r };
    let b2 = { ...c, v: -2 };
    for (let sc = c.s - sR; sc <= c.s + sR + 1e-9; sc += sS)
      for (let ty = c.ty - tR; ty <= c.ty + tR + 1e-9; ty += tS)
        for (let tx = c.tx - tR; tx <= c.tx + tR + 1e-9; tx += tS) {
          const v = nccAt(a.g, b.g, W, H, mask, sc, tx, ty, step);
          if (v > b2.v) b2 = { s: sc, tx, ty, v };
        }
    best = b2; prevW = W;
    if (L === 640) gain = b2.v - nccAt(a.g, b.g, W, H, mask, 1, 0, 0, step);
  }
  const f = w / W;
  const out = { s: best.s, tx: best.tx * f, ty: best.ty * f };
  // 거의 제자리이거나 맞춰 봐도 나아지지 않으면 그대로(엉뚱하게 옮기지 않게)
  if (gain < 0.01 || (Math.abs(out.s - 1) < 0.003 && Math.abs(out.tx) < 1.5 && Math.abs(out.ty) < 1.5)) return null;
  return out;
}
export function warpRGB(E, w, h, { s, tx, ty }) {
  const out = Buffer.alloc(w * h * 3);
  const cx = w / 2, cy = h / 2;
  const X0 = new Int32Array(w), WX = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    let fx = s * (x - cx) + cx + tx;
    if (fx < 0) fx = 0; else if (fx > w - 1.001) fx = w - 1.001;
    X0[x] = fx | 0; WX[x] = fx - X0[x];
  }
  for (let y = 0; y < h; y++) {
    let fy = s * (y - cy) + cy + ty;
    if (fy < 0) fy = 0; else if (fy > h - 1.001) fy = h - 1.001;
    const y0 = fy | 0, wy = fy - y0, r0 = y0 * w, r1 = r0 + w;
    for (let x = 0; x < w; x++) {
      const x0 = X0[x], wx = WX[x], o = (y * w + x) * 3;
      const i00 = (r0 + x0) * 3, i01 = i00 + 3, i10 = (r1 + x0) * 3, i11 = i10 + 3;
      for (let c = 0; c < 3; c++) {
        const v = (E[i00 + c] * (1 - wx) + E[i01 + c] * wx) * (1 - wy) + (E[i10 + c] * (1 - wx) + E[i11 + c] * wx) * wy;
        out[o + c] = v + 0.5;
      }
    }
  }
  return out;
}

/**
 * O, E: 같은 w×h 의 RGB Uint8 (E 는 AI 결과를 원본 크기로 늘인 것). regions/protect: 0~1000 박스.
 * 마스크(어디를 붙일지)는 긴 변 ~1024 로 줄여서 계산하고 원본 크기로 부드럽게 늘린다 — 경계는 어차피 페더라
 * 화질 차이가 없고, 원본 크기로 하면 사진 한 장에 16초가 걸렸다(실측). 섞기(합성)는 원본 크기에서 한다.
 * 반환: { out: RGB Uint8, pasted: 붙인 면적 비율, same: 원본과 같은 픽셀 비율 }
 */
export function compositeRetouch(O, E, w, h, regions, protect, scope = "local", keepDetail = false) {
  const n = w * h;
  // ── 사진 전체를 바꾸는 요청(밤으로·눈 오는 날·색감 등) ──
  //    아래 "부분 편집" 방식(바뀐 곳만 붙이기 + 전체 색 이동 되돌리기)은 전체 변경을 도로 원본으로 돌려놓는다
  //    (오너 실측 2026-09-30 "완전 밤으로 바꾸진 않네?"). 전체 변경은 AI 결과를 그대로 쓰되,
  //    얼굴만 **조명·색(저주파)은 AI, 이목구비·피부결(고주파)은 원본** 으로 합친다 — 밤 조명을 받은 같은 사람.
  //    (얼굴을 원본 그대로 두면 어두운 장면에 낮 얼굴이 오려 붙인 것처럼 뜬다 — 재현 확인)
  if (scope === "global" && keepDetail) {
    // 빛·시간대·색만 바꾸는 요청(낮으로·밤으로·노을·필름톤): **조명(저주파)은 AI, 세부(고주파)는 원본** 을 사진 전체에.
    // AI 는 화면을 다시 그리면서 작은 글자를 깨뜨린다 — 9/30 오너 버스 사진 "대낮처럼": BYD→BVC, 서울→세종,
    // 스티커 문구 깨짐. 곱셈형(원본/원본저주파 비율)으로 옮겨야 어두운 곳의 세부도 새 밝기에 맞게 산다.
    // 눈·비·사람 지우기처럼 새로 그려 넣는 요청은 keepDetail=false(계획 단계에서 정함) — 옮기면 눈송이가 지워진다.
    const out = Buffer.alloc(n * 3);
    const sd = Math.max(2, Math.min(w, h) * 0.0023);            // 2000px 기준 3.5px — 글자 획 굵기
    for (let c = 0; c < 3; c++) {
      const oc = new Float32Array(n), ec = new Float32Array(n);
      for (let i = 0; i < n; i++) { oc[i] = O[i * 3 + c]; ec[i] = E[i * 3 + c]; }
      const ol = gauss(oc, w, h, sd), el = gauss(ec, w, h, sd);
      for (let i = 0; i < n; i++) {
        let r = (oc[i] + 8) / (ol[i] + 8);
        r = r < 0.6 ? 0.6 : r > 1.6 ? 1.6 : r;
        const v = el[i] * r;
        out[i * 3 + c] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
      }
    }
    return { out, pasted: 1, same: 0, thr: 0 };
  }
  if (scope === "global") {
    const out = Buffer.from(E);
    const shortF = Math.min(w, h);
    const sig = Math.max(4, shortF * 0.012);
    for (const g of protect) {
      const [y0, x0, y1, x1] = g.box_2d;
      const cx = (x0 + x1) / 2000 * w, cy = (y0 + y1) / 2000 * h;
      const ax = Math.max(2, (x1 - x0) / 2000 * w), ay = Math.max(2, (y1 - y0) / 2000 * h);
      const padc = Math.ceil(sig * 3);
      const xa = Math.max(0, Math.floor(cx - ax * 1.25) - padc), xb = Math.min(w, Math.ceil(cx + ax * 1.25) + padc);
      const ya = Math.max(0, Math.floor(cy - ay * 1.25) - padc), yb = Math.min(h, Math.ceil(cy + ay * 1.25) + padc);
      const cw = xb - xa, ch = yb - ya;
      if (cw < 8 || ch < 8) continue;
      const cn = cw * ch;
      const prot = new Float32Array(cn);
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
        const dx = (x + xa - cx) / ax, dy = (y + ya - cy) / ay;
        if (dx * dx + dy * dy <= 1) prot[y * cw + x] = 1;
      }
      const pb = gauss(prot, cw, ch, shortF * 0.012);
      for (let c = 0; c < 3; c++) {
        const oc = new Float32Array(cn), ec = new Float32Array(cn);
        for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
          const i = ((y + ya) * w + (x + xa)) * 3 + c;
          oc[y * cw + x] = O[i]; ec[y * cw + x] = E[i];
        }
        const ol = gauss(oc, cw, ch, sig), el = gauss(ec, cw, ch, sig);
        for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
          const j = y * cw + x, p = Math.min(1, pb[j] * 1.6);
          if (p <= 0.002) continue;
          const f = el[j] + (oc[j] - ol[j]);               // 조명은 AI, 디테일은 원본
          const i = ((y + ya) * w + (x + xa)) * 3 + c;
          const v = E[i] * (1 - p) + f * p;
          out[i] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
        }
      }
    }
    return { out, pasted: 1, same: 0, thr: 0 };
  }
  // 1) 색 맞춤 — 요청 영역 밖(바뀌면 안 되는 곳)에서 채널별 y = a·x + b (원본 크기, 표본만)
  const pad0 = 0.03;
  const inAllow = (x, y) => regions.some((g) => {
    const [y0, x0, y1, x1] = g.box_2d;
    return y >= (y0 / 1000 - pad0) * h && y <= (y1 / 1000 + pad0) * h && x >= (x0 / 1000 - pad0) * w && x <= (x1 / 1000 + pad0) * w;
  });
  const Ec = new Uint8ClampedArray(E);
  const idx = [];
  const stride = Math.max(1, Math.floor(n / 120000));
  for (let i = 0; i < n; i += stride) if (!inAllow(i % w, (i / w) | 0)) idx.push(i);
  if (idx.length > 500) {
    for (let c = 0; c < 3; c++) {
      let a = 1, b = 0, keep = idx;
      for (let it = 0; it < 4; it++) {
        let sx = 0, sy = 0, sxx = 0, sxy = 0;
        for (const i of keep) { const x = E[i * 3 + c], y = O[i * 3 + c]; sx += x; sy += y; sxx += x * x; sxy += x * y; }
        const m = keep.length, den = m * sxx - sx * sx;
        if (Math.abs(den) < 1e-6) break;
        a = (m * sxy - sx * sy) / den; b = (sy - a * sx) / m;
        const res = Float32Array.from(idx, (i) => Math.abs(O[i * 3 + c] - (a * E[i * 3 + c] + b))).sort();
        const lim = Math.max(6, 2.5 * res[res.length >> 1] * 1.4826);
        keep = idx.filter((i) => Math.abs(O[i * 3 + c] - (a * E[i * 3 + c] + b)) < lim);
        if (keep.length < 200) break;
      }
      if (a < 0.8 || a > 1.25 || Math.abs(b) > 40) continue; // 영역 밖을 AI 가 크게 바꿨다면 맞추지 않는다
      for (let i = 0; i < n; i++) Ec[i * 3 + c] = a * E[i * 3 + c] + b;
    }
  }

  // 2) 마스크는 줄인 크기에서
  const k = Math.max(1, Math.ceil(Math.max(w, h) / 1024));
  const So = shrinkRGB(O, w, h, k), Se = shrinkRGB(Ec, w, h, k);
  const sw = So.sw, sh = So.sh, sn = sw * sh, short = Math.min(sw, sh);
  const allow = new Uint8Array(sn);
  const pad = Math.round(short * pad0);
  for (const g of regions) {
    const [y0, x0, y1, x1] = g.box_2d;
    const ya = Math.max(0, Math.floor(y0 / 1000 * sh) - pad), yb = Math.min(sh, Math.ceil(y1 / 1000 * sh) + pad);
    const xa = Math.max(0, Math.floor(x0 / 1000 * sw) - pad), xb = Math.min(sw, Math.ceil(x1 / 1000 * sw) + pad);
    for (let y = ya; y < yb; y++) allow.fill(1, y * sw + xa, y * sw + xb);
  }
  //    차이(Lab 거리) → 블러 → 잡음 수준(허용 영역 밖 분포) 기준 문턱
  const lo = new Float32Array(3), le = new Float32Array(3);
  const D = new Float32Array(sn);
  for (let j = 0; j < sn; j++) {
    toLab(So.px[j * 3] | 0, So.px[j * 3 + 1] | 0, So.px[j * 3 + 2] | 0, lo);
    toLab(Se.px[j * 3] | 0, Se.px[j * 3 + 1] | 0, Se.px[j * 3 + 2] | 0, le);
    const d0 = lo[0] - le[0], d1 = lo[1] - le[1], d2 = lo[2] - le[2];
    D[j] = Math.sqrt(d0 * d0 + d1 * d1 + d2 * d2);
  }
  const Db = gauss(D, sw, sh, short * 0.004);
  const bgv = [];
  for (let j = 0; j < sn; j++) if (!allow[j]) bgv.push(Db[j]);
  const bg = Float32Array.from(bgv).sort();
  const med = bg.length ? bg[bg.length >> 1] : 0;
  const mad = bg.length ? Float32Array.from(bg, (v) => Math.abs(v - med)).sort()[bg.length >> 1] : 0;
  const thr = Math.max(6, med + 6 * mad * 1.4826);
  let m = new Float32Array(sn);
  for (let j = 0; j < sn; j++) m[j] = allow[j] && Db[j] > thr ? 1 : 0;
  //    잡티 제거(열기) → 틈 메우기(닫기) → 살짝 키우고 페더
  m = dilate(erode(m, sw, sh, 3), sw, sh, 3);
  const rc = Math.max(3, Math.round(short * 0.02));
  m = erode(dilate(m, sw, sh, rc), sw, sh, rc);
  const filled = dilate(m, sw, sh, Math.max(2, Math.round(short * 0.006)));
  const alphaS = gauss(filled, sw, sh, short * 0.006);
  const guard = dilate(filled, sw, sh, Math.max(2, Math.round(short * 0.015)));
  for (let j = 0; j < sn; j++) alphaS[j] = Math.min(1, alphaS[j] * guard[j]);
  //    + 요청 영역 전체(여유 4%·부드러운 경계) — 차이 문턱만 쓰면 잡티·얼룩·표정처럼 **옅은 변화**가 문턱 아래라
  //      통째로 버려진다(9/30 경우의 수 테스트: 벽 얼룩·피부·미소·"예쁘게" 가 0% 붙음). 요청한 자리는 AI 결과를 쓴다.
  const regPad = Math.round(short * 0.04);
  const reg = new Float32Array(sn);
  for (const g of regions) {
    const [y0, x0, y1, x1] = g.box_2d;
    const ya = Math.max(0, Math.floor(y0 / 1000 * sh) - regPad), yb = Math.min(sh, Math.ceil(y1 / 1000 * sh) + regPad);
    const xa = Math.max(0, Math.floor(x0 / 1000 * sw) - regPad), xb = Math.min(sw, Math.ceil(x1 / 1000 * sw) + regPad);
    for (let y = ya; y < yb; y++) reg.fill(1, y * sw + xa, y * sw + xb);
  }
  const regSoft = gauss(reg, sw, sh, short * 0.015);
  for (let j = 0; j < sn; j++) if (regSoft[j] > alphaS[j]) alphaS[j] = Math.min(1, regSoft[j]);
  //    이음매 보정(심리스 클로닝 근사) — AI 는 요청 영역을 고치면서 주변 톤까지 살짝 바꾸곤 한다(벽이 밝아짐 등).
  //    영역째 붙이면 네모난 자국이 보인다(9/30 벽 얼룩 테스트). 원본−AI 의 저주파 차이 D 를 영역 **밖**에서는 그대로,
  //    **안**에서는 경계값으로 푼 라플라스 막(부드럽게 이어지는 면)으로 채워 AI 결과에 더한다.
  //    ⚠️ 막을 영역 안쪽 끝까지 쓰면 **의도한 변화까지 되돌린다** — 경계가 바뀐 곳(셔츠 박스 윗변이 목깃,
  //    피부 박스 가장자리가 볼)을 지나면 경계값이 그 변화의 반대라서 안쪽이 원본 쪽으로 끌려간다.
  //    같은 AI 결과로 잰 값(9/30): 흰 셔츠 63%·피부 잡티 77% 만 남음 → 막을 **경계 띠(짧은 변 6%)** 에서만
  //    쓰고 안쪽으로 갈수록 0 으로 줄이면 100%·100%, 벽 얼룩(작은 박스라 거의 전부 띠)·사람 지우기는 그대로.
  const Dm = [0, 1, 2].map((c) => {
    const d = new Float32Array(sn);
    for (let j = 0; j < sn; j++) d[j] = So.px[j * 3 + c] - Se.px[j * 3 + c];
    return gauss(d, sw, sh, Math.max(1, short * 0.005));
  });
  const q = Math.max(1, Math.ceil(Math.max(sw, sh) / 128));
  const qw = Math.ceil(sw / q), qh = Math.ceil(sh / q), qn = qw * qh;
  const inside = new Uint8Array(qn);
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) if (reg[y * sw + x]) inside[((y / q) | 0) * qw + ((x / q) | 0)] = 1;
  const inner = gauss(reg, sw, sh, short * 0.03);               // 경계 0.5 → 안쪽 1
  const Cm = [0, 1, 2].map((c) => {
    const C = new Float32Array(qn), cnt = new Float32Array(qn);
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) { const k = ((y / q) | 0) * qw + ((x / q) | 0); C[k] += Dm[c][y * sw + x]; cnt[k]++; }
    for (let k = 0; k < qn; k++) C[k] /= cnt[k] || 1;
    // SOR — 안쪽 칸만 이웃 평균으로 푼다(경계 = 영역 밖 칸의 D 값, 그림 가장자리는 자유 경계)
    for (let it = 0; it < 600; it++) {
      for (let y = 0; y < qh; y++) for (let x = 0; x < qw; x++) {
        const k = y * qw + x;
        if (!inside[k]) continue;
        let s2 = 0, m = 0;
        if (x > 0) { s2 += C[k - 1]; m++; } if (x < qw - 1) { s2 += C[k + 1]; m++; }
        if (y > 0) { s2 += C[k - qw]; m++; } if (y < qh - 1) { s2 += C[k + qw]; m++; }
        if (m) C[k] += 1.9 * (s2 / m - C[k]);
      }
    }
    // 마스크 해상도로 — 안쪽은 막 × 경계 띠 가중치(경계 1 → 안쪽 0), 밖은 D
    const full = new Float32Array(sn);
    for (let y = 0; y < sh; y++) {
      const fy = Math.min(qh - 1, Math.max(0, (y + 0.5) / q - 0.5)), y0 = fy | 0, y1 = Math.min(qh - 1, y0 + 1), ty = fy - y0;
      for (let x = 0; x < sw; x++) {
        const j = y * sw + x;
        if (!reg[j]) { full[j] = Dm[c][j]; continue; }
        const fx = Math.min(qw - 1, Math.max(0, (x + 0.5) / q - 0.5)), x0 = fx | 0, x1 = Math.min(qw - 1, x0 + 1), tx = fx - x0;
        const band = Math.max(0, Math.min(1, 2 * (1 - inner[j])));
        full[j] = ((C[y0 * qw + x0] * (1 - tx) + C[y0 * qw + x1] * tx) * (1 - ty) + (C[y1 * qw + x0] * (1 - tx) + C[y1 * qw + x1] * tx) * ty) * band;
      }
    }
    return gauss(full, sw, sh, Math.max(1, short * 0.004));
  });
  //    얼굴 보호 — 요청이 얼굴을 바꾸는 게 아니면 얼굴은 원본(타원 + 넓은 페더: 사각형이면 머리카락에 이음매가 보인다)
  if (protect.length) {
    const prot = new Float32Array(sn);
    for (const g of protect) {
      const [y0, x0, y1, x1] = g.box_2d;
      const cx = (x0 + x1) / 2000 * sw, cy = (y0 + y1) / 2000 * sh, ax = Math.max(1, (x1 - x0) / 2000 * sw), ay = Math.max(1, (y1 - y0) / 2000 * sh);
      for (let y = Math.max(0, Math.floor(cy - ay)); y < Math.min(sh, Math.ceil(cy + ay)); y++)
        for (let x = Math.max(0, Math.floor(cx - ax)); x < Math.min(sw, Math.ceil(cx + ax)); x++) {
          const dx = (x - cx) / ax, dy = (y - cy) / ay;
          if (dx * dx + dy * dy <= 1) prot[y * sw + x] = 1;
        }
    }
    const pb = gauss(prot, sw, sh, short * 0.012);
    for (let j = 0; j < sn; j++) alphaS[j] *= 1 - Math.min(1, pb[j] * 1.6);
  }

  // 3) 원본 크기에서 섞기 — 마스크는 양선형으로 늘린다. alpha 0 인 곳은 원본 바이트 그대로
  const out = Buffer.from(O);
  let pasted = 0;
  for (let y = 0; y < h; y++) {
    const fy = Math.min(sh - 1, Math.max(0, (y + 0.5) / k - 0.5)), y0 = fy | 0, y1 = Math.min(sh - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(sw - 1, Math.max(0, (x + 0.5) / k - 0.5)), x0 = fx | 0, x1 = Math.min(sw - 1, x0 + 1), tx = fx - x0;
      const a = (alphaS[y0 * sw + x0] * (1 - tx) + alphaS[y0 * sw + x1] * tx) * (1 - ty)
              + (alphaS[y1 * sw + x0] * (1 - tx) + alphaS[y1 * sw + x1] * tx) * ty;
      if (a <= 0.002) continue;
      pasted++;
      const i = (y * w + x) * 3;
      const s00 = y0 * sw + x0, s01 = y0 * sw + x1, s10 = y1 * sw + x0, s11 = y1 * sw + x1;
      for (let c = 0; c < 3; c++) {
        const cc = Cm[c];
        const corr = (cc[s00] * (1 - tx) + cc[s01] * tx) * (1 - ty) + (cc[s10] * (1 - tx) + cc[s11] * tx) * ty;
        const v = O[i + c] + (Ec[i + c] + corr - O[i + c]) * a;
        out[i + c] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
      }
    }
  }
  return { out, pasted: pasted / n, same: 1 - pasted / n, thr };
}

/**
 * srcBuf: 회전·알파 제거까지 끝난 원본 JPEG. text: 사용자가 쓴 요청(아무 언어).
 * 성공: { finalJpeg, plan, w, h, stats } · 거절: { refused: true, message } · 실패: { error: "busy" | "plan" }
 */
export async function runRetouch({ apiKey, sharp, srcBuf, text }) {
  const meta = await sharp(srcBuf).metadata();
  const w = meta.width, h = meta.height;
  const b64 = srcBuf.toString("base64");
  const plan = await planRetouch(apiKey, b64, text);
  if (!plan) return { error: "plan" };
  if (!plan.allowed) return { refused: true, message: plan.refusal, lang: plan.lang };
  if (!plan.edits.length || (plan.scope !== "global" && !plan.regions.length)) return { error: "plan" };
  const editB64 = await editImage(apiKey, b64, nearestAspect(w, h), editPrompt(plan));
  if (!editB64) return { error: "busy" };
  const O = await sharp(srcBuf).removeAlpha().raw().toBuffer();
  let E = await sharp(Buffer.from(editB64, "base64")).rotate().resize(w, h, { fit: "fill" }).removeAlpha().raw().toBuffer();
  const align = alignEdit(O, E, w, h, plan.regions, plan.scope);
  if (align) E = warpRGB(E, w, h, align);
  const { out, pasted, same, thr } = compositeRetouch(O, E, w, h, plan.regions, plan.protect, plan.scope, plan.keepDetail);
  const finalJpeg = await sharp(out, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 92 }).toBuffer();
  return { finalJpeg, plan, w, h, stats: { pasted, same, thr, align } };
}
