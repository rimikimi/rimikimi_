// ============================================================
// 카메라 — 찍기 전에 필터가 걸린 화면을 본다 (스노우식)
//
// 미리보기 = 카메라 영상(`<video>`) 그대로 + 색감만 CSS 필터로 근사.
// 저장본   = 셔터 순간 원본 해상도(최대 2048)에 `filters.js` 의 applyLook 을 정확히 적용.
//
// ⚠️ 예전엔 미리보기도 매 프레임 캔버스에 applyLook 을 돌려 "화면=결과물" 을 맞췄다.
//    그 연산이 너무 무거워 자동 해상도 강하가 계속 발동했고, **필터를 켜면 미리보기가
//    뭉개졌다**(오너 지적 2026-09-17). 그래서 미리보기는 GPU 가 공짜로 해주는 CSS 필터로
//    바꿨다 — 해상도·프레임 손실이 없다. 색이 100% 같지는 않지만(근사),
//    **찍힌 사진은 예전과 똑같이 정확하다.**
//    되돌리지 말 것: "화면과 결과가 같은 코드" 보다 "미리보기가 선명한 것" 이 우선이다.
//
//    촬영 후에는 PhotoEditor 로 넘긴다 — 세기 조절·효과·스티커·저장/공유가 거기 다 있다.
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


