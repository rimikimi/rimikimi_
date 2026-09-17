// ============================================================
// 2.0 iOS(SwiftUI)/Android(RN) 웹뷰 전용 진입점 — v2/SPEC.md §5 1단계.
//
// `?tool=camera` | `?tool=filter&mode=pick|edit` 로 들어오면 전체 PortraitStudio 앱
// 대신 이 화면만 뜬다. 로그인 게이트·홈·결제 등은 전부 네이티브가 이미 처리한 뒤라
// 여기선 카메라/편집기 그 자체만 있으면 된다. 저장·공유·닫기·크레딧 갱신은
// nativeBridge.js 의 WKWebView 브릿지로 나간다(Capacitor 없이도 동작).
//
// 네이티브 → 웹 초기 데이터: `window.__rimikimiInit(payload)`.
//   filter mode=edit  → { mode: "edit", src: "data:image/jpeg;base64,..." } (결과 화면 "다듬기")
//   filter mode=pick  → { mode: "pick", presetKey } (필터 탭 프리셋 → 사진 선택)
// ============================================================
import { useEffect, useRef, useState, useCallback } from "react";
import CameraStudio from "./CameraStudio";
import PhotoEditor from "./PhotoEditor";
import { isRimikimiWebView, nativeSaveToAlbum, nativeShareImage, nativeClose } from "./nativeBridge";

function useToolParams() {
  const [p] = useState(() => {
    const q = new URLSearchParams(window.location.search);
    return {
      tool: q.get("tool"), mode: q.get("mode") || "pick", preset: q.get("preset") || "none",
      debugShot: q.get("debugShot") === "1",
    };
  });
  return p;
}

/** 네이티브에 "준비됐다" 알리고 초기 데이터를 받는다. 웹(브라우저)에서 직접 열면 옵션 없이 진행. */
function useNativeInit() {
  const [init, setInit] = useState(null);
  useEffect(() => {
    window.__rimikimiInit = (payload) => setInit(payload || {});
    if (isRimikimiWebView()) {
      try {
        window.webkit.messageHandlers.rimikimi.postMessage({ id: "ready", type: "ready" });
      } catch (_) {}
      // 브릿지 응답이 늦거나 안 오는 경우에도 화면이 영원히 비어 있지 않도록.
      const t = setTimeout(() => setInit((cur) => cur || {}), 1500);
      return () => { clearTimeout(t); delete window.__rimikimiInit; };
    }
    setInit({}); // 웹뷰 밖(개발자 직접 접속)에서도 막히지 않게
    return () => { delete window.__rimikimiInit; };
  }, []);
  return init;
}

const ROOT = {
  position: "fixed", inset: 0, background: "#000",
  display: "flex", flexDirection: "column",
};

/** 촬영 직후: 즉시 앨범 저장 → "다듬기 · 공유"(SPEC §3 카메라). */
function ShotResult({ dataUrl, presetKey, onEdit }) {
  const [status, setStatus] = useState("saving"); // saving | saved | failed
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    let alive = true;
    nativeSaveToAlbum(dataUrl, "rimikimi_camera").then((r) => {
      if (alive) setStatus(r?.ok ? "saved" : "failed");
    });
    return () => { alive = false; };
  }, [dataUrl]);

  async function share() {
    if (sharing) return;
    setSharing(true);
    await nativeShareImage({ src: dataUrl, filename: "rimikimi_camera.jpg", title: "rimikimi", text: "" });
    setSharing(false);
  }

  return (
    <div style={ROOT}>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <img src={dataUrl} alt="" style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 14, objectFit: "contain" }} />
      </div>
      <div style={{ padding: "0 16px 28px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ color: "#fff", textAlign: "center", fontSize: 13, opacity: 0.8 }}>
          {status === "saving" ? "앨범에 저장하는 중…" : status === "saved" ? "앨범에 저장됐어요" : "앨범 저장에 실패했어요"}
        </div>
        <button onClick={() => onEdit(dataUrl, presetKey)} style={btnPrimary}>다듬기</button>
        <button onClick={share} disabled={sharing} style={btnSecondary}>{sharing ? "공유 중…" : "공유"}</button>
        <button onClick={nativeClose} style={btnGhost}>닫기</button>
      </div>
    </div>
  );
}

const btnBase = {
  height: 50, borderRadius: 12, border: "none", fontSize: 16, fontWeight: 600,
  fontFamily: "inherit", cursor: "pointer",
};
const btnPrimary = { ...btnBase, background: "#E6403C", color: "#fff" };
const btnSecondary = { ...btnBase, background: "rgba(255,255,255,.14)", color: "#fff" };
const btnGhost = { ...btnBase, background: "transparent", color: "rgba(255,255,255,.6)" };

