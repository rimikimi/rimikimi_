// ============================================================
// 웹 연속 촬영 카메라 — 2.0 앱 BurstCameraView(ios2/rimikimi/UI/Camera/BurstCamera.swift)와 같은 화면.
//
// 셔터를 여러 번 눌러 한 번에 최대 10장 → "완료 N" → 찍은 컷 전부를 편집기로 넘겨 필터를 한 번에.
// 촬영 중 라이브 필터는 없다(앱과 같다 — 찍고 나서 필터).
//
// ⚠️ 웹(PortraitStudio) 전용. 네이티브 2.0 웹뷰 경로(ToolEntry)는 여전히 CameraStudio 를 쓴다 —
//    이 파일을 바꿔도 앱 편집기에는 영향이 없다.
// ============================================================
import { useEffect, useRef, useState } from "react";

const MAX_SHOTS = 10;
const ACCENT = "#e6403c";
const FONT = '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", Roboto, "Segoe UI", sans-serif';

export default function WebBurstCamera({ onClose, onDone }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [facing, setFacing] = useState("environment");
  const [denied, setDenied] = useState(false);
  const [shots, setShots] = useState([]);
  const [flash, setFlash] = useState(false); // 셔터 반짝임
  const [torch, setTorch] = useState(false);
  const [torchOk, setTorchOk] = useState(false);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false,
        });
        if (dead) { s.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = s;
        if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play().catch(() => {}); }
        const caps = s.getVideoTracks()[0]?.getCapabilities?.() || {};
        setTorchOk(!!caps.torch);
        setTorch(false);
        setDenied(false);
      } catch (_) {
        if (!dead) setDenied(true);
      }
    })();
    return () => {
      dead = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [facing]);

  function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const on = !torch;
    track.applyConstraints({ advanced: [{ torch: on }] }).then(() => setTorch(on)).catch(() => {});
  }

  function capture() {
    const v = videoRef.current;
    if (!v || !v.videoWidth || shots.length >= MAX_SHOTS) return;
    // 3:4 세로로 가운데를 잘라 담는다(앱 결과·편집기 기본 비율).
    const vw = v.videoWidth, vh = v.videoHeight;
    let cw = vw, ch = Math.round(vw * 4 / 3);
    if (ch > vh) { ch = vh; cw = Math.round(vh * 3 / 4); }
    const c = document.createElement("canvas");
    c.width = cw; c.height = ch;
    const g = c.getContext("2d");
    if (facing === "user") { g.translate(cw, 0); g.scale(-1, 1); } // 셀카는 보이는 그대로(거울)
    g.drawImage(v, (vw - cw) / 2, (vh - ch) / 2, cw, ch, 0, 0, cw, ch);
    const url = c.toDataURL("image/jpeg", 0.92);
    setShots((s) => (s.length >= MAX_SHOTS ? s : [...s, url]));
    setFlash(true);
    setTimeout(() => setFlash(false), 180);
  }

  const full = shots.length >= MAX_SHOTS;
  return (
    <div style={W.root} role="dialog" aria-label="카메라">
      {denied ? (
        <div style={W.denied}>
          <svg width="34" height="34" viewBox="0 0 24 24" fill="rgba(255,255,255,0.6)" aria-hidden="true">
            <path d="M4 8.5h2.6l1.3-2h8.2l1.3 2H20a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5a1 1 0 0 1 1-1Z" />
          </svg>
          <div style={{ fontSize: 17, fontWeight: 600 }}>카메라 권한이 필요해요</div>
          <div style={{ fontSize: 13, opacity: 0.7, textAlign: "center", lineHeight: 1.45 }}>
            브라우저 설정에서 카메라를 허용하면 여러 장을 찍어 한 번에 필터를 입힐 수 있어요.
          </div>
          <button type="button" style={W.textBtn} onClick={onClose}>닫기</button>
        </div>
      ) : (
        <>
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            style={{ ...W.video, transform: facing === "user" ? "scaleX(-1)" : "none" }}
          />
          <div style={{ ...W.flash, opacity: flash ? 0.85 : 0 }} />

          <div style={W.top}>
            <GlassBtn label="닫기" onClick={onClose}>
              <path d="M6 6l12 12M18 6L6 18" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" fill="none" />
            </GlassBtn>
            {torchOk ? (
              <GlassBtn label={torch ? "플래시 끄기" : "플래시 켜기"} onClick={toggleTorch}>
                <path d="M13 3L5 13.5h6L10 21l8-10.5h-6z" fill={torch ? "#f9c83c" : "none"} stroke={torch ? "#f9c83c" : "#fff"} strokeWidth="1.8" strokeLinejoin="round" />
              </GlassBtn>
            ) : <div style={{ width: 40 }} />}
          </div>

          <div style={W.bottom}>
            {shots.length > 0 && (
              <div style={W.thumbs}>
                {shots.map((u, i) => (
                  <button key={i} type="button" style={W.thumb} aria-label={`${i + 1}번째 컷 지우기`}
                    onClick={() => setShots((s) => s.filter((_, k) => k !== i))}>
                    <img src={u} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    <span style={W.thumbX}>×</span>
                  </button>
                ))}
              </div>
            )}
            <div style={W.hint}>
              {full ? "10장을 다 찍었어요 · 완료를 눌러 주세요" : "여러 장 찍고 한 번에 필터를 입혀요 · 최대 10장"}
            </div>
            <div style={W.controls}>
              <div style={W.side}>
                <GlassBtn label="전면/후면 전환" onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}>
                  <path d="M4 9h2.4l1.2-2h8.8l1.2 2H20v10H4z" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinejoin="round" />
                  <path d="M9.2 13.2a3 3 0 0 1 5.3-1.6M14.8 14.4a3 3 0 0 1-5.3 1.6" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
                </GlassBtn>
              </div>
              <button type="button" aria-label="촬영" disabled={full} onClick={capture} style={W.shutter} className="rk-shutter">
                <span style={{ ...W.shutterRing, borderColor: `rgba(255,255,255,${full ? 0.3 : 0.9})` }} />
                <span style={{ ...W.shutterDot, background: `rgba(255,255,255,${full ? 0.3 : 1})` }} />
              </button>
              <div style={{ ...W.side, justifyContent: "flex-end" }}>
                {shots.length > 0 && (
                  <button type="button" style={W.done} onClick={() => onDone && onDone(shots)}>
                    완료 {shots.length}
                  </button>
                )}
              </div>
            </div>
          </div>
          <style>{`.rk-shutter:active span:last-child{transform:scale(.88)}.rk-shutter span:last-child{transition:transform 120ms ease-out}`}</style>
        </>
      )}
    </div>
  );
}

