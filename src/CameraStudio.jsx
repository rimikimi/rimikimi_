// ============================================================
// 카메라 — 찍기 전에 필터가 걸린 화면을 그대로 본다 (스노우식)
//
// 왜 이렇게 만들었나
//   CSS filter 로 미리보기를 흉내 내면 빠르지만 **찍은 결과와 색이 다르다**.
//   우리는 이미 filters.js 의 applyLook 으로 저장본을 만들고 있으니, 미리보기도
//   같은 함수를 매 프레임 돌린다. 화면과 결과물이 100% 같은 코드를 탄다.
//
//   대신 그 연산은 픽셀 수에 비례하므로 **미리보기 해상도를 낮춰서** 30fps 를 만든다
//   (기본 긴 변 640px). 프레임 시간을 재서 느리면 480 → 360 으로 자동으로 내려간다.
//   찍는 순간에는 카메라 원본 해상도로 같은 파이프라인을 한 번 더 돌린다.
//
//   촬영 후에는 PhotoEditor 로 넘긴다 — 세기 조절·효과·스티커·저장/공유가 거기 다 있다.
// ============================================================
import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { FILM_PRESETS, groupedPresets, presetByKey, applyLook } from "./filters";
import { t, getLang } from "./i18n";
import { isNative, isRimikimiWebView } from "./nativeBridge";
import * as hap from "./haptics";

const GRAIN_SEED = 7;          // PhotoEditor 와 같은 시드 — 미리보기/결과의 그레인이 같다
// 미리보기 긴 변 후보 (느리면 아래로).
// ⚠️ 예전엔 [640,480,360] 이었다 — 요즘 폰 화면(가로 1200px+)에 640 캔버스를 늘려 그리니
//    **미리보기가 뭉개져 보였다**(오너 지적 2026-09-17). 화면 실크기 × DPR 을 기준으로 잡고,
//    느린 기기는 기존처럼 자동으로 한 단계씩 내려간다(SLOW_MS).
const PREVIEW_STEPS = (() => {
  const dpr = Math.min(typeof devicePixelRatio === "number" ? devicePixelRatio : 1, 3);
  const cssLong = Math.min(Math.max(typeof innerHeight === "number" ? innerHeight : 800, 640), 1000);
  const top = Math.round(Math.min(cssLong * dpr, 1440) / 20) * 20; // 20px 단위로 정리
  return [top, Math.round(top * 0.75), Math.round(top * 0.56), 480, 360];
})();
const SLOW_MS = 42;            // 프레임 처리 시간이 이걸 넘으면 한 단계 낮춘다
const ASPECT = 3 / 4;          // 앱 결과물과 같은 3:4

// 칩 목록: 원본 + 그룹 순서대로
function chipList() {
  const none = FILM_PRESETS.find((p) => p.key === "none");
  const out = none ? [{ ...none, group: null }] : [];
  for (const g of groupedPresets()) for (const p of g.items) out.push(p);
  return out;
}

