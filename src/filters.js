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
export const FILM_PRESETS = [
  { key: "none",     ko: "원본",      en: "Original" },
  // 따뜻한 컬러 네거티브 계열
  { key: "golden",   ko: "골든",      en: "Golden",
    temp: 20, tint: 0,  ex: 0.04,  con: 0.18, fade: 10, whitePull: 8,  sat: 0.12,  vib: 0.15, sh: [6, 3, -8],   hi: [12, 9, -12] },
  { key: "peach",    ko: "피치",      en: "Peach",
    temp: 12, tint: 6,  ex: 0.07,  con: 0.08, fade: 14, whitePull: 14, sat: -0.08, vib: 0.25, sh: [4, 2, 0],    hi: [10, 5, -2] },
  { key: "warm",     ko: "웜톤",      en: "Warm",
    temp: 10, tint: 10, ex: 0.08,  con: 0.10, fade: 6,  whitePull: 4,  sat: 0.06,  vib: 0.15, sh: [2, 0, 0],    hi: [9, 2, 2] },
  { key: "pastel",   ko: "파스텔",    en: "Pastel",
    temp: -4, tint: -10, ex: 0.18, con: -0.05, fade: 24, whitePull: 16, sat: -0.15, vib: 0.2,  sh: [-2, 7, 5],   hi: [2, 5, 3] },
  // 슬라이드/차가운 계열
  { key: "slide",    ko: "슬라이드",  en: "Slide",
    temp: -6, tint: -2, ex: 0,     con: 0.26, fade: 4,  whitePull: 0,  sat: 0.2,   vib: 0.1,  sh: [-3, 0, 8],   hi: [0, 0, 0] },
  { key: "cool",     ko: "쿨톤",      en: "Cool",
    temp: -14, tint: -4, ex: 0,    con: 0.16, fade: 6,  whitePull: 4,  sat: 0.04,  vib: 0.1,  sh: [-2, 2, 5],   hi: [0, 2, 5] },
  { key: "docu",     ko: "다큐",      en: "Docu",
    temp: -4, tint: 0,  ex: -0.03, con: 0.20, fade: 10, whitePull: 10, sat: -0.28, vib: 0.1,  sh: [0, 2, 6],    hi: [4, 2, -2] },
  { key: "cine",     ko: "시네",      en: "Cine",
    temp: -14, tint: 6, ex: 0,     con: 0.20, fade: 12, whitePull: 6,  sat: 0.05,  vib: 0.1,  sh: [-6, 4, 10],  hi: [14, 2, -4] },
  // 채도/레트로 계열
  { key: "green",    ko: "그린",      en: "Green",
    temp: 4,  tint: -8, ex: 0,     con: 0.15, fade: 8,  whitePull: 6,  sat: 0.1,   vib: 0.12, sh: [0, 6, -2],   hi: [6, 4, -4] },
  { key: "vivid",    ko: "비비드",    en: "Vivid",
    temp: 0,  tint: 0,  ex: 0,     con: 0.28, fade: 0,  whitePull: 0,  sat: 0.26,  vib: 0.15, sh: [0, -2, 4],   hi: [2, 0, -2] },
  { key: "retro",    ko: "레트로",    en: "Retro",
    temp: 6,  tint: 2,  ex: -0.05, con: 0.32, fade: 2,  whitePull: 4,  sat: 0.18,  vib: 0,    sh: [4, -2, -4],  hi: [6, 2, -6] },
  { key: "newtro",   ko: "뉴트로",    en: "Newtro",
    temp: 8,  tint: 8,  ex: 0,     con: 0.22, fade: 8,  whitePull: 6,  sat: 0.16,  vib: 0,    sh: [6, -2, 0],   hi: [8, 2, -4] },
  { key: "vintage",  ko: "빈티지",    en: "Vintage",
    temp: 14, tint: 2,  ex: -0.02, con: -0.08, fade: 22, whitePull: 18, sat: -0.15, vib: 0.05, sh: [6, 4, -2],   hi: [8, 6, -6] },
  // 흑백 계열
  { key: "mono",     ko: "모노",      en: "Mono",
    ex: 0,    con: 0.35, fade: 2,  whitePull: 0,  bw: [0.35, 0.5, 0.15] },
  { key: "softmono", ko: "소프트 모노", en: "Soft Mono",
    ex: 0.05, con: 0.12, fade: 16, whitePull: 12, bw: [0.28, 0.56, 0.16] },
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

// 톤커브: 대비 S커브(시그모이드) → 페이드(블랙 리프트) → 화이트풀(하이라이트 롤오프)
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
  // 페이드: 검정을 fade/255 까지 들어올림 (필름의 옅은 블랙)
  const f = fade / 255;
  v = f + v * (1 - f);
  // 화이트풀: 최대 밝기를 (255-whitePull) 로 눌러 하이라이트를 부드럽게
  v = v * (1 - whitePull / 255);
  return v;
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
  const sh = p?.sh, hi = p?.hi, bw = p?.bw;

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
        // 결정적 해시 노이즈(시드 고정 → 미리보기/저장 결과 동일).
        // 미드톤에 가장 세게, 깊은 그림자·하이라이트엔 약하게 (실제 필름 입자 특성)
        let n = (x * 374761393 + y * 668265263 + seed * 974711) | 0;
        n = (n ^ (n >> 13)) * 1274126177; n = (n ^ (n >> 16)) >>> 0;
        const rand = n / 4294967296 - 0.5; // -0.5..0.5
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