// 1x1 회색 PNG — 시뮬레이터엔 실카메라가 없어 셔터를 실제로 누를 수 없을 때
// `?tool=camera&debugShot=1` 로 "촬영 직후" 화면(즉시 저장 → 다듬기·공유)만 검증한다.
const DEBUG_SHOT_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function CameraTool({ debugShot }) {
  const [shot, setShot] = useState(debugShot ? { dataUrl: DEBUG_SHOT_PNG, presetKey: "none" } : null);
  const [editing, setEditing] = useState(null);

  const onEdit = useCallback((dataUrl, presetKey) => setEditing({ dataUrl, presetKey }), []);

  if (editing) {
    return (
      <PhotoEditor
        src={editing.dataUrl}
        initialPresetKey={editing.presetKey}
        filename="rimikimi_camera"
        onClose={nativeClose}
      />
    );
  }
  if (shot) return <ShotResult dataUrl={shot.dataUrl} presetKey={shot.presetKey} onEdit={onEdit} />;
  return (
    <CameraStudio
      initialPresetKey="none"
      onClose={nativeClose}
      onShot={(dataUrl, presetKey) => setShot({ dataUrl, presetKey })}
    />
  );
}

/** 필터 탭 → 프리셋 → 사진 최대 10장. 표준 `<input type=file multiple>` — WKWebView 가 네이티브
 *  사진 피커를 그대로 띄워 준다(별도 권한/브릿지 불필요). */
function FilterPicker({ presetKey, onPicked }) {
  const [busy, setBusy] = useState(false);
  async function onChange(e) {
    const files = Array.from(e.target.files || []).slice(0, 10);
    if (!files.length) return;
    setBusy(true);
    const srcs = await Promise.all(files.map((f) => new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.readAsDataURL(f);
    })));
    setBusy(false);
    onPicked(srcs);
  }
  // 필터를 고른 직후라 "사진 선택" 한 단계가 더 있으면 빈 화면처럼 보인다(오너 지적).
  // 열리자마자 사진 선택창을 띄운다. 브라우저가 사용자 제스처 없는 click() 을 막으면
  // 아래 버튼이 그대로 보이므로 막히는 경우에도 흐름이 끊기지 않는다.
  const fileRef = useRef(null);
  useEffect(() => {
    const t = setTimeout(() => { try { fileRef.current?.click(); } catch (_) {} }, 120);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{ ...ROOT, alignItems: "center", justifyContent: "center", background: "#FBF8F3", gap: 14 }}>
      <div style={{ fontSize: 15, color: "rgba(35,31,32,.6)" }}>
        {busy ? "사진을 불러오고 있어요" : "꾸밀 사진을 골라 주세요"}
      </div>
      <label style={{ ...btnPrimary, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 24px" }}>
        {busy ? "불러오는 중…" : "사진 선택 (최대 10장)"}
        <input ref={fileRef} type="file" accept="image/*" multiple onChange={onChange}
               style={{ display: "none" }} disabled={busy} />
      </label>
    </div>
  );
}

function FilterTool({ mode, presetKey, initSrc, initSrcs }) {
  // 네이티브가 사진을 먼저 고르게 하고 여기로 넘긴다(`srcs`). 그러면 웹에
  // "사진 선택" 중간 화면이 아예 안 뜬다 — 사파리는 사용자 제스처 없는 파일창 열기를
  // 막아서 웹에서 자동으로 여는 건 불가능하다(2026-09-17 실패 확인).
  const first = (initSrcs && initSrcs.length) ? initSrcs : (mode === "edit" && initSrc ? [initSrc] : null);
  const [srcs, setSrcs] = useState(first);
  if (!srcs) return <FilterPicker presetKey={presetKey} onPicked={setSrcs} />;
  return (
    <PhotoEditor
      srcs={srcs}
      initialPresetKey={presetKey}
      filename="rimikimi_filter"
      onClose={nativeClose}
    />
  );
}

export default function ToolEntry() {
  const params = useToolParams();
  const init = useNativeInit();

  if (!init) {
    return <div style={{ ...ROOT, background: "#FBF8F3" }} />; // ready 핸드셰이크 대기 — 순간적
  }

  if (params.tool === "camera") return <CameraTool debugShot={params.debugShot} />;
  // filter
  const mode = init.mode || params.mode;
  const presetKey = init.presetKey || params.preset || "none";
  return <FilterTool mode={mode} presetKey={presetKey} initSrc={init.src} initSrcs={init.srcs} />;
}