export default function CameraStudio({ initialPresetKey = "none", onShot, onClose }) {
  const videoRef = useRef(null);
  const workRef = useRef(null);   // 처리용 오프스크린
  const viewRef = useRef(null);   // 화면에 보이는 캔버스
  const streamRef = useRef(null);
  const rafRef = useRef(0);
  const presetRef = useRef(initialPresetKey);
  const stepRef = useRef(0);
  const avgRef = useRef(0);
  const swipeRef = useRef(null);

  const [presetKey, setPresetKey] = useState(initialPresetKey);
  // 기본은 **후면** 카메라(오너 지시 2026-09-17). 전환 버튼으로 전면으로 바꿀 수 있다.
  // 전면일 때만 미리보기·저장본을 좌우 반전한다(아래 facing === "user" 분기).
  const [facing, setFacing] = useState("environment");
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const chips = chipList();
  const ko = getLang() === "ko";
  const label = (p) => (ko ? p.ko : p.en);

  useEffect(() => { presetRef.current = presetKey; }, [presetKey]);

  // 모달이 떠 있는 동안 앱 루트의 스와이프 제스처를 끈다 (PhotoEditor 와 같은 방식)
  useEffect(() => {
    document.body.dataset.modalOpen = "1";
    return () => { delete document.body.dataset.modalOpen; };
  }, []);

  /* ── 카메라 열기 ── */
  const open = useCallback(async (mode) => {
    setErr("");
    setReady(false);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
      // ⚠️ 네이티브에서는 iOS 권한을 **앱이 먼저** 받는다.
      //    Capacitor 는 웹뷰의 카메라 요청(requestMediaCapturePermissionFor)을 권한 창 없이 그대로
      //    승인(.grant)해 버린다. 그러면 WebKit 이 곧장 캡처를 시작하는데, 앱이 아직 카메라 권한을
      //    받은 적이 없으면 iOS 가 프롬프트 대신 앱을 종료하는 경로가 있다(TestFlight build 85·86
      //    크래시 — 시뮬레이터엔 카메라가 없어 재현 불가). @capacitor/camera 의 requestPermissions
      //    는 이 앱의 기존 촬영 기능이 쓰던 검증된 경로라 그걸로 먼저 권한을 확정한다.
      // 2.0 WKWebView 임베드(ios2/android2)는 Capacitor 셸이 아니다 — WebKit 이 getUserMedia 요청에
      // 붙는 카메라 권한 프롬프트를 직접 낸다(Info.plist NSCameraUsageDescription). Capacitor 카메라
      // 플러그인 프리체크는 실제 Capacitor 네이티브 셸에서만 필요.
      if (isNative() && !isRimikimiWebView()) {
        const { Camera } = await import("@capacitor/camera");
        const st = await Camera.requestPermissions({ permissions: ["camera"] });
        if (st.camera === "denied") { const e = new Error("denied"); e.name = "NotAllowedError"; throw e; }
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode, width: { ideal: 1440 }, height: { ideal: 1920 } },
        audio: false,
      });
      // 이전 스트림 정리 (전환 시)
      if (streamRef.current) streamRef.current.getTracks().forEach((tr) => tr.stop());
      streamRef.current = stream;
      const v = videoRef.current;
      if (!v) { stream.getTracks().forEach((tr) => tr.stop()); return; }
      v.srcObject = stream;
      v.muted = true;
      v.playsInline = true;
      await v.play().catch(() => {});
      setReady(true);
    } catch (e) {
      const name = e && e.name;
      setErr(
        name === "NotAllowedError" ? t("camera.err.denied")
        : name === "NotFoundError" ? t("camera.err.nocam")
        : t("camera.err.generic")
      );
    }
  }, []);

  useEffect(() => { open(facing); }, [facing, open]);

  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
  }, []);

  /* ── 미리보기 루프 ── */
  useEffect(() => {
    if (!ready) return;
    let alive = true;

    const loop = () => {
      if (!alive) return;
      rafRef.current = requestAnimationFrame(loop);
      const v = videoRef.current, work = workRef.current, view = viewRef.current;
      if (!v || !work || !view || !v.videoWidth) return;

      // 3:4 중앙 크롭 — 카메라가 주는 비율이 무엇이든 결과물 비율에 맞춘다
      const long = PREVIEW_STEPS[stepRef.current];
      const pw = Math.round(long * ASPECT), ph = long;
      if (work.width !== pw) { work.width = pw; work.height = ph; view.width = pw; view.height = ph; }

      const t0 = performance.now();
      const wctx = work.getContext("2d", { willReadFrequently: true });
      const { sx, sy, sw, sh } = cover(v.videoWidth, v.videoHeight, pw, ph);
      wctx.save();
      if (facing === "user") { wctx.translate(pw, 0); wctx.scale(-1, 1); } // 셀카는 거울로
      wctx.drawImage(v, sx, sy, sw, sh, 0, 0, pw, ph);
      wctx.restore();

      const p = presetByKey(presetRef.current);
      if (p && p.key !== "none") {
        const img = wctx.getImageData(0, 0, pw, ph);
        applyLook(img.data, pw, ph, p, { ...(p.fx || {}), seed: GRAIN_SEED });
        wctx.putImageData(img, 0, 0);
      }
      view.getContext("2d").drawImage(work, 0, 0);

      // 느리면 미리보기 해상도를 한 단계 내린다
      const ms = performance.now() - t0;
      avgRef.current = avgRef.current ? avgRef.current * 0.85 + ms * 0.15 : ms;
      if (avgRef.current > SLOW_MS && stepRef.current < PREVIEW_STEPS.length - 1) {
        stepRef.current += 1;
        avgRef.current = 0;
      }
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { alive = false; cancelAnimationFrame(rafRef.current); };
  }, [ready, facing]);

  /* ── 촬영: 카메라 원본 해상도로 같은 파이프라인 ── */
  async function shoot() {
    const v = videoRef.current;
    if (!v || !v.videoWidth || busy) return;
    setBusy(true);
    hap.tap();
    try {
      const long = Math.min(2048, Math.max(v.videoWidth, v.videoHeight));
      const w = Math.round(long * ASPECT), h = long;
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      const { sx, sy, sw, sh } = cover(v.videoWidth, v.videoHeight, w, h);
      ctx.save();
      if (facing === "user") { ctx.translate(w, 0); ctx.scale(-1, 1); }
      ctx.drawImage(v, sx, sy, sw, sh, 0, 0, w, h);
      ctx.restore();

      const p = presetByKey(presetRef.current);
      if (p && p.key !== "none") {
        const img = ctx.getImageData(0, 0, w, h);
        applyLook(img.data, w, h, p, { ...(p.fx || {}), seed: GRAIN_SEED });
        ctx.putImageData(img, 0, 0);
      }
      const url = c.toDataURL("image/jpeg", 0.92);
      onShot && onShot(url, presetRef.current);
    } catch (_) {
      setErr(t("camera.err.generic"));
    } finally {
      setBusy(false);
    }
  }

  /* ── 미리보기 좌우 스와이프로 필터 넘기기 ── */
  function onTouchStart(e) {
    const tt = e.touches && e.touches[0];
    if (!tt) return;
    swipeRef.current = { x0: tt.clientX, y0: tt.clientY, axis: null };
  }
  function onTouchMove(e) {
    const s = swipeRef.current, tt = e.touches && e.touches[0];
    if (!s || !tt) return;
    const dx = tt.clientX - s.x0, dy = tt.clientY - s.y0;
    if (!s.axis) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      s.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    }
    if (s.axis === "x" && !s.done && Math.abs(dx) > 48) {
      s.done = true;
      step(dx < 0 ? 1 : -1);
    }
  }
  function onTouchEnd() { swipeRef.current = null; }

  function step(dir) {
    const i = chips.findIndex((p) => p.key === presetRef.current);
    const next = chips[(i + dir + chips.length) % chips.length];
    if (!next) return;
    hap.tap();
    setPresetKey(next.key);
    scrollChipIntoView(next.key);
  }
  function scrollChipIntoView(key) {
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-cschip="${key}"]`);
      el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    });
  }

  return createPortal(
    <div style={CS.root}>
      <style>{CS_CSS}</style>

      {/* 2.0 네이티브 웹뷰 안에서는 껍데기가 이미 "닫기 · 카메라" 상단바를 그린다 —
          여기서 또 그리면 **헤더가 두 줄로 겹친다**(오너 지적 2026-09-17).
          그때는 상단바를 접고, 꼭 필요한 전/후면 전환만 미리보기 위에 띄운다. */}
      {isRimikimiWebView() ? (
        <>
          <button
            style={{ ...CS.floatBtn, left: 12 }}
            onClick={() => { hap.tap(); onClose && onClose(); }}
            aria-label={t("common.close")}
          >✕</button>
          <button
            style={{ ...CS.floatBtn, right: 12 }}
            onClick={() => { hap.tap(); setFacing((f) => (f === "user" ? "environment" : "user")); }}
            aria-label={t("camera.flip")}
          >⟳</button>
        </>
      ) : (
        <div style={CS.top}>
          <button style={CS.iconBtn} onClick={() => { hap.tap(); onClose && onClose(); }} aria-label={t("common.close")}>✕</button>
          <div style={CS.topTitle}>{t("camera.title")}</div>
          <button
            style={CS.iconBtn}
            onClick={() => { hap.tap(); setFacing((f) => (f === "user" ? "environment" : "user")); }}
            aria-label={t("camera.flip")}
          >⟳</button>
        </div>
      )}

      <div
        style={CS.stage}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <div style={CS.frame}>
          <video ref={videoRef} style={CS.video} playsInline muted autoPlay />
          <canvas ref={workRef} style={{ display: "none" }} />
          <canvas ref={viewRef} style={CS.canvas} />
          {!ready && !err && <div style={CS.hint}>{t("camera.opening")}</div>}
          {err && (
            <div style={CS.errBox}>
              <div style={CS.errText}>{err}</div>
              <button style={CS.retry} onClick={() => open(facing)}>{t("common.retry")}</button>
            </div>
          )}
          {ready && <div className="cs-name" key={presetKey} style={CS.nameTag}>{label(presetByKey(presetKey))}</div>}
        </div>
      </div>

      <div style={CS.chipRow} data-hscroll>
        {chips.map((p) => (
          <button
            key={p.key}
            data-cschip={p.key}
            style={{ ...CS.chip, ...(presetKey === p.key ? CS.chipOn : null) }}
            onClick={() => { hap.tap(); setPresetKey(p.key); scrollChipIntoView(p.key); }}
          >
            {label(p)}
          </button>
        ))}
      </div>

      <div style={CS.bottom}>
        <div style={CS.swipeHint}>{t("camera.swipeHint")}</div>
        <button
          style={{ ...CS.shutter, ...(ready && !busy ? null : CS.shutterOff) }}
          onClick={shoot}
          disabled={!ready || busy}
          aria-label={t("camera.shoot")}
        >
          <span style={CS.shutterInner} />
        </button>
      </div>
    </div>,
    document.body
  );
}

/* 소스에서 목적 비율에 맞는 가장 큰 중앙 사각형 */
function cover(sw0, sh0, dw, dh) {
  const want = dw / dh;
  const have = sw0 / sh0;
  let sw = sw0, sh = sh0;
  if (have > want) sw = Math.round(sh0 * want);
  else sh = Math.round(sw0 / want);
  return { sx: Math.round((sw0 - sw) / 2), sy: Math.round((sh0 - sh) / 2), sw, sh };
}

const CS = {
  root: {
    position: "fixed", inset: 0, zIndex: 3000, background: "#0d0c0c",
    display: "flex", flexDirection: "column",
    paddingTop: "env(safe-area-inset-top, 0px)",
    paddingBottom: "env(safe-area-inset-bottom, 0px)",
    color: "#fff", fontFamily: "'Quicksand', 'Jua', sans-serif",
  },
  top: {
    flex: "none", height: 52, display: "flex", alignItems: "center",
    justifyContent: "space-between", padding: "0 8px",
  },
  topTitle: { fontSize: 15, fontWeight: 700, letterSpacing: "0.01em", opacity: 0.9 },
  iconBtn: {
    width: 44, height: 44, borderRadius: 22, border: "none", background: "transparent",
    color: "#fff", fontSize: 20, cursor: "pointer", lineHeight: 1,
  },
  // 네이티브 웹뷰(카메라)는 상단바 없이 전체 화면이라, 닫기·전환을 미리보기 위에 띄운다
  // — 아이폰 기본 카메라와 같은 배치(왼쪽 위 닫기, 오른쪽 위 전환).
  floatBtn: {
    position: "absolute", top: "calc(env(safe-area-inset-top, 0px) + 10px)", zIndex: 5,
    width: 40, height: 40, borderRadius: 20, border: "none",
    background: "rgba(0,0,0,0.45)", color: "#fff", fontSize: 19, lineHeight: 1, cursor: "pointer",
  },
  // 아이폰 기본 카메라처럼 **화면을 꽉 채운다**(오너 지시 2026-09-17).
  // 예전엔 maxWidth 520 + 둥근 모서리 + 그림자라 검은 바탕에 상자가 떠 있는 모양이었다.
  stage: { flex: 1, minHeight: 0, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 0 },
  frame: {
    position: "relative", width: "100%", aspectRatio: "3 / 4",
    overflow: "hidden", background: "#181616",
  },
  video: { position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" },
  canvas: { width: "100%", height: "100%", display: "block", objectFit: "cover" },
  hint: {
    position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 14, color: "rgba(255,255,255,0.7)",
  },
  errBox: {
    position: "absolute", inset: 0, display: "flex", flexDirection: "column", gap: 14,
    alignItems: "center", justifyContent: "center", padding: 28, textAlign: "center",
  },
  errText: { fontSize: 14.5, lineHeight: 1.6, color: "rgba(255,255,255,0.86)" },
  retry: {
    border: "1px solid rgba(255,255,255,0.35)", background: "transparent", color: "#fff",
    borderRadius: 999, padding: "9px 22px", fontSize: 14, fontWeight: 700, cursor: "pointer",
  },
  nameTag: {
    position: "absolute", left: "50%", top: 14, transform: "translateX(-50%)",
    background: "rgba(0,0,0,0.42)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
    borderRadius: 999, padding: "5px 14px", fontSize: 12.5, fontWeight: 700, letterSpacing: "0.02em",
  },
  chipRow: {
    flex: "none", display: "flex", gap: 8, overflowX: "auto",
    padding: "12px 20px 4px", scrollPaddingLeft: 20, scrollPaddingRight: 20,
  },
  chip: {
    flexShrink: 0, border: "1px solid rgba(255,255,255,0.22)", background: "rgba(255,255,255,0.08)",
    color: "rgba(255,255,255,0.86)", borderRadius: 999, padding: "8px 16px",
    fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
  },
  chipOn: { background: "#fff", color: "#231f20", borderColor: "#fff" },
  bottom: { flex: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "10px 0 18px" },
  swipeHint: { fontSize: 11.5, color: "rgba(255,255,255,0.45)", letterSpacing: "0.02em" },
  shutter: {
    width: 74, height: 74, borderRadius: "50%", border: "3px solid rgba(255,255,255,0.9)",
    background: "transparent", padding: 0, cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  shutterOff: { opacity: 0.4, cursor: "default" },
  shutterInner: { width: 58, height: 58, borderRadius: "50%", background: "#fff", display: "block" },
};

const CS_CSS = `
  .cs-name { animation: csName 220ms cubic-bezier(0.32,0.72,0,1) backwards; }
  @keyframes csName { from { opacity: 0; transform: translateX(-50%) translateY(-4px); } }
  @media (prefers-reduced-motion: reduce) {
    .cs-name { animation-duration: 1ms; }
  }
`;
