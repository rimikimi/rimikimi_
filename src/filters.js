// ============================================================
// 사진 필터 엔진 — 필름 프리셋 15종 + 효과(그레인/비네트/빛샘)
//
// 전부 ImageData 픽셀 연산(순수 JS)이다. ctx.filter 를 쓰지 않는 이유:
//   · Safari(iOS WKWebView 포함)가 ctx.filter 를 지원하지 않는다
//   · 지원하는 브라우저끼리도 색 결과가 미묘하게 다르다
// 픽셀을 직접 계산하면 iOS/안드/웹/노드(검증 스크립트) 어디서나 같은 결과가
// 나오고, 노드에서 돌려 실측 검증할 수 있다.
//
// 프리셋은 실제 필름 색과학(코닥 골드/포트라, 후지 벨비아, 시네스틸 800T 등)을
// 참고해 만들었지만 이름에 브랜드/제품명은 쓰지 않는다 — 스토어 심사(5.2.1
// 지재권)와 상표 리스크 때문. 색감은 재현하되 이름은 느낌만 딴다.
//
// 파이프라인(applyLook, 픽셀당 1패스):
//   ① 채널 LUT — 온도/틴트 게인 + 노출 + 톤커브(대비 S커브·페이드·화이트풀)를
//      256칸 테이블로 미리 구움 (프리셋당 1회)
//   ② 흑백 믹서(모노 계열만)
//   ③ 채도/바이브런스 — 바이브런스는 이미 쨍한 픽셀은 덜 올린다(피부 보호)
//   ④ 스플릿톤 — 그림자/하이라이트에 각각 색을 얹음 (필름 특유의 색 편향)
//   ⑤ 효과 — 그레인(밝기 가중 모노 노이즈), 비네트, 빛샘(스크린 블렌드)
// ============================================================

/* ---------- 프리셋 ----------
   temp: 색온도(+따뜻 -차가움) / tint: +마젠타 -그린 / ex: 노출(EV)
   con: 대비 S커브 강도 / fade: 블랙 들어올림(빛바랜 느낌) / whitePull: 하이라이트 눌러 롤오프
   sat: 채도 / vib: 바이브런스 / sh·hi: 그림자·하이라이트 스플릿톤 [r,g,b]
   bw: 흑백 채널 믹서 [wr,wg,wb] (합=1) */
