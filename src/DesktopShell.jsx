import React, { useEffect, useState } from "react";
import { isNative } from "./nativeBridge";
import { getLang, localizedTitle, localizedCategory, t } from "./i18n";

// ============================================================
// PC(≥1024px) 전용 화면 틀 — 오너 지시 2026-10-06 "웹은 PC 버전으로 UIUX·레이아웃 다시 짜".
// 승인 목업: docs/pc-web-mockup/ (무채색 다크 · 큰 타이포 · 이미지 주도 · 어절 단위 줄바꿈).
// 모바일·앱(웹뷰)은 지금 화면 그대로 — 여기 컴포넌트는 데스크톱에서만 그려진다.
// 생성·결제·로그인 흐름은 기존 화면을 그대로 쓰고(DesktopPanel 안에), 홈·탐색·상단 바만 새로 그린다.
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

export function DesktopNav({ Logo, active, onNav, query, setQuery, chipLabel, onChip, photo, onProfile, theme, onTheme }) {
  const links = [
    ["concepts", L("컨셉", "Concepts")],
    ["booth", L("매직 부스", "Magic Booth")],
    ["fourcut", L("인생네컷", "Photo Booth")],
    ["filter", L("필터", "Filters")],
    ["mine", L("내 사진", "My Photos")],
  ];
  return (
    <nav style={N.bar}>
      <button style={N.logo} onClick={() => onNav("concepts", true)} aria-label="rimikimi"><Logo height={26} mono /></button>
      <div style={N.links}>
        {links.map(([k, label]) => (
          <button key={k} className="dkLink" style={{ ...N.link, color: active === k ? DK.tx : DK.mu }} onClick={() => onNav(k)}>{label}</button>
        ))}
      </div>
      <div style={{ flex: 1 }} />
      <label style={N.search}>
        <span aria-hidden="true" style={{ opacity: .7 }}>⌕</span>
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); if (active !== "concepts") onNav("concepts"); }}
          placeholder={L("컨셉 검색 — 웨딩, 할로윈, 여행…", "Search concepts — wedding, Halloween, travel…")}
          style={N.input}
        />
      </label>
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

function Card({ p, onPick, isNew }) {
  return (
    <button className="dkCard" onClick={() => onPick(p)} aria-label={localizedTitle(p)}>
      <div className="dkIm" style={C.im}>
        <img src={img(p.id)} onError={onImgErr(p.id)} alt="" loading="lazy" style={C.img} />
        {isNew && <span style={C.nw}>NEW</span>}
        <div className="dkGo" style={C.go}>{L("이 컨셉으로 만들기 →", "Create with this →")}</div>
      </div>
      <div style={C.t}>{localizedTitle(p)}</div>
      <div style={C.c}>{(p.categories || [p.category]).filter(Boolean).slice(0, 2).map(localizedCategory).join(" · ")}</div>
    </button>
  );
}

