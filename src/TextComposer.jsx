// ============================================================
// 문구 입력 — 인스타그램 스토리 방식 (오너 지시 2026-09-17)
//
// 인스타 스토리의 텍스트 편집을 그대로 따른다:
//   · 사진 위에 **바로** 입력한다(작은 입력칸이 아니라 전체 화면, 가운데 정렬, 큰 글씨)
//   · 왼쪽에 **세로 크기 슬라이더**
//   · 아래에 **글꼴 캐러셀**(가로 스크롤) + **색 스와치 줄**
//   · 스와치 맨 끝 무지개를 누르면 **연속 스펙트럼**(색상 + 밝기)으로 바뀐다
//   · 상단 `A` 버튼으로 **배경 없음 → 단색 → 반투명** 순환, 배경을 깔면 글자색 자동 대비
//   · 완료를 누르면 그때부터 드래그·회전 가능한 한 겹(layer)이 된다
//
// 한글 글꼴은 무겁다(하나에 수백 KB). 그래서 **고른 순간에만** 받아온다(lazy).
// 못 받아도 편집을 막지 않는다 — 시스템 글꼴로 계속 쓰고, 받아지면 그때 바뀐다.
// ============================================================
import { useEffect, useRef, useState } from "react";
import * as hap from "./haptics";

/** 글꼴 목록. `g` 는 Google Fonts family 이름(없으면 시스템). */
export const TEXT_FONTS = [
  { key: "basic",  ko: "기본",   css: "-apple-system, 'Apple SD Gothic Neo', sans-serif", weight: 800 },
  { key: "round",  ko: "둥근",   g: "Jua",               css: "'Jua'",               weight: 400 },
  { key: "pen",    ko: "손글씨", g: "Nanum Pen Script",  css: "'Nanum Pen Script'",  weight: 400 },
  { key: "cute",   ko: "귀여운", g: "Gaegu",             css: "'Gaegu'",             weight: 700 },
  { key: "heavy",  ko: "굵게",   g: "Black Han Sans",    css: "'Black Han Sans'",    weight: 400 },
  { key: "sharp",  ko: "각진",   g: "Do Hyeon",          css: "'Do Hyeon'",          weight: 400 },
  { key: "serif",  ko: "명조",   g: "Song Myung",        css: "'Song Myung'",        weight: 400 },
  { key: "brush",  ko: "붓글씨", g: "Nanum Brush Script",css: "'Nanum Brush Script'",weight: 400 },
  { key: "plain",  ko: "담백",   g: "Gowun Dodum",       css: "'Gowun Dodum'",       weight: 400 },
  { key: "pop",    ko: "발랄",   g: "Gamja Flower",      css: "'Gamja Flower'",      weight: 400 },
];
export const fontOf = (k) => TEXT_FONTS.find((f) => f.key === k) || TEXT_FONTS[0];
/** 실제로 쓸 font-family — 못 받았으면 시스템으로 떨어진다(편집을 막지 않는다). */
export const fontFamilyOf = (k) => `${fontOf(k).css}, 'Apple SD Gothic Neo', sans-serif`;

const loaded = new Set();
/** 고른 순간에만 받아온다. 실패해도 던지지 않는다. */
export function loadFont(key) {
  const f = fontOf(key);
  if (!f.g || loaded.has(key)) return Promise.resolve(true);
  loaded.add(key);
  return new Promise((res) => {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = `https://fonts.googleapis.com/css2?family=${f.g.replace(/ /g, "+")}&display=swap`;
    l.onload = () => res(true);
    l.onerror = () => res(false);
    document.head.appendChild(l);
    setTimeout(() => res(false), 4000);   // 느린 망에서도 편집을 막지 않는다
  });
}

