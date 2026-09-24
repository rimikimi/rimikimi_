// ============================================================
// 사진 보정 에디터 — 필름 필터 15종 + 효과 + 스티커/텍스트
//
// 생성 결과물을 "다시 뽑지 않고" 꾸미는 화면. 전부 클라이언트 연산(filters.js)
// 이라 서버 비용이 없고, 원본은 건드리지 않는다(보정본은 저장/공유로만 나감).
//
// 구조:
//   · 미리보기 — 원본을 ~1080px 로 줄인 ImageData 에 filters.applyLook 을 돌려
//     캔버스에 그린다. 슬라이더 드래그 중엔 rAF 로 합쳐 과도한 재계산을 막는다.
//   · 저장/공유 — 원본 해상도로 같은 파이프라인을 한 번 더 돌린다(미리보기와
//     동일 코드·동일 시드라 결과가 화면과 정확히 같다).
//   · 스티커 — 캔버스 위 DOM 레이어. 드래그 이동, 두 손가락 핀치로 크기/회전.
//     저장 시점에 캔버스에 합성된다. 좌표는 이미지 기준 비율(0..1)로 들고 있어
//     미리보기/원본 해상도가 달라도 같은 위치에 찍힌다.
// ============================================================
import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { FILM_PRESETS, presetByKey, applyLook, applyLookWithStrength, applyGeometry, autoStraighten } from "./filters";
import { isNative, nativeSaveToAlbum } from "./nativeBridge";
import { shareImage } from "./share";
import { t, getLang } from "./i18n";
import { supabase } from "./supabaseClient";
import { STICKER_SETS, stickerById } from "./stickerAssets";
// 텍스트 겹의 "생김새"는 전부 TextComposer 가 소유한다 —
// 화면 CSS(textLayerStyle)와 저장 합성(drawTextLayer)이 **같은 파일에 나란히** 있어야
// 한쪽만 고쳐서 화면≠저장본이 되는 사고가 안 난다(오너가 두 번 지적한 그 문제).
import TextComposer, { TEXT_MAXW, textLayerStyle, drawTextLayer, ensureTextFonts } from "./TextComposer";
import * as hap from "./haptics";

const PREVIEW_MAX = 1080; // 미리보기 긴 변
const THUMB_W = 64;       // 필터 칩 썸네일 폭
const GRAIN_SEED = 7;     // 고정 시드 — 미리보기와 저장본의 그레인이 같아야 한다

// 스티커로 고를 수 있는 이모지 (시스템 이모지 = 에셋 0)
const EMOJIS = [
  "🩷", "❤️", "✨", "⭐", "🌟", "💫", "🎀", "🌸", "🌷", "🌼",
  "🍒", "🍓", "🥂", "🎂", "🎈", "🎉", "👑", "💍", "🕶️", "💋",
  "😻", "🐶", "🦋", "🍀", "🌙", "☀️", "☁️", "⚡", "🔥", "💧",
  "📷", "🎞️", "💌", "🏷️", "🧸", "🎵", "🫶", "✌️", "😆", "🥹",
];
const TEXT_COLORS = ["#ffffff", "#231f20", "#B8860B", "#ff5c8a"];

let stickerSeq = 1;

/* ---------- 원본 로드 (data URL / 원격 URL 모두) ---------- */
async function loadSource(src) {
  let url = src;
  let revoke = null;
  if (!/^data:/.test(src)) {
    // 원격은 fetch→blob 으로 받아야 캔버스가 오염(taint)되지 않는다
    const r = await fetch(src);
    if (!r.ok) throw new Error("image fetch " + r.status);
    const blob = await r.blob();
    url = URL.createObjectURL(blob);
    revoke = url;
  }
  const img = new Image();
  img.decoding = "async";
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = () => rej(new Error("image decode fail"));
    img.src = url;
  });
  return { img, revoke };
}

/* ---------- 날짜 스탬프 6종 (아날로그~디지털, 오너 지시) ----------
   스타일마다 서체·색·포맷·위치가 다르다. 시스템 서체만 쓴다(웹폰트 로드 없음). */
export const DATE_STYLES = ["retro7", "reddot", "lcd", "type", "stamp", "script"];
function dateParts() {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(2);
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"][d.getMonth()];
  return { yy, yyyy, mm, dd, MON };
}
function drawDateStamp(ctx, w, h, style) {
  const { yy, yyyy, mm, dd, MON } = dateParts();
  const s = Math.round(w * 0.042); // 기준 크기
  ctx.save();
  ctx.textBaseline = "alphabetic";
  if (style === "retro7") {
    // 필름 컴팩트 카메라의 주황 7세그 각인
    ctx.font = `700 ${s}px "Courier New", monospace`;
    ctx.textAlign = "right";
    ctx.shadowColor = "rgba(255,120,30,0.9)";
    ctx.shadowBlur = s * 0.35;
    ctx.fillStyle = "#FFB03A";
    ctx.fillText(`'${yy} ${Number(mm)} ${Number(dd)}`, w - s * 0.8, h - s * 0.9);
  } else if (style === "reddot") {
    // 진한 레드 디지털 (도트 프린트 느낌)
    ctx.font = `700 ${Math.round(s * 0.92)}px "Courier New", monospace`;
    ctx.textAlign = "right";
    ctx.shadowColor = "rgba(255,40,40,0.75)";
    ctx.shadowBlur = s * 0.25;
    ctx.fillStyle = "#FF3B30";
    ctx.fillText(`${yy} ${mm} ${dd}`, w - s * 0.8, h - s * 0.9);
  } else if (style === "lcd") {
    // 2000년대 디지캠 연두 LCD
    ctx.font = `700 ${Math.round(s * 0.95)}px "Courier New", monospace`;
    ctx.textAlign = "right";
    ctx.shadowColor = "rgba(60,60,60,0.9)";
    ctx.shadowBlur = s * 0.12;
    ctx.fillStyle = "#B7F34C";
    ctx.fillText(`${yyyy}.${mm}.${dd}`, w - s * 0.8, h - s * 0.9);
  } else if (style === "type") {
    // 타자기 화이트
    ctx.font = `400 ${Math.round(s * 0.9)}px "Courier New", monospace`;
    ctx.textAlign = "right";
    ctx.globalAlpha = 0.92;
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = s * 0.15;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(`${dd} ${MON} ${yyyy}`, w - s * 0.8, h - s * 0.9);
  } else if (style === "stamp") {
    // 고무도장 — 좌하단, 살짝 기울고 테두리 박스
    const fs = Math.round(s * 0.85);
    const text = `${MON} ${Number(dd)} '${yy}`;
    ctx.font = `800 ${fs}px Georgia, serif`;
    const tw = ctx.measureText(text).width;
    ctx.translate(s * 1.2, h - s * 1.1);
    ctx.rotate(-3 * Math.PI / 180);
    ctx.globalAlpha = 0.82;
    ctx.strokeStyle = "#E03B30";
    ctx.lineWidth = Math.max(2, fs * 0.09);
    ctx.strokeRect(-fs * 0.45, -fs * 1.25, tw + fs * 0.9, fs * 1.75);
    ctx.fillStyle = "#E03B30";
    ctx.textAlign = "left";
    ctx.fillText(text, 0, 0);
  } else if (style === "script") {
    // 손글씨풍 화이트 이탤릭
    ctx.font = `italic 600 ${Math.round(s * 1.05)}px Georgia, "Times New Roman", serif`;
    ctx.textAlign = "right";
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = s * 0.2;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(`${yy}. ${mm}. ${dd}`, w - s * 0.8, h - s * 0.9);
  }
  ctx.restore();
}