// 홈(전체·검색 없음)이면 히어로·오늘 공개·매직 부스 띠를 위에 얹고, 카테고리 탐색(사이드바 + 4열 격자)은 항상 그린다.
export function DesktopHome({
  pool, categories, activeCat, setActiveCat, query, list, total, visibleCount, onShowMore, onPick, filterCatName,
}) {
  const all = t("step1.all");
  const isHome = (activeCat === "전체" || activeCat === all) && !query.trim();
  const now = Date.now();
  const byNew = [...pool].filter((p) => p.publishAt).sort((a, b) => Date.parse(b.publishAt) - Date.parse(a.publishAt));
  const newest = (byNew.length ? byNew : pool).slice(0, 5);
  const newestIds = new Set(byNew.filter((p) => now - Date.parse(p.publishAt) < 3 * 86400000).map((p) => p.id));
  const hero = (newest.length >= 5 ? [newest[0], ...pool.filter((p) => !newest.slice(0, 1).includes(p)).slice(0, 4)] : pool.slice(0, 5));
  const retouch = pool.find((p) => String(p.id) === "1015");
  const booth = pool.find((p) => (p.categories || [p.category]).includes("🪄 매직 부스"));
  const cats = categories.filter((c) => c.name !== filterCatName);

  return (
    <div>
      {isHome && (
        <>
          <section style={H.hero}>
            <div>
              <div style={H.eyebrow}>{L(`AI 프로필 사진 · 컨셉 ${pool.length}개`, `AI portraits · ${pool.length} concepts`)}</div>
              <h1 style={H.h1}>{L("셀카 한 장이면,", "One selfie,")}<br /><em style={H.em}>{L("인생 사진.", "your best photo.")}</em></h1>
              <p style={H.p}>{L("컨셉을 고르고 얼굴이 잘 보이는 사진 한 장만 올리세요. 사진관에서 찍은 것 같은 결과가 몇 분 안에 나와요.", "Pick a concept and upload one clear photo of your face. Studio-quality results in minutes.")}</p>
              <div style={H.ctas}>
                <button className="dkBtn" style={{ ...B.red, ...B.big }} onClick={() => document.getElementById("dk-browse")?.scrollIntoView({ behavior: "smooth" })}>{L("컨셉 고르기", "Browse concepts")}</button>
                {retouch && <button className="dkBtn" style={{ ...B.ghost, ...B.big }} onClick={() => onPick(retouch)}>{L("사진 말로 고치기", "Fix a photo with words")}</button>}
              </div>
              <div style={H.stats}>
                <div><b style={H.sb}>{pool.length}</b><span style={H.ss}>{L("공개 컨셉", "concepts")}</span></div>
                <div><b style={H.sb}>{L("매일 20:00", "Daily 8 PM")}</b><span style={H.ss}>{L("새 컨셉 공개 (한국 시간)", "new drops (KST)")}</span></div>
                <div><b style={H.sb}>{L("하루 무료", "Free daily")}</b><span style={H.ss}>{L("로그인하면 바로", "just sign in")}</span></div>
              </div>
            </div>
            <div style={H.mosaic}>
              {hero.slice(0, 5).map((p, i) => (
                <button key={p.id} className="dkCard" onClick={() => onPick(p)} style={i === 0 ? { gridRow: "span 2" } : null} aria-label={localizedTitle(p)}>
                  <div className="dkIm" style={{ ...H.mz, height: "100%" }}><img src={img(p.id)} onError={onImgErr(p.id)} alt="" style={C.img} /></div>
                </button>
              ))}
            </div>
          </section>

          <section style={H.sec}>
            <div style={H.sh}><h2 style={H.h2}>{L("새로 나온 컨셉", "New concepts")}<small style={H.small}>{L("매일 저녁 8시", "every day at 8 PM KST")}</small></h2></div>
            <div style={H.row5}>{newest.map((p) => <Card key={p.id} p={p} onPick={onPick} isNew={newestIds.has(p.id)} />)}</div>
          </section>

          {retouch && (
            <section style={H.booth}>
              <div style={{ padding: 56 }}>
                <div style={H.eyebrow}>{L("🪄 매직 부스 · 커스텀 보정", "🪄 Magic Booth · Custom Retouch")}</div>
                <h3 style={H.h3}>{L("고치고 싶은 건", "Just say")}<br /><em style={H.em}>{L("말로.", "what to fix.")}</em></h3>
                <p style={H.p}>{L("사진을 올리고 바꾸고 싶은 걸 편하게 적으면 그 부분만 고쳐요. 얼굴과 나머지는 원본 그대로예요.", "Upload a photo and describe the change. Only that part is edited — your face and everything else stay as they were.")}</p>
                <div style={H.prompt}>{L("들고 있는 커피를 딸기라떼로 바꿔줘", "Make my coffee a strawberry latte")}<span style={{ color: DK.mu }}>↵</span></div>
                <div style={H.ctas}>
                  <button className="dkBtn" style={{ ...B.white, ...B.big }} onClick={() => onPick(retouch)}>{L("사진 올리기", "Upload a photo")}</button>
                  {booth && <button className="dkBtn" style={{ ...B.ghost, ...B.big }} onClick={() => setActiveCat("🪄 매직 부스")}>{L("매직 부스 더 보기", "More Magic Booth")}</button>}
                </div>
              </div>
              <BeforeAfter onClick={() => onPick(retouch)} label={localizedTitle(retouch)} />
            </section>
          )}
        </>
      )}

      <section style={H.sec} id="dk-browse">
        <div style={H.sh}>
          <h2 style={H.h2}>
            {query.trim() ? L(`"${query.trim()}" 검색 결과`, `Results for "${query.trim()}"`) : isHome ? L("카테고리", "Categories") : localizedCategory(activeCat)}
            <small style={H.small}>{L(`${total}개`, `${total}`)}</small>
          </h2>
        </div>
        <div style={H.cat}>
          <div style={H.side}>
            {cats.map((c) => {
              const on = c.name === activeCat || (c.name === all && (activeCat === "전체" || activeCat === all));
              return (
                <button key={c.name} className="dkSide" style={{ ...H.sideItem, ...(on ? H.sideOn : null) }} onClick={() => setActiveCat(c.name === all ? "전체" : c.name)}>
                  <span>{localizedCategory(c.name)}</span><span style={H.sideN}>{c.count}</span>
                </button>
              );
            })}
          </div>
          <div>
            {list.length === 0 ? (
              <div style={{ color: DK.mu, fontSize: 18, padding: "60px 0" }}>{L("찾는 컨셉이 없어요. 다른 말로 검색해 보세요.", "No concepts found. Try another word.")}</div>
            ) : (
              <div style={H.grid4}>{list.map((p) => <Card key={p.id} p={p} onPick={onPick} isNew={newestIds.has(p.id)} />)}</div>
            )}
            {visibleCount < total && (
              <div style={{ display: "flex", justifyContent: "center", marginTop: 36 }}>
                <button className="dkBtn" style={{ ...B.ghost, ...B.big }} onClick={onShowMore}>{L("더 보기", "Show more")}</button>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

// 보정 전후 — 마우스를 움직이면 경계가 따라온다(카페 사진에 "들고 있는 커피를 딸기라떼로 바꿔줘", AI 모델 사진).
function BeforeAfter({ onClick, label }) {
  const [x, setX] = useState(50);
  const move = (e) => { const r = e.currentTarget.getBoundingClientRect(); setX(Math.max(4, Math.min(96, ((e.clientX - r.left) / r.width) * 100))); };
  const abs = { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 45%" };
  return (
    <button className="dkCard" style={{ position: "relative", overflow: "hidden", cursor: "ew-resize" }} onMouseMove={move} onClick={onClick} aria-label={label}>
      <img src="/promo/retouch_before.webp" alt="" style={abs} />
      <img src="/promo/retouch_after.webp" alt="" style={{ ...abs, clipPath: `inset(0 0 0 ${x}%)` }} />
      <div style={{ position: "absolute", top: 0, bottom: 0, left: `${x}%`, width: 3, background: "#fff", transform: "translateX(-1.5px)" }} />
      <span style={{ ...BA.tag, left: 18 }}>{L("보정 전", "Before")}</span>
      <span style={{ ...BA.tag, right: 18, background: DK.ac }}>{L("보정 후", "After")}</span>
    </button>
  );
}
const BA = {
  tag: { position: "absolute", top: 18, fontSize: 13, fontWeight: 800, padding: "6px 12px", borderRadius: 999, background: "rgba(0,0,0,.6)", color: "#fff" },
  req: { position: "absolute", left: 18, bottom: 18, fontSize: 15, fontWeight: 700, padding: "10px 16px", borderRadius: 14, background: "rgba(255,255,255,.94)", color: "#0B0B0C" },
};

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
  search: { width: 320, height: 42, borderRadius: 12, background: DK.s1, border: `1px solid ${DK.line}`, display: "flex", alignItems: "center", gap: 10, padding: "0 14px", color: DK.mu },
  input: { flex: 1, background: "transparent", border: 0, outline: "none", color: DK.tx, fontSize: 15, fontFamily: FONT },
  chip: { height: 42, padding: "0 16px", borderRadius: 12, background: DK.s1, border: `1px solid ${DK.line}`, color: DK.tx, fontSize: 15, fontWeight: 750, cursor: "pointer", fontFamily: FONT },
  ghost: { height: 42, padding: "0 18px", borderRadius: 12, border: `1px solid ${DK.line}`, color: DK.tx, fontSize: 15, fontWeight: 750, display: "flex", alignItems: "center", textDecoration: "none" },
  ava: { width: 42, height: 42, borderRadius: "50%", background: DK.s2, border: `1px solid ${DK.line}`, overflow: "hidden", padding: 0, cursor: "pointer", display: "grid", placeItems: "center", color: DK.tx },
};
const B = {
  big: { height: 56, padding: "0 28px", fontSize: 17, borderRadius: 14 },
  red: { background: DK.ac, color: "#fff", border: 0, fontWeight: 800, cursor: "pointer", fontFamily: FONT },
  white: { background: DK.tx, color: DK.bg, border: 0, fontWeight: 800, cursor: "pointer", fontFamily: FONT },
  ghost: { background: "transparent", color: DK.tx, border: `1px solid ${DK.line}`, fontWeight: 800, cursor: "pointer", fontFamily: FONT },
};
const C = {
  im: { position: "relative", aspectRatio: "3 / 4", borderRadius: 18, overflow: "hidden", background: DK.s1 },
  img: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
  nw: { position: "absolute", left: 12, top: 12, background: DK.ac, color: "#fff", fontSize: 12, fontWeight: 800, padding: "5px 9px", borderRadius: 999 },
  go: { position: "absolute", left: 12, right: 12, bottom: 12, height: 44, borderRadius: 12, background: "rgba(255,255,255,.94)", color: "#0B0B0C", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800 },
  t: { marginTop: 12, fontSize: 17, fontWeight: 700, color: DK.tx },
  c: { marginTop: 4, fontSize: 14, color: DK.mu },
};
const H = {
  hero: { maxWidth: 1440, margin: "0 auto", display: "grid", gridTemplateColumns: "minmax(420px, 600px) 1fr", gap: 48, padding: "64px 56px 40px", alignItems: "center" },
  eyebrow: { fontSize: 15, fontWeight: 700, color: DK.mu },
  h1: { marginTop: 18, fontSize: "clamp(56px, 5.6vw, 84px)", fontWeight: 800, lineHeight: 1.08, letterSpacing: "-0.045em", color: DK.tx },
  em: { fontStyle: "normal", color: DK.ac },
  p: { marginTop: 20, fontSize: 20, lineHeight: 1.6, color: DK.mu, maxWidth: 520 },
  ctas: { marginTop: 32, display: "flex", gap: 12, flexWrap: "wrap" },
  stats: { marginTop: 40, display: "flex", gap: 40 },
  sb: { display: "block", fontSize: 28, fontWeight: 800, color: DK.tx },
  ss: { fontSize: 14, color: DK.mu },
  mosaic: { display: "grid", gridTemplateColumns: "1.25fr 1fr 1fr", gridTemplateRows: "repeat(2, minmax(220px, 290px))", gap: 14 },
  mz: { borderRadius: 22, overflow: "hidden", background: DK.s1 },
  sec: { maxWidth: 1440, margin: "0 auto", padding: "48px 56px 0" },
  sh: { display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 22 },
  h2: { fontSize: 36, fontWeight: 800, letterSpacing: "-0.03em", color: DK.tx },
  small: { marginLeft: 12, fontSize: 16, fontWeight: 600, color: DK.mu, letterSpacing: 0 },
  row5: { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 18 },
  booth: { maxWidth: 1328, margin: "64px auto 0", borderRadius: 28, background: DK.s1, border: `1px solid ${DK.line}`, display: "grid", gridTemplateColumns: "1fr 1.1fr", overflow: "hidden", minHeight: 480 },
  h3: { marginTop: 16, fontSize: 52, fontWeight: 800, lineHeight: 1.12, letterSpacing: "-0.04em", color: DK.tx },
  prompt: { marginTop: 28, background: DK.bg, border: `1px solid ${DK.line}`, borderRadius: 16, padding: "18px 20px", fontSize: 18, color: DK.tx, display: "flex", justifyContent: "space-between", maxWidth: 480 },
  cat: { display: "grid", gridTemplateColumns: "240px 1fr", gap: 40 },
  side: { position: "sticky", top: 96, alignSelf: "start", display: "flex", flexDirection: "column", gap: 2, maxHeight: "calc(100dvh - 120px)", overflowY: "auto" },
  sideItem: { display: "flex", justifyContent: "space-between", padding: "11px 14px", borderRadius: 10, fontSize: 16, fontWeight: 600, color: DK.mu, background: "none", border: 0, cursor: "pointer", textAlign: "left", fontFamily: FONT },
  sideOn: { background: DK.s2, color: DK.tx },
  sideN: { fontSize: 13, color: DK.dim },
  grid4: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 18 },
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
