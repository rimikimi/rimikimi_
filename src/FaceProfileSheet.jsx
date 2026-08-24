// ============================================================
// 페이스 프로필 v1.1 — 촬영 온보딩 / 확인·동의 / 관리
//
// 정본 스펙: rimikimi studios/_design/face-profile-v1.md §1·§2
// 동의 문구 근거: face-profile-legal.md §6 초안 — v1.1(기기 보관)에 맞게 수정.
//   초안은 v1.0(서버 보관) 기준이라 "서버에 저장돼요" 로 되어 있었다. v1.1 은
//   기기에만 저장하므로 그 문장을 그대로 쓰면 허위기재가 된다 — 보관 위치를
//   기기로 바꾸고 "생성할 때만 임시 전송" 을 명시한다.
//
// 화면 흐름 (v1.1 개정: 2026-08-24 오너 지시):
//   안내(셀카 찍기 / 앨범 업로드 선택) → 1장 필수 + 2장 선택 (품질 게이트)
//   → 서버가 앵커(기준 정면 사진) 생성 → "이 얼굴이 맞아요?" 확인·동의 → 앵커만 저장
// 저장되는 건 사용자가 확인한 앵커 1장뿐이다. 올린 셀카는 앵커를 만드는 요청에만
// 쓰이고 어디에도 남지 않는다.
// ============================================================

import React, { useEffect, useState } from "react";
import { isNative, nativePickPhoto, nativeSaveToAlbum } from "./nativeBridge";
import {
  ANGLES, REQUIRED_ANGLES,
  inspectShot, serverFaceCheck, saveProfile, deleteProfile, loadProfilePreviews,
  requestAnchor,
} from "./faceProfile";

// 앨범 업로드 모드의 슬롯 — 각도 지시 없이 "얼굴 잘 보이는 사진 1~3장".
const ALBUM_SLOTS = [
  { key: "p1", label: "사진 1", hint: "얼굴이 또렷하게 보이는 사진", required: true },
  { key: "p2", label: "사진 2", hint: "다른 각도면 더 좋아요 (선택)", required: false },
  { key: "p3", label: "사진 3", hint: "(선택)", required: false },
];

// 앵커 재생성 한도 — 서버 캡(24h 6회)과 별개로 UX 는 한 세션 2회까지.
const REGEN_MAX = 2;

const INK = "#231f20";

// 촬영본은 전송 전에 장변 1280px 로 줄인다. (기기·서버 어디에도 저장하지 않는다 —
// 앵커를 만드는 데 한 번 쓰이고 버려진다.)
// 1024/q0.88 이었는데, 그 해상도면 셀카에서 얼굴이 차지하는 픽셀이 400px 남짓이라
// 눈매·피부결 같은 정체성 디테일이 모델에 도달하기 전에 이미 뭉갠 상태로 올라갔다.
function shrink(dataUrl, max = 1280, q = 0.92) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width: w, height: h } = img;
      if (w > max || h > max) {
        const s = max / Math.max(w, h);
        w = Math.round(w * s); h = Math.round(h * s);
      }
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL("image/jpeg", q));
    };
    img.onerror = () => reject(new Error("사진을 읽을 수 없어요."));
    img.src = dataUrl;
  });
}

