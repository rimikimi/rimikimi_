import React, { useEffect, useState } from "react";
import { isNative } from "./nativeBridge";
import { getLang, t } from "./i18n";

// ============================================================
// PC(≥1024px) 전용 화면 틀 — 오너 지시 2026-10-06 "웹은 PC 버전으로 UIUX·레이아웃 다시 짜".
// 승인 목업: docs/pc-web-mockup/ (무채색 다크 · 큰 타이포 · 이미지 주도 · 어절 단위 줄바꿈).
// 모바일·앱(웹뷰)은 지금 화면 그대로 — 여기 컴포넌트는 데스크톱에서만 그려진다.
// 생성·결제·로그인 흐름은 기존 화면을 그대로 쓰고(DesktopPanel 안에), 상단 바만 여기서 그린다.
// 2026-10-10: 홈·목적·앨범·담기는 앱 개편(만들기 탭)과 같은 구조로 DesktopMake.jsx 로 옮겼다(예전 히어로·사이드바 홈 삭제).
// ============================================================

// 색은 CSS 변수 — .dk[data-dk="light"|"dark"] 가 값을 바꾼다(DK_CSS). 인라인 스타일은 변수 이름만 쓴다.
export const DK = { bg: "var(--dk-bg)", s1: "var(--dk-s1)", s2: "var(--dk-s2)", line: "var(--dk-line)", tx: "var(--dk-tx)", mu: "var(--dk-mu)", ac: "#E6403C", dim: "var(--dk-dim)", nav: "var(--dk-nav)", sheetLine: "var(--dk-sheet-line)" };
const THEME_KEY = "rimikimi_pc_theme";

// 라이트/다크 — 처음엔 OS 설정을 따르고, 상단 바에서 바꾸면 그 선택을 기억한다
export function useDkTheme() {
  const sys = () => (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark");
  const [saved, setSaved] = useState(() => { try { return localStorage.getItem(THEME_KEY); } catch (_) { return null; } });
  const [osTheme, setOsTheme] = useState(sys);
  useEffect(() => {
    const m = window.matchMedia?.("(prefers-color-scheme: light)");
    if (!m) return;
    const f = () => setOsTheme(m.matches ? "light" : "dark");
    m.addEventListener ? m.addEventListener("change", f) : m.addListener(f);
    return () => (m.removeEventListener ? m.removeEventListener("change", f) : m.removeListener(f));
  }, []);
  const theme = saved === "light" || saved === "dark" ? saved : osTheme;
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setSaved(next);
    try { localStorage.setItem(THEME_KEY, next); } catch (_) {}
  };
  return [theme, toggle];
}

export function useIsDesktop() {
  const q = "(min-width: 1024px)";
  const [on, setOn] = useState(() => !isNative() && typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => {
    if (isNative()) return;
    const m = window.matchMedia(q);
    const f = () => setOn(m.matches);
    m.addEventListener ? m.addEventListener("change", f) : m.addListener(f);
    return () => (m.removeEventListener ? m.removeEventListener("change", f) : m.removeListener(f));
  }, []);
  return on;
}

const en = () => getLang() === "en";
const L = (ko, e) => (en() ? e : ko);

