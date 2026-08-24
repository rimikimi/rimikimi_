// ============================================================
// 페이스 프로필 v1.1 — 촬영 온보딩 / 확인·동의 / 관리
//
// 정본 스펙: rimikimi studios/_design/face-profile-v1.md §1·§2
// 동의 문구 근거: face-profile-legal.md §6 초안 — v1.1(기기 보관)에 맞게 수정.
//   초안은 v1.0(서버 보관) 기준이라 "서버에 저장돼요" 로 되어 있었다. v1.1 은
//   기기에만 저장하므로 그 문장을 그대로 쓰면 허위기재가 된다 — 보관 위치를
//   기기로 바꾸고 "생성할 때만 임시 전송" 을 명시한다.
//
// 화면 흐름: 안내(권한 사전고지) → 슬롯별 촬영(품질 게이트) → 확인·동의 → 저장
// ============================================================

import React, { useEffect, useState } from "react";
import { isNative, nativePickPhoto } from "./nativeBridge";
import {
  ANGLES, REQUIRED_ANGLES,
  inspectShot, serverFaceCheck, saveProfile, deleteProfile, loadProfilePreviews,
} from "./faceProfile";

const INK = "#231f20";

// 촬영본은 저장·전송 모두 장변 1024px 로 줄인다 (§2-3 "장변 1024px로 축소 후 전송").
function shrink(dataUrl, max = 1024, q = 0.88) {
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
  // step: intro → shoot → confirm
  const [step, setStep] = useState("intro");
  const [shots, setShots] = useState({});      // { angle: dataUrl }
  const [busy, setBusy] = useState(null);      // 검사 중인 angle
  const [err, setErr] = useState({});          // { angle: 사유 }
  const [agree, setAgree] = useState(false);   // ⚠️ 기본 해제 (legal §6-3)
  const [age14, setAge14] = useState(false);   // 만 14세 이상 (legal §6-6)
  const [saveErr, setSaveErr] = useState("");
  const fileRef = React.useRef(null);
  const pendingAngle = React.useRef(null);

  const done = REQUIRED_ANGLES.every((a) => shots[a]);
  const count = Object.keys(shots).length;

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
      const list = ANGLES.filter((a) => shots[a.key]).map((a) => ({ angle: a.key, dataUrl: shots[a.key] }));
      await saveProfile(list);
      onSaved && onSaved();
      onClose && onClose();
    } catch (e) {
      setSaveErr(e?.message || "저장하지 못했어요.");
    }
  }

  return (
    <div style={S.backdrop} onClick={onClose}>
      <div style={S.sheet} onClick={(e) => e.stopPropagation()}>
        <button style={S.close} onClick={onClose} aria-label="닫기">✕</button>
        <input ref={fileRef} type="file" accept="image/*" onChange={onFile} style={{ display: "none" }} />

        {step === "intro" && (
          <>
            <div style={S.emoji}>🙂</div>
            <h2 style={S.title}>내 얼굴 등록하기</h2>
            <p style={S.lead}>
              셀카 3장을 등록해두면, 다음부터는 사진을 올리지 않아도 바로 만들 수 있어요.
              여러 각도를 함께 보기 때문에 얼굴이 더 잘 살아나요.
            </p>
            {/* 권한 사전고지 (legal §6-7) — OS 프롬프트 전에 왜 필요한지 먼저 설명 */}
            <div style={S.noteBox}>
              <div style={S.noteHead}>카메라·사진 접근이 필요해요</div>
              <div style={S.noteBody}>
                얼굴 등록에만 사용해요. 허용하지 않아도 앱의 다른 기능은 그대로 쓸 수 있어요.
              </div>
            </div>
            <div style={{ ...S.noteBox, background: "rgba(26,127,75,0.07)" }}>
              <div style={{ ...S.noteHead, color: "#1a7f4b" }}>얼굴 사진은 이 폰에만 저장돼요</div>
              <div style={S.noteBody}>
                서버에는 보관하지 않아요. 사진을 만들 때만 잠깐 전송되고 바로 지워져요.
                폰을 바꾸거나 앱을 지우면 다시 등록해야 해요.
              </div>
            </div>
            <button style={S.primary} onClick={() => setStep("shoot")}>시작하기</button>
          </>
        )}

        {step === "shoot" && (
          <>
            <h2 style={S.title}>3장만 찍어주세요</h2>
            <p style={S.lead}>정면과 좌우 45°. 원하면 2장 더 추가할 수 있어요.</p>
            <div style={S.grid}>
              {ANGLES.map((a) => {
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
                      <button style={S.miniBtn} disabled={!!busy} onClick={() => shoot(a.key, "camera")}>
                        {got ? "다시" : "촬영"}
                      </button>
                      <button style={S.miniGhost} disabled={!!busy} onClick={() => shoot(a.key, "photos")}>앨범</button>
                    </div>
                  </div>
                );
              })}
            </div>
            <button style={{ ...S.primary, opacity: done ? 1 : 0.35 }} disabled={!done}
              onClick={() => setStep("confirm")}>
              {done ? `${count}장으로 계속하기` : "필수 3장을 채워주세요"}
            </button>
          </>
        )}

        {step === "confirm" && (
          <>
            <h2 style={S.title}>이 얼굴을 사용할까요?</h2>
            <div style={S.previewRow}>
              {ANGLES.filter((a) => shots[a.key]).map((a) => (
                <img key={a.key} src={shots[a.key]} alt={a.label} style={S.preview} />
              ))}
            </div>

            {/* 동의 문구 — legal §6 초안을 v1.1(기기 보관)에 맞게 수정 */}
            <ul style={S.consent}>
              <li>촬영한 사진 {count}장은 <b>이 기기에만</b> 저장돼요. 서버에는 보관하지 않아요.</li>
              <li>사진을 만들 때마다 이 사진들이 이미지 생성을 위해 <b>해외(미국) Google 서버로 전송</b>되고, 생성이 끝나면 즉시 폐기돼요.</li>
              <li>이 사진으로 회원님을 인증하거나 신원을 확인하지 않으며, 얼굴인식 특징정보(임베딩)를 만들지 않아요.</li>
              <li>언제든 [프로필 &gt; 얼굴 프로필]에서 바꾸거나 삭제할 수 있어요. 삭제하면 기기에서 바로 지워져요.</li>
              <li>동의하지 않아도 괜찮아요 — 그때그때 사진을 올리는 기존 방식으로 계속 이용할 수 있어요.</li>
            </ul>

            <label style={S.check}>
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={S.cb} />
              <span>위 내용을 확인했고, 얼굴 사진의 기기 저장과 생성 시 해외 전송에 동의해요.</span>
            </label>
            <label style={S.check}>
              <input type="checkbox" checked={age14} onChange={(e) => setAge14(e.target.checked)} style={S.cb} />
              <span>만 14세 이상이에요.</span>
            </label>

            {saveErr && <div style={S.err}>{saveErr}</div>}
            <div style={S.row}>
              <button style={S.ghost} onClick={() => setStep("shoot")}>다시 찍기</button>
              <button style={{ ...S.primary, flex: 1, opacity: agree && age14 ? 1 : 0.35 }}
                disabled={!agree || !age14} onClick={save}>
                이 얼굴로 시작하기
              </button>
            </div>
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
            {meta.count}장 등록됨 · 이 기기에만 저장
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
            셀카 3장을 등록하면 매번 사진을 올리지 않아도 돼요. 얼굴은 이 폰에만 저장돼요.
          </div>
          <button style={S.primary} onClick={onEdit}>얼굴 등록하기</button>
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