/* ---------- 색 ---------- */
// 스와치는 인스타처럼 한 줄. 맨 끝 무지개를 누르면 스펙트럼으로 바뀐다.
const SWATCHES = [
  "#FFFFFF", "#111111", "#E6403C", "#F9C83C", "#5AC46E",
  "#60C9DE", "#4C6FE7", "#8A5DA7", "#F3819F",
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

/** 배경 위 글자색 — 밝은 배경엔 검정, 어두운 배경엔 흰색. */
export function contrastInk(hex) {
  const n = (hex || "#fff").replace("#", "");
  const lin = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const L = 0.2126 * lin(parseInt(n.slice(0, 2), 16))
          + 0.7152 * lin(parseInt(n.slice(2, 4), 16))
          + 0.0722 * lin(parseInt(n.slice(4, 6), 16));
  return L > 0.45 ? "#111111" : "#FFFFFF";
}

const BG_ORDER = ["none", "solid", "soft"];

/**
 * @param initial  수정할 기존 겹(없으면 새로 만든다)
 * @param onDone   {value, color, bg, font, scale, align} 또는 null(취소)
 */
export default function TextComposer({ initial, onDone }) {
  const [value, setValue] = useState(initial?.value || "");
  const [font, setFont] = useState(initial?.font || "basic");
  const [color, setColor] = useState(initial?.color || "#FFFFFF");
  const [bg, setBg] = useState(initial?.bg || "none");
  const [align, setAlign] = useState(initial?.align || "center");
  const [scale, setScale] = useState(initial?.scale || 0.12);
  const [spectrum, setSpectrum] = useState(false);
  const [hue, setHue] = useState(0);
  const [light, setLight] = useState(1);
  const [, force] = useState(0);
  const taRef = useRef(null);

  useEffect(() => { taRef.current?.focus(); }, []);
  // 고른 글꼴만 받아온다. 도착하면 한 번 다시 그려 실제 글꼴로 보이게 한다.
  useEffect(() => { loadFont(font).then(() => force((n) => n + 1)); }, [font]);

  const ink = bg === "none" ? color : contrastInk(color);
  const px = Math.round(scale * (typeof window !== "undefined" ? window.innerWidth : 390));

  const textStyle = {
    fontFamily: fontFamilyOf(font),
    fontWeight: fontOf(font).weight,
    fontSize: px,
    lineHeight: 1.22,
    color: ink,
    textAlign: align,
    ...(bg === "none"
      ? { textShadow: "0 1px 10px rgba(0,0,0,.45)" }
      : {
          backgroundColor: color,
          opacity: bg === "soft" ? 0.62 : 1,
          padding: `${px * 0.12}px ${px * 0.28}px`,
          borderRadius: px * 0.22,
        }),
  };

  function done() {
    const v = value.trim();
    hap.tap();
    onDone(v ? { value: v.slice(0, 60), color, bg, font, scale, align } : null);
  }

  return (
    <div style={S.root}>
      {/* 상단 — 인스타와 같은 배치: 취소 / A(배경) · 정렬 / 완료 */}
      <div style={S.top}>
        <button style={S.topBtn} onClick={() => { hap.tap(); onDone(null); }}>취소</button>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            style={{ ...S.iconBtn, ...(bg !== "none" ? S.iconBtnOn : null) }}
            onClick={() => { hap.tap(); setBg(BG_ORDER[(BG_ORDER.indexOf(bg) + 1) % 3]); }}
            aria-label="글자 배경"
          >A</button>
          <button
            style={S.iconBtn}
            onClick={() => { hap.tap(); setAlign(align === "center" ? "left" : align === "left" ? "right" : "center"); }}
            aria-label="정렬"
          >{align === "center" ? "≡" : align === "left" ? "⌫" : "⌦"}</button>
        </div>
        <button style={{ ...S.topBtn, fontWeight: 800 }} onClick={done}>완료</button>
      </div>

      {/* 왼쪽 세로 크기 슬라이더 (인스타와 같은 위치) */}
      <input
        type="range" min="5" max="34"
        value={Math.round(scale * 100)}
        onChange={(e) => setScale(Number(e.target.value) / 100)}
        style={S.sizeSlider}
        aria-label="글자 크기"
      />

      {/* 사진 위에 바로 입력 */}
      <div style={S.stage} onClick={() => taRef.current?.focus()}>
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, 60))}
          placeholder="문구 입력"
          rows={1}
          style={{ ...S.ta, ...textStyle }}
        />
      </div>

      {/* 아래 — 색 줄, 그다음 글꼴 캐러셀 */}
      <div style={S.bottom}>
        {spectrum ? (
          <div style={S.specWrap}>
            <input
              type="range" min="0" max="360" value={hue}
              onChange={(e) => { const h = Number(e.target.value); setHue(h); setColor(colorOf(h, light)); }}
              style={{ ...S.spec, background: "linear-gradient(90deg,#f00 0%,#ff0 16.6%,#0f0 33.3%,#0ff 50%,#00f 66.6%,#f0f 83.3%,#f00 100%)" }}
              aria-label="색상"
            />
            <input
              type="range" min="0" max="100" value={Math.round(light * 100)}
              onChange={(e) => { const t = Number(e.target.value) / 100; setLight(t); setColor(colorOf(hue, t)); }}
              style={{ ...S.spec, background: `linear-gradient(90deg,#000,${colorOf(hue, 0.5)},#fff)` }}
              aria-label="밝기"
            />
          </div>
        ) : (
          <div style={S.swatchRow} data-hscroll>
            {SWATCHES.map((c) => (
              <button
                key={c}
                style={{ ...S.swatch, background: c, ...(color === c ? S.swatchOn : null) }}
                onClick={() => { hap.tap(); setColor(c); }}
                aria-label={`색 ${c}`}
              />
            ))}
            <button
              style={{ ...S.swatch, background: "conic-gradient(#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)" }}
              onClick={() => { hap.tap(); setSpectrum(true); }}
              aria-label="색 직접 고르기"
            />
          </div>
        )}
        {spectrum && (
          <button style={S.specBack} onClick={() => setSpectrum(false)}>기본 색으로</button>
        )}

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
    </div>
  );
}