/* ---------- 스티커 합성 (저장 시) ---------- */
function drawSticker(ctx, st, w, h) {
  const px = st.scale * w; // scale = 이미지 폭 대비 크기
  ctx.save();
  ctx.translate(st.x * w, st.y * h);
  ctx.rotate((st.rot * Math.PI) / 180);
  ctx.textBaseline = "middle";
  if (st.kind === "img") {
    // 직접 그린 SVG 스티커. drawImage 는 동기라 미리 디코드된 것만 그린다
    // (없으면 조용히 건너뛴다 — 저장이 실패하는 것보다 낫다).
    const im = st._img;
    if (im && im.complete && im.naturalWidth) {
      const ratio = st.ratio || 1;
      const dw = px, dh = px / ratio;
      ctx.drawImage(im, -dw / 2, -dh / 2, dw, dh);
    }
    ctx.restore();
    return;
  }
  if (st.kind === "text") {
    drawTextLayer(ctx, st, px, w);
    ctx.restore();
    return;
  }
  ctx.textAlign = "center";
  ctx.font = `${px}px "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
  ctx.fillText(st.value, 0, 0);
  ctx.restore();
}

// 프리셋의 기본 효과 조합 — 칩 하나가 "완성된 룩"이 되게 한다 (토이=비네트, 일회용=그레인…)
const fxOf = (p) => ({
  grain: p?.fx?.grain || 0, vignette: p?.fx?.vignette || 0, leak: p?.fx?.leak || 0,
  glow: p?.fx?.glow || 0, blur: p?.fx?.blur || 0, shake: p?.fx?.shake || 0,
  twinkle: p?.fx?.twinkle || 0,
});

// src(1장) 또는 srcs(여러 장, 최대 10) 를 받는다. 여러 장이면 필터/효과는 전체
// 공통(한 번 고르면 전부 적용)이고 스티커만 사진별이다 — "10장에 같은 필터 입혀서
// 한 번에 저장"이 배치 모드의 존재 이유라서다.
// initialPresetKey: 필터 카테고리의 프리셋 카드에서 들어오면 그 룩이 켜진 채 열린다.
export default function PhotoEditor({ src, srcs, initialPresetKey = "none", filename = "rimikimi", onClose }) {
  const sources = srcs && srcs.length ? srcs : [src];
  const multi = sources.length > 1;
  // 에디터가 떠 있는 동안 앱 루트의 스와이프 제스처(뒤로가기·탭 전환)를 끈다.
  // 포털로 루트 밖에 있어 대부분의 터치는 애초에 안 오지만, 전환 도중에 열리는 경우까지
  // 확실히 막는다. 루트 핸들러가 이 플래그를 보고 즉시 빠져나간다.
  useEffect(() => {
    document.body.dataset.modalOpen = "1";
    return () => { delete document.body.dataset.modalOpen; };
  }, []);
  const [idx, setIdx] = useState(0);
  const [ready, setReady] = useState(false);
  const [loadErr, setLoadErr] = useState(false);
  const [tab, setTab] = useState("filter"); // filter | fx | fit | sticker
  // 정방향 맞춤(SPEC §3) — 3:4 가 아니면 잘라 맞춤(무료) / 채워 맞춤(서버, 1크레딧).
  const [fitBusy, setFitBusy] = useState("");   // "" | "crop" | "outpaint"
  const [fitErr, setFitErr] = useState("");
  const [presetKey, setPresetKey] = useState(initialPresetKey);
  const [fx, setFx] = useState(() => fxOf(presetByKey(initialPresetKey)));
  const [chipGroup, setChipGroup] = useState(() => presetByKey(initialPresetKey).group || "phone");
  // 필터 강도 (오너 지시): %표시 없는 슬라이더, 기본 0.7 = 지금의 풀 프리셋 룩.
  // 1.0 까지 올리면 더 진하게(외삽), 0 이면 원본.
  const [strength, setStrength] = useState(0.7);
  const [lens, setLens] = useState(0);
  // 정방향(기울기·세로·가로 원근) — 사진별. geoAuto = 자동 판정 결과(한 번만 돌린다).
  const ZERO_GEO = { tilt: 0, pv: 0, ph: 0 };
  const [geo, setGeo] = useState(ZERO_GEO);
  const [geoAuto, setGeoAuto] = useState(null);
  const [geoBusy, setGeoBusy] = useState(false);
  // 룩(프리셋·효과·강도)은 사진별 (오너 지시: "각각 적용 + 전체 적용 버튼").
  // presetKey/fx/strength 는 "지금 보는 사진"의 룩이고, lookByIdx 가 장부 —
  // 룩을 바꾸는 곳은 반드시 updateLook 을 거쳐 둘을 같이 쓴다. (effect 로 미러링하면
  // 사진 전환 직후 옛 룩이 새 사진에 덮어써지는 레이스가 생겨서 명령형으로 간다)
  const defaultLook = () => ({
    presetKey: initialPresetKey,
    fx: fxOf(presetByKey(initialPresetKey)),
    strength: 0.7,
    lens: 0,   // 렌즈 왜곡 보정 -1..1 (0 = 원본)
    geo: { tilt: 0, pv: 0, ph: 0 },
    geoAuto: null,
  });
  const [lookByIdx, setLookByIdx] = useState({});
  const lookOf = (i) => lookByIdx[i] || defaultLook();
  function updateLook(patch) {
    const next = { presetKey, fx, strength, lens, geo, geoAuto, ...patch };
    setPresetKey(next.presetKey);
    setFx(next.fx);
    setStrength(next.strength);
    setLens(next.lens || 0);
    setGeo(next.geo || ZERO_GEO);
    setGeoAuto(next.geoAuto || null);
    setLookByIdx((p) => ({ ...p, [idx]: next }));
  }
  function switchPhoto(i) {
    const lk = lookOf(i);
    setPresetKey(lk.presetKey);
    setFx(lk.fx);
    setStrength(lk.strength);
    setLens(lk.lens || 0);
    setGeo(lk.geo || ZERO_GEO);
    setGeoAuto(lk.geoAuto || null);
    const g = presetByKey(lk.presetKey).group;
    if (g) setChipGroup(g);
    setReady(false);
    setIdx(i);
  }
  function applyLookToAll() {
    hap.tap();
    const cur = { presetKey, fx, strength, lens };
    const all = {};
    // 정방향(기울기·원근)은 사진마다 다르다 — 전체 적용에서 옮기지 않고 각 사진 것을 둔다.
    for (let i = 0; i < sources.length; i++) {
      const own = lookOf(i);
      all[i] = { ...cur, geo: i === idx ? geo : (own.geo || ZERO_GEO), geoAuto: i === idx ? geoAuto : (own.geoAuto || null) };
    }
    setLookByIdx(all);
    flashToast(t("edit.applyAllDone", { n: sources.length }));
  }
  const [dateStyle, setDateStyle] = useState("none");
  // 스티커는 사진별 — 위치가 그 사진의 구도에 묶여 있어 공유하면 엉뚱한 데 찍힌다
  const [stickersByIdx, setStickersByIdx] = useState({});
  const stickers = stickersByIdx[idx] || [];
  const setStickers = (updater) =>
    setStickersByIdx((p) => ({
      ...p,
      [idx]: typeof updater === "function" ? updater(p[idx] || []) : updater,
    }));
  const [selId, setSelId] = useState(null);
  const [textDraft, setTextDraft] = useState("");
  // 인스타 스토리식 문구 입력 — 사진 위에서 바로 친다. null 이면 닫힘.
  const [composing, setComposing] = useState(null);   // null | {} | 기존 겹
  const [busy, setBusy] = useState(null); // "save" | "share" | null
  const [saveProg, setSaveProg] = useState(""); // 배치 저장 진행 "3/10"
  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);

  const fullImgRef = useRef(null);   // 활성 사진의 원본 <img> (내보내기용)
  const revokeRef = useRef(null);
  const canvasRef = useRef(null);
  const baseRef = useRef(null);      // 활성 사진의 미리보기 ImageData
  // 드래그 중에 쓸 **저해상도** base — 슬라이더를 움직일 때마다 1080px 전체에 applyLook 을
  // 돌리면 한 번이 수십~수백 ms 라 rAF 로 합쳐도 버벅인다(오너 지적 2026-09-17).
  // 드래그 중엔 이걸로 그리고(캔버스가 CSS 로 늘어나 살짝 무를 뿐), 손을 떼면 원본 품질로 다시 그린다.
  const baseSmallRef = useRef(null);
  const draggingRef = useRef(false);
  const settleRef = useRef(0);
  const thumbRef = useRef(null);     // 칩 썸네일용 작은 ImageData
  // 사진 전환이 즉각이도록 최근 3장의 디코드 결과를 캐시 (10장 전부 들고 있으면
  // 2K 기준 200MB+ 라 iOS 웹뷰가 위험하다)
  const cacheRef = useRef(new Map()); // idx → {img, base, thumb, revoke}
  const rafRef = useRef(0);
  const wrapRef = useRef(null);
  const dragRef = useRef(null);      // 스티커 드래그/핀치 상태
  const stickerElRef = useRef(new Map()); // id → DOM (드래그 중 transform 직접 갱신용)
  const overlayRef = useRef(null);   // 닫을 때 150ms 페이드아웃(WAAPI)
  // 아래 셋은 드래그 중에만 보이는 보조 UI. 전부 **ref 로 직접 style 을 만진다** —
  // state 로 두면 매 pointermove 마다 리렌더가 돌아 2K 캔버스 위에서 끊긴다(기존 원칙).
  const canvasTapRef = useRef(null); // 캔버스 탭 판정(짧게=문구 만들기 / 길게=원본 비교)
  const trashRef = useRef(null);     // 인스타식 휴지통 (아래로 끌어서 삭제)
  const guideVRef = useRef(null);    // 세로 중앙 가이드
  const guideHRef = useRef(null);    // 가로 중앙 가이드
  const safeRef = useRef(null);      // 안전영역 표시
  // 스티커 크기는 "이미지 폭 대비 비율"이라 화면상 픽셀 크기는 래퍼 실폭에서 계산한다.
  // (cqw 컨테이너 쿼리 단위는 iOS 16 미만 웹뷰가 몰라서 실측으로 간다)
  const [wrapW, setWrapW] = useState(0);
  useEffect(() => {
    if (!ready || !wrapRef.current) return;
    const el = wrapRef.current;
    const ro = new ResizeObserver(() => setWrapW(el.clientWidth || 0));
    ro.observe(el);
    setWrapW(el.clientWidth || 0);
    return () => ro.disconnect();
  }, [ready]);

  function flashToast(msg, ms = 2200) {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), ms);
  }

  /* ---------- 로드 (활성 사진, 최근 3장 캐시) ---------- */
  async function decodeAt(i) {
    const hit = cacheRef.current.get(i);
    if (hit) return hit;
    const { img, revoke } = await loadSource(sources[i]);
    const scale = Math.min(1, PREVIEW_MAX / Math.max(img.naturalWidth, img.naturalHeight));
    const pw = Math.max(1, Math.round(img.naturalWidth * scale));
    const ph = Math.max(1, Math.round(img.naturalHeight * scale));
    const off = document.createElement("canvas");
    off.width = pw; off.height = ph;
    const octx = off.getContext("2d", { willReadFrequently: true });
    octx.drawImage(img, 0, 0, pw, ph);
    const base = octx.getImageData(0, 0, pw, ph);
    const tw = THUMB_W, th = Math.round((ph / pw) * THUMB_W);
    const toff = document.createElement("canvas");
    toff.width = tw; toff.height = th;
    const tctx = toff.getContext("2d", { willReadFrequently: true });
    tctx.drawImage(img, 0, 0, tw, th);
    const entry = { img, base, thumb: tctx.getImageData(0, 0, tw, th), revoke };
    cacheRef.current.set(i, entry);
    // LRU 3장 초과분 정리
    while (cacheRef.current.size > 3) {
      const [oldK, oldV] = cacheRef.current.entries().next().value;
      if (oldK === i) break;
      if (oldV.revoke) URL.revokeObjectURL(oldV.revoke);
      cacheRef.current.delete(oldK);
    }
    return entry;
  }

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const e = await decodeAt(idx);
        if (dead) return;
        fullImgRef.current = e.img;
        baseRef.current = e.base;
        baseSmallRef.current = makeSmallBase(e.base);
        thumbRef.current = e.thumb;
        setReady(true);
      } catch (_) {
        if (!dead) setLoadErr(true);
      }
    })();
    return () => { dead = true; };
  }, [idx]); // eslint-disable-line react-hooks/exhaustive-deps

  // 언마운트 시 objectURL 정리
  useEffect(() => () => {
    for (const v of cacheRef.current.values()) if (v.revoke) URL.revokeObjectURL(v.revoke);
    if (revokeRef.current) URL.revokeObjectURL(revokeRef.current);
  }, []);

  // 원본 비교(peek) — 프리뷰를 누르고 있는 동안 보정 전 원본을 보여준다 (오너 지시).
  // 라이트룸/VSCO 의 press-to-compare 관례 그대로: 누르면 원본, 떼면 보정본.
  const [peeking, setPeeking] = useState(false);

  /* ---------- 드래그용 저해상도 base ---------- */
  // 긴 변 ~460px. 픽셀 수가 1/5 이하로 줄어 applyLook 이 그만큼 빨라진다.
  function makeSmallBase(base) {
    try {
      const long = Math.max(base.width, base.height);
      if (long <= 520) return base;
      const k = 460 / long;
      const sw = Math.max(1, Math.round(base.width * k));
      const sh = Math.max(1, Math.round(base.height * k));
      const a = document.createElement("canvas");
      a.width = base.width; a.height = base.height;
      a.getContext("2d").putImageData(base, 0, 0);
      const b = document.createElement("canvas");
      b.width = sw; b.height = sh;
      const bc = b.getContext("2d", { willReadFrequently: true });
      bc.drawImage(a, 0, 0, sw, sh);
      return bc.getImageData(0, 0, sw, sh);
    } catch (_) { return base; }
  }

  /* ---------- 미리보기 렌더 (rAF 로 합침) ---------- */
  const renderPreview = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      // 드래그 중엔 저해상도로 — 손 떼면 아래 settle 타이머가 원본 품질로 다시 그린다.
      const base = (draggingRef.current && baseSmallRef.current) || baseRef.current;
      if (!base || !canvas) return;
      const { width: w, height: h } = base;
      if (canvas.width !== w) { canvas.width = w; canvas.height = h; }
      const ctx = canvas.getContext("2d");
      if (peeking) {
        ctx.putImageData(base, 0, 0); // 원본 그대로 (룩·날짜 없음)
        return;
      }
      const copy = new ImageData(new Uint8ClampedArray(base.data), w, h);
      // 기하 보정(정방향·렌즈)은 룩보다 먼저, 한 번의 리샘플로
      if (lens || geo.tilt || geo.pv || geo.ph) applyGeometry(copy.data, w, h, { ...geo, lens });
      applyLookWithStrength(copy.data, w, h, presetByKey(presetKey), { ...fx, seed: GRAIN_SEED }, strength);
      ctx.putImageData(copy, 0, 0);
      if (dateStyle !== "none") drawDateStamp(ctx, w, h, dateStyle);
    });
  }, [presetKey, fx, dateStyle, peeking, strength, lens, geo]);

  useEffect(() => { if (ready) renderPreview(); }, [ready, renderPreview, idx]);

  // 슬라이더 조작 중 표시 — 마지막 입력 후 140ms 지나면 원본 품질로 다시 그린다.
  const beginDrag = useCallback(() => {
    draggingRef.current = true;
    clearTimeout(settleRef.current);
  }, []);
  const endDragSoon = useCallback(() => {
    clearTimeout(settleRef.current);
    settleRef.current = setTimeout(() => {
      draggingRef.current = false;
      renderPreview();
    }, 140);
  }, [renderPreview]);
  useEffect(() => () => clearTimeout(settleRef.current), []);


  /* ---------- 정방향 맞춤 (SPEC §3) ----------
     잘라 맞춤 = 기기 안에서 3:4 중앙 크롭(무료). 얼굴 인식은 없다 — 가운데·위쪽 가중.
     채워 맞춤 = 서버 `/api/generate {fit:"outpaint"}` (1크레딧). 원본 픽셀은 그대로 두고
     바깥만 새로 그린다(서버가 결과 위에 원본을 다시 합성하므로 인물 재생성 불가). */
  function isThreeFour() {
    const b = baseRef.current;
    if (!b) return true;
    return Math.abs(b.width / b.height - 0.75) < 0.02;
  }

  // 자동 정방향 — "정방향" 탭을 처음 열 때 사진마다 한 번. 선(문틀·수평선·건물)을 보고
  // 기울기와 세로 원근을 찾는다. 증거가 약하면(반듯한 사진·선이 없는 사진) 손대지 않는다.
  // 가로 원근은 자동에서 뺐다(테스트에서 오히려 더 틀어짐) — 슬라이더로만.
  function runAutoStraighten() {
    const b = baseRef.current;
    if (!b || geoBusy) return;
    setGeoBusy(true);
    setTimeout(() => {           // "찾는 중" 표시가 먼저 그려지게 한 프레임 양보
      try {
        const r = autoStraighten(b.data, b.width, b.height);
        const info = { confident: r.confident, tilt: r.tilt, pv: r.pv };
        if (r.confident) updateLook({ geo: { tilt: r.tilt, pv: r.pv, ph: 0 }, geoAuto: info });
        else updateLook({ geoAuto: info });
      } catch (_) {
        updateLook({ geoAuto: { confident: false, tilt: 0, pv: 0 } });
      } finally { setGeoBusy(false); }
    }, 30);
  }

  // "정방향" 탭에 있는 동안 사진마다 한 번 자동 — 탭을 열 때만 돌리면 탭에 머문 채 다음 사진으로
  // 넘기면 자동이 안 돌았다(스윕 9/23). ready = 새 사진의 baseRef 가 준비된 뒤.
  useEffect(() => {
    if (tab === "fit" && ready && !geoAuto && !geoBusy) runAutoStraighten();
  }, [tab, idx, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // 편집기 상태를 새 이미지로 갈아끼운다(맞춤 결과 반영).
  async function replaceWithDataUrl(dataUrl) {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl; });
    const long = Math.max(img.width, img.height);
    const k = long > 1080 ? 1080 / long : 1;
    const w = Math.round(img.width * k), h = Math.round(img.height * k);
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    fullImgRef.current = img;
    baseRef.current = ctx.getImageData(0, 0, w, h);
    baseSmallRef.current = makeSmallBase(baseRef.current);
    renderPreview();
  }

  async function doCropFit() {
    const img = fullImgRef.current;
    if (!img || fitBusy) return;
    setFitErr(""); setFitBusy("crop"); hap.tap();
    try {
      const target = 0.75; // 3:4
      let sw = img.width, sh = img.height, sx = 0, sy = 0;
      if (img.width / img.height > target) {      // 가로로 넓다 → 좌우를 자른다
        sw = Math.round(img.height * target);
        sx = Math.round((img.width - sw) / 2);
      } else {                                     // 세로로 길다 → 위아래를 자른다
        sh = Math.round(img.width / target);
        sy = Math.round((img.height - sh) * 0.35); // 얼굴은 보통 위쪽 — 위를 조금 더 남긴다
      }
      const c = document.createElement("canvas");
      c.width = sw; c.height = sh;
      c.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      await replaceWithDataUrl(c.toDataURL("image/jpeg", 0.95));
    } catch (_) {
      setFitErr("잘라 맞춤에 실패했어요. 다시 시도해 주세요.");
    } finally { setFitBusy(""); }
  }

  async function doOutpaintFit() {
    const img = fullImgRef.current;
    if (!img || fitBusy) return;
    setFitErr(""); setFitBusy("outpaint"); hap.tap();
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) { setFitErr("로그인이 필요해요."); return; }
      const c = document.createElement("canvas");
      const long = Math.min(1600, Math.max(img.width, img.height));
      const k = long / Math.max(img.width, img.height);
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      const b64 = c.toDataURL("image/jpeg", 0.92).split(",")[1];
      const r = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ fit: "outpaint", mimeType: "image/jpeg", base64: b64 }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.base64) {
        setFitErr(j?.error || "채워 맞춤을 하지 못했어요. 크레딧은 차감되지 않았어요 🙂");
        return;
      }
      await replaceWithDataUrl(`data:${j.mimeType || "image/jpeg"};base64,${j.base64}`);
    } catch (_) {
      setFitErr("채워 맞춤을 하지 못했어요. 크레딧은 차감되지 않았어요 🙂");
    } finally { setFitBusy(""); }
  }

  /* ---------- 필터 칩 썸네일 ---------- */
  // 각 칩의 <canvas> 가 마운트될 때 한 번 그린다 (프리셋당 64px — 순간).
  // 사진을 바꾸면 JSX 쪽 key 에 idx 가 들어가 캔버스가 새로 마운트돼 다시 그려진다.
  const thumbCanvasCb = useCallback((el, key) => {
    const tb = thumbRef.current;
    if (!el || !tb || el.dataset.drawn) return;
    el.dataset.drawn = "1";
    el.width = tb.width; el.height = tb.height;
    const copy = new ImageData(new Uint8ClampedArray(tb.data), tb.width, tb.height);
    applyLook(copy.data, tb.width, tb.height, presetByKey(key), {});
    el.getContext("2d").putImageData(copy, 0, 0);
  }, [ready, idx]); // eslint-disable-line react-hooks/exhaustive-deps

  // 사진을 바꾸면 선택 상태 해제 (스티커는 사진별이라 남의 선택이 남는다)
  useEffect(() => { setSelId(null); }, [idx]);

  /* ---------- 스티커 ---------- */
  function addEmoji(e) {
    hap.tap();
    const st = { id: stickerSeq++, kind: "emoji", value: e, x: 0.5, y: 0.5, scale: 0.22, rot: 0 };
    setStickers((p) => [...p, st]);
    setSelId(st.id);
  }
  function addImgSticker(item) {
    hap.tap();
    const im = new Image();
    im.src = item.src;                    // data URI — 네트워크 요청 없음
    const st = {
      id: stickerSeq++, kind: "img", value: item.id, src: item.src, ratio: item.ratio || 1,
      x: 0.5, y: 0.5, scale: 0.3, rot: 0, _img: im,
    };
    setStickers((p) => [...p, st]);
    setSelId(st.id);
  }

  /** 컴포저 완료 — 새로 만들거나, 고르던 겹을 갱신한다.
   *  새 겹은 **탭한 자리**(composing.x/y)에 생긴다 — 인스타처럼. 없으면 한가운데. */
  function commitText(out) {
    const at = composing || {};
    const editingId = at.id;
    setComposing(null);
    if (!out) return;
    if (editingId != null) {
      setStickers((p) => p.map((s0) => (s0.id === editingId ? { ...s0, ...out } : s0)));
      return;
    }
    const st = {
      id: stickerSeq++, kind: "text", ...out,
      // 컴포저가 키보드를 피해 밀어 올렸으면 out.x/y 가 **보이던 자리**다 — 그게 우선이다.
      x: typeof out.x === "number" ? out.x : (typeof at.x === "number" ? at.x : 0.5),
      y: typeof out.y === "number" ? out.y : (typeof at.y === "number" ? at.y : 0.5),
      rot: typeof out.rot === "number" ? out.rot : 0,
    };
    setStickers((p) => [...p, st]);
    setSelId(st.id);
  }

  /** 사진 위 한 점(화면 좌표)을 탭 → 그 자리에 문구를 만든다 (인스타 진입 방식). */
  function openTextAt(clientX, clientY) {
    const wrap = wrapRef.current;
    if (!wrap) { setComposing({}); return; }
    const r = wrap.getBoundingClientRect();
    const cl = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    hap.tap();
    setComposing({
      x: cl((clientX - r.left) / r.width, 0.08, 0.92),
      // 아래쪽 끝은 키보드에 가려 안 보인다 — 만들 때만 살짝 위로 물린다(옮기는 건 자유)
      y: cl((clientY - r.top) / r.height, 0.08, 0.85),
    });
  }

  /** 스포이드용 — 화면 좌표의 **보이는 픽셀**(필터까지 먹은 색)을 뽑아준다.
   *  캔버스가 same-origin(원격 이미지도 fetch→blob 으로 받는다)이라 getImageData 가 된다.
   *  브라우저 EyeDropper API 는 iOS WKWebView 에 없어서 쓸 수 없다. */
  const pickColorAt = useCallback((clientX, clientY) => {
    const cv = canvasRef.current, wrap = wrapRef.current;
    if (!cv || !wrap) return null;
    const r = wrap.getBoundingClientRect();
    const u = (clientX - r.left) / r.width, v = (clientY - r.top) / r.height;
    if (u < 0 || u > 1 || v < 0 || v > 1) return null;
    try {
      const x = Math.min(cv.width - 1, Math.max(0, Math.round(u * cv.width)));
      const y = Math.min(cv.height - 1, Math.max(0, Math.round(v * cv.height)));
      const d = cv.getContext("2d").getImageData(x, y, 1, 1).data;
      return "#" + [d[0], d[1], d[2]].map((n) => n.toString(16).padStart(2, "0")).join("");
    } catch (_) { return null; }
  }, []);

  function removeSticker(id) {
    hap.light();
    setStickers((p) => p.filter((s) => s.id !== id));
    setSelId((cur) => (cur === id ? null : cur));
  }

  /* 편집기가 떠 있는 동안 문서 스크롤을 막는다.
     ⚠️ iOS 는 손가락을 끌 때 페이지가 조금이라도 스크롤되면 **pointercancel** 을 던져
        진행 중인 드래그를 끊어 버린다. 맥 브라우저에는 없는 동작이라 실기에서만
        "글자가 안 옮겨진다" 로 나타난다(2026-09-17 지적). 아예 스크롤을 못 하게 한다. */
  useEffect(() => {
    const b = document.body, d = document.documentElement;
    const prev = { bo: b.style.overflow, dof: d.style.overflow, ov: b.style.overscrollBehavior };
    b.style.overflow = "hidden";
    d.style.overflow = "hidden";
    b.style.overscrollBehavior = "none";
    const pin = () => { if (window.scrollY) window.scrollTo(0, 0); };
    window.addEventListener("scroll", pin, { passive: true });
    return () => {
      b.style.overflow = prev.bo; d.style.overflow = prev.dof; b.style.overscrollBehavior = prev.ov;
      window.removeEventListener("scroll", pin);
    };
  }, []);

  /* ---------- 드래그 중 보조 UI (휴지통 · 중앙 가이드 · 안전영역) ---------- */
  function showTrash(on) {
    const el = trashRef.current;
    if (!el) return;
    el.style.opacity = on ? "1" : "0";
    el.style.transform = on ? "translate(-50%,0) scale(1)" : "translate(-50%,14px) scale(.9)";
    if (!on) el.style.background = "rgba(0,0,0,.55)";
    // 끄는 동안엔 겹이 사진 밖으로 나가도 잘리지 않게 한다 — 안 그러면 휴지통까지 가기 전에
    // 사진 아래 모서리에서 글자가 사라져 버린다(인스타는 손끝을 끝까지 따라온다).
    if (wrapRef.current) wrapRef.current.style.overflow = on ? "visible" : "hidden";
  }
  function setTrashHot(hot) {
    const el = trashRef.current;
    if (!el) return;
    el.style.background = hot ? "#E6403C" : "rgba(0,0,0,.55)";
    el.style.transform = hot ? "translate(-50%,0) scale(1.2)" : "translate(-50%,0) scale(1)";
  }
  function overTrash(x, y) {
    const el = trashRef.current;
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2)) < 64;
  }
  function showGuides(v, h) {
    if (guideVRef.current) guideVRef.current.style.opacity = v ? "1" : "0";
    if (guideHRef.current) guideHRef.current.style.opacity = h ? "1" : "0";
  }
  function showSafe(on) {
    if (safeRef.current) safeRef.current.style.opacity = on ? "1" : "0";
  }

  /** 사진 아무 데나 짚은 두 번째 손가락을 진행 중인 겹 제스처에 합류시킨다.
   *  합류시켰으면 true — 그 경우 캔버스 본래 동작(원본 비교·탭해서 문구 만들기)은 건너뛴다.
   *  (글자 상자가 작아 두 손가락을 다 얹을 수 없어서 크기·회전이 사실상 불가능했다) */
  function joinPinch(ev) {
    const d = dragRef.current;
    if (!d || d.pointers.size !== 1 || d.pointers.has(ev.pointerId)) return false;
    if (canvasTapRef.current?.timer) window.clearTimeout(canvasTapRef.current.timer);
    canvasTapRef.current = null;
    d.pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    const [a, b] = [...d.pointers.values()];
    d.baseDist = Math.hypot(a.x - b.x, a.y - b.y);
    d.baseAng = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    // 지금까지 끌어 놓은 값을 기준으로 삼는다(안 그러면 두 번째 손가락을 대는 순간 튄다)
    if (d.live) d.start = { ...d.start, scale: d.live.scale, rot: d.live.rot };
    d.movedPx = 999;                       // 크기 조절은 "탭"이 아니다
    // 캡처가 실패해도 제스처는 계속돼야 한다 — 여기서 예외가 나면 핸들러가 통째로 죽는다.
    try { ev.currentTarget.setPointerCapture?.(ev.pointerId); } catch (_) {}
    return true;
  }

  // 드래그(1손가락) / 핀치 크기·회전(2손가락). 포인터 이벤트로 통일.
  function stickerPointerDown(ev, st) {
    ev.stopPropagation();
    setSelId(st.id);
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const d = dragRef.current && dragRef.current.id === st.id ? dragRef.current : { id: st.id, pointers: new Map() };
    d.pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    d.rect = rect;
    d.start = { x: st.x, y: st.y, scale: st.scale, rot: st.rot };
    // "탭인가 드래그인가" 판정용 — 탭이면 다시 편집(인스타처럼 키보드가 올라온다)
    if (d.downT == null) { d.downT = Date.now(); d.movedPx = 0; }
    if (d.pointers.size === 2) {
      const [a, b] = [...d.pointers.values()];
      d.baseDist = Math.hypot(a.x - b.x, a.y - b.y);
      d.baseAng = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    }
    dragRef.current = d;
    try { ev.currentTarget.setPointerCapture?.(ev.pointerId); } catch (_) {}
  }
  // 드래그 중엔 React state 를 건드리지 않는다(모션 리뷰). 매 pointermove 마다 setStickers 로
  // left/top(%) 을 바꾸면 레이아웃→페인트→합성이 프레임마다 돌고 stickers.map 재렌더까지
  // 얹혀 2K 캔버스 위에서 끊겼다. 이제 이동·핀치는 엘리먼트의 transform 만 직접 바꾸고
  // (합성 전용), 손을 뗄 때 한 번만 state 에 커밋한다. 좌표 체계(0..1 비율)는 그대로.
  // 겹의 "평상시" transform. 렌더와 **글자 하나까지 같은 문자열**이어야 한다.
  // ⚠️ 드래그가 끝날 때 el.style.transform = "" 로 지우면 안 된다(실측으로 잡은 버그):
  //    React 는 이전 렌더와 transform 값이 같으면 DOM 에 다시 쓰지 않는다. 우리가 지워버린
  //    채로 남아서, 손을 뗀 겹이 제 크기의 절반만큼 오른쪽·아래로 어긋나 보인다
  //    (저장본은 st.x/st.y 로 바르게 찍히므로 "화면과 저장본이 다른" 그 현상이 된다).
  const layerTransform = (rot) => `translate(-50%,-50%) rotate(${rot}deg)`;

  function paintStickerLive(d) {
    const el = stickerElRef.current.get(d.id);
    if (!el || !d.live) return;
    const offX = (d.live.x - d.start.x) * d.rect.width;
    const offY = (d.live.y - d.start.y) * d.rect.height;
    // 휴지통에 가까워질수록 겹이 줄어든다(인스타와 같은 신호). 사진 밖으로 잘려 나가는 것도 같이 줄어든다.
    const k = (d.live.scale / d.start.scale) * (d.trashK ?? 1);
    el.style.transform =
      `translate(${offX}px, ${offY}px) translate(-50%,-50%) rotate(${d.live.rot}deg) scale(${k})`;
  }
  function stickerPointerMove(ev) {
    const d = dragRef.current;
    if (!d || !d.pointers.has(ev.pointerId)) return;
    ev.preventDefault();
    const prev = d.pointers.get(ev.pointerId);
    d.pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    d.movedPx = (d.movedPx || 0) + Math.abs(ev.clientX - prev.x) + Math.abs(ev.clientY - prev.y);
    if (!d.live) d.live = { ...d.start };
    if (d.pointers.size === 1) {
      const dx = (ev.clientX - prev.x) / d.rect.width;
      const dy = (ev.clientY - prev.y) / d.rect.height;
      d.live.x = Math.min(1.05, Math.max(-0.05, d.live.x + dx));
      d.live.y = Math.min(1.05, Math.max(-0.05, d.live.y + dy));
      // 가운데 정렬 가이드 — 임계 안에 들면 붙여주고 선을 보여준다(인스타의 파란 선)
      const snapV = Math.abs(d.live.x - 0.5) < 0.015;
      const snapH = Math.abs(d.live.y - 0.5) < 0.015;
      if (snapV) d.live.x = 0.5;
      if (snapH) d.live.y = 0.5;
      if (snapV !== d.snapV || snapH !== d.snapH) {
        if (snapV || snapH) hap.light();   // 붙는 순간에만 아주 약하게
        d.snapV = snapV; d.snapH = snapH;
        showGuides(snapV, snapH);
      }
      showSafe(true);
      // 아래로 끌어 휴지통에 버리기 (한 번만 띄운다 — 매 프레임 띄우면 hover 확대가 지워진다)
      if ((d.movedPx || 0) > 8) {
        if (!d.trashShown) { d.trashShown = true; showTrash(true); }
        const hot = overTrash(ev.clientX, ev.clientY);
        if (hot !== d.overTrash) { if (hot) hap.light(); d.overTrash = hot; setTrashHot(hot); }
        // 휴지통까지 남은 거리로 겹을 줄인다 (160px 밖=1.0 → 휴지통 위=0.5)
        const tr = trashRef.current?.getBoundingClientRect();
        if (tr) {
          const dist = Math.hypot(ev.clientX - (tr.left + tr.width / 2), ev.clientY - (tr.top + tr.height / 2));
          d.trashK = Math.max(0.5, Math.min(1, 0.5 + ((dist - 56) / 160) * 0.5));
        }
      }
    } else if (d.pointers.size === 2 && d.baseDist) {
      // 두 손가락(크기·회전) 중엔 삭제 제스처가 아니다 — 휴지통을 감춘다
      if (d.overTrash) { d.overTrash = false; setTrashHot(false); }
      if (d.trashShown) { d.trashShown = false; showTrash(false); }
      d.trashK = 1;
      const [a, b] = [...d.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      const k = dist / d.baseDist;
      d.live.scale = Math.min(0.9, Math.max(0.04, d.start.scale * k));
      d.live.rot = d.start.rot + (ang - d.baseAng);
    }
    paintStickerLive(d);
  }
  function stickerPointerUp(ev) {
    const d = dragRef.current;
    if (!d) return;
    d.pointers.delete(ev.pointerId);
    if (d.pointers.size === 0) {
      dragRef.current = null;
      showTrash(false); showGuides(false, false); showSafe(false);
      const el = stickerElRef.current.get(d.id);
      // 드래그용 임시 transform 을 "평상시" 값으로 되돌린다 (지우면 안 된다 — 위 주석 참고)
      if (el) el.style.transform = layerTransform((d.live || d.start).rot);
      // 휴지통 위에서 손을 떼면 삭제 (인스타의 텍스트·스티커 공통 삭제 제스처)
      if (d.overTrash) { removeSticker(d.id); return; }
      // 손가락 떨림(8px 미만·400ms 미만)은 이동이 아니라 **탭**이다 → 텍스트면 다시 편집.
      // (인스타: 얹은 글자를 한 번 탭하면 키보드가 다시 올라온다)
      const isTap = (d.movedPx || 0) < 8 && Date.now() - (d.downT || 0) < 400;
      if (d.live && !isTap) {
        const live = d.live;
        setStickers((p) => p.map((s) => (s.id === d.id ? { ...s, ...live } : s)));
        return;
      }
      if (isTap) {
        const cur = (stickersByIdx[idx] || []).find((s) => s.id === d.id);
        if (cur && cur.kind === "text") { hap.tap(); setComposing(cur); }
      }
    } else {
      // 손가락 하나가 남으면 남은 손가락 기준으로 이동을 이어간다 — 기준점을 현재 값으로 재설정
      d.baseDist = null; d.baseAng = null;
      if (d.live) {
        d.start = { ...d.live };
        const el = stickerElRef.current.get(d.id);
        if (el) {
          // 커밋 없이 이어가므로 지금 위치를 새 기준(start)으로 두고 transform 을 다시 계산
          paintStickerLive(d);
        }
      }
    }
  }

  /* ---------- 내보내기 (원본 해상도) ---------- */
  // i 번째 사진을 전체 해상도로 합성. img 를 안 주면 새로 디코드한다(배치 저장용 —
  // 10장을 전부 캐시에 올리면 메모리가 위험해서 장당 디코드→저장→해제로 돈다).
  async function renderFullAt(i, imgIn = null) {
    let img = imgIn, revoke = null;
    if (!img) {
      const loaded = await loadSource(sources[i]);
      img = loaded.img; revoke = loaded.revoke;
    }
    try {
      const w = img.naturalWidth, h = img.naturalHeight;
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      // 룩은 사진별 — i 번 사진의 장부를 쓴다 (지금 보는 사진도 장부에 최신값이 있다)
      const lk = lookOf(i);
      const hasLook = lk.presetKey !== "none"
        || lk.fx.grain || lk.fx.vignette || lk.fx.leak || lk.fx.glow || lk.fx.blur || lk.fx.shake
        || lk.fx.twinkle;
      // ⚠️ 왜곡 보정은 룩이 없어도 저장본에 반영돼야 한다 — hasLook 에만 걸어두면
      //    "필터 없이 왜곡만 고친" 사진이 원본 그대로 저장된다.
      const g = lk.geo || {};
      const hasGeo = !!(lk.lens || g.tilt || g.pv || g.ph);
      // ⚠️ 정방향도 같은 이유로 여기 걸어야 한다 — 필터 없이 기울기만 고친 사진.
      if (hasLook || hasGeo) {
        const id = ctx.getImageData(0, 0, w, h);
        if (hasGeo) applyGeometry(id.data, w, h, { ...g, lens: lk.lens || 0 });
        // 원본이 커서(2K) 수백 ms 걸릴 수 있다 — 호출측이 busy 표시를 켠 채로 부른다
        if (hasLook) applyLookWithStrength(id.data, w, h, presetByKey(lk.presetKey), { ...lk.fx, seed: GRAIN_SEED }, lk.strength);
        ctx.putImageData(id, 0, 0);
      }
      if (dateStyle !== "none") drawDateStamp(ctx, w, h, dateStyle);
      for (const st of stickersByIdx[i] || []) drawSticker(ctx, st, w, h);
      return c.toDataURL("image/jpeg", 0.95);
    } finally {
      if (revoke) URL.revokeObjectURL(revoke);
    }
  }

  async function saveDataUrl(data, name) {
    if (isNative()) {
      const r = await nativeSaveToAlbum(data, name);
      return !!r?.ok;
    }
    const a = document.createElement("a");
    a.href = data;
    a.download = name + ".jpg";
    document.body.appendChild(a); a.click(); a.remove();
    return true;
  }

  // 저장 — 1장이면 그 장, 여러 장이면 전부(같은 룩, 사진별 스티커) 순차 저장
  async function handleSave() {
    if (busy) return;
    setBusy("save");
    try {
      await new Promise((r) => setTimeout(r, 30)); // busy 표시가 먼저 그려지게
      // 합성 전에 글꼴 도착을 기다린다 — 안 그러면 저장본만 대체 글꼴로 찍힐 수 있다
      await ensureTextFonts(Object.values(stickersByIdx).flat());
      let okAll = true;
      for (let i = 0; i < sources.length; i++) {
        if (multi) setSaveProg(`${i + 1}/${sources.length}`);
        const data = await renderFullAt(i, i === idx ? fullImgRef.current : null);
        const name = multi ? `${filename}_edit_${i + 1}` : `${filename}_edit`;
        const ok = await saveDataUrl(data, name);
        okAll = okAll && ok;
      }
      okAll ? hap.done() : hap.warn();
      flashToast(okAll ? t("save.toast.done") : t("save.toast.fail"));
    } catch (_) {
      hap.warn();
      flashToast(t("save.toast.fail"));
    } finally {
      setBusy(null);
      setSaveProg("");
    }
  }

  // 공유는 지금 보고 있는 사진 1장만 — 10장짜리 공유 시트는 대부분의 앱이 버벅인다
  async function handleShare() {
    if (busy) return;
    setBusy("share");
    try {
      await new Promise((r) => setTimeout(r, 30));
      await ensureTextFonts(stickersByIdx[idx] || []);   // 저장과 같은 이유 (위 주석 참고)
      const data = await renderFullAt(idx, fullImgRef.current);
      const r = await shareImage({
        src: data,
        filename: filename + "_edit.jpg",
        title: t("invite.shareTitle"),
        text: t("share.caption"),
      });
      if (r.ok) flashToast(t("share.doneToast"));
    } catch (_) {
      flashToast(t("save.toast.fail"));
    } finally {
      setBusy(null);
    }
  }

  const sel = stickers.find((s) => s.id === selId);

  // ⚠️ body 로 포털한다 (main 안에 두면 안 된다).
  //   화면 전환(navTransition)은 <main> 에 transform / will-change:transform 을 건다.
  //   transform 이 걸린 조상은 position:fixed 의 컨테이닝 블록이 되므로, 에디터가 main 안에
  //   있으면 전환·엣지 스와이프 때마다 오버레이가 화면과 같이 옆으로 끌려간다(실제 버그).
  //   포털로 app 루트 바깥에 두면 루트의 스와이프 핸들러도 에디터 터치를 못 받는다
  //   = 필터 칩을 옆으로 넘겨도 뒤로가기 제스처가 발동하지 않는다.
  // 닫기: 진입(300ms)과 달리 사용자 행동이라 빠르게 — 하지만 0ms 는 "뚝 끊김"이라 150ms 페이드.
  function closeEditor() {
    const el = overlayRef.current;
    let reduced = false;
    try { reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (_) {}
    if (!el || reduced || !el.animate) return onClose();
    el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, easing: "cubic-bezier(0.32,0.72,0,1)", fill: "forwards" })
      .finished.then(onClose, onClose);
  }

  return createPortal(
    <div style={ES.overlay} className="pe-in" ref={overlayRef}>
      <style>{PE_CSS}</style>
      {/* 문구 입력은 **사진 위에서** 일어난다 — 컴포저가 wrapRef 의 화면 좌표에 맞춰 뜬다.
          그래서 편집 중 크기·위치·줄바꿈이 확정 뒤와 완전히 같다(WYSIWYG). */}
      {composing && ready && (
        <TextComposer
          at={composing}
          wrapRef={wrapRef}
          pickColorAt={pickColorAt}
          onDone={commitText}
        />
      )}
      {toast && <div style={ES.toast} className="pe-toast" onClick={() => setToast("")}>{toast}</div>}

      {/* 휴지통 — 겹을 끌면 나타나고, 그 위에서 손을 떼면 지워진다(인스타와 같은 삭제).
          state 를 쓰지 않는다: 드래그 중 리렌더를 막으려고 ref 로 style 만 만진다. */}
      {/* 아이콘은 이모지가 아니라 선화 SVG 다 — 이모지는 기기마다 그림이 달라지고 싸구려로 보인다. */}
      <div ref={trashRef} style={ES.trash} aria-hidden="true">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
             stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 6.5h16" />
          <path d="M9.5 6.5V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2v1.3" />
          <path d="M6.6 6.5l.8 12.1A1.5 1.5 0 0 0 8.9 20h6.2a1.5 1.5 0 0 0 1.5-1.4l.8-12.1" />
          <path d="M10.4 10v6M13.6 10v6" />
        </svg>
      </div>

      {/* 상단 바 — 문구를 치는 동안엔 감춘다(인스타처럼 화면 전체가 텍스트 편집이 된다).
          ⚠️ display:none 이 아니라 visibility 다. 없애면 stage(flex:1)가 커지면서 사진 크기가
             변하고, 글자 크기 기준(wrapW)이 바뀌어 "편집 중 크기 ≠ 얹힌 크기"로 되돌아간다. */}
      <div style={{ ...ES.topBar, ...(composing ? ES.hidden : null) }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <button style={ES.topBtn} onClick={closeEditor}>✕</button>
          <div style={ES.topTitle}>{t("edit.title")}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {/* Aa — 인스타처럼 상단에서 바로 문구를 시작한다(탭 고르기·빨간 버튼을 거치지 않는다) */}
          <button
            style={{ ...ES.topAction, ...ES.topAa }}
            disabled={!ready}
            onClick={() => { hap.tap(); setSelId(null); setComposing({}); }}
            aria-label="문구 추가"
          >Aa</button>
          <button style={ES.topAction} disabled={!!busy} onClick={handleShare}>
            {busy === "share" ? "…" : t("common.share")}
          </button>
          <button style={{ ...ES.topAction, ...ES.topActionPrimary }} disabled={!!busy} onClick={handleSave}>
            {busy === "save"
              ? (saveProg ? saveProg + " " + t("edit.exporting") : t("edit.exporting"))
              : multi ? t("edit.saveAll", { n: sources.length }) : t("common.save")}
          </button>
        </div>
      </div>

      {/* 미리보기 */}
      <div style={ES.stage} onPointerDown={() => setSelId(null)}>
        {loadErr ? (
          <div style={ES.loadState}>{t("edit.loadFail")}</div>
        ) : !ready ? (
          <div style={ES.loadState}>{t("common.loading")}</div>
        ) : (
          <div
            ref={wrapRef}
            style={{
              ...ES.canvasWrap,
              aspectRatio: baseRef.current ? `${baseRef.current.width} / ${baseRef.current.height}` : "3 / 4",
            }}
          >
            <canvas
              ref={canvasRef}
              style={ES.canvas}
              // 길게 누르면 원본 비교(peek, 기존 기능). **짧게 탭하면 그 자리에 문구**(인스타 진입).
              // 겹이 선택돼 있을 땐 탭이 먼저 '선택 해제'로 쓰인다.
              onPointerDown={(e) => {
                e.preventDefault();
                // 두 번째 손가락은 **사진 아무 데나** 짚어도 크기·회전에 합류시킨다.
                // 글자 상자는 작아서 두 손가락을 다 얹을 수 없다 — 인스타도 캔버스 아무 데나 짚는다.
                if (joinPinch(e)) return;
                // ⚠️ 여기서 바로 setPeeking(true) 하면 **겹이 전부 사라진다**(아래 목록이
                //    !peeking 일 때만 그려진다). 글자 가장자리를 살짝 빗맞혀 눌러도 그 순간
                //    끌려던 글자가 없어져서 "옮겨지지 않는다"가 된다(2026-09-17 실기 지적).
                //    원본 비교는 원래 "길게 누르기" 기능이므로 320ms 뒤에만 켠다.
                const tap = { t: Date.now(), x: e.clientX, y: e.clientY, hadSel: selId != null };
                tap.timer = window.setTimeout(() => setPeeking(true), 320);
                canvasTapRef.current = tap;
              }}
              onPointerMove={(e) => {
                if (dragRef.current?.pointers.has(e.pointerId)) stickerPointerMove(e);
              }}
              onPointerUp={(e) => {
                if (dragRef.current?.pointers.has(e.pointerId)) { stickerPointerUp(e); return; }
                const s = canvasTapRef.current;
                if (s?.timer) window.clearTimeout(s.timer);
                setPeeking(false);
                canvasTapRef.current = null;
                if (!s || composing) return;
                if (Date.now() - s.t > 320) return;                       // 길게 누름 = 원본 비교
                if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > 8) return;
                if (s.hadSel) return;                                     // 선택 해제만
                openTextAt(e.clientX, e.clientY);
              }}
              onPointerCancel={(e) => {
                if (dragRef.current?.pointers.has(e.pointerId)) { stickerPointerUp(e); return; }
                if (canvasTapRef.current?.timer) window.clearTimeout(canvasTapRef.current.timer);
                setPeeking(false); canvasTapRef.current = null;
              }}
              onPointerLeave={(e) => {
                if (dragRef.current?.pointers.has(e.pointerId)) return;   // 제스처 중이면 건드리지 않는다
                if (canvasTapRef.current?.timer) window.clearTimeout(canvasTapRef.current.timer);
                setPeeking(false); canvasTapRef.current = null;
              }}
            />
            {/* 드래그 중 보조선 — 가운데 정렬 가이드 + 안전영역 (인스타와 같은 안내) */}
            <div ref={safeRef} style={ES.safeBox} />
            <div ref={guideVRef} style={ES.guideV} />
            <div ref={guideHRef} style={ES.guideH} />
            {peeking && <div style={ES.peekBadge}>{t("edit.peek")}</div>}
            {/* 지금 고쳐 쓰는 겹은 컴포저가 대신 그린다 — 두 번 겹쳐 보이지 않게 숨긴다 */}
            {!peeking && stickers.filter((s) => !(composing && composing.id === s.id)).map((st) => (
              <span
                key={st.id}
                ref={(el) => { if (el) stickerElRef.current.set(st.id, el); else stickerElRef.current.delete(st.id); }}
                onPointerDown={(e) => stickerPointerDown(e, st)}
                onPointerMove={stickerPointerMove}
                onPointerUp={stickerPointerUp}
                onPointerCancel={stickerPointerUp}
                style={{
                  ...ES.sticker,
                  left: `${st.x * 100}%`,
                  top: `${st.y * 100}%`,
                  transform: layerTransform(st.rot),   // 드래그 종료 때 되돌리는 문자열과 반드시 같아야 한다
                  // 텍스트 겹의 CSS 는 컴포저와 **같은 함수**가 만든다 — 어긋날 수가 없다
                  ...(st.kind === "text"
                    ? textLayerStyle(st, st.scale * wrapW || 24, TEXT_MAXW * (wrapW || 300))
                    : { fontSize: st.scale * wrapW || 24 }),
                  ...(selId === st.id ? ES.stickerSel : null),
                }}
              >
                {st.kind === "img"
                  ? <img src={st.src} alt="" draggable={false}
                         style={{ width: st.scale * wrapW || 60, height: "auto", display: "block", pointerEvents: "none" }} />
                  : st.value}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 사진 스트립 (여러 장일 때) — 탭해서 전환. 룩·스티커 모두 사진별 ("전체 적용"으로 일괄) */}
      {multi && (
        <div style={{ ...ES.photoStrip, ...(composing ? ES.hidden : null) }}>
          {sources.map((s, i) => (
            <button
              key={i}
              style={{ ...ES.photoThumbBtn, ...(i === idx ? ES.photoThumbOn : null) }}
              // 자동 정방향 계산 중엔 사진을 못 바꾼다 — 끝난 결과가 바뀐 사진의 장부에 잘못 들어간다(스윕 9/23).
              onClick={() => { if (i !== idx && !geoBusy) { hap.tap(); switchPhoto(i); } }}
            >
              <img src={s} alt={"" + (i + 1)} style={ES.photoThumbImg} />
              {(stickersByIdx[i] || []).length > 0 && <span style={ES.photoThumbDot} />}
            </button>
          ))}
        </div>
      )}

      {/* 하단 패널 — 문구 입력 중엔 감춘다(위 상단 바와 같은 이유로 visibility 만 끈다) */}
      <div style={{ ...ES.panel, ...(composing ? ES.hidden : null) }}>
        <div style={ES.tabRow}>
          {/* 꾸미기(스티커) 탭 — 2026-08-26 에 "development 가 좀 필요할듯" 으로 뺐다가
              2026-09-17 오너 지시로 복귀. 구현(드래그·핀치·회전·저장 합성)은 계속 있었다. */}
          {[
            ["filter", t("edit.tab.filter")],
            ["fx", t("edit.tab.fx")],
            ["fit", getLang() === "ko" ? "정방향" : "Straighten"],
            ["sticker", getLang() === "ko" ? "꾸미기" : "Decorate"],
          ].map(([k, label]) => (
            <button
              key={k}
              style={{ ...ES.tabBtn, ...(tab === k ? ES.tabBtnOn : null) }}
              onClick={() => {
                hap.tap(); setTab(k);
              }}
            >{label}</button>
          ))}
        </div>

        {tab === "filter" && (
          <>
            {/* 폰카 / 필름 / 카메라 / 재미 그룹 토글 */}
            <div style={ES.groupRow}>
              {[["phone", t("filter.gPhone")], ["film", t("filter.gFilm")], ["camera", t("filter.gCam")], ["fun", t("filter.gFun")]].map(([g, label]) => (
                <button
                  key={g}
                  style={{ ...ES.groupBtn, ...(chipGroup === g ? ES.groupBtnOn : null) }}
                  onClick={() => { hap.tap(); setChipGroup(g); }}
                >{label}</button>
              ))}
              {/* 여러 장일 때: 지금 사진의 룩을 10장 전부에 일괄 적용 (오너 지시) */}
              {multi && (
                <button style={ES.applyAllBtn} onClick={applyLookToAll}>
                  {t("edit.applyAll")}
                </button>
              )}
            </div>
            <div style={ES.chipScroll}>
              {FILM_PRESETS.filter((p) => p.key === "none" || p.group === chipGroup).map((p) => (
                // key 에 ready 를 넣는 이유: 사진 전환 시 디코드가 끝난 "뒤"에 캔버스를
                // 다시 마운트해야 새 사진의 썸네일로 그려진다 (idx 만 넣으면 옛 썸네일로 그림)
                <button
                  key={p.key + ":" + idx + ":" + (ready ? "r" : "l")}
                  style={{ ...ES.filterChip, ...(presetKey === p.key ? ES.filterChipOn : null) }}
                  onClick={() => {
                    hap.tap();
                    // 프리셋 기본 효과까지 원탭 적용, 강도는 기본값(0.7 = 표준 룩)으로 리셋
                    updateLook({ presetKey: p.key, fx: fxOf(p), strength: 0.7 });
                  }}
                >
                  <canvas
                    ref={(el) => thumbCanvasCb(el, p.key)}
                    style={{ ...ES.filterThumb, ...(presetKey === p.key ? ES.filterThumbOn : null) }}
                  />
                  <span style={{ ...ES.filterName, ...(presetKey === p.key ? ES.filterNameOn : null) }}>
                    {getLang() === "ko" ? p.ko : p.en}
                  </span>
                </button>
              ))}
            </div>
            {/* 필터 강도 — %표시 없는 슬라이더 (기본 0.7 = 표준 룩, 끝까지 올리면 더 진하게) */}
            {presetKey !== "none" && (
              <div style={ES.strengthRow}>
                <input
                  className="pe-range"
                  type="range" min="0" max="100"
                  value={Math.round(strength * 100)}
                  onChange={(e) => updateLook({ strength: Number(e.target.value) / 100 })}
                  onPointerDown={beginDrag}
                  onPointerUp={endDragSoon}
                  onPointerCancel={endDragSoon}
                  onTouchStart={beginDrag}
                  onTouchEnd={endDragSoon}
                  style={{ width: "100%" }}
                />
              </div>
            )}
          </>
        )}

        {tab === "fit" && (
          <div style={ES.fitCol}>
            <div style={ES.fitHint}>
              {geoBusy ? "기울어진 선을 찾는 중…" :
               geoAuto?.confident && (geo.tilt || geo.pv) ? "자동으로 반듯하게 맞췄어요." :
               geoAuto?.confident ? "원래 사진으로 돌려놨어요." :
               geoAuto ? "반듯한 사진이에요. 필요하면 아래에서 직접 맞춰 주세요." : ""}
            </div>
            {geoAuto?.confident && (
              <div style={{ display: "flex", gap: 8 }}>
                <button style={ES.fitBtnGhost} disabled={geoBusy}
                  onClick={() => { hap.tap(); updateLook({ geo: ZERO_GEO }); }}>원래대로</button>
                <button style={ES.fitBtnGhost} disabled={geoBusy}
                  onClick={() => { hap.tap(); updateLook({ geo: { tilt: geoAuto.tilt, pv: geoAuto.pv, ph: 0 } }); }}>자동 다시 적용</button>
              </div>
            )}
            {[
              ["tilt", "기울기", -15, 15, 0.1, (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}°`],
              ["pv", "세로 원근", -0.5, 0.5, 0.01, (v) => `${Math.round(v * 100)}`],
              ["ph", "가로 원근", -0.5, 0.5, 0.01, (v) => `${Math.round(v * 100)}`],
            ].map(([key, label, min, max, step, fmt]) => (
              <div key={key}>
                <div style={{ ...ES.fitNote, display: "flex", justifyContent: "space-between" }}>
                  <span>{label}</span><span>{fmt(geo[key] || 0)}</span>
                </div>
                <input
                  className="pe-range"
                  type="range" min={min} max={max} step={step}
                  value={geo[key] || 0}
                  onChange={(e) => updateLook({ geo: { ...geo, [key]: Number(e.target.value) } })}
                  onPointerDown={beginDrag}
                  onPointerUp={endDragSoon}
                  onPointerCancel={endDragSoon}
                  onTouchStart={beginDrag}
                  onTouchEnd={endDragSoon}
                  style={{ width: "100%" }}
                />
              </div>
            ))}

            <div style={{ ...ES.fitHint, marginTop: 6 }}>3:4 맞춤</div>
            <div style={ES.fitHint}>
              {isThreeFour() ? "이미 3:4 예요. 맞출 게 없어요." :
               "이 사진은 3:4 가 아니에요. 잘라서 맞추거나, 바깥을 채워서 맞출 수 있어요."}
            </div>
            <button style={ES.fitBtn} disabled={isThreeFour() || !!fitBusy} onClick={doCropFit}>
              {fitBusy === "crop" ? "맞추는 중…" : "잘라 맞춤 · 무료"}
            </button>
            <button style={ES.fitBtnGhost} disabled={isThreeFour() || !!fitBusy} onClick={doOutpaintFit}>
              {fitBusy === "outpaint" ? "채우는 중…" : "채워 맞춤 · 1 크레딧"}
            </button>
            {fitErr && <div style={ES.fitErr}>{fitErr}</div>}

            <div style={ES.fitHint}>줌·광각 왜곡 보정</div>
            <input
              className="pe-range"
              type="range" min="-100" max="100"
              value={Math.round(lens * 100)}
              onChange={(e) => updateLook({ lens: Number(e.target.value) / 100 })}
              onPointerDown={beginDrag}
              onPointerUp={endDragSoon}
              onPointerCancel={endDragSoon}
              onTouchStart={beginDrag}
              onTouchEnd={endDragSoon}
              style={{ width: "100%" }}
            />
            <div style={ES.fitNote}>
              가운데가 부풀어 보이면 오른쪽으로, 가장자리가 당겨 보이면 왼쪽으로.
              가운데(0)가 원본이에요.
            </div>
            <div style={ES.fitNote}>
              잘라 맞춤은 기기 안에서 처리돼요. 채워 맞춤은 원본은 그대로 두고 바깥만 새로 그려요.
            </div>
          </div>
        )}

        {tab === "fx" && (
          <div style={ES.fxCol}>
            {[
              ["glow", t("edit.fx.glow")],
              ["grain", t("edit.fx.grain")],
              ["vignette", t("edit.fx.vignette")],
              ["leak", t("edit.fx.leak")],
              ["blur", t("edit.fx.blur")],
              ["shake", t("edit.fx.shake")],
            ].map(([k, label]) => (
              <label key={k} style={ES.fxRow}>
                <span style={ES.fxLabel}>{label}</span>
                <input
                  className="pe-range"
                  type="range" min="0" max="100"
                  value={Math.round(fx[k] * 100)}
                  onChange={(e) => updateLook({ fx: { ...fx, [k]: Number(e.target.value) / 100 } })}
                  onPointerDown={beginDrag}
                  onPointerUp={endDragSoon}
                  onPointerCancel={endDragSoon}
                  onTouchStart={beginDrag}
                  onTouchEnd={endDragSoon}
                  style={ES.fxSlider}
                />
                <span style={ES.fxVal}>{Math.round(fx[k] * 100)}</span>
              </label>
            ))}
            {/* 날짜 스탬프 6종 — 스타일별 색·서체를 라벨에 그대로 입혀 미리보기를 겸한다 */}
            <div style={ES.dateRow}>
              {/* 라벨은 윗줄 전체 폭 — 62px 고정폭에 넣으면 "날짜 스/탬프"로 꺾인다(오너 신고) */}
              <span style={ES.dateLabel}>🗓️ {t("edit.fx.date")}</span>
              <div style={ES.dateChips}>
                {["none", ...DATE_STYLES].map((k) => (
                  <button
                    key={k}
                    style={{
                      ...ES.dateChip,
                      ...(DATE_PREVIEW[k] || null),
                      ...(dateStyle === k ? ES.dateChipOn : null),
                    }}
                    onClick={() => { hap.tap(); setDateStyle(k); }}
                  >
                    {t("edit.date." + k)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "sticker" && (
          <div style={ES.stickerPanel}>
            <button style={ES.addTextBtn} onClick={() => { hap.tap(); setSelId(null); setComposing({}); }}>
              문구 추가
            </button>
            <div style={ES.stickerHint}>
              사진을 가볍게 탭해도 그 자리에 문구가 생겨요. 쓰는 중에도 끌어서 옮기고
              두 손가락으로 키우거나 돌릴 수 있어요. 얹은 문구를 탭하면 다시 고쳐지고,
              아래 휴지통으로 끌면 지워져요.
            </div>
            {/* ⚠️ 이모지 줄은 오너 지시(2026-09-17 "밑에 이모지 빼줘")로 숨긴다.
                addEmoji·EMOJIS·합성 코드(kind:"emoji")는 그대로라 되살릴 땐 이 블록만 풀면 된다.
                그림 스티커도 같은 이유로 숨겨져 있다(위 주석 참고). */}
            {sel && <div style={ES.stickerHint}>{t("edit.sticker.hint")}</div>}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

/* ---------- 스타일 ----------
   에디터는 어두운 배경(색 판단이 정확)이되, 본 앱과 같은 급의 마감으로:
   세그먼트 탭 · 화이트 필 버튼 · 커스텀 슬라이더 · 선택 링 · 진입 모션. */
// 편집기 전체 글꼴 — 지정이 없어 영어(라틴 글자)가 브라우저 기본 세리프(Times)로 나왔다(2026-09-25 영어화 때 발견).
const EDITOR_FONT = '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", Roboto, "Segoe UI", sans-serif';
const ES = {
  overlay: {
    position: "fixed", inset: 0, zIndex: 300, display: "flex", flexDirection: "column",
    fontFamily: EDITOR_FONT,
    background: "#0f0d0b",
    paddingTop: "env(safe-area-inset-top, 0px)",
    paddingBottom: "env(safe-area-inset-bottom, 0px)",
  },
  toast: {
    // transform 은 .pe-toast CSS 가 소유한다(진입 전환 + @starting-style) — 인라인에 두면 덮어써서 전환이 안 된다
    position: "fixed", top: "calc(env(safe-area-inset-top, 0px) + 64px)", left: "50%",
    zIndex: 320, background: "rgba(255,255,255,.96)", color: "#231f20",
    padding: "10px 18px", borderRadius: 13, fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap",
    boxShadow: "0 10px 30px -8px rgba(0,0,0,.6)",
  },
  topBar: {
    position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "12px 16px 8px", gap: 10,
  },
  topBtn: {
    width: 36, height: 36, borderRadius: 18, border: "none", background: "rgba(255,255,255,.09)",
    color: "rgba(255,255,255,.9)", fontSize: 15, cursor: "pointer", lineHeight: 1,
  },
  topTitle: {
    color: "rgba(255,255,255,.92)", fontSize: 14.5, fontWeight: 800, letterSpacing: ".04em",
  },
  topAction: {
    border: "none", borderRadius: 19, padding: "10px 16px", fontSize: 13.5, fontWeight: 800,
    background: "rgba(255,255,255,.09)", color: "rgba(255,255,255,.92)", cursor: "pointer",
  },
  topActionPrimary: { background: "#fff", color: "#191512" },
  // 레이아웃은 그대로 두고 보이기만 끈다 (사진 크기가 변하면 글자 크기 기준이 흔들린다)
  hidden: { visibility: "hidden", pointerEvents: "none" },
  // Aa — 글자 도구라는 게 한눈에 보이게 라벨 자체를 세리프+큰 글씨로
  topAa: { padding: "8px 13px", fontSize: 16, fontWeight: 800, fontFamily: "Georgia, serif", letterSpacing: "-.01em" },
  stage: {
    flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center",
    padding: "8px 16px", overflow: "hidden",
  },
  canvasWrap: {
    position: "relative", maxWidth: "100%", maxHeight: "100%",
    borderRadius: 16, overflow: "hidden",
    boxShadow: "0 24px 60px -20px rgba(0,0,0,.9), 0 0 0 1px rgba(255,255,255,.05)",
  },
  canvas: {
    // 모서리 둥글기를 캔버스가 직접 가진다 — 드래그 중 wrap 의 overflow 를 풀어도 사진이 각지지 않게.
    display: "block", width: "100%", height: "100%", borderRadius: 16,
    touchAction: "none", WebkitTouchCallout: "none", WebkitUserSelect: "none",
  },
  peekBadge: {
    position: "absolute", top: 12, left: 12, background: "rgba(0,0,0,.62)", color: "#fff",
    fontSize: 11.5, fontWeight: 800, borderRadius: 9, padding: "6px 10px",
    letterSpacing: ".03em", pointerEvents: "none",
  },
  loadState: { color: "rgba(255,255,255,.55)", fontSize: 14 },
  stickerSetName: {
    width: "100%", fontSize: 11.5, fontWeight: 700, letterSpacing: ".02em",
    color: "rgba(255,255,255,0.5)", margin: "10px 0 6px",
  },
  stickerSetRow: { display: "flex", flexWrap: "wrap", gap: 8 },
  stickerImgBtn: {
    width: 48, height: 48, borderRadius: 12, border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)", display: "flex", alignItems: "center",
    justifyContent: "center", cursor: "pointer", padding: 0,
  },
  sticker: {
    position: "absolute", lineHeight: 1, touchAction: "none",
    cursor: "grab", padding: 4,
    // ⚠️ iOS(WKWebView)에서 겹을 끌거나 두 손가락으로 키울 수 없던 원인 (2026-09-17 실기).
    //    `user-select: none` 만으로는 사파리가 **글자 선택**을 막지 않는다. 텍스트 겹을
    //    누르는 순간 선택·돋보기(callout)가 시작되면서 브라우저가 pointercancel 을 던져
    //    제스처가 통째로 끊긴다. 캔버스에는 이 세 줄이 있었는데 겹에는 빠져 있었다.
    //    (스티커가 그림이던 시절엔 안 났고, 겹이 글자가 되면서 드러났다.)
    userSelect: "none", WebkitUserSelect: "none",
    WebkitTouchCallout: "none", WebkitUserDrag: "none",
  },
  // 선택 표시는 outline 만 — borderRadius 를 여기서 덮으면 텍스트 배경 박스 모서리가 망가진다
  stickerSel: { outline: "1.5px dashed rgba(255,255,255,.85)", outlineOffset: 3 },
  // 휴지통 — 겹을 끌 때만 아래 가운데에 뜬다. 위로 올리면 빨개지고, 떼면 삭제.
  trash: {
    position: "fixed", left: "50%", bottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)",
    width: 58, height: 58, borderRadius: 29, zIndex: 340,
    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24,
    background: "rgba(0,0,0,.55)", border: "1px solid rgba(255,255,255,.4)",
    boxShadow: "0 8px 24px -6px rgba(0,0,0,.7)",
    pointerEvents: "none", opacity: 0, transform: "translate(-50%,14px) scale(.9)",
    transition: "opacity .15s ease, transform .15s cubic-bezier(0.32,0.72,0,1), background .12s linear",
  },
  guideV: {
    position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, marginLeft: -0.5,
    background: "rgba(86,170,255,.95)", boxShadow: "0 0 6px rgba(86,170,255,.85)",
    opacity: 0, pointerEvents: "none", transition: "opacity .12s linear",
  },
  guideH: {
    position: "absolute", top: "50%", left: 0, right: 0, height: 1, marginTop: -0.5,
    background: "rgba(86,170,255,.95)", boxShadow: "0 0 6px rgba(86,170,255,.85)",
    opacity: 0, pointerEvents: "none", transition: "opacity .12s linear",
  },
  safeBox: {
    position: "absolute", inset: "5%", border: "1px dashed rgba(255,255,255,.34)",
    borderRadius: 10, opacity: 0, pointerEvents: "none", transition: "opacity .12s linear",
  },
  photoStrip: {
    display: "flex", gap: 7, overflowX: "auto", padding: "10px 16px 2px",
    WebkitOverflowScrolling: "touch", flex: "0 0 auto",
  },
  photoThumbBtn: {
    position: "relative", flex: "0 0 auto", width: 46, height: 60, borderRadius: 11,
    overflow: "hidden", border: "none", padding: 0, background: "#000",
    cursor: "pointer", opacity: 0.55, transition: "opacity .18s",
  },
  photoThumbOn: { opacity: 1, boxShadow: "0 0 0 2px #fff" },
  photoThumbImg: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
  photoThumbDot: {
    position: "absolute", top: 3, right: 3, width: 7, height: 7, borderRadius: 4,
    background: "#fff", boxShadow: "0 0 0 1.5px rgba(0,0,0,.5)",
  },
  panel: {
    background: "rgba(26,22,18,.96)", borderTop: "1px solid rgba(255,255,255,.07)",
    padding: "12px 0 14px", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
  },
  tabRow: {
    display: "inline-flex", gap: 2, margin: "0 16px 12px", padding: 3,
    background: "rgba(255,255,255,.07)", borderRadius: 13, alignSelf: "flex-start",
  },
  // 정방향 슬라이더 3개 + 3:4 맞춤 + 렌즈 — 그냥 쌓으면 사진이 화면 밖으로 밀려난다(실측) → 효과 탭처럼 높이 제한 + 스크롤
  fitCol: {
    padding: "8px 18px 4px", display: "flex", flexDirection: "column", gap: 10,
    maxHeight: "34vh", overflowY: "auto", WebkitOverflowScrolling: "touch",
  },
  fitHint: { fontSize: 13.5, lineHeight: 1.5, color: "rgba(255,255,255,0.8)" },
  fitBtn: {
    height: 46, borderRadius: 12, border: "none", background: "#E6403C", color: "#fff",
    fontSize: 15, fontWeight: 700, cursor: "pointer",
  },
  fitBtnGhost: {
    height: 46, borderRadius: 12, border: "1px solid rgba(255,255,255,0.28)",
    background: "transparent", color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer",
  },
  fitErr: { fontSize: 13, color: "#ff9b96", lineHeight: 1.5 },
  fitNote: { fontSize: 11.5, color: "rgba(255,255,255,0.45)", lineHeight: 1.5 },
  tabBtn: {
    border: "none", borderRadius: 10, padding: "7px 16px", fontSize: 13, fontWeight: 800,
    background: "transparent", color: "rgba(255,255,255,.5)", cursor: "pointer",
    transition: "color .15s",
  },
  tabBtnOn: { background: "#fff", color: "#191512" },
  // 그룹이 4개(폰카 추가)라 좁은 폰에서 "전체 적용"까지 한 줄에 안 들어갈 수 있다 → 가로 스크롤
  groupRow: { display: "flex", gap: 6, padding: "0 16px 9px", overflowX: "auto", scrollbarWidth: "none" },
  groupBtn: {
    border: "1px solid rgba(255,255,255,.14)", borderRadius: 15, padding: "5px 13px",
    fontSize: 11.5, fontWeight: 800, background: "transparent",
    color: "rgba(255,255,255,.55)", cursor: "pointer",
    whiteSpace: "nowrap", flexShrink: 0,
  },
  groupBtnOn: { background: "rgba(255,255,255,.14)", color: "#fff", borderColor: "transparent" },
  // 전체 적용 — 그룹 토글과 같은 급의 필이되 오른쪽 끝에서 살짝 강조
  applyAllBtn: {
    marginLeft: "auto", border: "1px solid rgba(255,255,255,.3)", borderRadius: 15,
    padding: "5px 13px", fontSize: 11.5, fontWeight: 800,
    background: "rgba(255,255,255,.08)", color: "#fff", cursor: "pointer",
    whiteSpace: "nowrap", flexShrink: 0,
  },
  chipScroll: {
    display: "flex", gap: 10, overflowX: "auto", padding: "2px 16px 4px",
    WebkitOverflowScrolling: "touch",
  },
  filterChip: {
    flex: "0 0 auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
    border: "none", background: "transparent", padding: 0, cursor: "pointer",
  },
  filterChipOn: {},
  filterThumb: {
    width: 62, borderRadius: 13, display: "block",
    boxShadow: "0 0 0 1px rgba(255,255,255,.08)",
  },
  filterThumbOn: { boxShadow: "0 0 0 2px #fff" },
  filterName: { fontSize: 10.5, fontWeight: 700, color: "rgba(255,255,255,.55)", whiteSpace: "nowrap" },
  filterNameOn: { color: "#fff" },
  strengthRow: { padding: "8px 18px 0" },
  fxCol: {
    display: "flex", flexDirection: "column", gap: 12, padding: "2px 18px",
    maxHeight: "34vh", overflowY: "auto", WebkitOverflowScrolling: "touch", // 슬라이더 6개+날짜 — 작은 화면 스크롤
  },
  fxRow: { display: "flex", alignItems: "center", gap: 12 },
  fxLabel: { width: 62, fontSize: 12.5, fontWeight: 800, color: "rgba(255,255,255,.85)", flex: "0 0 auto" },
  fxSlider: { flex: 1, minWidth: 0 },
  fxVal: {
    width: 30, textAlign: "right", fontSize: 12, color: "rgba(255,255,255,.55)",
    fontVariantNumeric: "tabular-nums", flex: "0 0 auto",
  },
  dateRow: { display: "flex", flexDirection: "column", alignItems: "stretch", gap: 8 },
  dateLabel: { fontSize: 12.5, fontWeight: 800, color: "rgba(255,255,255,.85)", whiteSpace: "nowrap" },
  dateChips: { display: "flex", gap: 6, overflowX: "auto", flex: 1, minWidth: 0, paddingBottom: 2 },
  dateChip: {
    flex: "0 0 auto", border: "1px solid rgba(255,255,255,.14)", borderRadius: 11,
    padding: "7px 11px", fontSize: 11.5, fontWeight: 800, background: "transparent",
    color: "rgba(255,255,255,.6)", cursor: "pointer", whiteSpace: "nowrap",
  },
  dateChipOn: { borderColor: "#fff", boxShadow: "0 0 0 1px #fff", color: "#fff" },
  stickerPanel: { padding: "2px 16px" },
  textRow: { display: "flex", alignItems: "center", gap: 7, marginBottom: 10 },
  textInput: {
    flex: 1, minWidth: 0, border: "1px solid rgba(255,255,255,.13)", borderRadius: 12,
    background: "rgba(255,255,255,.07)", color: "#fff", padding: "9px 12px", fontSize: 13.5,
    outline: "none",
  },
  colorDot: { width: 24, height: 24, borderRadius: 12, border: "2px solid rgba(255,255,255,.25)", cursor: "pointer", flex: "0 0 auto", padding: 0 },
  colorDotOn: { borderColor: "#fff", transform: "scale(1.12)" },
  addTextBtn: {
    width: "100%", height: 46, borderRadius: 12, border: "none",
    background: "#E6403C", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer",
  },
  spectrum: {
    width: "100%", height: 22, borderRadius: 11, appearance: "none", WebkitAppearance: "none",
    margin: "8px 0 0", cursor: "pointer", border: "1px solid rgba(255,255,255,.18)",
  },
  textOptRow: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 10 },
  textOptLabel: { fontSize: 12, color: "rgba(255,255,255,.55)", minWidth: 28 },
  textOptBtn: {
    height: 32, padding: "0 12px", borderRadius: 16, border: "1px solid rgba(255,255,255,.16)",
    background: "rgba(255,255,255,.06)", color: "rgba(255,255,255,.82)",
    fontSize: 13, cursor: "pointer",
  },
  textOptOn: { background: "#fff", color: "#191512", border: "1px solid #fff", fontWeight: 700 },
  textAdd: {
    border: "none", borderRadius: 12, padding: "9px 14px", fontSize: 12.5, fontWeight: 800,
    background: "#fff", color: "#191512", cursor: "pointer", flex: "0 0 auto",
  },
  emojiGrid: {
    display: "flex", gap: 2, flexWrap: "wrap", maxHeight: 100,
    overflowY: "auto", WebkitOverflowScrolling: "touch",
  },
  emojiBtn: {
    border: "none", background: "transparent", fontSize: 25, padding: 5, cursor: "pointer",
    lineHeight: 1, borderRadius: 9,
  },
  stickerHint: { marginTop: 7, fontSize: 11.5, color: "rgba(255,255,255,.45)" },
};

// 날짜 칩 라벨에 스타일별 색·서체를 그대로 입힌다 — 라벨이 곧 미리보기
const DATE_PREVIEW = {
  retro7: { color: "#FFB03A", fontFamily: '"Courier New", monospace', textShadow: "0 0 6px rgba(255,120,30,.8)" },
  reddot: { color: "#FF3B30", fontFamily: '"Courier New", monospace' },
  lcd:    { color: "#B7F34C", fontFamily: '"Courier New", monospace' },
  type:   { color: "#fff", fontFamily: '"Courier New", monospace', fontWeight: 400 },
  stamp:  { color: "#E03B30", fontFamily: "Georgia, serif" },
  script: { color: "#fff", fontFamily: "Georgia, serif", fontStyle: "italic" },
};

// 커스텀 슬라이더 + 진입 모션 (인라인 스타일로는 pseudo-element 를 못 만진다)
const PE_CSS = `
/* 색상 스펙트럼 띠 — 360도 전부. Justin PosterEditor 와 같은 방식(프리셋 아님). */
.pe-hue {
  background: linear-gradient(90deg,
    #ff0000 0%, #ffff00 16.6%, #00ff00 33.3%, #00ffff 50%,
    #0000ff 66.6%, #ff00ff 83.3%, #ff0000 100%);
}
.pe-range.pe-hue::-webkit-slider-thumb,
.pe-range::-webkit-slider-thumb { -webkit-appearance: none; }

/* 진입은 앱 공통 토큰(--d-enter/--ease-out)을 쓴다 — 편집기만 다른 곡선이면 이 화면만 튄다(모션 리뷰).
   body 로 포털돼도 :root 변수라 그대로 닿는다. */
.pe-in { animation: peUp var(--d-enter, 300ms) var(--ease-out, cubic-bezier(0.32,0.72,0,1)) backwards; }
@keyframes peUp { from { opacity: 0; transform: translateY(16px); } }
/* 토스트: 키프레임이 아니라 전환 — flashToast 연타에도 처음부터 다시 재생되지 않고 이어진다 */
.pe-toast {
  opacity: 1; transform: translate(-50%, 0);
  transition: opacity var(--d-swap, 180ms) var(--ease-out, cubic-bezier(0.32,0.72,0,1)),
              transform var(--d-swap, 180ms) var(--ease-out, cubic-bezier(0.32,0.72,0,1));
}
@starting-style { .pe-toast { opacity: 0; transform: translate(-50%, -6px); } }
.pe-range { -webkit-appearance: none; appearance: none; height: 28px; background: transparent; }
.pe-range::-webkit-slider-runnable-track {
  height: 3px; border-radius: 2px; background: rgba(255,255,255,.22);
}
.pe-range::-webkit-slider-thumb {
  -webkit-appearance: none; width: 21px; height: 21px; border-radius: 11px; border: none;
  background: #fff; margin-top: -9px; box-shadow: 0 1px 6px rgba(0,0,0,.45);
}
.pe-range::-moz-range-track { height: 3px; border-radius: 2px; background: rgba(255,255,255,.22); }
.pe-range::-moz-range-thumb { width: 21px; height: 21px; border-radius: 11px; border: none; background: #fff; }
`;
