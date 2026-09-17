// ============================================================
// 문구 입력 — 인스타그램 스토리와 "같게" (오너 지시 2026-09-17, 재지시 2026-09-17)
//
// 이전 버전은 "흉내"였다. 사진을 어둡게 덮는 별도 전체화면에서 글자를 치고,
// 완료를 누르면 그제서야 사진 위에 얹혀 크기·위치가 달라졌다. 인스타는 그렇지 않다.
// 인스타 스토리는 **편집 화면 자체가 캔버스**다. 그래서 이렇게 바꿨다:
//
//   · 입력이 **사진 위에서 그대로** 일어난다 — 컴포저는 사진 래퍼의 화면 좌표에
//     딱 맞춰 뜬다(WYSIWYG). 어둡게 깔리는 건 사진 "바깥"뿐(box-shadow 스크림).
//   · 글자 크기 기준이 사진 폭이라 **편집 중 크기 = 얹힌 크기 = 저장본 크기**.
//   · 화면에 보이는 겹과 완전히 같은 CSS 를 `textLayerStyle()` 한 곳에서 만든다.
//     PhotoEditor 의 화면 겹도, 컴포저 미리보기도 같은 함수를 쓴다(어긋날 수 없다).
//   · 저장(캔버스 합성)은 PhotoEditor.drawTextLayer 가 **같은 순서로** 계산한다.
//     줄 접기 한계폭(TEXT_MAXW)·줄간(LINE_H)·여백(PAD_*)·모서리(RADIUS_R)·
//     반투명도(BG_SOFT_ALPHA)·테두리 두께(STROKE_R)를 여기서 **한 번만** 정의해
//     양쪽이 같은 수를 쓰게 한다. (전에는 0.62 / 0.55 / 0.55 로 세 군데가 달랐다)
//
// 입력칸 구조: "거울(mirror) + 투명 textarea".
//   textarea 는 width:max-content 를 못 써서 배경 박스가 글자를 감싸지 못한다.
//   그래서 실제로 보이는 건 겹과 똑같이 그린 div(거울)이고, 그 위에 글자를 투명하게
//   만든 textarea 를 겹쳐 캐럿·IME(한글 조합)만 맡긴다. 줄바꿈 위치까지 똑같아진다.
//
// 한글 글꼴은 무겁다. 그래도 캐러셀이 **미리보기 구실을 하려면** 칩마다 그 글꼴로
// 보여야 해서, 컴포저가 뜰 때 8종을 한꺼번에 받아온다(구글 폰트는 unicode-range
// 서브셋이라 칩에 쓰인 두세 글자 조각만 내려온다). 못 받아도 편집은 막지 않는다.
// ============================================================
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as hap from "./haptics";

/** 글꼴 목록. `g` 는 Google Fonts family 이름(없으면 시스템). */
export const TEXT_FONTS = [
  // 오너 지시(2026-09-17): "폰트는 좀 디자인 모던하고 이쁜걸로", "개밤티 폰트 가져오지 말고".
  // 후보 20종을 실제로 렌더해 눈으로 고른 결과다(scratchpad/shots/fontsheet.png).
  // **뺀 것**: 나눔손글씨·나눔붓글씨·개구·감자꽃·Poor Story·Song Myung·Dongle —
  //   전부 촌스럽거나 옛 한글 웹폰트 느낌이라 사진 위에 얹으면 싸구려로 보인다.
  // `g` = Google Fonts family, `url` = 그 밖의 CDN(구글에 없는 것).
  { key: "pretendard", ko: "기본", weight: 700, css: "'Pretendard'",
    url: "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard-dynamic-subset.css" },
  { key: "serif",   ko: "세리프", g: "Hahmlet",        css: "'Hahmlet'",        weight: 700 },
  { key: "elegant", ko: "고운",   g: "Gowun Batang",   css: "'Gowun Batang'",   weight: 700 },
  { key: "thin",    ko: "가는",   g: "Diphylleia",     css: "'Diphylleia'",     weight: 400 },
  { key: "impact",  ko: "임팩트", g: "Black Han Sans", css: "'Black Han Sans'", weight: 400 },
  { key: "bold",    ko: "볼드",   g: "Gasoek One",     css: "'Gasoek One'",     weight: 400 },
  { key: "sharp",   ko: "각진",   g: "Do Hyeon",       css: "'Do Hyeon'",       weight: 400 },
  { key: "hand",    ko: "손글씨", g: "Single Day",     css: "'Single Day'",     weight: 400 },
];
export const fontOf = (k) => TEXT_FONTS.find((f) => f.key === k) || TEXT_FONTS[0];
/** 실제로 쓸 font-family — 못 받았으면 시스템으로 떨어진다(편집을 막지 않는다). */
export const fontFamilyOf = (k) => `${fontOf(k).css}, 'Apple SD Gothic Neo', sans-serif`;

const loaded = new Set();
/** 글꼴 CSS 를 붙인다. 실패해도 던지지 않는다. */
export function loadFont(key) {
  const f = fontOf(key);
  const href = f.url || (f.g && `https://fonts.googleapis.com/css2?family=${f.g.replace(/ /g, "+")}&display=swap`);
  if (!href || loaded.has(key)) return Promise.resolve(true);
  loaded.add(key);
  return new Promise((res) => {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.onload = () => res(true);
    l.onerror = () => res(false);
    document.head.appendChild(l);
    setTimeout(() => res(false), 4000);   // 느린 망에서도 편집을 막지 않는다
  });
}

/* ---------- 화면과 저장본이 공유하는 상수 ----------
   ⚠️ 여기 숫자를 바꾸면 화면·컴포저·저장본이 **함께** 바뀐다. 한 곳에서만 고쳐라. */
export const LINE_H = 1.22;        // 줄간 (fontSize 배수)
export const TEXT_MAXW = 0.86;     // 텍스트 상자 최대 폭 = 사진 폭의 86%
export const PAD_X_R = 0.28;       // 배경 박스 좌우 여백 (fontSize 배수)
export const PAD_Y_R = 0.12;       // 배경 박스 상하 여백
export const RADIUS_R = 0.22;      // 배경 박스 모서리
export const BG_SOFT_ALPHA = 0.55; // 반투명 배경의 알파 — **배경만** 투명하고 글자는 선명
export const STROKE_R = 0.045;     // 테두리 효과 두께 (fontSize 배수)
// 네온 글로우 세 겹의 번짐 반지름 (fontSize 배수). CSS text-shadow 와 캔버스 shadowBlur 는
// 같은 척도라 **같은 수**를 넣으면 같은 그림이 나온다(실측 확인).
export const NEON_BLUR = [0.04, 0.12, 0.3];