const S = {
  root: {
    position: "fixed", inset: 0, zIndex: 4000, background: "rgba(0,0,0,0.55)",
    backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)",
    display: "flex", flexDirection: "column",
    paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)",
  },
  top: {
    flex: "none", height: 52, display: "flex", alignItems: "center",
    justifyContent: "space-between", padding: "0 14px",
  },
  topBtn: {
    border: "none", background: "transparent", color: "#fff",
    fontSize: 16, cursor: "pointer", padding: "8px 4px",
  },
  iconBtn: {
    width: 38, height: 38, borderRadius: 10, border: "1px solid rgba(255,255,255,.35)",
    background: "rgba(0,0,0,.25)", color: "#fff", fontSize: 17, fontWeight: 800, cursor: "pointer",
  },
  iconBtnOn: { background: "#fff", color: "#111", border: "1px solid #fff" },
  sizeSlider: {
    position: "absolute", left: -58, top: "42%", width: 170, transform: "rotate(-90deg)",
    zIndex: 2, accentColor: "#fff",
  },
  stage: {
    flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center",
    padding: "0 54px",
  },
  ta: {
    width: "100%", maxHeight: "60vh", border: "none", outline: "none", background: "transparent",
    resize: "none", overflow: "hidden", caretColor: "#fff", display: "block",
  },
  bottom: { flex: "none", padding: "0 12px 10px", display: "flex", flexDirection: "column", gap: 10 },
  swatchRow: { display: "flex", gap: 10, overflowX: "auto", padding: "4px 2px" },
  swatch: {
    width: 30, height: 30, borderRadius: 15, border: "2px solid rgba(255,255,255,.55)",
    flex: "0 0 auto", cursor: "pointer", padding: 0,
  },
  swatchOn: { border: "3px solid #fff", transform: "scale(1.12)" },
  specWrap: { display: "flex", flexDirection: "column", gap: 8 },
  spec: {
    width: "100%", height: 22, borderRadius: 11, appearance: "none", WebkitAppearance: "none",
    border: "1px solid rgba(255,255,255,.25)", cursor: "pointer",
  },
  specBack: {
    alignSelf: "flex-start", border: "none", background: "transparent",
    color: "rgba(255,255,255,.7)", fontSize: 12.5, cursor: "pointer", padding: "2px 0",
  },
  fontRow: { display: "flex", gap: 8, overflowX: "auto", padding: "2px 2px 4px" },
  fontChip: {
    height: 38, padding: "0 16px", borderRadius: 19, flex: "0 0 auto",
    border: "1px solid rgba(255,255,255,.28)", background: "rgba(0,0,0,.28)",
    color: "#fff", fontSize: 15, cursor: "pointer", whiteSpace: "nowrap",
  },
  fontChipOn: { background: "#fff", color: "#111", border: "1px solid #fff" },
};
