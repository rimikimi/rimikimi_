// ============================================================
// 사용 안내 (첫 실행 온보딩 + 사진 가이드)
//
// 두 가지 역할을 한 컴포넌트가 한다:
//   mode="intro"  첫 실행 때 자동으로 뜨는 3장짜리 안내
//   mode="photo"  사진 올리는 화면의 "사진 가이드" 링크로 여는 2번째 장만
//
// 내용은 추측이 아니라 실제 동작에 맞췄다:
//  · 서버 사전검사(api/_lib/precheck.js)는 "얼굴이 또렷하게 보이는지"만 본다.
//    못 찾으면 생성 전에 막고 크레딧도 차감하지 않는다 → "얼굴이 잘 보이게"가 1순위.
//  · 컨셉 프롬프트는 참조사진을 **얼굴 정체성에만** 쓴다("use the attached
//    reference image only for facial identity"). 옷·배경은 전부 새로 그려진다
//    → 사용자가 이걸 모르면 옷 신경 쓰느라 정작 얼굴이 안 보이는 사진을 올린다.
//  · 결과는 1시간 뒤 삭제된다(api/_lib/gallery.js TTL_MINUTES = 60).
//  · 커플 컨셉은 참조사진이 2장 필요하다.
// ============================================================

import React, { useState } from "react";
import { t } from "./i18n";

const SEEN_KEY = "rimikimi_guide_seen";

export function guideSeen() {
  try { return localStorage.getItem(SEEN_KEY) === "1"; } catch { return true; }
}
export function markGuideSeen() {
  try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* 사파리 프라이빗 등 — 무시 */ }
}

export default function Guide({ mode = "intro", onClose }) {
  // photo 모드는 사진 장(1번 인덱스)만 보여준다
  const single = mode === "photo";
  const [i, setI] = useState(single ? 1 : 0);
  const last = 2;

  function finish() {
    markGuideSeen();
    onClose && onClose();
  }

  const pages = [
    // 0 — 3단계
    <div key="how">
      <div style={S.emoji}>✨</div>
      <h2 style={S.title}>{t("guide.how.title")}</h2>
      <ol style={S.steps}>
        <li style={S.step}><b>{t("guide.how.s1t")}</b><span style={S.stepSub}>{t("guide.how.s1d")}</span></li>
        <li style={S.step}><b>{t("guide.how.s2t")}</b><span style={S.stepSub}>{t("guide.how.s2d")}</span></li>
        <li style={S.step}><b>{t("guide.how.s3t")}</b><span style={S.stepSub}>{t("guide.how.s3d")}</span></li>
      </ol>
    </div>,

    // 1 — 어떤 사진을 넣어야 하나 (핵심)
    <div key="photo">
      <div style={S.emoji}>📸</div>
      <h2 style={S.title}>{t("guide.photo.title")}</h2>
      <p style={S.lead}>{t("guide.photo.lead")}</p>
      <div style={S.listBox}>
        <div style={{ ...S.listHead, color: "#1a7f4b" }}>{t("guide.photo.goodHead")}</div>
        {["g1", "g2", "g3", "g4"].map((k) => (
          <div key={k} style={S.item}><span style={S.ok}>✓</span>{t("guide.photo." + k)}</div>
        ))}
      </div>
      <div style={S.listBox}>
        <div style={{ ...S.listHead, color: "#c0392b" }}>{t("guide.photo.badHead")}</div>
        {["b1", "b2", "b3", "b4"].map((k) => (
          <div key={k} style={S.item}><span style={S.no}>✕</span>{t("guide.photo." + k)}</div>
        ))}
      </div>
      <p style={S.note}>{t("guide.photo.note")}</p>
    </div>,

    // 2 — 알아두면 좋은 것
    <div key="tips">
      <div style={S.emoji}>💡</div>
      <h2 style={S.title}>{t("guide.tips.title")}</h2>
      <div style={S.tip}><b>{t("guide.tips.t1t")}</b><span style={S.stepSub}>{t("guide.tips.t1d")}</span></div>
      <div style={S.tip}><b>{t("guide.tips.t2t")}</b><span style={S.stepSub}>{t("guide.tips.t2d")}</span></div>
      <div style={S.tip}><b>{t("guide.tips.t3t")}</b><span style={S.stepSub}>{t("guide.tips.t3d")}</span></div>
    </div>,
  ];

  return (
    <div style={S.backdrop} onClick={finish}>
      <div style={S.card} onClick={(e) => e.stopPropagation()}>
        <button style={S.close} onClick={finish} aria-label={t("common.close")}>✕</button>
        <div style={S.body}>{pages[i]}</div>

        {!single && (
          <div style={S.dots}>
            {[0, 1, 2].map((n) => (
              <span key={n} style={{ ...S.dot, ...(n === i ? S.dotOn : null) }} />
            ))}
          </div>
        )}

        <div style={S.actions}>
          {!single && i > 0 && (
            <button style={S.ghostBtn} onClick={() => setI(i - 1)}>{t("guide.prev")}</button>
          )}
          <button
            style={S.primaryBtn}
            onClick={() => (single || i === last ? finish() : setI(i + 1))}
          >
            {single || i === last ? t("guide.start") : t("guide.next")}
          </button>
        </div>
      </div>
    </div>
  );
}