/* 아이폰 기본 카메라와 같은 결의 아이콘 — 문자(✕ ⟳) 대신 SVG. */
function IconX({ size = 17 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
function IconFlipCamera({ size = 21 }) {
  // 카메라 몸체 + 회전 화살표 (SF Symbols 의 arrow.triangle.2.circlepath.camera 결)
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4.5 8.5h3l1.2-1.8h6.6L16.5 8.5h3a1.5 1.5 0 011.5 1.5v7a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 17v-7a1.5 1.5 0 011.5-1.5z"
            stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9.6 13.4a2.4 2.4 0 014.2-1.5M14.4 13.4a2.4 2.4 0 01-4.2 1.5"
            stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M13.9 10.6l0.2 1.5 1.5-0.2M10.1 16.2l-0.2-1.5-1.5 0.2"
            stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// 프리셋 색감을 CSS 필터로 근사한다(미리보기 전용 — 저장본은 applyLook 그대로).
// GPU 로 처리돼서 해상도·프레임 손실이 없다. 정확히 같진 않지만 "어떤 느낌인지"는 전달된다.
function cssFilterFor(p) {
  if (!p || p.key === "none") return "none";
  const fx = p.fx || {};
  const out = [];
  const mono = (p.sat ?? 0) <= -0.9 || fx.mono;
  if (mono) out.push("grayscale(1)");
  const ex = p.ex ?? 0, con = p.con ?? 0;
  const fade = (p.fade ?? 0) / 100;
  out.push(`brightness(${(1 + ex + fade * 0.12).toFixed(3)})`);
  out.push(`contrast(${(1 + con - fade * 0.25).toFixed(3)})`);
  if (!mono) {
    const sat = 1 + (p.sat ?? 0) + (p.vib ?? 0) * 0.4;
    out.push(`saturate(${Math.max(0, sat).toFixed(3)})`);
    const temp = p.temp ?? 0;
    if (temp > 0) out.push(`sepia(${Math.min(0.5, temp / 140).toFixed(3)})`);
    const tint = p.tint ?? 0;
    if (tint) out.push(`hue-rotate(${(-tint * 0.5).toFixed(1)}deg)`);
  }
  if (fx.blur) out.push(`blur(${(fx.blur * 1.2).toFixed(1)}px)`);
  return out.join(" ");
}

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
  // 터치 포커스 — 누른 자리에 사각형을 띄우고, **기기가 지원할 때만** 실제 포커스를 건다.
  // iOS WebKit 이 focusMode/pointsOfInterest 를 노출하지 않으면 표시만 되고 초점은 안 바뀐다
  // (그 경우 진짜 터치 포커스는 웹뷰가 아니라 네이티브 카메라로 가야 한다).
  const [focusPt, setFocusPt] = useState(null);  // {x,y,ok} 화면 비율 0..1
  // 디지털 줌 1..4 — 하드웨어 줌은 기기가 노출해야 쓸 수 있어서(웹뷰에선 대개 불가)
  // 미리보기는 CSS 확대로 보여주고, **저장본은 원본 해상도에서 그만큼 잘라낸다**
  // (업스케일이 아니라 실제 센서 픽셀을 쓰므로 화질 손실이 최소).
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const pinchRef = useRef(null);
  const focusTimer = useRef(0);

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
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

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

  /* ── 미리보기 ──
     ⚠️ 예전엔 매 프레임을 캔버스에 다시 그리고 `applyLook` 을 픽셀 단위로 돌렸다.
     그게 너무 무거워서 자동 해상도 강하(SLOW_MS)가 계속 발동 → **필터를 켜면 미리보기가
     뭉개졌다**(오너 지적 2026-09-17: "필터 적용하면 왜 해상도가 깨지냐").
     이제 카메라 영상(`<video>`)을 **그대로** 띄우고 색감만 CSS 필터로 근사한다 —
     GPU 가 처리하니 해상도 손실도, 프레임 드랍도 없다.
     **저장본은 그대로 정확하다**: 셔터를 누르면 `shoot()` 가 원본 해상도(최대 2048)에
     `applyLook` 을 그대로 한 번 적용한다. 미리보기는 근사, 결과물은 정확. */

  /* ── 터치 포커스 ── */
  async function focusAt(e) {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const p = e.touches?.[0] || e.changedTouches?.[0] || e;
    const x = (p.clientX - r.left) / r.width;
    const y = (p.clientY - r.top) / r.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;

    let ok = false;
    try {
      const track = streamRef.current?.getVideoTracks?.()[0];
      const caps = track?.getCapabilities?.() || {};
      // 지원 여부를 **실제로 물어보고** 있을 때만 적용한다. 없으면 표시만.
      if (track && (caps.pointsOfInterest || caps.focusMode)) {
        const c = {};
        if (caps.pointsOfInterest) c.pointsOfInterest = [{ x, y }];
        if (caps.focusMode) {
          const modes = Array.isArray(caps.focusMode) ? caps.focusMode : [caps.focusMode];
          if (modes.includes("single-shot")) c.focusMode = "single-shot";
          else if (modes.includes("continuous")) c.focusMode = "continuous";
        }
        if (Object.keys(c).length) { await track.applyConstraints({ advanced: [c] }); ok = true; }
      }
    } catch (_) { ok = false; }

    hap.tap();
    setFocusPt({ x, y, ok });
    clearTimeout(focusTimer.current);
    focusTimer.current = setTimeout(() => setFocusPt(null), 900);
  }
  useEffect(() => () => clearTimeout(focusTimer.current), []);

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
      let { sx, sy, sw, sh } = cover(v.videoWidth, v.videoHeight, w, h);
      // 디지털 줌: 미리보기에서 확대한 만큼 원본에서 가운데를 잘라낸다(업스케일 아님).
      const z = zoomRef.current || 1;
      if (z > 1) {
        const nw = sw / z, nh = sh / z;
        sx += (sw - nw) / 2; sy += (sh - nh) / 2; sw = nw; sh = nh;
      }
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
  const dist2 = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

  function onTouchStart(e) {
    if (e.touches && e.touches.length === 2) {           // 핀치 줌 시작
      swipeRef.current = null;
      pinchRef.current = { d0: dist2(e.touches[0], e.touches[1]), z0: zoomRef.current };
      return;
    }
    const tt = e.touches && e.touches[0];
    if (!tt) return;
    swipeRef.current = { x0: tt.clientX, y0: tt.clientY, axis: null };
  }
  function onTouchMove(e) {
    if (pinchRef.current && e.touches && e.touches.length === 2) {
      const { d0, z0 } = pinchRef.current;
      if (d0 > 0) {
        const next = Math.min(4, Math.max(1, z0 * (dist2(e.touches[0], e.touches[1]) / d0)));
        setZoom(next);
      }
      return;
    }
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
  function onTouchEnd() { swipeRef.current = null; pinchRef.current = null; }

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
          ><IconX /></button>
          <button
            style={{ ...CS.floatBtn, right: 12 }}
            onClick={() => { hap.tap(); setFacing((f) => (f === "user" ? "environment" : "user")); }}
            aria-label={t("camera.flip")}
          ><IconFlipCamera /></button>
        </>
      ) : (
        <div style={CS.top}>
          <button style={CS.iconBtn} onClick={() => { hap.tap(); onClose && onClose(); }} aria-label={t("common.close")}><IconX /></button>
          <div style={CS.topTitle}>{t("camera.title")}</div>
          <button
            style={CS.iconBtn}
            onClick={() => { hap.tap(); setFacing((f) => (f === "user" ? "environment" : "user")); }}
            aria-label={t("camera.flip")}
          ><IconFlipCamera /></button>
        </div>
      )}

      <div
        style={CS.stage}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <div style={CS.frame} onClick={focusAt}>
          <video
            ref={videoRef}
            style={{
              ...CS.liveVideo,
              filter: cssFilterFor(presetByKey(presetKey)),
              transform: `${facing === "user" ? "scaleX(-1) " : ""}scale(${zoom})`,
            }}
            playsInline muted autoPlay
          />
          <canvas ref={workRef} style={{ display: "none" }} />
          <canvas ref={viewRef} style={{ display: "none" }} />
          {!ready && !err && <div style={CS.hint}>{t("camera.opening")}</div>}
          {err && (
            <div style={CS.errBox}>
              <div style={CS.errText}>{err}</div>
              <button style={CS.retry} onClick={() => open(facing)}>{t("common.retry")}</button>
            </div>
          )}
          {focusPt && (
            <div
              className="cs-focus"
              style={{ ...CS.focusBox, left: `${focusPt.x * 100}%`, top: `${focusPt.y * 100}%` }}
            />
          )}
          {ready && (
            <div style={CS.zoomRow}>
              {[1, 2].map((z) => (
                <button
                  key={z}
                  style={{ ...CS.zoomBtn, ...(Math.abs(zoom - z) < 0.06 ? CS.zoomBtnOn : null) }}
                  onClick={(e) => { e.stopPropagation(); hap.tap(); setZoom(z); }}
                >{z}×</button>
              ))}
              {zoom > 1 && Math.abs(zoom - 1) > 0.06 && Math.abs(zoom - 2) > 0.06 && (
                <span style={CS.zoomNow}>{zoom.toFixed(1)}×</span>
              )}
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
  // 카메라 영상을 그대로 보여준다(해상도 손실 없음). 색감은 CSS 필터로 근사.
  zoomRow: {
    position: "absolute", left: 0, right: 0, bottom: 12, zIndex: 4,
    display: "flex", justifyContent: "center", alignItems: "center", gap: 8,
  },
  zoomBtn: {
    minWidth: 38, height: 30, padding: "0 10px", borderRadius: 15, border: "none",
    background: "rgba(0,0,0,0.45)", color: "rgba(255,255,255,0.85)",
    fontSize: 12.5, fontWeight: 700, cursor: "pointer",
  },
  zoomBtnOn: { background: "rgba(255,255,255,0.92)", color: "#111" },
  zoomNow: {
    height: 30, display: "flex", alignItems: "center", padding: "0 10px", borderRadius: 15,
    background: "rgba(0,0,0,0.45)", color: "#FFD84D", fontSize: 12.5, fontWeight: 700,
  },
  focusBox: {
    position: "absolute", width: 74, height: 74, marginLeft: -37, marginTop: -37,
    border: "1.5px solid #FFD84D", borderRadius: 6, pointerEvents: "none", zIndex: 4,
  },
  liveVideo: { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" },
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