export const DK_CSS = `
.dk { --dk-bg:#0B0B0C; --dk-s1:#141416; --dk-s2:#1C1C1F; --dk-line:#27272B; --dk-tx:#F4F4F5; --dk-mu:#8C8C94; --dk-dim:#5d5d64; --dk-nav:rgba(11,11,12,.86); --dk-scroll:#2a2a2f; --dk-sheet-line:transparent; color-scheme: dark; }
.dk[data-dk="light"] { --dk-bg:#F3F1ED; --dk-s1:#FFFFFF; --dk-s2:#E8E5DF; --dk-line:#DDD9D2; --dk-tx:#161618; --dk-mu:#6A6A72; --dk-dim:#9A9AA2; --dk-nav:rgba(243,241,237,.86); --dk-scroll:#CFCBC4; --dk-sheet-line:#E2DED7; color-scheme: light; }
.dk, .dk main { transition: background-color .2s ease-out, color .2s ease-out; }
.dk, .dk * { word-break: keep-all; overflow-wrap: break-word; }
.dk [data-dkhide] { display: none !important; }
.dk [data-dkbar] { position: sticky !important; bottom: 0 !important; max-width: none !important; margin: 0 !important; }
.dk ::-webkit-scrollbar { width: 10px; height: 10px; }
.dk ::-webkit-scrollbar-thumb { background: var(--dk-scroll); border-radius: 10px; }
.dkCard { cursor: pointer; text-align: left; background: none; border: 0; color: inherit; padding: 0; font: inherit; }
.dkCard .dkIm { transition: transform .25s cubic-bezier(.2,.7,.2,1), outline-color .2s; outline: 2px solid transparent; outline-offset: 3px; }
.dkCard .dkGo { opacity: 0; transform: translateY(6px); transition: opacity .2s, transform .2s; }
@media (hover: hover) and (pointer: fine) {
  .dkCard:hover .dkIm { outline-color: ${DK.tx}; }
  .dkCard:hover .dkGo { opacity: 1; transform: none; }
  .dkLink:hover { color: ${DK.tx} !important; }
  .dkBtn:hover { filter: brightness(1.08); }
  .dkSide:hover { color: ${DK.tx} !important; }
}
.dkCard:focus-visible .dkIm, .dkBtn:focus-visible, .dkLink:focus-visible { outline: 2px solid ${DK.tx}; outline-offset: 3px; }
@media (prefers-reduced-motion: reduce) { .dkCard .dkIm, .dkCard .dkGo { transition: none; } }
`;

const img = (id, size = "large") => `/${size}/${id}.webp`;
const onImgErr = (id) => (e) => { e.currentTarget.onerror = null; e.currentTarget.src = img(id, "thumbs"); };

// 상단 바 — 앱 탭과 같은 3개(만들기 / 카메라·필터 / 내 사진). 2026-10-10 앱 개편에 맞춰 검색창은 뺐다.
export function DesktopNav({ Logo, active, onNav, chipLabel, onChip, photo, onProfile, theme, onTheme }) {
  const links = [
    ["make", L("만들기", "Create")],
    ["camera", L("카메라·필터", "Camera")],
    ["mine", L("내 사진", "My Photos")],
  ];
  return (
    <nav style={N.bar}>
      <button style={N.logo} onClick={() => onNav("make", true)} aria-label="rimikimi"><Logo height={26} mono /></button>
      <div style={N.links}>
        {links.map(([k, label]) => (
          <button key={k} className="dkLink" style={{ ...N.link, color: active === k ? DK.tx : DK.mu }} aria-current={active === k ? "page" : undefined} onClick={() => onNav(k)}>{label}</button>
        ))}
      </div>
      <div style={{ flex: 1 }} />
      {chipLabel != null && <button className="dkBtn" style={N.chip} onClick={onChip}>{chipLabel}</button>}
      {onTheme && (
        <button className="dkBtn" style={N.chip} onClick={onTheme}
          aria-label={theme === "dark" ? L("라이트 모드로", "Switch to light mode") : L("다크 모드로", "Switch to dark mode")}
          title={theme === "dark" ? L("라이트 모드", "Light mode") : L("다크 모드", "Dark mode")}>
          {theme === "dark" ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" /></svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z" /></svg>
          )}
        </button>
      )}
      <a className="dkBtn" style={N.ghost} href="/download">{L("앱 받기", "Get the app")}</a>
      <button style={N.ava} onClick={onProfile} aria-label={L("프로필", "Profile")}>
        {photo ? <img src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 18 }}>👤</span>}
      </button>
    </nav>
  );
}

// 기존 화면(옵션·결과·스토어·프로필·내 사진)을 감싸는 틀. 옵션 화면이면 왼쪽에 컨셉 샘플을 크게.
export function DesktopPanel({ concept, children }) {
  if (concept) {
    return (
      <div style={P.split}>
        <div style={P.big}><img src={img(concept.id)} onError={onImgErr(concept.id)} alt="" style={C.img} /></div>
        <div style={P.sheet}>{children}</div>
      </div>
    );
  }
  return <div style={P.center}><div style={P.sheetWide}>{children}</div></div>;
}