// group: "film"(필름 스톡) | "camera"(카메라 룩). 오너 지시 — "상징적인 카메라와 필름".
// hsl: 색상 대역 조정(applyHslBands) / fx: 프리셋 기본 효과(칩 탭 = 원탭 완성 룩)
export const FILM_PRESETS = [
  { key: "none",     ko: "원본",      en: "Original" },

  /* ── 필름 스톡 (코닥/후지/시네스틸/아그파/일포드 색과학 참고, 이름은 느낌만) ── */
  { key: "golden",   ko: "골든",      en: "Golden", group: "film", // Kodak Gold 200
    temp: 20, tint: 0,  ex: 0.04,  con: 0.18, fade: 10, whitePull: 8,  sat: 0.12,  vib: 0.15, sh: [6, 3, -8],   hi: [12, 9, -12],
    hsl: [{ c: 110, w: 60, h: -18, s: -0.12 }, { c: 30, w: 25, s: 0.08, l: 0.02 }] },
  { key: "peach",    ko: "피치",      en: "Peach", group: "film", // Portra 400
    temp: 12, tint: 6,  ex: 0.07,  con: 0.08, fade: 14, whitePull: 14, sat: -0.08, vib: 0.25, sh: [4, 2, 0],    hi: [10, 5, -2],
    hsl: [{ c: 30, w: 28, s: -0.06, l: 0.04 }, { c: 110, w: 60, h: -10, s: -0.15 }] },
  { key: "slide",    ko: "슬라이드",  en: "Slide", group: "film", // Ektachrome
    temp: -6, tint: -2, ex: 0,     con: 0.26, fade: 4,  whitePull: 0,  sat: 0.2,   vib: 0.1,  sh: [-3, 0, 8],   hi: [0, 0, 0],
    hsl: [{ c: 225, w: 55, s: 0.25, l: -0.05 }, { c: 120, w: 50, s: 0.1 }] },
  { key: "retro",    ko: "레트로",    en: "Retro", group: "film", // Kodachrome
    temp: 6,  tint: 2,  ex: -0.05, con: 0.32, fade: 2,  whitePull: 4,  sat: 0.18,  vib: 0,    sh: [4, -2, -4],  hi: [6, 2, -6],
    hsl: [{ c: 0, w: 30, s: 0.2, l: -0.06 }, { c: 60, w: 35, h: -10, s: 0.1 }, { c: 220, w: 60, s: -0.15, l: -0.05 }] },
  { key: "vivid",    ko: "비비드",    en: "Vivid", group: "film", // Velvia
    temp: 0,  tint: 0,  ex: 0,     con: 0.28, fade: 0,  whitePull: 0,  sat: 0.18,  vib: 0.12, sh: [0, -2, 4],   hi: [2, 0, -2],
    hsl: [{ c: 225, w: 60, s: 0.3, l: -0.04 }, { c: 120, w: 55, s: 0.25, l: -0.03 }, { c: 0, w: 25, s: 0.2 }, { c: 30, w: 18, s: -0.1 }] },
  { key: "green",    ko: "그린",      en: "Green", group: "film", // Superia
    temp: 4,  tint: -8, ex: 0,     con: 0.15, fade: 8,  whitePull: 6,  sat: 0.1,   vib: 0.12, sh: [0, 6, -2],   hi: [6, 4, -4],
    hsl: [{ c: 120, w: 60, h: 6, s: 0.2, l: -0.03 }, { c: 60, w: 25, h: 20, s: -0.1 }] },
  { key: "pastel",   ko: "파스텔",    en: "Pastel", group: "film", // Pro 400H
    temp: -4, tint: -10, ex: 0.18, con: -0.05, fade: 24, whitePull: 16, sat: -0.15, vib: 0.2,  sh: [-2, 7, 5],   hi: [2, 5, 3],
    hsl: [{ c: 120, w: 70, h: 8, s: -0.2, l: 0.05 }, { c: 220, w: 60, s: -0.15, l: 0.05 }, { c: 30, w: 25, s: -0.08 }] },
  { key: "cine",     ko: "시네",      en: "Cine", group: "film", // CineStill 800T
    temp: -14, tint: 6, ex: 0,     con: 0.20, fade: 12, whitePull: 6,  sat: 0.05,  vib: 0.1,  sh: [-6, 4, 10],  hi: [14, 2, -4],
    hsl: [{ c: 120, w: 70, h: 55, s: -0.2 }, { c: 220, w: 50, h: -18 }, { c: 30, w: 22, s: 0.05 }],
    fx: { grain: 0.3 } },
  { key: "newtro",   ko: "뉴트로",    en: "Newtro", group: "film", // Agfa Vista
    temp: 8,  tint: 8,  ex: 0,     con: 0.22, fade: 8,  whitePull: 6,  sat: 0.16,  vib: 0,    sh: [6, -2, 0],   hi: [8, 2, -4],
    hsl: [{ c: 0, w: 35, s: 0.15 }, { c: 180, w: 60, s: -0.2 }, { c: 30, w: 20, s: 0.05 }] },
  { key: "softmono", ko: "소프트 모노", en: "Soft Mono", group: "film", // Ilford HP5
    ex: 0.05, con: 0.12, fade: 16, whitePull: 12, bw: [0.28, 0.56, 0.16],
    fx: { grain: 0.35 } },

  /* ── 카메라 룩 (상징적인 카메라들의 렌더링) ── */
  { key: "warm",     ko: "웜톤",      en: "Warm", group: "camera", // 캐논풍 스킨톤
    temp: 10, tint: 10, ex: 0.08,  con: 0.10, fade: 6,  whitePull: 4,  sat: 0.06,  vib: 0.15, sh: [2, 0, 0],    hi: [9, 2, 2],
    hsl: [{ c: 30, w: 25, l: 0.03 }, { c: 220, w: 50, s: -0.1 }] },
  { key: "cool",     ko: "쿨톤",      en: "Cool", group: "camera", // 니콘풍 뉴트럴
    temp: -14, tint: -4, ex: 0,    con: 0.16, fade: 6,  whitePull: 4,  sat: 0.04,  vib: 0.1,  sh: [-2, 2, 5],   hi: [0, 2, 5],
    hsl: [{ c: 225, w: 60, s: 0.12 }, { c: 110, w: 50, h: 15, s: -0.08 }] },
  { key: "vintage",  ko: "빈티지",    en: "Vintage", group: "camera", // 미놀타 90년대 자동카메라
    temp: 14, tint: 2,  ex: -0.02, con: -0.08, fade: 22, whitePull: 18, sat: -0.15, vib: 0.05, sh: [6, 4, -2],   hi: [8, 6, -6],
    hsl: [{ c: 120, w: 60, h: -25, s: -0.3 }, { c: 220, w: 60, s: -0.25 }, { c: 30, w: 30, s: -0.05, l: 0.03 }],
    fx: { grain: 0.25 } },
  { key: "docu",     ko: "다큐",      en: "Docu", group: "camera", // 후지 클래식크롬풍
    temp: -4, tint: 0,  ex: -0.03, con: 0.20, fade: 10, whitePull: 10, sat: -0.28, vib: 0.1,  sh: [0, 2, 6],    hi: [4, 2, -2],
    hsl: [{ c: 220, w: 70, h: -10, s: 0.05 }, { c: 0, w: 30, s: -0.15 }, { c: 30, w: 25, s: -0.12 }] },
  { key: "mono",     ko: "모노",      en: "Mono", group: "camera", // 라이카 모노크롬풍
    ex: 0,    con: 0.35, fade: 2,  whitePull: 0,  bw: [0.35, 0.5, 0.15] },
  { key: "digicam",  ko: "디지캠",    en: "Digicam", group: "camera", // 2000년대 CCD 컴팩트 (Y2K)
    temp: -8, tint: -2, ex: 0.06,  con: 0.22, fade: 0,  whitePull: 0,  sat: 0.15,  vib: 0.1,  sh: [0, 2, 6],    hi: [4, 4, 10],
    hsl: [{ c: 225, w: 60, s: 0.2 }, { c: 180, w: 40, s: 0.15 }],
    fx: { grain: 0.15 } },
  { key: "toy",      ko: "토이",      en: "Toy", group: "camera", // 로모/홀가 토이카메라
    temp: 4,  tint: 6,  ex: 0,     con: 0.3,  fade: 4,  whitePull: 0,  sat: 0.24,  vib: 0,    sh: [0, -4, 8],   hi: [6, 0, -6],
    hsl: [{ c: 225, w: 55, s: 0.3, l: -0.06 }, { c: 0, w: 30, s: 0.15 }],
    fx: { vignette: 0.65, grain: 0.25 } },
  { key: "dispo",    ko: "일회용",    en: "Dispo", group: "camera", // 일회용 카메라 + 플래시
    temp: 6,  tint: 0,  ex: 0.1,   con: 0.25, fade: 6,  whitePull: 0,  sat: 0.12,  vib: 0.08, sh: [-2, 4, 0],   hi: [10, 8, 2],
    hsl: [{ c: 110, w: 50, h: -8, s: -0.05 }],
    fx: { grain: 0.45, leak: 0.12 } },
  { key: "instant",  ko: "인스턴트",  en: "Instant", group: "camera", // 폴라로이드 인화지 색
    temp: -2, tint: -6, ex: 0.06,  con: -0.06, fade: 20, whitePull: 14, sat: -0.12, vib: 0.08, sh: [-4, 6, 4],   hi: [6, 4, -2],
    hsl: [{ c: 120, w: 60, h: 10, s: -0.15, l: 0.03 }],
    fx: { grain: 0.2 } },
];