export default function FaceProfile({ accessToken, onClose, onSaved }) {
  // step: intro → shoot → confirm(앵커 생성·확인)
  const [step, setStep] = useState("intro");
  const [mode, setMode] = useState("camera");  // "camera" | "album"
  const [shots, setShots] = useState({});      // { slotKey: dataUrl }
  const [busy, setBusy] = useState(null);      // 검사 중인 slotKey
  const [err, setErr] = useState({});          // { slotKey: 사유 }
  const [agree, setAgree] = useState(false);   // ⚠️ 기본 해제 (legal §6-3)
  const [age14, setAge14] = useState(false);   // 만 14세 이상 (legal §6-6)
  const [saveErr, setSaveErr] = useState("");
  const [anchor, setAnchor] = useState(null);      // 생성된 기준 사진 dataUrl
  const [anchorBusy, setAnchorBusy] = useState(false);
  const [anchorErr, setAnchorErr] = useState("");
  const [regens, setRegens] = useState(0);         // 재생성 횟수 (REGEN_MAX 까지)
  const fileRef = React.useRef(null);
  const pendingAngle = React.useRef(null);

  const SLOTS = mode === "album" ? ALBUM_SLOTS : ANGLES;
  const required = SLOTS.filter((s) => s.required).map((s) => s.key);
  const done = required.every((a) => shots[a]);
  const count = SLOTS.filter((s) => shots[s.key]).length;

  // 앵커 생성 — 채워진 슬롯 순서대로 보낸다 (필수 슬롯이 첫 장)
  async function makeAnchor() {
    setAnchorErr("");
    setAnchor(null);
    setAnchorBusy(true);
    try {
      const urls = SLOTS.filter((s) => shots[s.key]).map((s) => shots[s.key]);
      const a = await requestAnchor(accessToken, urls);
      setAnchor(a);
    } catch (e) {
      setAnchorErr(e?.message || "기준 사진을 만들지 못했어요.");
    } finally {
      setAnchorBusy(false);
    }
  }

  function startConfirm() {
    setRegens(0);
    setStep("confirm");
    makeAnchor();
  }

  function regen() {
    if (regens >= REGEN_MAX || anchorBusy) return;
    setRegens((n) => n + 1);
    makeAnchor();
  }

  async function accept(angle, rawDataUrl) {
    setBusy(angle);
    setErr((e) => ({ ...e, [angle]: null }));
    try {
      const small = await shrink(rawDataUrl);
      // 1차: 기기에서 밝기·블러·해상도
      const local = await inspectShot(small);
      if (!local.ok) { setErr((e) => ({ ...e, [angle]: local.reason })); return; }
      // 2차: 서버에서 얼굴 검출
      const remote = await serverFaceCheck(accessToken, small);
      if (!remote.ok) { setErr((e) => ({ ...e, [angle]: remote.reason })); return; }
      setShots((s) => ({ ...s, [angle]: small }));
    } catch (e) {
      setErr((x) => ({ ...x, [angle]: e?.message || "사진을 처리하지 못했어요." }));
    } finally {
      setBusy(null);
    }
  }

  async function shoot(angle, source) {
    if (isNative()) {
      const d = await nativePickPhoto(source);
      if (d) accept(angle, d);
      return;
    }
    pendingAngle.current = angle;
    fileRef.current?.click();
  }

  function onFile(e) {
    const f = e.target.files?.[0];
    const angle = pendingAngle.current;
    try { e.target.value = ""; } catch { /* 무시 */ }
    if (!f || !angle || !f.type.startsWith("image/")) return;
    const rd = new FileReader();
    rd.onload = () => accept(angle, rd.result);
    rd.readAsDataURL(f);
  }

  async function save() {
    setSaveErr("");
    try {
      await saveProfile(anchor); // 저장은 앵커 1장뿐 — 올린 셀카는 남기지 않는다
      onSaved && onSaved();
      onClose && onClose();
    } catch (e) {
      setSaveErr(e?.message || "저장하지 못했어요.");
    }
  }

  // 만든 기준 사진을 사용자 앨범에도 저장 (2026-08-24 오너 지시).
  // 프로필 등록과 별개 동작 — 등록 없이 사진만 가져가도 된다.
  const [albumMsg, setAlbumMsg] = useState("");
  async function saveAnchorToAlbum() {
    if (!anchor) return;
    setAlbumMsg("");
    try {
      if (isNative()) {
        const r = await nativeSaveToAlbum(anchor, "rimikimi_face");
        setAlbumMsg(r ? "앨범에 저장했어요 ✓" : "앨범에 저장하지 못했어요.");
      } else {
        const a = document.createElement("a");
        a.href = anchor;
        a.download = "rimikimi_face" + (/^data:image\/jpe?g/i.test(anchor) ? ".jpg" : ".png");
        a.click();
        setAlbumMsg("저장했어요 ✓");
      }
    } catch {
      setAlbumMsg("앨범에 저장하지 못했어요.");
    }
  }

  return (
    <div style={S.backdrop} onClick={onClose}>
      <div style={S.sheet} onClick={(e) => e.stopPropagation()}>
        <button style={S.close} onClick={onClose} aria-label="닫기">✕</button>
        {/* 앵커 생성 대기 스피너용 — 전역 CSS 에 spin 키프레임이 없어 여기서 선언 */}
        <style>{"@keyframes rk-spin { to { transform: rotate(360deg); } }"}</style>
        <input ref={fileRef} type="file" accept="image/*" onChange={onFile} style={{ display: "none" }} />

        {step === "intro" && (
          <>
            <div style={S.emoji}>🙂</div>
            <h2 style={S.title}>앱에서 사용할 사진 만들기</h2>
            <p style={S.lead}>
              {/* "여러 각도라 더 잘 나온다" 는 문구를 쓰지 않는다 — 스펙 §6 A/B 실측(1장 vs 3장,
                  총 10장, 블라인드 판정 6회)에서 정확도 차이가 확인되지 않았다.
                  자세한 수치는 docs/face-profile-ab.md. */}
              사진 1장만 있으면 돼요. 기준 사진을 만들어 두면 다음부터는
              사진을 올리지 않아도 바로 만들 수 있어요.
            </p>
            {/* 권한 사전고지 (legal §6-7) — OS 프롬프트 전에 왜 필요한지 먼저 설명 */}
            <div style={S.noteBox}>
              <div style={S.noteHead}>카메라·사진 접근이 필요해요</div>
              <div style={S.noteBody}>
                얼굴 등록에만 사용해요. 허용하지 않아도 앱의 다른 기능은 그대로 쓸 수 있어요.
              </div>
            </div>
            <div style={{ ...S.noteBox, background: "rgba(26,127,75,0.07)" }}>
              <div style={{ ...S.noteHead, color: "#1a7f4b" }}>기준 사진은 이 폰에만 저장돼요</div>
              <div style={S.noteBody}>
                올린 셀카로 기준 사진 1장을 만들어 보여드려요. 마음에 들 때만 저장되고,
                올린 셀카는 어디에도 남지 않아요. 폰을 바꾸거나 앱을 지우면 다시 등록해야 해요.
              </div>
            </div>
            <button style={S.primary} onClick={() => { setMode("camera"); setShots({}); setErr({}); setStep("shoot"); }}>
              지금 셀카 찍기
            </button>
            <button style={{ ...S.ghost, width: "100%", marginTop: 8 }}
              onClick={() => { setMode("album"); setShots({}); setErr({}); setStep("shoot"); }}>
              앨범에서 사진 올리기
            </button>
          </>
        )}

        {step === "shoot" && (
          <>
            <h2 style={S.title}>{mode === "album" ? "사진을 올려주세요" : "셀카를 찍어주세요"}</h2>
            <p style={S.lead}>
              {mode === "album"
                ? "1장이면 충분해요. 다른 각도 사진을 더 올리면 좋아요 (최대 3장)."
                : "정면 1장이면 충분해요. 좌우 45°도 찍으면 좋아요."}
            </p>
            <div style={S.grid}>
              {SLOTS.map((a) => {
                const got = shots[a.key];
                const reason = err[a.key];
                return (
                  <div key={a.key} style={S.slot}>
                    <div style={{ ...S.slotBox, borderColor: got ? "#1a7f4b" : reason ? "#c0392b" : INK + "22" }}>
                      {got
                        ? <img src={got} alt={a.label} style={S.slotImg} />
                        : <div style={S.slotEmpty}>{a.required ? "필수" : "선택"}</div>}
                      {busy === a.key && <div style={S.slotBusy}>검사 중…</div>}
                    </div>
                    <div style={S.slotLabel}>{a.label}</div>
                    <div style={S.slotHint}>{reason || a.hint}</div>
                    <div style={S.slotBtns}>
                      {mode === "album" ? (
                        <button style={S.miniBtn} disabled={!!busy} onClick={() => shoot(a.key, "photos")}>
                          {got ? "다시 선택" : "올리기"}
                        </button>
                      ) : (
                        <>
                          <button style={S.miniBtn} disabled={!!busy} onClick={() => shoot(a.key, "camera")}>
                            {got ? "다시" : "촬영"}
                          </button>
                          <button style={S.miniGhost} disabled={!!busy} onClick={() => shoot(a.key, "photos")}>앨범</button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <button style={{ ...S.primary, opacity: done ? 1 : 0.35 }} disabled={!done}
              onClick={startConfirm}>
              {done
                ? `${count}장으로 기준 사진 만들기`
                : mode === "album" ? "사진 1장을 올려주세요" : "정면 1장을 찍어주세요"}
            </button>
          </>
        )}

        {step === "confirm" && (
          <>
            <h2 style={S.title}>{anchorBusy ? "기준 사진을 만들고 있어요…" : "이 얼굴이 맞아요?"}</h2>

            {anchorBusy && (
              <div style={S.anchorLoading}>
                <div style={S.anchorSpin} />
                <div style={S.lead}>올려주신 사진 {count}장으로 만드는 중이에요 (10~30초)</div>
              </div>
            )}

            {!anchorBusy && anchorErr && (
              <>
                <div style={S.err}>{anchorErr}</div>
                <div style={S.row}>
                  <button style={S.ghost} onClick={() => setStep("shoot")}>사진 다시 고르기</button>
                  <button style={{ ...S.primary, flex: 1 }} onClick={makeAnchor}>다시 시도</button>
                </div>
              </>
            )}

            {!anchorBusy && anchor && (
              <>
                <div style={S.previewRow}>
                  <img src={anchor} alt="기준 사진" style={S.anchorImg} />
                </div>
                <div style={{ textAlign: "center", marginBottom: 8 }}>
                  <button style={S.linkBtn} onClick={saveAnchorToAlbum}>📥 이 사진 앨범에 저장</button>
                  {albumMsg && <div style={S.albumMsg}>{albumMsg}</div>}
                </div>
                <p style={S.lead}>
                  이 사진이 앞으로 모든 컨셉 사진의 얼굴 기준이 돼요.
                  마음에 안 들면 다시 만들 수 있어요.
                </p>

                {/* 동의 문구 — legal §6 초안을 v1.1(앵커 기기 보관)에 맞게 수정 */}
                <ul style={S.consent}>
                  <li>올린 셀카 {count}장은 기준 사진을 만드는 데만 쓰이고 <b>저장되지 않아요</b>.</li>
                  <li>확인한 기준 사진 1장만 <b>이 기기에만</b> 저장돼요. 서버에는 보관하지 않아요.</li>
                  <li>사진을 만들 때마다 기준 사진이 이미지 생성을 위해 <b>해외(미국) Google 서버로 전송</b>되고, 생성이 끝나면 즉시 폐기돼요.</li>
                  <li>이 사진으로 회원님을 인증하거나 신원을 확인하지 않으며, 얼굴인식 특징정보(임베딩)를 만들지 않아요.</li>
                  <li>언제든 [프로필 &gt; 얼굴 프로필]에서 바꾸거나 삭제할 수 있어요. 삭제하면 기기에서 바로 지워져요.</li>
                  <li>동의하지 않아도 괜찮아요 — 그때그때 사진을 올리는 기존 방식으로 계속 이용할 수 있어요.</li>
                </ul>

                <label style={S.check}>
                  <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={S.cb} />
                  <span>위 내용을 확인했고, 기준 사진의 기기 저장과 생성 시 해외 전송에 동의해요.</span>
                </label>
                <label style={S.check}>
                  <input type="checkbox" checked={age14} onChange={(e) => setAge14(e.target.checked)} style={S.cb} />
                  <span>만 14세 이상이에요.</span>
                </label>

                {saveErr && <div style={S.err}>{saveErr}</div>}
                <div style={S.row}>
                  <button style={S.ghost} onClick={() => setStep("shoot")}>사진 다시 고르기</button>
                  <button
                    style={{ ...S.ghost, opacity: regens >= REGEN_MAX ? 0.35 : 1 }}
                    disabled={regens >= REGEN_MAX}
                    onClick={regen}>
                    다시 만들기{regens > 0 ? ` (${REGEN_MAX - regens}회 남음)` : ""}
                  </button>
                </div>
                <button
                  style={{ ...S.primary, marginTop: 8, opacity: agree && age14 ? 1 : 0.35 }}
                  disabled={!agree || !age14} onClick={save}>
                  이 얼굴로 시작하기
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- 프로필 화면에 넣는 관리 카드 ---------- */
export function FaceProfileCard({ meta, onEdit, onDeleted }) {
  const [previews, setPreviews] = useState([]);
  useEffect(() => {
    let dead = false;
    if (meta) loadProfilePreviews().then((p) => { if (!dead) setPreviews(p); });
    else setPreviews([]);
    return () => { dead = true; };
  }, [meta && meta.consentAt, meta && meta.count]);

  return (
    <div style={S.card}>
      <div style={S.cardHead}>얼굴 프로필</div>
      {meta ? (
        <>
          <div style={S.previewRow}>
            {previews.map((p) => <img key={p.angle} src={p.dataUrl} alt={p.angle} style={S.previewSm} />)}
          </div>
          <div style={S.cardNote}>
            기준 사진 등록됨 · 이 기기에만 저장
            {meta.stale && " · 안내가 바뀌어 다시 등록이 필요해요"}
          </div>
          <div style={S.row}>
            <button style={S.ghost} onClick={onEdit}>다시 등록</button>
            <button style={S.danger} onClick={async () => { await deleteProfile(); onDeleted && onDeleted(); }}>
              삭제
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={S.cardNote}>
            사진 1~3장으로 내 기준 사진을 만들어두면 매번 사진을 올리지 않아도 돼요.
            기준 사진은 이 폰에만 저장돼요.
          </div>
          <button style={S.primary} onClick={onEdit}>앱에서 사용할 사진 만들기</button>
        </>
      )}
    </div>
  );
}

const S = {
  backdrop: {
    position: "fixed", inset: 0, zIndex: 420,
    background: "rgba(20,16,14,0.55)", backdropFilter: "blur(3px)",
    display: "flex", alignItems: "flex-end", justifyContent: "center",
  },
  sheet: {
    width: "100%", maxWidth: 440, background: "#fffdf9",
    borderRadius: "22px 22px 0 0",
    padding: "22px 20px calc(env(safe-area-inset-bottom, 0px) + 18px)",
    maxHeight: "92vh", overflowY: "auto", position: "relative",
    boxShadow: "0 -8px 40px rgba(0,0,0,0.18)",
  },
  close: {
    position: "absolute", top: 12, right: 12, width: 32, height: 32, borderRadius: 16,
    border: "none", background: "rgba(0,0,0,0.05)", fontSize: 15, color: "#6b6360", cursor: "pointer",
  },
  emoji: { fontSize: 32, textAlign: "center", marginBottom: 6 },
  title: { fontSize: 20, fontWeight: 800, textAlign: "center", margin: "0 0 10px", color: INK },
  lead: { fontSize: 13.5, lineHeight: 1.6, color: "#6b6360", textAlign: "center", margin: "0 0 14px" },
  noteBox: { background: "rgba(0,0,0,0.04)", borderRadius: 12, padding: "11px 13px", marginBottom: 10 },
  noteHead: { fontSize: 13, fontWeight: 800, marginBottom: 3, color: INK },
  noteBody: { fontSize: 12.5, lineHeight: 1.55, color: "#6b6360" },
  grid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 14 },
  slot: { display: "flex", flexDirection: "column", gap: 4 },
  slotBox: {
    aspectRatio: "3/4", borderRadius: 12, overflow: "hidden", position: "relative",
    background: "#f0ece4", border: "2px solid", display: "flex", alignItems: "center", justifyContent: "center",
  },
  slotImg: { width: "100%", height: "100%", objectFit: "cover" },
  slotEmpty: { fontSize: 11, color: "#9a918d", fontWeight: 700 },
  slotBusy: {
    position: "absolute", inset: 0, background: "rgba(255,255,255,0.8)",
    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: INK,
  },
  slotLabel: { fontSize: 11.5, fontWeight: 800, color: INK },
  slotHint: { fontSize: 10, lineHeight: 1.4, color: "#8b827e", minHeight: 26 },
  slotBtns: { display: "flex", gap: 4 },
  miniBtn: {
    flex: 1, padding: "6px 0", borderRadius: 8, border: "none", background: INK,
    color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer",
  },
  miniGhost: {
    flex: 1, padding: "6px 0", borderRadius: 8, border: "1px solid rgba(0,0,0,0.14)",
    background: "transparent", fontSize: 11, fontWeight: 600, color: "#3d3735", cursor: "pointer",
  },
  previewRow: { display: "flex", gap: 8, justifyContent: "center", marginBottom: 12, flexWrap: "wrap" },
  preview: { width: 84, aspectRatio: "3/4", objectFit: "cover", borderRadius: 12 },
  // "이 얼굴이 맞아요?" 는 화질까지 보고 판단하는 화면이다. 190px 짜리 썸네일로는
  // 판단이 불가능해서 크게 띄운다. aspectRatio+cover 로 자르면 모델이 정사각으로
  // 돌려줬을 때 머리가 잘리므로 원본 비율 그대로 둔다.
  anchorImg: {
    width: "100%", maxWidth: 300, height: "auto", display: "block", borderRadius: 16,
    border: "3px solid #1a7f4b", boxShadow: "0 10px 28px -12px rgba(35,31,32,0.35)",
  },
  anchorLoading: {
    display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "26px 0 10px",
  },
  anchorSpin: {
    width: 34, height: 34, borderRadius: "50%",
    border: "3px solid rgba(0,0,0,0.1)", borderTopColor: INK,
    animation: "rk-spin 0.9s linear infinite",
  },
  linkBtn: {
    border: "none", background: "transparent", fontSize: 13, fontWeight: 700,
    color: "#1a7f4b", cursor: "pointer", padding: "4px 8px", textDecoration: "underline",
  },
  albumMsg: { fontSize: 12, color: "#6b6360", marginTop: 2 },
  previewSm: { width: 54, aspectRatio: "3/4", objectFit: "cover", borderRadius: 9 },
  consent: {
    margin: "0 0 12px", padding: "12px 14px 12px 28px", background: "rgba(0,0,0,0.03)",
    borderRadius: 12, fontSize: 12.5, lineHeight: 1.65, color: "#3d3735",
  },
  check: {
    display: "flex", gap: 9, alignItems: "flex-start", padding: "7px 2px",
    fontSize: 12.5, lineHeight: 1.5, color: "#3d3735", cursor: "pointer",
  },
  cb: { marginTop: 2, width: 17, height: 17, flexShrink: 0, accentColor: INK },
  err: {
    background: "rgba(230,64,60,0.08)", color: "#c0392b", borderRadius: 10,
    padding: "9px 12px", fontSize: 12.5, margin: "8px 0",
  },
  row: { display: "flex", gap: 8, marginTop: 12 },
  primary: {
    width: "100%", padding: "13px 18px", borderRadius: 14, border: "none",
    background: INK, color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer",
  },
  ghost: {
    flex: "0 0 auto", padding: "13px 18px", borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.12)", background: "transparent",
    fontSize: 14.5, fontWeight: 600, color: "#3d3735", cursor: "pointer",
  },
  danger: {
    flex: "0 0 auto", padding: "13px 18px", borderRadius: 14,
    border: "1px solid rgba(192,57,43,0.3)", background: "transparent",
    fontSize: 14.5, fontWeight: 700, color: "#c0392b", cursor: "pointer",
  },
  card: {
    background: "#fff", border: "1px solid " + INK + "10", borderRadius: 18,
    padding: 16, marginBottom: 12, boxShadow: "0 8px 20px -12px rgba(35,31,32,0.18)",
  },
  cardHead: { fontSize: 15, fontWeight: 800, color: INK, marginBottom: 8 },
  cardNote: { fontSize: 12.5, lineHeight: 1.6, color: "#6b6360", marginBottom: 10 },
};
