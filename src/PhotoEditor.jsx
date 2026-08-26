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
import { FILM_PRESETS, presetByKey, applyLook } from "./filters";
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

/* ---------- 날짜 스탬프 (필름 카메라 주황 각인) ---------- */
function drawDateStamp(ctx, w, h) {
  const d = new Date();
  const text = `'${String(d.getFullYear()).slice(2)}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  const size = Math.round(w * 0.042);
  ctx.save();
  ctx.font = `700 ${size}px "Courier New", monospace`;
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.shadowColor = "rgba(255,120,30,0.9)";
  ctx.shadowBlur = size * 0.35;
  ctx.fillStyle = "#FFB03A";
  ctx.fillText(text, w - size * 0.8, h - size * 0.9);
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

export default function PhotoEditor({ src, filename = "rimikimi", onClose }) {
  const [ready, setReady] = useState(false);
  const [loadErr, setLoadErr] = useState(false);
  const [tab, setTab] = useState("filter"); // filter | fx | sticker
  const [presetKey, setPresetKey] = useState("none");
  const [fx, setFx] = useState({ grain: 0, vignette: 0, leak: 0 });
  const [dateOn, setDateOn] = useState(false);
  const [stickers, setStickers] = useState([]);
  const [selId, setSelId] = useState(null);
  const [textDraft, setTextDraft] = useState("");
  const [textColor, setTextColor] = useState(TEXT_COLORS[0]);
  const [busy, setBusy] = useState(null); // "save" | "share" | null
  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);

  const fullImgRef = useRef(null);   // 원본 <img> (내보내기용)
  const revokeRef = useRef(null);
  const canvasRef = useRef(null);
  const baseRef = useRef(null);      // 미리보기 원본 ImageData
  const thumbRef = useRef(null);     // 칩 썸네일용 작은 ImageData
  const rafRef = useRef(0);
  const wrapRef = useRef(null);
  const dragRef = useRef(null);      // 스티커 드래그/핀치 상태
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

  /* ---------- 로드 ---------- */
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const { img, revoke } = await loadSource(src);
        if (dead) { if (revoke) URL.revokeObjectURL(revoke); return; }
        fullImgRef.current = img;
        revokeRef.current = revoke;
        const scale = Math.min(1, PREVIEW_MAX / Math.max(img.naturalWidth, img.naturalHeight));
        const pw = Math.max(1, Math.round(img.naturalWidth * scale));
        const ph = Math.max(1, Math.round(img.naturalHeight * scale));
        const off = document.createElement("canvas");
        off.width = pw; off.height = ph;
        const octx = off.getContext("2d", { willReadFrequently: true });
        octx.drawImage(img, 0, 0, pw, ph);
        baseRef.current = octx.getImageData(0, 0, pw, ph);
        // 칩 썸네일 베이스
        const tw = THUMB_W, th = Math.round((ph / pw) * THUMB_W);
        const toff = document.createElement("canvas");
        toff.width = tw; toff.height = th;
        const tctx = toff.getContext("2d", { willReadFrequently: true });
        tctx.drawImage(img, 0, 0, tw, th);
        thumbRef.current = tctx.getImageData(0, 0, tw, th);
        setReady(true);
      } catch (_) {
        if (!dead) setLoadErr(true);
      }
    })();
    return () => {
      dead = true;
      if (revokeRef.current) URL.revokeObjectURL(revokeRef.current);
    };
  }, [src]);

  /* ---------- 미리보기 렌더 (rAF 로 합침) ---------- */
  const renderPreview = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const base = baseRef.current, canvas = canvasRef.current;
      if (!base || !canvas) return;
      const { width: w, height: h } = base;
      if (canvas.width !== w) { canvas.width = w; canvas.height = h; }
      const ctx = canvas.getContext("2d");
      const copy = new ImageData(new Uint8ClampedArray(base.data), w, h);
      applyLook(copy.data, w, h, presetByKey(presetKey), { ...fx, seed: GRAIN_SEED });
      ctx.putImageData(copy, 0, 0);
      if (dateOn) drawDateStamp(ctx, w, h);
    });
  }, [presetKey, fx, dateOn]);

  useEffect(() => { if (ready) renderPreview(); }, [ready, renderPreview]);

  /* ---------- 필터 칩 썸네일 ---------- */
  // 각 칩의 <canvas> 가 마운트될 때 한 번 그린다 (프리셋당 64px — 순간)
  const thumbCanvasCb = useCallback((el, key) => {
    const tb = thumbRef.current;
    if (!el || !tb || el.dataset.drawn) return;
    el.dataset.drawn = "1";
    el.width = tb.width; el.height = tb.height;
    const copy = new ImageData(new Uint8ClampedArray(tb.data), tb.width, tb.height);
    applyLook(copy.data, tb.width, tb.height, presetByKey(key), {});
    el.getContext("2d").putImageData(copy, 0, 0);
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

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
  function stickerPointerMove(ev) {
    const d = dragRef.current;
    if (!d || !d.pointers.has(ev.pointerId)) return;
    ev.preventDefault();
    const prev = d.pointers.get(ev.pointerId);
    d.pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (d.pointers.size === 1) {
      const dx = (ev.clientX - prev.x) / d.rect.width;
      const dy = (ev.clientY - prev.y) / d.rect.height;
      setStickers((p) => p.map((s) => (s.id === d.id
        ? { ...s, x: Math.min(1.05, Math.max(-0.05, s.x + dx)), y: Math.min(1.05, Math.max(-0.05, s.y + dy)) }
        : s)));
    } else if (d.pointers.size === 2 && d.baseDist) {
      const [a, b] = [...d.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      const k = dist / d.baseDist;
      setStickers((p) => p.map((s) => (s.id === d.id
        ? { ...s, scale: Math.min(0.9, Math.max(0.04, d.start.scale * k)), rot: d.start.rot + (ang - d.baseAng) }
        : s)));
    }
  }
  function stickerPointerUp(ev) {
    const d = dragRef.current;
    if (!d) return;
    d.pointers.delete(ev.pointerId);
    if (d.pointers.size === 0) dragRef.current = null;
    else { d.baseDist = null; d.baseAng = null; } // 남은 손가락 기준 재설정은 다음 down 에서
  }

  /* ---------- 내보내기 (원본 해상도) ---------- */
  async function renderFull() {
    const img = fullImgRef.current;
    const w = img.naturalWidth, h = img.naturalHeight;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const hasLook = presetKey !== "none" || fx.grain || fx.vignette || fx.leak;
    if (hasLook) {
      const id = ctx.getImageData(0, 0, w, h);
      // 원본이 커서(2K) 수백 ms 걸릴 수 있다 — 호출측이 busy 표시를 켠 채로 부른다
      applyLook(id.data, w, h, presetByKey(presetKey), { ...fx, seed: GRAIN_SEED });
      ctx.putImageData(id, 0, 0);
    }
    if (dateOn) drawDateStamp(ctx, w, h);
    for (const st of stickers) drawSticker(ctx, st, w, h);
    return c.toDataURL("image/jpeg", 0.95);
  }

  async function handleSave() {
    if (busy) return;
    setBusy("save");
    try {
      await new Promise((r) => setTimeout(r, 30)); // busy 표시가 먼저 그려지게
      const data = await renderFull();
      let ok = true;
      if (isNative()) {
        const r = await nativeSaveToAlbum(data, filename + "_edit");
        ok = !!r?.ok;
      } else {
        const a = document.createElement("a");
        a.href = data;
        a.download = filename + "_edit.jpg";
        document.body.appendChild(a); a.click(); a.remove();
      }
      ok ? hap.done() : hap.warn();
      flashToast(ok ? t("save.toast.done") : t("save.toast.fail"));
    } catch (_) {
      hap.warn();
      flashToast(t("save.toast.fail"));
    } finally {
      setBusy(null);
    }
  }

  async function handleShare() {
    if (busy) return;
    setBusy("share");
    try {
      await new Promise((r) => setTimeout(r, 30));
      const data = await renderFull();
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

  return (
    <div style={ES.overlay}>
      {toast && <div style={ES.toast} onClick={() => setToast("")}>{toast}</div>}

      {/* 상단 바 */}
      <div style={ES.topBar}>
        <button style={ES.topBtn} onClick={onClose}>✕</button>
        <div style={ES.topTitle}>{t("edit.title")}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={ES.topAction} disabled={!!busy} onClick={handleShare}>
            {busy === "share" ? "…" : t("common.share")}
          </button>
          <button style={{ ...ES.topAction, ...ES.topActionPrimary }} disabled={!!busy} onClick={handleSave}>
            {busy === "save" ? t("edit.exporting") : t("common.save")}
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
            <canvas ref={canvasRef} style={ES.canvas} />
            {stickers.map((st) => (
              <span
                key={st.id}
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

      {/* 하단 패널 */}
      <div style={ES.panel}>
        <div style={ES.tabRow}>
          {[
            ["filter", t("edit.tab.filter")],
            ["fx", t("edit.tab.fx")],
            ["sticker", t("edit.tab.sticker")],
          ].map(([k, label]) => (
            <button
              key={k}
              style={{ ...ES.tabBtn, ...(tab === k ? ES.tabBtnOn : null) }}
              onClick={() => { hap.tap(); setTab(k); }}
            >{label}</button>
          ))}
        </div>

        {tab === "filter" && (
          <div style={ES.chipScroll}>
            {FILM_PRESETS.map((p) => (
              <button
                key={p.key}
                style={{ ...ES.filterChip, ...(presetKey === p.key ? ES.filterChipOn : null) }}
                onClick={() => { hap.tap(); setPresetKey(p.key); }}
              >
                <canvas ref={(el) => thumbCanvasCb(el, p.key)} style={ES.filterThumb} />
                <span style={ES.filterName}>{getLang() === "ko" ? p.ko : p.en}</span>
              </button>
            ))}
          </div>
        )}

        {tab === "fx" && (
          <div style={ES.fxCol}>
            {[
              ["grain", t("edit.fx.grain")],
              ["vignette", t("edit.fx.vignette")],
              ["leak", t("edit.fx.leak")],
            ].map(([k, label]) => (
              <label key={k} style={ES.fxRow}>
                <span style={ES.fxLabel}>{label}</span>
                <input
                  type="range" min="0" max="100"
                  value={Math.round(fx[k] * 100)}
                  onChange={(e) => setFx((p) => ({ ...p, [k]: Number(e.target.value) / 100 }))}
                  style={ES.fxSlider}
                />
                <span style={ES.fxVal}>{Math.round(fx[k] * 100)}</span>
              </label>
            ))}
            <button
              style={{ ...ES.dateChip, ...(dateOn ? ES.dateChipOn : null) }}
              onClick={() => { hap.tap(); setDateOn((v) => !v); }}
            >
              🗓️ {t("edit.fx.date")} {dateOn ? "ON" : "OFF"}
            </button>
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
    </div>
  );
}

/* ---------- 스타일 (에디터는 어두운 배경 — 색 판단이 정확해진다) ---------- */
const ES = {
  overlay: {
    position: "fixed", inset: 0, zIndex: 300, display: "flex", flexDirection: "column",
    background: "#141210",
    paddingTop: "env(safe-area-inset-top, 0px)",
    paddingBottom: "env(safe-area-inset-bottom, 0px)",
  },
  toast: {
    position: "fixed", top: "calc(env(safe-area-inset-top, 0px) + 64px)", left: "50%",
    transform: "translateX(-50%)", zIndex: 320, background: "rgba(35,31,32,.94)", color: "#fff",
    padding: "10px 18px", borderRadius: 12, fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap",
  },
  topBar: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "10px 14px", gap: 10,
  },
  topBtn: {
    width: 36, height: 36, borderRadius: 10, border: "none", background: "rgba(255,255,255,.08)",
    color: "#fff", fontSize: 16, cursor: "pointer",
  },
  topTitle: { color: "#fff", fontSize: 15, fontWeight: 800, letterSpacing: ".02em" },
  topAction: {
    border: "none", borderRadius: 11, padding: "9px 16px", fontSize: 13.5, fontWeight: 700,
    background: "rgba(255,255,255,.1)", color: "#fff", cursor: "pointer",
  },
  topActionPrimary: { background: "#B8860B", color: "#fff" },
  stage: {
    flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center",
    padding: "6px 12px", overflow: "hidden",
  },
  canvasWrap: {
    position: "relative", maxWidth: "100%", maxHeight: "100%",
    borderRadius: 10, overflow: "hidden", boxShadow: "0 18px 44px -18px rgba(0,0,0,.8)",
  },
  canvas: { display: "block", width: "100%", height: "100%" },
  loadState: { color: "rgba(255,255,255,.6)", fontSize: 14 },
  sticker: {
    position: "absolute", lineHeight: 1, userSelect: "none", touchAction: "none",
    cursor: "grab", padding: 4,
  },
  stickerSel: { outline: "1.5px dashed rgba(255,255,255,.8)", borderRadius: 8 },
  stickerDel: {
    position: "absolute", top: -14, right: -14, width: 24, height: 24, borderRadius: 12,
    border: "none", background: "#fff", color: "#231f20", fontSize: 11, fontWeight: 800,
    boxShadow: "0 2px 8px rgba(0,0,0,.4)", cursor: "pointer",
  },
  panel: {
    background: "#1d1a17", borderTop: "1px solid rgba(255,255,255,.06)",
    padding: "10px 0 12px",
  },
  tabRow: { display: "flex", gap: 6, padding: "0 14px 10px" },
  tabBtn: {
    border: "none", borderRadius: 10, padding: "7px 14px", fontSize: 13, fontWeight: 700,
    background: "transparent", color: "rgba(255,255,255,.55)", cursor: "pointer",
  },
  tabBtnOn: { background: "rgba(255,255,255,.1)", color: "#fff" },
  chipScroll: {
    display: "flex", gap: 8, overflowX: "auto", padding: "2px 14px 4px",
    WebkitOverflowScrolling: "touch",
  },
  filterChip: {
    flex: "0 0 auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
    border: "none", background: "transparent", padding: 3, borderRadius: 12, cursor: "pointer",
  },
  filterChipOn: { background: "rgba(184,134,11,.28)" },
  filterThumb: { width: 56, borderRadius: 9, display: "block" },
  filterName: { fontSize: 10.5, fontWeight: 700, color: "rgba(255,255,255,.85)", whiteSpace: "nowrap" },
  fxCol: { display: "flex", flexDirection: "column", gap: 10, padding: "4px 18px" },
  fxRow: { display: "flex", alignItems: "center", gap: 12 },
  fxLabel: { width: 58, fontSize: 12.5, fontWeight: 700, color: "rgba(255,255,255,.85)" },
  fxSlider: { flex: 1, accentColor: "#B8860B" },
  fxVal: { width: 30, textAlign: "right", fontSize: 12, color: "rgba(255,255,255,.6)", fontVariantNumeric: "tabular-nums" },
  dateChip: {
    alignSelf: "flex-start", border: "1px solid rgba(255,255,255,.16)", borderRadius: 11,
    padding: "8px 14px", fontSize: 12.5, fontWeight: 700, background: "transparent",
    color: "rgba(255,255,255,.8)", cursor: "pointer",
  },
  dateChipOn: { background: "rgba(184,134,11,.28)", borderColor: "#B8860B", color: "#fff" },
  stickerPanel: { padding: "2px 14px" },
  textRow: { display: "flex", alignItems: "center", gap: 7, marginBottom: 9 },
  textInput: {
    flex: 1, minWidth: 0, border: "1px solid rgba(255,255,255,.14)", borderRadius: 10,
    background: "rgba(255,255,255,.06)", color: "#fff", padding: "8px 11px", fontSize: 13.5,
  },
  colorDot: { width: 22, height: 22, borderRadius: 11, border: "2px solid transparent", cursor: "pointer", flex: "0 0 auto" },
  colorDotOn: { borderColor: "#B8860B" },
  textAdd: {
    border: "none", borderRadius: 10, padding: "8px 13px", fontSize: 12.5, fontWeight: 800,
    background: "rgba(255,255,255,.12)", color: "#fff", cursor: "pointer", flex: "0 0 auto",
  },
  emojiGrid: {
    display: "flex", gap: 2, overflowX: "auto", flexWrap: "wrap", maxHeight: 96,
    overflowY: "auto", WebkitOverflowScrolling: "touch",
  },
  emojiBtn: {
    border: "none", background: "transparent", fontSize: 24, padding: 5, cursor: "pointer",
    lineHeight: 1,
  },
  stickerHint: { marginTop: 6, fontSize: 11.5, color: "rgba(255,255,255,.5)" },
};