export function presetByKey(key) {
  return FILM_PRESETS.find((p) => p.key === key) || FILM_PRESETS[0];
}

const clamp8 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

/* ---------- ① 채널 LUT 굽기 ---------- */
// 온도/틴트 → 채널 게인. ±40 스케일을 게인 ±6.4% 로 매핑 (실측으로 잡은 감도).
function channelGains(temp = 0, tint = 0) {
  return [
    1 + temp * 0.0016 + tint * 0.0008,
    1 - tint * 0.0016,
    1 - temp * 0.0016 + tint * 0.0008,
  ];
}

// 톤커브: 대비 S커브(시그모이드) → 페이드(그림자 리프트) → 화이트풀(숄더 압축)
function toneCurve(v01, con = 0, fade = 0, whitePull = 0) {
  let v = v01;
  if (con) {
    // 0.5 중심 시그모이드. con>0 이면 S커브(대비↑), con<0 이면 역S(대비↓)
    const k = 1 + Math.abs(con) * 6;
    const sig = (x) => 1 / (1 + Math.exp(-k * (x - 0.5)));
    const lo = sig(0), hi = sig(1);
    const s = (sig(v) - lo) / (hi - lo);
    v = con > 0 ? s : v + (v - s); // 역S = 시그모이드 반대 방향으로 밀기
  }
  // 페이드: 깊은 그림자만 들어올린다((1-v)³ 가중). 전 구간 선형 리프트는 미드톤까지
  // 부옇게 만들어 "물 빠진 싸구려 톤"이 된다 — 오너 피드백("밤티")의 주범 1.
  const f = fade / 255;
  if (f) v = v + f * Math.pow(1 - v, 3);
  // 화이트풀: 0.65 위 어깨(shoulder)만 곡선으로 압축. 선형 스케일다운은 밝은 영역
  // 전체가 회색으로 죽는다 — 주범 2. (t - wp·0.9·t² 는 wp≤0.1 에서 단조증가)
  const wp = whitePull / 255;
  if (wp && v > 0.65) {
    const t = (v - 0.65) / 0.35;
    v = 0.65 + 0.35 * (t - wp * 0.9 * t * t);
  }
  return v;
}

