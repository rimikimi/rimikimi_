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
  required: ["allowed", "lang", "summary", "edits", "keep", "regions", "protect"],
  properties: {
    allowed: { type: "BOOLEAN" },
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
3) REGIONS — "regions": tight boxes around the areas the edits touch (including where changed things will end up), and nothing else.
   "protect": a tight box around every person's face (forehead to chin, ear to nose tip) that the edits do NOT explicitly change.
   Boxes are [ymin, xmin, ymax, xmax] normalized 0-1000.
Return JSON only.`;
}

function editPrompt(plan) {
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
The result must look like the same real photo after a skilled human retoucher's careful work: photorealistic, no painted or AI look, no added objects, no text, no watermark, no frame or border.`;
}

const ASPECTS = [["1:1", 1], ["2:3", 2 / 3], ["3:2", 3 / 2], ["3:4", 3 / 4], ["4:3", 4 / 3], ["4:5", 4 / 5], ["5:4", 5 / 4], ["9:16", 9 / 16], ["16:9", 16 / 9]];
const nearestAspect = (w, h) =>
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
      edits: (p.edits || []).map(String).filter(Boolean).slice(0, 12),
      keep: (p.keep || []).map(String).filter(Boolean).slice(0, 12),
      regions: cleanBoxes(p.regions),
      protect: cleanBoxes(p.protect),
    };
  } catch (_) { return null; }
}

async function editImage(apiKey, jpegB64, aspect, prompt) {
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

/**
 * O, E: 같은 w×h 의 RGB Uint8 (E 는 AI 결과를 원본 크기로 늘인 것). regions/protect: 0~1000 박스.
 * 마스크(어디를 붙일지)는 긴 변 ~1024 로 줄여서 계산하고 원본 크기로 부드럽게 늘린다 — 경계는 어차피 페더라
 * 화질 차이가 없고, 원본 크기로 하면 사진 한 장에 16초가 걸렸다(실측). 섞기(합성)는 원본 크기에서 한다.
 * 반환: { out: RGB Uint8, pasted: 붙인 면적 비율, same: 원본과 같은 픽셀 비율 }
 */
export function compositeRetouch(O, E, w, h, regions, protect) {
  const n = w * h;
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
      out[i] = Math.round(O[i] + (Ec[i] - O[i]) * a);
      out[i + 1] = Math.round(O[i + 1] + (Ec[i + 1] - O[i + 1]) * a);
      out[i + 2] = Math.round(O[i + 2] + (Ec[i + 2] - O[i + 2]) * a);
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
  if (!plan.edits.length || !plan.regions.length) return { error: "plan" };
  const editB64 = await editImage(apiKey, b64, nearestAspect(w, h), editPrompt(plan));
  if (!editB64) return { error: "busy" };
  const O = await sharp(srcBuf).removeAlpha().raw().toBuffer();
  const E = await sharp(Buffer.from(editB64, "base64")).rotate().resize(w, h, { fit: "fill" }).removeAlpha().raw().toBuffer();
  const { out, pasted, same, thr } = compositeRetouch(O, E, w, h, plan.regions, plan.protect);
  const finalJpeg = await sharp(out, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 92 }).toBuffer();
  return { finalJpeg, plan, w, h, stats: { pasted, same, thr } };
}