export function DesktopFooter({ isKorea }) {
  return (
    <footer style={F.bar}>
      <div>
        {isKorea && (<>{t("footer.biz.company")} · {t("footer.biz.reg")} · {t("footer.biz.sales")}<br />{t("footer.biz.addr")} · {t("footer.biz.contact")}</>)}
      </div>
      <div style={{ display: "flex", gap: 18 }}>
        <a className="dkLink" style={F.a} href="/terms" target="_blank" rel="noopener noreferrer">{t("footer.terms")}</a>
        <a className="dkLink" style={F.a} href="/privacy" target="_blank" rel="noopener noreferrer">{t("footer.privacy")}</a>
        <a className="dkLink" style={F.a} href="/refund" target="_blank" rel="noopener noreferrer">{t("footer.refund")}</a>
        <a className="dkLink" style={F.a} href={getLang() === "en" ? "https://apps.rimikimi.com/apps/rimikimi.html" : "https://apps.rimikimi.com/ko/apps/rimikimi.html"}>{t("footer.hubApp")}</a>
        <a className="dkLink" style={F.a} href={getLang() === "en" ? "https://apps.rimikimi.com/apps/" : "https://apps.rimikimi.com/ko/apps/"}>{t("footer.hubAll")}</a>
      </div>
    </footer>
  );
}

const FONT = '"Pretendard", -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
const N = {
  bar: { position: "sticky", top: 0, zIndex: 60, height: 76, display: "flex", alignItems: "center", gap: 36, padding: "0 56px", background: DK.nav, backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", borderBottom: `1px solid ${DK.line}`, fontFamily: FONT },
  logo: { background: "none", color: DK.tx, border: 0, padding: 0, cursor: "pointer", display: "flex", alignItems: "center" },
  links: { display: "flex", gap: 26 },
  link: { background: "none", border: 0, padding: "8px 0", cursor: "pointer", fontSize: 16, fontWeight: 650, fontFamily: FONT },
  chip: { height: 42, padding: "0 16px", borderRadius: 12, background: DK.s1, border: `1px solid ${DK.line}`, color: DK.tx, fontSize: 15, fontWeight: 750, cursor: "pointer", fontFamily: FONT },
  ghost: { height: 42, padding: "0 18px", borderRadius: 12, border: `1px solid ${DK.line}`, color: DK.tx, fontSize: 15, fontWeight: 750, display: "flex", alignItems: "center", textDecoration: "none" },
  ava: { width: 42, height: 42, borderRadius: "50%", background: DK.s2, border: `1px solid ${DK.line}`, overflow: "hidden", padding: 0, cursor: "pointer", display: "grid", placeItems: "center", color: DK.tx },
};
const C = {
  img: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
};
const P = {
  split: { maxWidth: 1328, margin: "0 auto", padding: "32px 56px 48px", display: "grid", gridTemplateColumns: "1fr 520px", gap: 40, alignItems: "start" },
  big: { position: "sticky", top: 108, height: "calc(100dvh - 148px)", minHeight: 520, borderRadius: 24, overflow: "hidden", background: DK.s1 },
  sheet: { borderRadius: 24, overflow: "hidden", background: "#FBF8F3", border: `1px solid ${DK.sheetLine}`, color: "#231f20", padding: "4px 24px 24px", boxSizing: "border-box", minHeight: "calc(100dvh - 148px)", position: "relative" },
  center: { maxWidth: 1328, margin: "0 auto", padding: "32px 56px 48px", display: "flex", justifyContent: "center" },
  sheetWide: { width: 640, borderRadius: 24, overflow: "hidden", background: "#FBF8F3", border: `1px solid ${DK.sheetLine}`, color: "#231f20", padding: "4px 24px 24px", boxSizing: "border-box", minHeight: "calc(100dvh - 148px)", position: "relative" },
};
const F = {
  bar: { maxWidth: 1440, margin: "80px auto 0", borderTop: `1px solid ${DK.line}`, padding: "36px 56px 48px", display: "flex", justifyContent: "space-between", gap: 32, color: DK.mu, fontSize: 13, lineHeight: 1.8, fontFamily: FONT },
  a: { color: DK.mu, textDecoration: "none" },
};