/** #rrggbb → rgba(). 배경만 반투명하게 만들 때 쓴다(요소 opacity 를 쓰면 글자까지 흐려진다). */
export function withAlpha(hex, a) {
  const n = String(hex || "#ffffff").replace("#", "");
  const s = n.length === 3 ? n.split("").map((c) => c + c).join("") : n;
  const r = parseInt(s.slice(0, 2), 16) || 0;
  const g = parseInt(s.slice(2, 4), 16) || 0;
  const b = parseInt(s.slice(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${a})`;
}

/* ---------- 색 ---------- */
// 인스타처럼 여러 줄(페이지)로 넘긴다 — 한 줄을 좌우로 스와이프하면 다음 색들.
export const SWATCH_PAGES = [
  ["#FFFFFF", "#111111", "#E6403C", "#F9C83C", "#5AC46E", "#60C9DE", "#4C6FE7", "#8A5DA7", "#F3819F"],
  ["#FDE7EC", "#FFD9C0", "#FFF3B0", "#D9F2D0", "#CDE9F7", "#DCD6F7", "#F6D6E8", "#EADFD2", "#BFBFBF"],
  ["#7A1F1A", "#C2410C", "#B45309", "#166534", "#0E7490", "#1E3A8A", "#4C1D95", "#831843", "#3F3F46"],
];
function hsl(h, sat, l) {
  const a = (sat / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const c = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * c).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
const lightOf = (t) => (t <= 0.5 ? t * 100 : 50 + (t - 0.5) * 100);
export const colorOf = (hue, light) =>
  hsl(hue, light >= 0.98 || light <= 0.02 ? 0 : 85, lightOf(light));

/** 배경 위 글자색 기본값 — 밝은 배경엔 검정, 어두운 배경엔 흰색.
 *  (이제 "강제"가 아니라 **기본값**이다. 배경을 켠 뒤에도 글자색을 따로 고를 수 있다.) */
export function contrastInk(hex) {
  const n = (hex || "#fff").replace("#", "");
  const lin = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const L = 0.2126 * lin(parseInt(n.slice(0, 2), 16))
          + 0.7152 * lin(parseInt(n.slice(2, 4), 16))
          + 0.0722 * lin(parseInt(n.slice(4, 6), 16));
  return L > 0.45 ? "#111111" : "#FFFFFF";
}

const BG_ORDER = ["none", "solid", "soft"];
/** 효과 — 화면(CSS)과 저장본(캔버스) **양쪽에 같은 결과로** 그릴 수 있는 것만 넣었다.
 *  움직이는 효과(Pop/Jump/Shimmer)는 결과물이 정지 이미지(JPEG)라 담기지 않으므로 뺐다. */
export const TEXT_EFFECTS = [["none", "기본"], ["neon", "네온"], ["stroke", "테두리"]];
const MAX_TEXT_LEN = 140;

/**
 * 텍스트 겹의 CSS — **화면 겹과 컴포저 미리보기가 공유한다.**
 * @param st   {font,color,bg,bgColor,align,effect}
 * @param px   글자 크기(픽셀) = scale × 사진 실폭
 * @param maxW 상자 최대 폭(픽셀) = TEXT_MAXW × 사진 실폭
 */
export function textLayerStyle(st, px, maxW) {
  const bg = st.bg || "none";
  const effect = st.effect || "none";
  const s = {
    fontFamily: fontFamilyOf(st.font),
    fontWeight: fontOf(st.font).weight,
    fontSize: px,
    lineHeight: LINE_H,
    color: st.color || "#FFFFFF",
    textAlign: st.align || "center",
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    wordBreak: "break-word",
    // 폭: 내용만큼 줄었다가 maxW 에서 접힌다 = CSS 의 min(max-content, max-width).
    // 저장 합성도 같은 식으로 contentW 를 구한다(안 그러면 저장본 줄바꿈이 달라진다).
    boxSizing: "border-box",
    width: "max-content",
    maxWidth: maxW,
    padding: 0,
  };
  if (bg !== "none") {
    // 반투명은 요소 opacity 가 아니라 **배경색 알파**로 — 글자는 선명하게 남는다.
    s.backgroundColor = bg === "soft"
      ? withAlpha(st.bgColor || "#FFFFFF", BG_SOFT_ALPHA)
      : (st.bgColor || "#FFFFFF");
    s.padding = `${px * PAD_Y_R}px ${px * PAD_X_R}px`;
    s.borderRadius = px * RADIUS_R;
  }
  if (effect === "neon") {
    // 세 겹 글로우. 캔버스(drawTextLayer)가 **같은 반지름으로 세 번** 그려 같은 그림이 된다.
    // 반지름을 더 키우면 글자가 번져서 안 읽힌다(실측) — 여기까지가 한계.
    const c = st.color || "#FFFFFF";
    s.textShadow = NEON_BLUR.map((r) => `0 0 ${px * r}px ${c}`).join(", ");
  } else if (effect === "stroke") {
    s.WebkitTextStrokeWidth = `${Math.max(1, px * STROKE_R)}px`;
    s.WebkitTextStrokeColor = contrastInk(st.color || "#FFFFFF");
    s.paintOrder = "stroke fill";   // 획이 글자 속을 파먹지 않게 (캔버스의 stroke→fill 순서와 같다)
  } else if (bg === "none") {
    s.textShadow = `0 ${px * 0.02}px ${px * 0.1}px rgba(0,0,0,.45)`;
  }
  return s;
}

/* 줄바꿈 기회 판정 — 브라우저(UAX#14, word-break:normal)를 따라간다.
   ⚠️ 실측으로 잡은 규칙이다. "마지막 공백에서 끊는다"로 했더니 화면과 어긋났다:
      한글은 **음절 사이 어디서나** 끊을 수 있어서, 브라우저는 공백까지 되돌아가지 않고
      "…오래 간 / 직하자" 처럼 단어 중간에서 끊는다. 저장본만 "…오래 / 간직하자" 가 되면
      화면과 다른 그림이 나온다. */
const CJK_RE = /[ᄀ-ᇿ⺀-〿぀-ヿ㄰-㆏ㇰ-ㇿ㐀-䶿一-鿿ꥠ-꥿가-퟿豈-﫿＀-｠]/;
const NO_BREAK_BEFORE = /[)\]}»”’,.!?;:%·…、。」』]/;   // 닫는 부호·마침표는 앞줄에 붙어 있어야 한다
const NO_BREAK_AFTER = /[(\[{«“‘「『]/;                 // 여는 부호 뒤에서는 끊지 않는다
function breakOk(a, b) {
  if (a === undefined || b === undefined) return false;
  if (b === " ") return false;           // 공백은 앞줄 끝에 매달린다
  if (a === " ") return true;            // 공백 뒤는 언제나 끊을 수 있다
  if (NO_BREAK_BEFORE.test(b) || NO_BREAK_AFTER.test(a)) return false;
  return CJK_RE.test(a) || CJK_RE.test(b);
}

/**
 * 한 줄 한계폭에 맞춰 줄을 접는다 — 저장 합성이 **화면과 같은 곳에서** 끊게 하려는 것.
 * 규칙: 글자를 하나씩 채우다 넘치면, 지금까지 지나온 **마지막 줄바꿈 기회**로 되돌아가 끊는다.
 *       기회가 하나도 없으면 그 자리에서 강제로 끊는다(overflow-wrap:break-word 와 같다).
 *       줄 끝 공백은 브라우저처럼 "매달리는" 것으로 보고 폭 계산·그리기에서 뺀다.
 * @param measure (문자열)→픽셀폭
 */
export function wrapTextLines(measure, text, limit) {
  const out = [];
  for (const raw of String(text ?? "").split("\n")) {
    if (raw === "") { out.push(""); continue; }
    let start = 0;        // 지금 줄의 시작 인덱스
    let lastBreak = -1;   // 지금 줄 안에서 마지막으로 본 줄바꿈 기회
    let i = start;
    let guard = 0;
    while (i < raw.length && guard++ < 20000) {
      const next = i + 1;
      const seg = raw.slice(start, next).replace(/\s+$/, "");
      if (seg !== "" && next - start > 1 && measure(seg) > limit) {
        const cut = lastBreak > start ? lastBreak : i;
        out.push(raw.slice(start, cut).replace(/\s+$/, ""));
        start = cut;
        lastBreak = -1;
        i = start;
        continue;
      }
      if (next < raw.length && breakOk(raw[i], raw[next])) lastBreak = next;
      i = next;
    }
    out.push(raw.slice(start).replace(/\s+$/, ""));
  }
  return out;
}

/* ---------- 텍스트 겹 합성 (저장 시) ----------
   ⚠️ 화면(textLayerStyle)에서 **CSS 가 하는 일을 그대로** 캔버스로 옮긴 것이다.
   화면에 보이던 것과 저장본이 다르면 버그라서, 순서까지 CSS 를 따라간다:
     1) 줄마다 원래 폭을 재고 → contentW = min(가장 긴 줄, 한계폭)
        (= CSS 의 `width:max-content` 를 `max-width` 로 자른 결과)
     2) 그 contentW 로 줄을 접는다 → 줄 수 × lineHeight 가 글자 블록 높이
     3) 배경 박스 = contentW + 좌우 여백 × 2, 블록 높이 + 상하 여백 × 2
     4) 정렬(st.align)은 contentW 안에서의 문단 정렬 — 예전엔 항상 가운데였다
     5) 반투명 배경은 **박스 칠할 때만** globalAlpha — 글자는 선명하게 남는다 */
export function drawTextLayer(ctx, st, px, w) {
  const f = fontOf(st.font);
  ctx.font = `${f.weight} ${px}px ${fontFamilyOf(st.font)}`;
  const bg = st.bg || "none";
  const align = st.align || "center";
  const effect = st.effect || "none";
  const padX = bg === "none" ? 0 : px * PAD_X_R;
  const padY = bg === "none" ? 0 : px * PAD_Y_R;
  const lh = px * LINE_H;
  const measure = (s) => ctx.measureText(s).width;
  const limit = Math.max(px, TEXT_MAXW * w - padX * 2);
  const raws = String(st.value ?? "").split("\n");
  let maxRaw = 0;
  for (const r of raws) maxRaw = Math.max(maxRaw, measure(r));
  const contentW = Math.max(1, Math.min(maxRaw, limit));
  const lines = wrapTextLines(measure, st.value ?? "", contentW);
  const blockH = lines.length * lh;

  if (bg !== "none") {
    ctx.save();
    ctx.globalAlpha = bg === "soft" ? BG_SOFT_ALPHA : 1;
    ctx.fillStyle = st.bgColor || "#FFFFFF";
    const bw = contentW + padX * 2, bh = blockH + padY * 2;
    ctx.beginPath();
    ctx.roundRect(-bw / 2, -bh / 2, bw, bh, px * RADIUS_R);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  const x0 = align === "left" ? -contentW / 2 : align === "right" ? contentW / 2 : 0;
  const ys = lines.map((_, i) => -blockH / 2 + lh * (i + 0.5));
  ctx.fillStyle = st.color;

  if (effect === "neon") {
    // CSS 는 "그림자 세 겹 + 선명한 글자" 네 층으로 그린다. 캔버스도 똑같이 네 번 그린다
    // (한 겹만 진하게 칠하면 화면보다 흐릿하거나 진해져서 저장본이 달라진다).
    for (const r of NEON_BLUR) {
      ctx.shadowColor = st.color;
      ctx.shadowBlur = px * r;
      ctx.shadowOffsetY = 0;
      for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], x0, ys[i]);
    }
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
  } else if (effect === "none" && bg === "none") {
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = px * 0.1;
    ctx.shadowOffsetY = px * 0.02;
  } else if (effect === "stroke") {
    // -webkit-text-stroke + paint-order:stroke fill 과 같게 — 획을 먼저, 글자를 나중에
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    ctx.lineWidth = Math.max(1, px * STROKE_R);
    ctx.strokeStyle = contrastInk(st.color);
    for (let i = 0; i < lines.length; i++) ctx.strokeText(lines[i], x0, ys[i]);
  }
  for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], x0, ys[i]);
  ctx.restore();
}

/**
 * 저장/공유 **직전에** 부른다 — 화면에 보이던 글꼴 그대로 저장본에 찍히게 하는 보험.
 * ⚠️ 실측으로 확인한 함정: 캔버스는 글꼴을 스스로 불러오지 않는다. @font-face 가 아직
 *    안 받아진 상태에서 fillText 하면 **말없이 대체 글꼴로** 찍혀서, 화면은 임팩트인데
 *    저장본만 기본 고딕인 사진이 나온다. 그래서 합성 전에 한 번 기다린다.
 *    (실패해도 저장을 막지 않는다 — 대체 글꼴로라도 저장되는 편이 낫다)
 */
export async function ensureTextFonts(layers) {
  const texts = (layers || []).filter((s) => s && s.kind === "text");
  if (!texts.length) return;
  try {
    await Promise.all(texts.map((s) => loadFont(s.font)));
    await Promise.all(texts.map((s) => {
      const f = fontOf(s.font);
      // 실제 글자를 넘겨야 한다 — 구글 폰트 한글은 unicode-range 로 쪼개져 있어서
      // 쓰이는 글자에 해당하는 조각만 내려온다.
      return document.fonts?.load?.(`${f.weight} 40px ${f.css}`, s.value || "가");
    }));
    await document.fonts?.ready;
  } catch (_) { /* 글꼴을 못 받아도 저장은 계속한다 */ }
}

/** 정렬 아이콘 — 인스타처럼 "길이가 다른 가로줄"로 현재 정렬을 그림으로 보여준다.
 *  (옛 아이콘 ⌫/⌦ 은 백스페이스·딜리트 기호라 글자가 지워질 것처럼 읽혔다) */
function AlignIcon({ align }) {
  const W = 20, lens = [16, 10, 16, 9];
  return (
    <svg width="20" height="17" viewBox="0 0 20 17" aria-hidden="true" style={{ display: "block" }}>
      {lens.map((L, i) => {
        const x = align === "left" ? 2 : align === "right" ? 18 - L : (W - L) / 2;
        return <rect key={i} x={x} y={2 + i * 4} width={L} height={2} rx="1" fill="currentColor" />;
      })}
    </svg>
  );
}

/**
 * 사진 위에서 바로 치는 문구 입력.
 * @param at          {} (새 문구, 사진 한가운데) | {x,y} (탭한 자리) | 기존 겹(수정)
 * @param wrapRef     사진 래퍼 DOM ref — 여기에 화면 좌표를 맞춘다(WYSIWYG 의 전제)
 * @param pickColorAt (clientX, clientY) → "#rrggbb" | null  스포이드용 픽셀 추출
 * @param onDone      {value,color,bgColor,bg,font,scale,align,effect} 또는 null(취소)
 */
export default function TextComposer({ at, wrapRef, pickColorAt, onDone }) {
  const init = at && at.id != null ? at : null;
  const [value, setValue] = useState(init?.value || "");
  const [font, setFont] = useState(init?.font || "pretendard");
  const [color, setColor] = useState(init?.color || "#FFFFFF");
  const [bgColor, setBgColor] = useState(init?.bgColor || "#FFFFFF");
  const [bg, setBg] = useState(init?.bg || "none");
  const [align, setAlign] = useState(init?.align || "center");
  const [effect, setEffect] = useState(init?.effect || "none");
  const [scale, setScale] = useState(init?.scale || 0.12);
  const [target, setTarget] = useState("text");   // 색을 어디에 칠할지: "text" | "bg"
  const [padOpen, setPadOpen] = useState(false);  // 연속 스펙트럼 판
  const [padSticky, setPadSticky] = useState(false);
  const [picking, setPicking] = useState(false);  // 스포이드 중
  const [rect, setRect] = useState(null);         // 사진 래퍼의 화면 좌표
  const boxRef = useRef(null);                    // 입력 중인 글자 상자
  const shiftRef = useRef(0);                     // 키보드에 가려 위로 밀어 올린 양(px)
  // 제스처(끌기·크기·회전)를 **컴포저 안에서** 처리한다. 오너 지시 2026-09-17:
  // "완료 누르면 다음 단계에서 되는 게 아니라 한 페이지에서 끝나야 함".
  // ⚠️ 전부 ref 다 — 상태를 바꾸면 리렌더가 나고, 리렌더는 한글 조합을 끊는다.
  const gestRef = useRef({ dx: 0, dy: 0, k: 1, rot: 0 });
  const dragRef = useRef(null);
  const topBarRef = useRef(null);                 // 상단바 — 리렌더 없이 직접 옮긴다
  const bottomRef = useRef(null);                 // 색·글꼴 줄 — 리렌더 없이 직접 옮긴다
  const [, force] = useState(0);
  const taRef = useRef(null);
  const mirrorRef = useRef(null);
  const composingRef = useRef(false);              // 한글/일본어/중국어 조합 중인가
  const padRef = useRef(null);
  const loupeRef = useRef(null);
  const lpRef = useRef(null);                     // 스와치 롱프레스 상태
  const pickDownRef = useRef(false);              // 스포이드 레이어에서 실제로 누른 적이 있나

  /* 사진 래퍼에 딱 맞춘다 — 이게 "사진 위에서 편집"의 전부다.
     레이아웃이 흔들릴 수 있는 모든 계기(리사이즈·키보드)에 다시 잰다. */
  useEffect(() => {
    const el = wrapRef && wrapRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setRect({ left: r.left, top: r.top, width: r.width, height: r.height });
    };
    measure();
    let ro = null;
    try { ro = new ResizeObserver(measure); ro.observe(el); } catch (_) {}
    window.addEventListener("resize", measure);
    const vv = window.visualViewport;
    if (vv) { vv.addEventListener("resize", measure); vv.addEventListener("scroll", measure); }
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener("resize", measure);
      if (vv) { vv.removeEventListener("resize", measure); vv.removeEventListener("scroll", measure); }
    };
  }, [wrapRef]);

  /* 키보드 위에 컨트롤을 붙인다(인스타는 색·글꼴 줄이 키보드 바로 위에 있다).
     ⚠️ 두 가지를 지킨다. 둘 다 2026-09-17 실기에서 비싸게 배운 것이다.
     ① **window.innerHeight 를 쓰지 않는다.** 네이티브 웹뷰(Capacitor)에서는 이 값이
        화면도 웹뷰도 아닌 엉뚱한 크기라, 이걸로 키보드 높이를 빼면 색·글꼴 줄이
        사진 한가운데에 떠 버린다. 보이는 영역은 visualViewport 가 직접 알려 준다 —
        위 끝 = offsetTop, 아래 끝 = offsetTop + height. 그 두 값에만 붙인다.
     ② **여기서 상태를 바꾸지 않는다.** 한글을 치는 동안 키보드 추천줄이 늘었다 줄었다
        하며 이 이벤트가 계속 온다. 그때마다 리렌더하면 **조합 중인 한글이 끊겨**
        "완" 이 "우ㅏㅏㄴ" 으로 깨진다. 그래서 DOM 스타일만 직접 쓴다. */
  useEffect(() => {
    const vv = window.visualViewport;
    let baseH = vv ? vv.height : 0;               // 키보드가 없을 때의 높이(가장 큰 값)
    const apply = () => {
      const top = vv ? vv.offsetTop : 0;
      const h = vv ? vv.height : window.innerHeight;
      if (h > baseH) baseH = h;
      const kbUp = h < baseH - 60;
      queueMicrotask(fitText);
      if (topBarRef.current) topBarRef.current.style.transform = `translateY(${Math.round(top)}px)`;
      const el = bottomRef.current;
      if (el) {
        el.style.top = `${Math.round(top + h)}px`;   // 보이는 영역의 아래 끝 = 키보드 바로 위
        el.style.transform = "translateY(-100%)";
        // 키보드가 떠 있으면 홈 인디케이터 여백이 필요 없다(키보드가 이미 덮는다).
        el.style.paddingBottom = kbUp ? "8px" : "calc(env(safe-area-inset-bottom, 0px) + 10px)";
      }
    };
    apply();
    if (!vv) return;
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    return () => { vv.removeEventListener("resize", apply); vv.removeEventListener("scroll", apply); };
  }, []);

  /* 리렌더가 나면 거울(span)의 글자가 React 가 아는 값으로 되돌아간다.
     조합 중에는 그 값이 아직 낡았으므로, 렌더가 날 때마다 실제 입력값으로 다시 칠한다. */
  useEffect(() => {
    if (composingRef.current && taRef.current) paintMirror(taRef.current.value);
    fitText();
  });

  /* ⚠️ 키보드가 뜨면 iOS(WKWebView)는 **문서를 위로 스크롤**해 입력칸을 드러낸다.
     우리 편집기는 position:fixed 로 짜여 있어서, 그렇게 스크롤되면 사진과 겹쳐 있던
     컴포저가 화면 밖으로 밀려나고 아래 색·글꼴 줄이 사라진다(2026-09-17 실기 버그).
     그래서 컴포저가 떠 있는 동안에는 문서 스크롤을 0 으로 묶어 둔다. */
  useEffect(() => {
    const se = document.scrollingElement || document.documentElement;
    const prevY = window.scrollY || 0;
    const pin = () => {
      if ((window.scrollY || 0) !== 0) window.scrollTo(0, 0);
      if (se && se.scrollTop !== 0) se.scrollTop = 0;
    };
    pin();
    window.addEventListener("scroll", pin, { passive: true });
    document.addEventListener("scroll", pin, { passive: true, capture: true });
    return () => {
      window.removeEventListener("scroll", pin);
      document.removeEventListener("scroll", pin, { capture: true });
      window.scrollTo(0, prevY);
    };
  }, []);

  useEffect(() => { taRef.current?.focus(); }, []);
  // 롱프레스 타이머가 컴포저보다 오래 살지 않게 (닫는 순간 눌려 있었을 수 있다)
  useEffect(() => () => { if (lpRef.current) window.clearTimeout(lpRef.current.timer); }, []);

  // 글꼴 캐러셀이 **미리보기 구실을 하도록** 8종을 한꺼번에 받는다.
  // (전에는 고른 글꼴만 받아서 칩이 전부 시스템 글꼴로 똑같이 보였다)
  useEffect(() => {
    let dead = false;
    // 조합 중 리렌더는 한글을 끊는다 → 조합이 끝난 뒤로 미룬다.
    const bump = () => {
      if (dead) return;
      if (composingRef.current) { setTimeout(bump, 120); return; }
      force((n) => n + 1);
    };
    for (const f of TEXT_FONTS) loadFont(f.key).then(bump);
    const done = () => bump();
    try { document.fonts?.addEventListener?.("loadingdone", done); } catch (_) {}
    return () => {
      dead = true;
      try { document.fonts?.removeEventListener?.("loadingdone", done); } catch (_) {}
    };
  }, []);

  const boxW = rect ? rect.width : (typeof window !== "undefined" ? window.innerWidth : 390);
  // 사진 폭 기준 = 얹힌 뒤 크기와 **완전히** 동일. 반올림하지 않는다 —
  // 겹 쪽은 st.scale * wrapW 를 그대로 쓰므로 여기서 반올림하면 0.04px 어긋난다.
  const px = Math.max(10, scale * boxW);
  const maxW = TEXT_MAXW * boxW;
  const tx = init?.x ?? at?.x ?? 0.5;
  const ty = init?.y ?? at?.y ?? 0.5;

  const layer = { font, color, bgColor, bg, align, effect };
  const tStyle = textLayerStyle(layer, px, maxW);
  const activeColor = bg !== "none" && target === "bg" ? bgColor : color;
  const applyColor = (c) => {
    if (bg !== "none" && target === "bg") setBgColor(c);
    else setColor(c);
  };

  function cycleBg() {
    hap.tap();
    const next = BG_ORDER[(BG_ORDER.indexOf(bg) + 1) % 3];
    if (bg === "none" && next !== "none") {
      // 배경을 처음 켤 때만 기본값을 잡아준다 — 지금 글자색을 배경으로 옮기고
      // 글자는 대비색으로. 그 뒤에는 둘 다 자유롭게 고를 수 있다(강제가 아니다).
      setBgColor(color);
      setColor(contrastInk(color));
      setTarget("text");
    }
    setBg(next);
  }

  /* ---------- 스와치: 짧게 누르면 그 색, 길게 누르면 연속 스펙트럼 ----------
     ⚠️ pointerdown 에서 바로 capture 하면 색 줄을 옆으로 넘기지(페이지 스와이프) 못한다.
        그래서 **롱프레스가 성립한 뒤에만** 잡는다. 그 전에 손가락이 움직이면 스크롤로 보고 취소. */
  function swatchDown(ev, c) {
    const el = ev.currentTarget;
    const L = { id: ev.pointerId, c, fired: false, timer: 0, sx: ev.clientX, sy: ev.clientY, el };
    L.timer = window.setTimeout(() => {
      L.fired = true;
      // 이제부터 손가락이 어디로 가든 우리가 받는다.
      // (그 사이 컴포저가 닫혀 엘리먼트가 떨어져 나갔으면 던지므로 감싼다)
      try { el.setPointerCapture?.(L.id); } catch (_) {}
      hap.light();
      setPadOpen(true);               // 손가락을 뗄 때까지 떠 있는다(놓으면 그 색으로 확정)
    }, 280);
    lpRef.current = L;
  }
  function swatchCancel() {           // 스크롤로 넘어갔다 — 색을 바꾸지 않고 끝낸다
    const L = lpRef.current;
    if (!L) return;
    window.clearTimeout(L.timer);
    lpRef.current = null;
    if (L.fired && !padSticky) setPadOpen(false);
  }
  function padColorFrom(clientX, clientY) {
    const el = padRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const fx = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    const fy = Math.min(1, Math.max(0, (clientY - r.top) / r.height));
    return colorOf(Math.round(fx * 360), 1 - fy);   // 가로=색상, 세로 위=밝게/아래=어둡게
  }
  function swatchMove(ev) {
    const L = lpRef.current;
    if (!L || L.id !== ev.pointerId) return;
    if (!L.fired) {
      // 아직 롱프레스 전인데 움직였다 = 색 줄을 넘기려는 것 → 롱프레스 취소
      if (Math.hypot(ev.clientX - L.sx, ev.clientY - L.sy) > 10) { window.clearTimeout(L.timer); lpRef.current = null; }
      return;
    }
    const c = padColorFrom(ev.clientX, ev.clientY);
    if (c) applyColor(c);
  }
  function swatchUp() {
    const L = lpRef.current;
    if (!L) return;
    window.clearTimeout(L.timer);
    lpRef.current = null;
    if (L.fired) { if (!padSticky) setPadOpen(false); }
    else { hap.tap(); applyColor(L.c); }
  }

  /* ---------- 스포이드 — 사진의 픽셀 색을 집는다 ----------
     브라우저 EyeDropper API 는 iOS Safari/WKWebView 에 없다. 대신 우리 캔버스가
     same-origin 이라 픽셀을 직접 읽을 수 있다(PhotoEditor.pickColorAt). */
  // ⚠️ pointerdown 이 아니라 **click**(= 손을 뗀 뒤)에 켠다. pointerdown 에서 켜면
  //    같은 탭의 pointerup 이 방금 생긴 스포이드 레이어 위로 떨어져 곧바로 꺼진다(실측).
  function beginPick() {
    if (!pickColorAt) return;
    hap.tap();
    pickDownRef.current = false;
    taRef.current?.blur();   // 인스타처럼 키보드를 내리고 사진을 보여준다
    setPicking(true);
  }
  function pickMove(ev) {
    const c = pickColorAt && pickColorAt(ev.clientX, ev.clientY);
    const lo = loupeRef.current;
    if (lo) {
      lo.style.left = ev.clientX + "px";
      lo.style.top = ev.clientY + "px";
      if (c) lo.style.background = c;
    }
    if (c) applyColor(c);
  }
  function endPick() {
    if (!pickDownRef.current) return;   // 스포이드를 켠 그 탭의 손뗌은 무시한다
    pickDownRef.current = false;
    setPicking(false);
    hap.light();
    setTimeout(() => taRef.current?.focus(), 0);
  }

  const mirrorText = (v) => (v === "" ? "문구 입력" : v + (v.endsWith("\n") ? "\u200B" : ""));
  /** 글자 수 상한을 DOM 에 직접 적용하고 그 값을 돌려준다(비제어 textarea 라 여기서 자른다). */
  function clampLen(el) {
    if (el.value.length > MAX_TEXT_LEN) el.value = el.value.slice(0, MAX_TEXT_LEN);
    return el.value;
  }
  /** 조합 중에는 리렌더 없이 거울만 직접 갱신한다(리렌더하면 조합이 끊긴다). */
  function paintMirror(v) {
    const el = mirrorRef.current;
    if (!el) return;
    el.textContent = mirrorText(v);
    el.style.opacity = v === "" ? "0.55" : "1";
  }

  /** 키보드·컨트롤에 가려지지 않게 글자 상자를 위아래로 밀어 준다.
   *  ⚠️ 상태를 쓰지 않는다 — 한글 조합 중에 리렌더가 나면 글자가 깨진다.
   *  밀어 올린 만큼은 완료할 때 위치(y)에 반영하므로, **보이는 자리에 그대로 얹힌다**. */
  function fitText() {
    const box = boxRef.current, stageEl = box && box.parentElement;
    if (!box || !stageEl) return;
    const sr = stageEl.getBoundingClientRect();
    if (!sr.height) return;
    const cur = shiftRef.current;
    // 지금 밀어 놓은 걸 뺀 "본래" 자리에서 계산한다
    const br = box.getBoundingClientRect();
    const top0 = br.top - cur, bot0 = br.bottom - cur;
    const topLimit = (topBarRef.current?.getBoundingClientRect().bottom ?? 0) + 10;
    const botLimit = (bottomRef.current?.getBoundingClientRect().top ?? window.innerHeight) - 10;
    let shift = 0;
    if (bot0 > botLimit) shift = botLimit - bot0;          // 아래에 가리면 위로
    if (top0 + shift < topLimit) shift = topLimit - top0;  // 그래도 위가 잘리면 도로 내린다
    if (bot0 - top0 > botLimit - topLimit) shift = topLimit - top0;  // 글이 길면 위 기준
    shift = Math.round(shift);
    if (shift === cur) return;
    shiftRef.current = shift;
    applyBox();
  }

  /** 글자 상자의 최종 transform — 키보드 회피(shift) + 손가락 제스처를 합쳐 한 번에 쓴다. */
  function applyBox() {
    const box = boxRef.current;
    if (!box) return;
    const g = gestRef.current;
    box.style.transform =
      `translate(-50%,-50%) translate(${Math.round(g.dx)}px, ${Math.round(g.dy + shiftRef.current)}px)`
      + ` rotate(${g.rot.toFixed(2)}deg) scale(${g.k.toFixed(4)})`;
  }

  /* ---------- 한 페이지 안에서 끌기 / 두 손가락 크기·회전 ----------
     사진(stage) 위에서 받는다. 두 번째 손가락은 **사진 아무 데나** 짚어도 된다
     (글자 상자는 작아서 두 손가락을 다 얹을 수 없다 — 편집기 쪽과 같은 규칙). */
  function gestDown(ev) {
    const inBox = boxRef.current && boxRef.current.contains(ev.target);
    const d = dragRef.current || { pointers: new Map(), moved: 0, active: false };
    d.pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (d.pointers.size === 1) {
      // 한 손가락: 글자 위에서 시작했을 때만 "옮기기 후보". 8px 넘게 움직여야 실제로 옮긴다
      // (그 전에는 캐럿 놓기 · 글자 고르기를 그대로 둔다).
      d.candidate = !!inBox;
      d.base = { ...gestRef.current };
    } else if (d.pointers.size === 2) {
      const [a1, b1] = [...d.pointers.values()];
      d.baseDist = Math.hypot(a1.x - b1.x, a1.y - b1.y) || 1;
      d.baseAng = (Math.atan2(b1.y - a1.y, b1.x - a1.x) * 180) / Math.PI;
      d.base = { ...gestRef.current };
      d.active = true;                       // 두 손가락은 곧바로 제스처
      lockSelection(true);
      try { ev.currentTarget.setPointerCapture?.(ev.pointerId); } catch (_) {}
    }
    dragRef.current = d;
  }
  /** 제스처 동안만 글자 선택을 막는다. 키보드는 그대로 둔다(인스타도 안 내린다). */
  function lockSelection(on) {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.webkitUserSelect = on ? "none" : "";
    ta.style.userSelect = on ? "none" : "";
  }
  function gestMove(ev) {
    const d = dragRef.current;
    if (!d || !d.pointers.has(ev.pointerId)) return;
    const prev = d.pointers.get(ev.pointerId);
    d.pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    d.moved += Math.abs(ev.clientX - prev.x) + Math.abs(ev.clientY - prev.y);
    const g = gestRef.current;
    if (d.pointers.size === 1) {
      if (!d.candidate) return;
      if (!d.active && d.moved < 8) return;           // 아직 탭/캐럿 구간
      if (!d.active) {
        d.active = true;
        lockSelection(true);
        try { ev.currentTarget.setPointerCapture?.(ev.pointerId); } catch (_) {}
      }
      ev.preventDefault();                            // iOS 글자 선택·스크롤 차단
      g.dx += ev.clientX - prev.x;
      g.dy += ev.clientY - prev.y;
    } else if (d.pointers.size === 2 && d.baseDist) {
      ev.preventDefault();
      const [a1, b1] = [...d.pointers.values()];
      const dist = Math.hypot(a1.x - b1.x, a1.y - b1.y);
      const ang = (Math.atan2(b1.y - a1.y, b1.x - a1.x) * 180) / Math.PI;
      g.k = Math.min(6, Math.max(0.35, d.base.k * (dist / d.baseDist)));
      g.rot = d.base.rot + (ang - d.baseAng);
    }
    applyBox();
  }
  function gestUp(ev) {
    const d = dragRef.current;
    if (!d) return;
    d.pointers.delete(ev.pointerId);
    if (d.pointers.size === 1) {
      // 손가락 하나가 남으면 남은 손가락 기준으로 이어서 옮긴다
      d.base = { ...gestRef.current };
      d.baseDist = 0;
      d.candidate = true;
      return;
    }
    if (d.pointers.size === 0) {
      dragRef.current = null;
      lockSelection(false);
      // 제스처로 자리가 바뀌었으니 키보드에 가리지 않는지 다시 본다
      queueMicrotask(fitText);
    }
  }

  function done() {
    // 조합이 아직 안 끝난 채 완료를 누를 수 있다 → 상태가 아니라 **DOM 의 현재 값**을 읽는다.
    const raw = taRef.current ? taRef.current.value : value;
    const v = raw.trim();
    hap.tap();
    // 키보드 회피로 밀어 올린 양 + 손가락으로 옮긴 양을 모두 위치에 반영한다.
    // → **화면에서 보이던 그 자리·그 크기·그 각도 그대로** 얹힌다.
    const sr = boxRef.current?.parentElement?.getBoundingClientRect();
    const g = gestRef.current;
    const cl = (n) => Math.min(1.05, Math.max(-0.05, n));
    const x = sr?.width ? cl(tx + g.dx / sr.width) : tx;
    const y = sr?.height ? cl(ty + (g.dy + shiftRef.current) / sr.height) : ty;
    onDone(v
      ? { value: v.slice(0, MAX_TEXT_LEN), color, bgColor, bg, font, align, effect,
          scale: Math.min(0.9, Math.max(0.04, scale * g.k)), rot: g.rot, x, y }
      : null);
  }

  // 거울(mirror)에 넣을 글자. 빈 값이면 안내 문구, 줄바꿈으로 끝나면 빈 줄이 접히지 않게 폭 0 문자.
  const mirror = mirrorText(value);

  const stage = rect
    ? { position: "fixed", left: rect.left, top: rect.top, width: rect.width, height: rect.height,
        borderRadius: 16, boxShadow: "0 0 0 9999px rgba(0,0,0,.45)" }
    : { position: "fixed", inset: 0, background: "rgba(0,0,0,.45)" };

  return createPortal(
    <div style={S.root}>
      <style>{TC_CSS}</style>

      {/* 빈 곳을 누르면 확정 — 인스타와 같다. 동시에 뒤쪽 편집기 조작을 막는 역할도 한다. */}
      <div style={S.catcher} onPointerDown={done} />

      {/* 사진 위 입력 — 스크림은 사진 "바깥"에만 깔린다(box-shadow) */}
      <div
        style={{ ...stage, touchAction: "none" }}
        onPointerDown={gestDown}
        onPointerMove={gestMove}
        onPointerUp={gestUp}
        onPointerCancel={gestUp}
      >
        <div
          ref={boxRef}
          style={{
            ...tStyle,
            position: "absolute",
            left: `${tx * 100}%`,
            top: `${ty * 100}%`,
            transform: "translate(-50%,-50%)",
          }}
        >
          <span ref={mirrorRef} style={{ opacity: value === "" ? 0.55 : 1, pointerEvents: "none", userSelect: "none" }}>
            {mirror}
          </span>
          {/* 투명 textarea — 보이는 건 위 거울이고, 이건 캐럿과 한글 조합만 맡는다.
              ⚠️ **value 로 묶지 말 것** (2026-09-17 실기 버그: "둥" 이 "ㄷㅜㅇㅇ" 로 깨졌다).
              한글은 한 글자를 여러 번의 input 이벤트로 **조합**해 만든다. React 의 제어 컴포넌트는
              input 마다 DOM 의 value 를 제 상태로 되돌려 쓰는데, 그러면 조합 중인 글자가 끊겨
              자모가 낱개로 떨어진다. 그래서 여기서는 비제어(defaultValue)로 두고,
              조합 중에는 거울만 직접 갱신하고 조합이 끝났을 때 상태에 넣는다. */}
          <textarea
            ref={taRef}
            defaultValue={init?.value || ""}
            onCompositionStart={() => { composingRef.current = true; }}
            onCompositionEnd={(e) => {
              composingRef.current = false;
              setValue(clampLen(e.target));
            }}
            onInput={(e) => {
              const v = clampLen(e.target);
              // 조합 중(한글·일본어·중국어)에는 상태를 건드리지 않는다 — 거울만 직접 갱신.
              if (composingRef.current) paintMirror(v);
              else setValue(v);
              queueMicrotask(fitText);
            }}
            rows={1}
            spellCheck={false}
            style={{
              position: "absolute", left: 0, top: 0, width: "100%", height: "100%",
              boxSizing: "border-box", margin: 0, border: "none", outline: "none",
              background: "transparent", resize: "none", overflow: "hidden",
              color: "transparent", WebkitTextFillColor: "transparent", caretColor: color,
              fontFamily: tStyle.fontFamily, fontWeight: tStyle.fontWeight,
              fontSize: px, lineHeight: LINE_H, textAlign: align,
              padding: tStyle.padding, whiteSpace: "pre-wrap",
              overflowWrap: "break-word", wordBreak: "break-word",
            }}
          />
        </div>
      </div>

      {/* 상단 — 정렬은 인스타처럼 왼쪽 끝. 그 옆에 배경(A)·효과. 오른쪽은 취소/완료. */}
      <div ref={topBarRef} style={S.top}>
        <div style={S.topGroup}>
          <button
            style={S.iconBtn}
            onClick={() => { hap.tap(); setAlign(align === "center" ? "left" : align === "left" ? "right" : "center"); }}
            aria-label="정렬"
          ><AlignIcon align={align} /></button>
          <button
            style={{ ...S.iconBtn, ...(bg !== "none" ? S.iconBtnOn : null) }}
            onClick={cycleBg}
            aria-label="글자 배경"
          >A</button>
          <button
            style={{ ...S.effBtn, ...(effect !== "none" ? S.iconBtnOn : null) }}
            onClick={() => {
              hap.tap();
              const i = TEXT_EFFECTS.findIndex(([k]) => k === effect);
              setEffect(TEXT_EFFECTS[(i + 1) % TEXT_EFFECTS.length][0]);
            }}
            aria-label="글자 효과"
          >{(TEXT_EFFECTS.find(([k]) => k === effect) || TEXT_EFFECTS[0])[1]}</button>
        </div>
        <div style={S.topGroup}>
          <button style={S.topBtn} onClick={() => { hap.tap(); onDone(null); }}>취소</button>
          <button style={{ ...S.topBtn, ...S.topDone }} onClick={done}>완료</button>
        </div>
      </div>

      {/* 왼쪽 세로 크기 슬라이더 — 사진 세로 가운데에 맞춘다 */}
      <input
        className="tc-range"
        type="range" min="5" max="34"
        value={Math.round(scale * 100)}
        onChange={(e) => setScale(Number(e.target.value) / 100)}
        style={{ ...S.sizeSlider, top: rect ? rect.top + rect.height / 2 : "45%" }}
        aria-label="글자 크기"
      />

      {/* 아래 — 키보드 바로 위에 붙는다(색 줄 + 글꼴 캐러셀) */}
      <div ref={bottomRef} style={S.bottom}>
        {/* 배경을 켜면 글자색/배경색을 따로 고른다 (흰 배경 + 분홍 글씨 같은 조합이 가능해진다) */}
        {bg !== "none" && (
          <div style={S.targetRow}>
            {[["text", "글자색"], ["bg", "배경색"]].map(([k, label]) => (
              <button
                key={k}
                style={{ ...S.targetBtn, ...(target === k ? S.targetOn : null) }}
                onClick={() => { hap.tap(); setTarget(k); }}
              >{label}</button>
            ))}
            <span style={{ ...S.targetDot, background: activeColor }} />
          </div>
        )}

        {padOpen && (
          <div
            ref={padRef}
            style={S.pad}
            onPointerDown={(e) => { if (padSticky) { e.currentTarget.setPointerCapture?.(e.pointerId); const c = padColorFrom(e.clientX, e.clientY); if (c) applyColor(c); } }}
            onPointerMove={(e) => { if (padSticky && e.buttons !== 0) { const c = padColorFrom(e.clientX, e.clientY); if (c) applyColor(c); } }}
          />
        )}

        <div style={S.swatchRow}>
          {/* 스포이드 — 인스타와 같이 줄 맨 왼쪽 */}
          <button
            style={{ ...S.sideBtn, ...(picking ? S.sideBtnOn : null) }}
            onClick={beginPick}
            aria-label="사진에서 색 집기"
          >💧</button>

          {/* 기본 색 — 3페이지, 좌우로 넘긴다 */}
          <div style={S.pager} data-hscroll>
            {SWATCH_PAGES.map((page, pi) => (
              <div key={pi} style={S.page}>
                {page.map((c) => (
                  <button
                    key={c}
                    style={{ ...S.swatch, background: c, ...(activeColor.toLowerCase() === c.toLowerCase() ? S.swatchOn : null) }}
                    onPointerDown={(e) => swatchDown(e, c)}
                    onPointerMove={swatchMove}
                    onPointerUp={swatchUp}
                    onPointerCancel={swatchCancel}
                    aria-label={`색 ${c}`}
                  />
                ))}
              </div>
            ))}
          </div>

          {/* 무지개 — 탭하면 스펙트럼 판이 고정으로 열린다(길게 누르기를 모르는 사용자용) */}
          <button
            style={{ ...S.sideBtn, background: "conic-gradient(#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)", ...(padSticky ? S.sideBtnOn : null) }}
            onClick={() => { hap.tap(); const n = !padSticky; setPadSticky(n); setPadOpen(n); }}
            aria-label="색 직접 고르기"
          />
        </div>

        <div style={S.fontRow} data-hscroll>
          {TEXT_FONTS.map((f) => (
            <button
              key={f.key}
              style={{
                ...S.fontChip,
                fontFamily: fontFamilyOf(f.key),
                fontWeight: f.weight,
                ...(font === f.key ? S.fontChipOn : null),
              }}
              onClick={() => { hap.tap(); setFont(f.key); }}
            >{f.ko}</button>
          ))}
        </div>
      </div>

      {/* 스포이드 중 — 사진 위에 물방울 커서 */}
      {picking && (
        <div
          style={S.pickLayer}
          onPointerDown={(e) => {
            pickDownRef.current = true;
            e.currentTarget.setPointerCapture?.(e.pointerId);
            pickMove(e);
          }}
          onPointerMove={(e) => { if (pickDownRef.current) pickMove(e); }}
          onPointerUp={endPick}
          onPointerCancel={endPick}
        >
          <div style={S.pickHint}>사진을 눌러 색을 집으세요</div>
          <div ref={loupeRef} style={{ ...S.loupe, background: activeColor }} />
        </div>
      )}
    </div>,
    document.body
  );
}

const S = {
  // 배경을 깔지 않는다 — 사진이 그대로 보여야 편집 중 모습이 곧 결과다.
  root: { position: "fixed", inset: 0, zIndex: 4000 },
  catcher: { position: "absolute", inset: 0 },
  top: {
    position: "fixed", left: 0, right: 0,
    top: "env(safe-area-inset-top, 0px)", height: 54,
    display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px",
  },
  topGroup: { display: "flex", alignItems: "center", gap: 8 },
  topBtn: {
    border: "none", background: "rgba(0,0,0,.35)", color: "#fff", borderRadius: 18,
    fontSize: 14.5, fontWeight: 700, cursor: "pointer", padding: "9px 15px",
    backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
  },
  topDone: { background: "#fff", color: "#111", fontWeight: 800 },
  iconBtn: {
    width: 38, height: 38, borderRadius: 19, border: "1px solid rgba(255,255,255,.35)",
    background: "rgba(0,0,0,.35)", color: "#fff", fontSize: 17, fontWeight: 800, cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
    backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
  },
  effBtn: {
    height: 38, padding: "0 13px", borderRadius: 19, border: "1px solid rgba(255,255,255,.35)",
    background: "rgba(0,0,0,.35)", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer",
    backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
  },
  iconBtnOn: { background: "#fff", color: "#111", border: "1px solid #fff" },
  sizeSlider: {
    position: "fixed", left: 34, width: 168, transform: "translate(-50%,-50%) rotate(-90deg)",
    accentColor: "#fff",
  },
  // 위치는 visualViewport 로 **직접** 잡는다(위 useEffect). bottom 으로 붙이면
  // 네이티브 웹뷰에서 키보드 높이를 잘못 계산해 사진 한가운데로 떠 버린다.
  bottom: {
    position: "fixed", left: 0, right: 0, top: 0,
    transform: "translateY(-100%)",
    padding: "0 12px", paddingBottom: 10,
    display: "flex", flexDirection: "column", gap: 9,
  },
  targetRow: { display: "flex", alignItems: "center", gap: 6 },
  targetBtn: {
    height: 28, padding: "0 12px", borderRadius: 14, border: "1px solid rgba(255,255,255,.3)",
    background: "rgba(0,0,0,.35)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer",
  },
  targetOn: { background: "#fff", color: "#111", border: "1px solid #fff" },
  targetDot: { width: 18, height: 18, borderRadius: 9, border: "2px solid rgba(255,255,255,.8)" },
  pad: {
    height: 150, borderRadius: 14, border: "1px solid rgba(255,255,255,.28)",
    touchAction: "none",
    backgroundImage:
      "linear-gradient(to bottom, #ffffff 0%, rgba(255,255,255,0) 48%, rgba(0,0,0,0) 52%, #000000 100%)," +
      "linear-gradient(to right,#f00 0%,#ff0 16.6%,#0f0 33.3%,#0ff 50%,#00f 66.6%,#f0f 83.3%,#f00 100%)",
  },
  swatchRow: { display: "flex", alignItems: "center", gap: 8 },
  pager: {
    flex: 1, minWidth: 0, display: "flex", overflowX: "auto",
    scrollSnapType: "x mandatory", scrollbarWidth: "none",
  },
  page: {
    // 한 페이지 = 줄 폭 그대로. 9개 × 26px 이라 SE(375px) 에서도 안 넘친다.
    flex: "0 0 100%", display: "flex", justifyContent: "space-between",
    gap: 2, scrollSnapAlign: "start", padding: "3px 1px",
  },
  swatch: {
    width: 26, height: 26, borderRadius: 13, border: "2px solid rgba(255,255,255,.55)",
    flex: "0 0 auto", cursor: "pointer", padding: 0,
    // pan-x: 가로로 밀면 페이지 넘김(브라우저), 가만히 누르면 롱프레스(우리) — 둘 다 산다
    touchAction: "pan-x",
  },
  swatchOn: { border: "3px solid #fff", transform: "scale(1.15)" },
  sideBtn: {
    width: 32, height: 32, borderRadius: 16, flex: "0 0 auto", cursor: "pointer", padding: 0,
    border: "1px solid rgba(255,255,255,.5)", background: "rgba(0,0,0,.4)",
    color: "#fff", fontSize: 15, lineHeight: 1,
  },
  sideBtnOn: { boxShadow: "0 0 0 2px #fff" },
  fontRow: { display: "flex", gap: 8, overflowX: "auto", padding: "2px 2px 4px" },
  fontChip: {
    height: 38, padding: "0 16px", borderRadius: 19, flex: "0 0 auto",
    border: "1px solid rgba(255,255,255,.28)", background: "rgba(0,0,0,.35)",
    color: "#fff", fontSize: 15, cursor: "pointer", whiteSpace: "nowrap",
    backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
  },
  fontChipOn: { background: "#fff", color: "#111", border: "1px solid #fff" },
  pickLayer: { position: "fixed", inset: 0, zIndex: 10, touchAction: "none", cursor: "crosshair" },
  pickHint: {
    position: "absolute", left: "50%", top: "env(safe-area-inset-top, 0px)",
    transform: "translate(-50%, 66px)", background: "rgba(0,0,0,.6)", color: "#fff",
    fontSize: 12.5, fontWeight: 700, padding: "7px 13px", borderRadius: 11, whiteSpace: "nowrap",
  },
  loupe: {
    position: "absolute", left: -99, top: -99, width: 46, height: 46, borderRadius: 23,
    transform: "translate(-50%,-160%)", border: "3px solid #fff", pointerEvents: "none",
    boxShadow: "0 4px 14px rgba(0,0,0,.5)",
  },
};

// 세로 슬라이더는 앱 공통 .pe-range 와 같은 생김새로 (편집기 안에서 혼자 튀지 않게)
const TC_CSS = `
.tc-range { -webkit-appearance: none; appearance: none; height: 26px; background: transparent; }
.tc-range::-webkit-slider-runnable-track { height: 3px; border-radius: 2px; background: rgba(255,255,255,.45); }
.tc-range::-webkit-slider-thumb {
  -webkit-appearance: none; width: 20px; height: 20px; border-radius: 10px; border: none;
  background: #fff; margin-top: -8.5px; box-shadow: 0 1px 6px rgba(0,0,0,.5);
}
.tc-range::-moz-range-track { height: 3px; border-radius: 2px; background: rgba(255,255,255,.45); }
.tc-range::-moz-range-thumb { width: 20px; height: 20px; border-radius: 10px; border: none; background: #fff; }
`;