function GlassBtn({ label, onClick, children }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} style={W.glass}>
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">{children}</svg>
    </button>
  );
}

const W = {
  root: { position: "fixed", inset: 0, zIndex: 400, background: "#000", color: "#fff", fontFamily: FONT, overflow: "hidden" },
  video: { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" },
  flash: { position: "absolute", inset: 0, background: "#fff", pointerEvents: "none", transition: "opacity 180ms ease-out" },
  top: {
    position: "absolute", left: 0, right: 0, top: 0,
    padding: "calc(env(safe-area-inset-top, 0px) + 12px) 16px 0",
    display: "flex", justifyContent: "space-between", alignItems: "center",
  },
  glass: {
    width: 40, height: 40, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.35)",
    display: "flex", alignItems: "center", justifyContent: "center", padding: 0, cursor: "pointer",
  },
  bottom: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    padding: "0 0 calc(env(safe-area-inset-bottom, 0px) + 24px)",
  },
  thumbs: { display: "flex", gap: 8, overflowX: "auto", padding: "0 16px", marginBottom: 12 },
  thumb: {
    position: "relative", flex: "0 0 44px", width: 44, height: 59, borderRadius: 8, overflow: "hidden",
    border: "none", padding: 0, cursor: "pointer", background: "#222",
  },
  thumbX: {
    position: "absolute", top: 2, right: 2, width: 14, height: 14, borderRadius: "50%",
    background: "rgba(0,0,0,0.5)", color: "#fff", fontSize: 11, lineHeight: "14px", textAlign: "center",
  },
  hint: { fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.75)", textAlign: "center", marginBottom: 12, padding: "0 16px" },
  controls: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px" },
  side: { width: 84, display: "flex", alignItems: "center" },
  shutter: {
    position: "relative", width: 74, height: 74, border: "none", background: "transparent", padding: 0, cursor: "pointer",
  },
  shutterRing: { position: "absolute", inset: 0, borderRadius: "50%", border: "4px solid", boxSizing: "border-box" },
  shutterDot: { position: "absolute", left: 7, top: 7, width: 60, height: 60, borderRadius: "50%" },
  done: {
    height: 40, padding: "0 12px", borderRadius: 999, border: "none", background: ACCENT, color: "#fff",
    fontSize: 15, fontWeight: 600, fontFamily: FONT, cursor: "pointer", whiteSpace: "nowrap",
  },
  denied: {
    position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center",
    justifyContent: "center", gap: 12, padding: 16,
  },
  textBtn: { background: "none", border: "none", color: "#fff", fontSize: 15, fontWeight: 600, fontFamily: FONT, cursor: "pointer" },
};

