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
import { FILM_PRESETS, presetByKey, applyLook, applyLookWithStrength } from "./filters";
import { isNative, nativeSaveToAlbum } from "./nativeBridge";
import { shareImage } from "./share";
import { t, getLang } from "./i18n";
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
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (st.kind === "text") {
    ctx.font = `800 ${px}px -apple-system, "Apple SD Gothic Neo", sans-serif`;
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = px * 0.12;
    ctx.fillStyle = st.color;
    ctx.fillText(st.value, 0, 0);
  } else {
    ctx.font = `${px}px "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
    ctx.fillText(st.value, 0, 0);
  }
  ctx.restore();
}

// 프리셋의 기본 효과 조합 — 칩 하나가 "완성된 룩"이 되게 한다 (토이=비네트, 일회용=그레인…)
const fxOf = (p) => ({
  grain: p?.fx?.grain || 0, vignette: p?.fx?.vignette || 0, leak: p?.fx?.leak || 0,
  glow: p?.fx?.glow || 0, blur: p?.fx?.blur || 0, shake: p?.fx?.shake || 0,
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
  const [tab, setTab] = useState("filter"); // filter | fx | sticker
  const [presetKey, setPresetKey] = useState(initialPresetKey);
  const [fx, setFx] = useState(() => fxOf(presetByKey(initialPresetKey)));
  const [chipGroup, setChipGroup] = useState(() => presetByKey(initialPresetKey).group || "film");
  // 필터 강도 (오너 지시): %표시 없는 슬라이더, 기본 0.7 = 지금의 풀 프리셋 룩.
  // 1.0 까지 올리면 더 진하게(외삽), 0 이면 원본.
  const [strength, setStrength] = useState(0.7);
  // 룩(프리셋·효과·강도)은 사진별 (오너 지시: "각각 적용 + 전체 적용 버튼").
  // presetKey/fx/strength 는 "지금 보는 사진"의 룩이고, lookByIdx 가 장부 —
  // 룩을 바꾸는 곳은 반드시 updateLook 을 거쳐 둘을 같이 쓴다. (effect 로 미러링하면
  // 사진 전환 직후 옛 룩이 새 사진에 덮어써지는 레이스가 생겨서 명령형으로 간다)
  const defaultLook = () => ({
    presetKey: initialPresetKey,
    fx: fxOf(presetByKey(initialPresetKey)),
    strength: 0.7,
  });
  const [lookByIdx, setLookByIdx] = useState({});
  const lookOf = (i) => lookByIdx[i] || defaultLook();
  function updateLook(patch) {
    const next = { presetKey, fx, strength, ...patch };
    setPresetKey(next.presetKey);
    setFx(next.fx);
    setStrength(next.strength);
    setLookByIdx((p) => ({ ...p, [idx]: next }));
  }
  function switchPhoto(i) {
    const lk = lookOf(i);
    setPresetKey(lk.presetKey);
    setFx(lk.fx);
    setStrength(lk.strength);
    const g = presetByKey(lk.presetKey).group;
    if (g) setChipGroup(g);
    setReady(false);
    setIdx(i);
  }
  function applyLookToAll() {
    hap.tap();
    const cur = { presetKey, fx, strength };
    const all = {};
    for (let i = 0; i < sources.length; i++) all[i] = cur;
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
  const [textColor, setTextColor] = useState(TEXT_COLORS[0]);
  const [busy, setBusy] = useState(null); // "save" | "share" | null
  const [saveProg, setSaveProg] = useState(""); // 배치 저장 진행 "3/10"
  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);

  const fullImgRef = useRef(null);   // 활성 사진의 원본 <img> (내보내기용)
  const revokeRef = useRef(null);
  const canvasRef = useRef(null);
  const baseRef = useRef(null);      // 활성 사진의 미리보기 ImageData
  const thumbRef = useRef(null);     // 칩 썸네일용 작은 ImageData
  // 사진 전환이 즉각이도록 최근 3장의 디코드 결과를 캐시 (10장 전부 들고 있으면
  // 2K 기준 200MB+ 라 iOS 웹뷰가 위험하다)
  const cacheRef = useRef(new Map()); // idx → {img, base, thumb, revoke}
  const rafRef = useRef(0);
  const wrapRef = useRef(null);
  const dragRef = useRef(null);      // 스티커 드래그/핀치 상태
  const stickerElRef = useRef(new Map()); // id → DOM (드래그 중 transform 직접 갱신용)
  const overlayRef = useRef(null);   // 닫을 때 150ms 페이드아웃(WAAPI)
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

  /* ---------- 미리보기 렌더 (rAF 로 합침) ---------- */
  const renderPreview = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const base = baseRef.current, canvas = canvasRef.current;
      if (!base || !canvas) return;
      const { width: w, height: h } = base;
      if (canvas.width !== w) { canvas.width = w; canvas.height = h; }
      const ctx = canvas.getContext("2d");
      if (peeking) {
        ctx.putImageData(base, 0, 0); // 원본 그대로 (룩·날짜 없음)
        return;
      }
      const copy = new ImageData(new Uint8ClampedArray(base.data), w, h);
      applyLookWithStrength(copy.data, w, h, presetByKey(presetKey), { ...fx, seed: GRAIN_SEED }, strength);
      ctx.putImageData(copy, 0, 0);
      if (dateStyle !== "none") drawDateStamp(ctx, w, h, dateStyle);
    });
  }, [presetKey, fx, dateStyle, peeking, strength]);

  useEffect(() => { if (ready) renderPreview(); }, [ready, renderPreview, idx]);

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
  function addText() {
    const v = textDraft.trim();
    if (!v) return;
    hap.tap();
    const st = { id: stickerSeq++, kind: "text", value: v.slice(0, 24), color: textColor, x: 0.5, y: 0.78, scale: 0.09, rot: 0 };
    setStickers((p) => [...p, st]);
    setSelId(st.id);
    setTextDraft("");
  }
  function removeSticker(id) {
    hap.light();
    setStickers((p) => p.filter((s) => s.id !== id));
    setSelId((cur) => (cur === id ? null : cur));
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
    if (d.pointers.size === 2) {
      const [a, b] = [...d.pointers.values()];
      d.baseDist = Math.hypot(a.x - b.x, a.y - b.y);
      d.baseAng = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    }
    dragRef.current = d;
    ev.currentTarget.setPointerCapture?.(ev.pointerId);
  }
  // 드래그 중엔 React state 를 건드리지 않는다(모션 리뷰). 매 pointermove 마다 setStickers 로
  // left/top(%) 을 바꾸면 레이아웃→페인트→합성이 프레임마다 돌고 stickers.map 재렌더까지
  // 얹혀 2K 캔버스 위에서 끊겼다. 이제 이동·핀치는 엘리먼트의 transform 만 직접 바꾸고
  // (합성 전용), 손을 뗄 때 한 번만 state 에 커밋한다. 좌표 체계(0..1 비율)는 그대로.
  function paintStickerLive(d) {
    const el = stickerElRef.current.get(d.id);
    if (!el || !d.live) return;
    const offX = (d.live.x - d.start.x) * d.rect.width;
    const offY = (d.live.y - d.start.y) * d.rect.height;
    const k = d.live.scale / d.start.scale;
    el.style.transform =
      `translate(${offX}px, ${offY}px) translate(-50%,-50%) rotate(${d.live.rot}deg) scale(${k})`;
  }
  function stickerPointerMove(ev) {
    const d = dragRef.current;
    if (!d || !d.pointers.has(ev.pointerId)) return;
    ev.preventDefault();
    const prev = d.pointers.get(ev.pointerId);
    d.pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (!d.live) d.live = { ...d.start };
    if (d.pointers.size === 1) {
      const dx = (ev.clientX - prev.x) / d.rect.width;
      const dy = (ev.clientY - prev.y) / d.rect.height;
      d.live.x = Math.min(1.05, Math.max(-0.05, d.live.x + dx));
      d.live.y = Math.min(1.05, Math.max(-0.05, d.live.y + dy));
    } else if (d.pointers.size === 2 && d.baseDist) {
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
      if (d.live) {
        const live = d.live;
        // 커밋: state 가 left/top/fontSize/rotate 를 다시 그리므로 임시 transform 은 지운다
        const el = stickerElRef.current.get(d.id);
        if (el) el.style.transform = "";
        setStickers((p) => p.map((s) => (s.id === d.id ? { ...s, ...live } : s)));
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
        || lk.fx.grain || lk.fx.vignette || lk.fx.leak || lk.fx.glow || lk.fx.blur || lk.fx.shake;
      if (hasLook) {
        const id = ctx.getImageData(0, 0, w, h);
        // 원본이 커서(2K) 수백 ms 걸릴 수 있다 — 호출측이 busy 표시를 켠 채로 부른다
        applyLookWithStrength(id.data, w, h, presetByKey(lk.presetKey), { ...lk.fx, seed: GRAIN_SEED }, lk.strength);
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
      {toast && <div style={ES.toast} className="pe-toast" onClick={() => setToast("")}>{toast}</div>}

      {/* 상단 바 */}
      <div style={ES.topBar}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <button style={ES.topBtn} onClick={closeEditor}>✕</button>
          <div style={ES.topTitle}>{t("edit.title")}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
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
              onPointerDown={(e) => { e.preventDefault(); setPeeking(true); }}
              onPointerUp={() => setPeeking(false)}
              onPointerCancel={() => setPeeking(false)}
              onPointerLeave={() => setPeeking(false)}
            />
            {peeking && <div style={ES.peekBadge}>{t("edit.peek")}</div>}
            {!peeking && stickers.map((st) => (
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
                  transform: `translate(-50%,-50%) rotate(${st.rot}deg)`,
                  fontSize: st.scale * wrapW || 24,
                  ...(st.kind === "text"
                    ? { fontWeight: 800, color: st.color, textShadow: "0 1px 8px rgba(0,0,0,.35)", whiteSpace: "nowrap" }
                    : null),
                  ...(selId === st.id ? ES.stickerSel : null),
                }}
              >
                {st.value}
                {selId === st.id && (
                  <button
                    style={ES.stickerDel}
                    onPointerDown={(e) => { e.stopPropagation(); }}
                    onClick={(e) => { e.stopPropagation(); removeSticker(st.id); }}
                  >✕</button>
                )}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 사진 스트립 (여러 장일 때) — 탭해서 전환. 룩·스티커 모두 사진별 ("전체 적용"으로 일괄) */}
      {multi && (
        <div style={ES.photoStrip}>
          {sources.map((s, i) => (
            <button
              key={i}
              style={{ ...ES.photoThumbBtn, ...(i === idx ? ES.photoThumbOn : null) }}
              onClick={() => { if (i !== idx) { hap.tap(); switchPhoto(i); } }}
            >
              <img src={s} alt={"" + (i + 1)} style={ES.photoThumbImg} />
              {(stickersByIdx[i] || []).length > 0 && <span style={ES.photoThumbDot} />}
            </button>
          ))}
        </div>
      )}

      {/* 하단 패널 */}
      <div style={ES.panel}>
        <div style={ES.tabRow}>
          {/* 스티커 탭은 오너 지시로 제외(2026-08-26 "development 가 좀 필요할듯").
              구현(드래그·핀치·합성)은 아래에 그대로 있으니 배열에 다시 넣으면 복귀. */}
          {[
            ["filter", t("edit.tab.filter")],
            ["fx", t("edit.tab.fx")],
          ].map(([k, label]) => (
            <button
              key={k}
              style={{ ...ES.tabBtn, ...(tab === k ? ES.tabBtnOn : null) }}
              onClick={() => { hap.tap(); setTab(k); }}
            >{label}</button>
          ))}
        </div>

        {tab === "filter" && (
          <>
            {/* 필름 / 카메라 그룹 토글 */}
            <div style={ES.groupRow}>
              {[["film", t("filter.gFilm")], ["camera", t("filter.gCam")], ["fun", t("filter.gFun")]].map(([g, label]) => (
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
                  style={{ width: "100%" }}
                />
              </div>
            )}
          </>
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
            <div style={ES.textRow}>
              <input
                style={ES.textInput}
                placeholder={t("edit.sticker.placeholder")}
                value={textDraft}
                maxLength={24}
                onChange={(e) => setTextDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addText(); }}
              />
              {TEXT_COLORS.map((c) => (
                <button
                  key={c}
                  style={{ ...ES.colorDot, background: c, ...(textColor === c ? ES.colorDotOn : null) }}
                  onClick={() => setTextColor(c)}
                />
              ))}
              <button style={ES.textAdd} onClick={addText}>{t("edit.sticker.add")}</button>
            </div>
            <div style={ES.emojiGrid}>
              {EMOJIS.map((e) => (
                <button key={e} style={ES.emojiBtn} onClick={() => addEmoji(e)}>{e}</button>
              ))}
            </div>
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
const ES = {
  overlay: {
    position: "fixed", inset: 0, zIndex: 300, display: "flex", flexDirection: "column",
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
    display: "block", width: "100%", height: "100%",
    touchAction: "none", WebkitTouchCallout: "none", WebkitUserSelect: "none",
  },
  peekBadge: {
    position: "absolute", top: 12, left: 12, background: "rgba(0,0,0,.62)", color: "#fff",
    fontSize: 11.5, fontWeight: 800, borderRadius: 9, padding: "6px 10px",
    letterSpacing: ".03em", pointerEvents: "none",
  },
  loadState: { color: "rgba(255,255,255,.55)", fontSize: 14 },
  sticker: {
    position: "absolute", lineHeight: 1, userSelect: "none", touchAction: "none",
    cursor: "grab", padding: 4,
  },
  stickerSel: { outline: "1.5px dashed rgba(255,255,255,.85)", borderRadius: 8 },
  stickerDel: {
    position: "absolute", top: -14, right: -14, width: 24, height: 24, borderRadius: 12,
    border: "none", background: "#fff", color: "#231f20", fontSize: 11, fontWeight: 800,
    boxShadow: "0 2px 8px rgba(0,0,0,.4)", cursor: "pointer",
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
  tabBtn: {
    border: "none", borderRadius: 10, padding: "7px 16px", fontSize: 13, fontWeight: 800,
    background: "transparent", color: "rgba(255,255,255,.5)", cursor: "pointer",
    transition: "color .15s",
  },
  tabBtnOn: { background: "#fff", color: "#191512" },
  groupRow: { display: "flex", gap: 6, padding: "0 16px 9px" },
  groupBtn: {
    border: "1px solid rgba(255,255,255,.14)", borderRadius: 15, padding: "5px 13px",
    fontSize: 11.5, fontWeight: 800, background: "transparent",
    color: "rgba(255,255,255,.55)", cursor: "pointer",
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