const S = {
  backdrop: {
    position: "fixed", inset: 0, zIndex: 400,
    background: "rgba(20,16,14,0.55)", backdropFilter: "blur(3px)",
    display: "flex", alignItems: "flex-end", justifyContent: "center",
  },
  card: {
    width: "100%", maxWidth: 440,
    background: "#fffdf9",
    borderRadius: "22px 22px 0 0",
    padding: "22px 22px calc(env(safe-area-inset-bottom, 0px) + 18px)",
    maxHeight: "88vh", overflowY: "auto",
    position: "relative",
    boxShadow: "0 -8px 40px rgba(0,0,0,0.18)",
  },
  close: {
    position: "absolute", top: 12, right: 12,
    width: 32, height: 32, borderRadius: 16,
    border: "none", background: "rgba(0,0,0,0.05)",
    fontSize: 15, color: "#6b6360", cursor: "pointer",
  },
  body: { minHeight: 260 },
  emoji: { fontSize: 32, textAlign: "center", marginBottom: 6 },
  title: {
    fontSize: 20, fontWeight: 800, textAlign: "center",
    margin: "0 0 14px", color: "#231f20", lineHeight: 1.35,
  },
  lead: {
    fontSize: 13.5, lineHeight: 1.6, color: "#6b6360",
    textAlign: "center", margin: "0 0 14px",
  },
  steps: { margin: 0, padding: "0 0 0 4px", listStyle: "none" },
  step: {
    display: "flex", flexDirection: "column", gap: 2,
    padding: "11px 0", borderBottom: "1px solid rgba(0,0,0,0.06)",
    fontSize: 15, color: "#231f20",
  },
  stepSub: { fontSize: 13, color: "#6b6360", lineHeight: 1.55 },
  listBox: {
    background: "rgba(0,0,0,0.03)", borderRadius: 14,
    padding: "12px 14px", marginBottom: 10,
  },
  listHead: { fontSize: 12.5, fontWeight: 800, marginBottom: 7, letterSpacing: "0.02em" },
  item: {
    display: "flex", gap: 8, alignItems: "flex-start",
    fontSize: 13.5, lineHeight: 1.55, color: "#3d3735", padding: "3px 0",
  },
  ok: { color: "#1a7f4b", fontWeight: 800, flexShrink: 0 },
  no: { color: "#c0392b", fontWeight: 800, flexShrink: 0 },
  note: {
    fontSize: 12.5, lineHeight: 1.6, color: "#6b6360",
    background: "rgba(230,64,60,0.06)", borderRadius: 12,
    padding: "10px 12px", margin: "4px 0 0",
  },
  tip: {
    display: "flex", flexDirection: "column", gap: 3,
    padding: "12px 0", borderBottom: "1px solid rgba(0,0,0,0.06)",
    fontSize: 15, color: "#231f20",
  },
  dots: { display: "flex", gap: 6, justifyContent: "center", margin: "16px 0 4px" },
  dot: { width: 6, height: 6, borderRadius: 3, background: "rgba(0,0,0,0.15)" },
  dotOn: { background: "#231f20", width: 18 },
  actions: { display: "flex", gap: 8, marginTop: 14 },
  ghostBtn: {
    flex: "0 0 auto", padding: "13px 18px", borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.12)", background: "transparent",
    fontSize: 14.5, fontWeight: 600, color: "#3d3735", cursor: "pointer",
  },
  primaryBtn: {
    flex: 1, padding: "13px 18px", borderRadius: 14, border: "none",
    background: "#231f20", color: "#fff",
    fontSize: 15, fontWeight: 700, cursor: "pointer",
  },
};