/* ---------- 색상 대역(HSL) 조정 ----------
   진짜 필름 룩의 핵심 — "초록만 틸로 민다 / 피부(주황)는 보호한다" 같은
   대역별 처리. 전역 보정만으로는 어떤 프리셋이든 싸구려 인스타 필터처럼 보인다.
   band: { c: 중심 색상(0~360), w: 반경, h: 색상 이동(±도), s: 채도 배율 δ, l: 밝기 배율 δ } */
function rgb2hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h;
  if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (mx === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return [h, s, l];
}
function hue2rgbc(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}
function hsl2rgb(h, s, l) {
  if (s <= 0) { const v = l * 255; return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hh = h / 360;
  return [hue2rgbc(p, q, hh + 1 / 3) * 255, hue2rgbc(p, q, hh) * 255, hue2rgbc(p, q, hh - 1 / 3) * 255];
}
function applyHslBands(r, g, b, bands) {
  let [h, s, l] = rgb2hsl(r, g, b);
  if (s < 0.03) return [r, g, b]; // 무채색은 색상 정보가 무의미 — 건드리면 노이즈만 는다
  let dh = 0, ds = 0, dl = 0;
  for (const bd of bands) {
    let dist = Math.abs(h - bd.c);
    if (dist > 180) dist = 360 - dist;
    if (dist >= bd.w) continue;
    const wgt = 1 - dist / bd.w; // 중심에서 1, 가장자리 0 (선형 falloff)
    dh += (bd.h || 0) * wgt;
    ds += (bd.s || 0) * wgt;
    dl += (bd.l || 0) * wgt;
  }
  if (!dh && !ds && !dl) return [r, g, b];
  h = (h + dh + 360) % 360;
  s = Math.min(1, Math.max(0, s * (1 + ds)));
  l = Math.min(1, Math.max(0, l * (1 + dl)));
  return hsl2rgb(h, s, l);
}

// 프리셋 → 채널별 256칸 LUT. 프리셋당 1회만 계산하고 픽셀 루프는 테이블 조회만 한다.
export function buildLuts(p) {
  const gains = channelGains(p.temp, p.tint);
  const exGain = Math.pow(2, p.ex || 0);
  const luts = [new Uint8Array(256), new Uint8Array(256), new Uint8Array(256)];
  for (let c = 0; c < 3; c++) {
    for (let v = 0; v < 256; v++) {
      const lin = Math.min(1, (v / 255) * gains[c] * exGain);
      luts[c][v] = clamp8(Math.round(toneCurve(lin, p.con, p.fade, p.whitePull) * 255));
    }
  }
  return luts;
}

/* ---------- 메인: 프리셋 + 효과 1패스 적용 ----------
   data: ImageData.data (RGBA, 제자리 수정)
   effects: { grain:0..1, vignette:0..1, leak:0..1, seed:정수 } (없으면 프리셋만) */
export function applyLook(data, w, h, preset, effects = {}) {
  const p = preset && preset.key !== "none" ? preset : null;
  const luts = p ? buildLuts(p) : null;
  const sat = p?.sat || 0;
  const vib = p?.vib || 0;
  const sh = p?.sh, hi = p?.hi, bw = p?.bw, hslBands = p?.hsl;

  const grain = effects.grain || 0;
  const vig = effects.vignette || 0;
  const leak = effects.leak || 0;
  const seed = (effects.seed || 7) | 0;

  // 비네트/빛샘용 좌표 상수 (픽셀 루프 밖에서 준비)
  const cx = w / 2, cy = h / 2;
  const maxD = Math.sqrt(cx * cx + cy * cy);
  // 빛샘: 우상단 모서리에서 번지는 주황 + 좌하단의 약한 마젠타 (스크린 블렌드)
  const leakR1 = Math.hypot(w, h) * 0.55;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let r = data[i], g = data[i + 1], b = data[i + 2];

      if (luts) {
        r = luts[0][r]; g = luts[1][g]; b = luts[2][b];

        if (bw) {
          const v = r * bw[0] + g * bw[1] + b * bw[2];
          r = g = b = v;
        } else {
          const L = r * 0.299 + g * 0.587 + b * 0.114;
          if (sat || vib) {
            // 바이브런스: 이미 채도가 높은 픽셀(max-min 큼)은 덜 올린다 — 피부 붉어짐 방지
            const mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
            const mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
            const boost = 1 + sat + vib * (1 - (mx - mn) / 255);
            r = L + (r - L) * boost;
            g = L + (g - L) * boost;
            b = L + (b - L) * boost;
          }
          if (hslBands) {
            const o = applyHslBands(r, g, b, hslBands);
            r = o[0]; g = o[1]; b = o[2];
          }
          if (sh || hi) {
            const l01 = L / 255;
            const ws = (1 - l01) * (1 - l01); // 그림자 가중
            const wh = l01 * l01;             // 하이라이트 가중
            if (sh) { r += sh[0] * ws; g += sh[1] * ws; b += sh[2] * ws; }
            if (hi) { r += hi[0] * wh; g += hi[1] * wh; b += hi[2] * wh; }
          }
        }
      }

      if (grain) {
        // 결정적 해시 노이즈(시드 고정 → 미리보기/저장 결과 동일). 2옥타브 —
        // 픽셀 단위 백색소음만 쓰면 디지털 노이즈처럼 보인다. 2px 굵은 결을 섞어야
        // 필름 입자의 뭉침이 난다. 미드톤에 세고 극단부엔 약하게(실제 입자 특성).
        let n = (x * 374761393 + y * 668265263 + seed * 974711) | 0;
        n = (n ^ (n >> 13)) * 1274126177; n = (n ^ (n >> 16)) >>> 0;
        let m = ((x >> 1) * 668265263 + (y >> 1) * 374761393 + seed * 434371) | 0;
        m = (m ^ (m >> 13)) * 1274126177; m = (m ^ (m >> 16)) >>> 0;
        const rand = 0.65 * (n / 4294967296 - 0.5) + 0.35 * (m / 4294967296 - 0.5);
        const L = r * 0.299 + g * 0.587 + b * 0.114;
        const mid = 1 - Math.abs(L - 128) / 160;
        const amt = grain * 46 * (mid < 0.25 ? 0.25 : mid);
        const add = rand * amt;
        r += add; g += add; b += add;
      }

      if (vig) {
        const dx = x - cx, dy = y - cy;
        const d = Math.sqrt(dx * dx + dy * dy) / maxD; // 0(중앙)..1(모서리)
        // 0.55 부터 서서히 어두워짐
        const t = d < 0.55 ? 0 : (d - 0.55) / 0.45;
        const f = 1 - vig * 0.5 * t * t;
        r *= f; g *= f; b *= f;
      }

      if (leak) {
        // 우상단 주황 번짐
        const d1 = Math.hypot(x - w, y) / leakR1;
        const s1 = d1 < 1 ? (1 - d1) * (1 - d1) * leak : 0;
        if (s1 > 0.003) {
          // screen: out = 255 - (255-v)(255-c)/255
          r = 255 - ((255 - r) * (255 - 235 * s1)) / 255;
          g = 255 - ((255 - g) * (255 - 110 * s1)) / 255;
          b = 255 - ((255 - b) * (255 - 40 * s1)) / 255;
        }
        // 좌측 세로 마젠타 줄기 (더 약하게)
        const d2 = Math.abs(x - w * 0.08) / (w * 0.1);
        const s2 = d2 < 1 ? (1 - d2) * leak * 0.45 : 0;
        if (s2 > 0.003) {
          r = 255 - ((255 - r) * (255 - 190 * s2)) / 255;
          b = 255 - ((255 - b) * (255 - 120 * s2)) / 255;
        }
      }

      data[i] = clamp8(r + 0.5) | 0;
      data[i + 1] = clamp8(g + 0.5) | 0;
      data[i + 2] = clamp8(b + 0.5) | 0;
    }
  }
  return data;
}
