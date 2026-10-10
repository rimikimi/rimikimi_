import React, { useEffect, useMemo, useRef, useState } from "react";
import { getLang, localizedTitle, localizedCategory } from "./i18n";
import { DK } from "./DesktopShell";

// ============================================================
// PC 웹 "만들기" — 앱(ios2) 2026-10-09 개편과 같은 정보 구조(오너 지시: PC 웹도 앱처럼).
//   홈: 말로 고치기 / 옛날 사진 복원 카드 → 목적 4칸 → 컨셉 앨범 격자(표지 + 이름 + 장수)
//   목적 화면: 탭(세그먼트) · 웨딩 도구(필터 · 신랑도 함께) · 빽빽한 격자
//   여러 장 담기(최대 8): 타일 위 체크(마우스 올리면 보임) = 담기, 타일 클릭 = 지금처럼 크게 보기(옵션 화면)
//   담은 줄(아래) → "N장 만들기". 전문 프로필 룩을 담았으면 그 전에 세부 조정·옷 바꾸기 단계(StudioStepSheet).
// 설명 글·머리글은 넣지 않는다(오너 규칙: 컨셉 이름 말고는 글 없이).
// 기준 소스: ios2/rimikimi/UI/Home/HomeView.swift · PurposeView.swift · StudioCatalog.swift ·
//           Backend/ConceptStore.swift(앨범 순서) · App/AppState.swift(담기·만들기).
// ============================================================

const en = () => getLang() === "en";
const L = (ko, e) => (en() ? e : ko);
const FONT = '"Pretendard", -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
export const CART_MAX = 8; // AppState.cartMax

// ── 서버 이름표(/labels.json) — 앱 LabelStore.t 와 같다: 표에 있으면 그것, 없으면 코드 기본 문구 ──
export function lbl(labels, key, ko, e) {
  const v = labels?.[key]?.[en() ? "en" : "ko"];
  return v ? v : L(ko, e);
}
// 앨범(카테고리) 이름 — labels 의 category.<이름> 이 우선(앱 Copy.category)
export function catLabel(labels, name) {
  return lbl(labels, `category.${name}`, name, localizedCategory(name));
}

// ── 데이터: 이름표 · 시즌 표 · 브루클린 카탈로그 · 조세핀 드레스 (앱 StudioStore.load 와 같은 주소) ──
const getJSON = (u) => fetch(u, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
export function useDkData() {
  const [labels, setLabels] = useState(null);
  const [seasons, setSeasons] = useState([]);
  const [catalog, setCatalog] = useState(null);
  const [dresses, setDresses] = useState([]);
  useEffect(() => {
    let off = false;
    getJSON("/labels.json").then((j) => { if (!off && j && typeof j === "object") setLabels(j); });
    getJSON("/seasons.json").then((j) => { if (!off && Array.isArray(j)) setSeasons(j); });
    getJSON("/studio-catalog.json").then((j) => { if (!off && j && Array.isArray(j.presets)) setCatalog(j); });
    getJSON("/wedding-catalog.json").then((j) => { if (!off && Array.isArray(j)) setDresses(j); });
    return () => { off = true; };
  }, []);
  return { labels, seasons, catalog, dresses };
}

// ── 정렬·앨범 (ConceptStore 와 1:1) ──
const cats = (c) => c.categories || (c.category ? [c.category] : []);
const sortKey = (c) => (c.publishAt ? Date.parse(c.publishAt) / 1000 : Number(c.id) || 0);
export const byNewest = (a, b) => (sortKey(b) - sortKey(a)) || ((Number(b.id) || 0) - (Number(a.id) || 0));
// 시즌 — KST 날짜(yyyy-MM-dd) 로만 비교, end 는 그날까지 포함(Season.isActive)
function activeSeasonCats(seasons) {
  const kst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  return (seasons || []).filter((s) => s && s.start <= kst && kst <= s.end).map((s) => s.category);
}
// 앨범 타일: 최근에 새 컨셉이 들어온 카테고리가 앞(rows) → 활성 시즌은 맨 앞. (즐겨찾기 앨범은 웹에 없다)
export function albumTiles(pool, seasons) {
  const groups = new Map();
  for (const c of pool) for (const cat of cats(c)) {
    const g = groups.get(cat) || { items: [], latest: -Infinity };
    g.items.push(c);
    g.latest = Math.max(g.latest, sortKey(c));
    groups.set(cat, g);
  }
  let tiles = [...groups.entries()]
    .map(([name, g]) => ({ name, count: g.items.length, cover: [...g.items].sort(byNewest)[0], latest: g.latest }))
    .sort((a, b) => b.latest - a.latest);
  const season = activeSeasonCats(seasons);
  tiles = season.map((n) => tiles.find((t) => t.name === n)).filter(Boolean).concat(tiles.filter((t) => !season.includes(t.name)));
  return tiles;
}
export const conceptsIn = (pool, cat) => pool.filter((c) => cats(c).includes(cat));

// ── 목적 4칸 (HomeView.swift Purpose) ──
const PURPOSES = [
  { key: "profile", lk: "purpose.profile", ko: "증명·프로필", en: "ID · Profile", fallback: "스튜디오 프로필" },
  { key: "snap", lk: "purpose.snap", ko: "프사·소개팅", en: "Profile pic · Dating", fallback: "일상 스냅", coverID: "454" },
  { key: "wedding", lk: "purpose.wedding", ko: "웨딩·커플", en: "Wedding · Couple", fallback: "웨딩 / 브라이덜" },
  { key: "concept", lk: "purpose.concept", ko: "컨셉화보", en: "Concept shoots", fallback: null },
];
export const purposeTitle = (labels, key) => {
  const p = PURPOSES.find((x) => x.key === key) || PURPOSES[3];
  return lbl(labels, p.lk, p.ko, p.en);
};
function newestOf(pool, isFeature) { return pool.filter((c) => !isFeature(c)).sort(byNewest).slice(0, 10); }
export function conceptsFor(pool, key, isFeature) {
  const p = PURPOSES.find((x) => x.key === key);
  const tagged = pool.filter((c) => Array.isArray(c.purposes) && c.purposes.includes(key)).sort(byNewest);
  if (tagged.length) return tagged;
  if (p?.fallback) return conceptsIn(pool, p.fallback).sort(byNewest);
  return newestOf(pool, isFeature);
}
function coverFor(pool, key, isFeature) {
  const p = PURPOSES.find((x) => x.key === key);
  if (p?.coverID) { const c = pool.find((x) => String(x.id) === p.coverID); if (c) return c; }
  return key === "concept" ? newestOf(pool, isFeature)[0] : conceptsFor(pool, key, isFeature)[0];
}

// ── 브루클린 룩 · 조세핀 드레스를 격자·담기 줄이 쓰는 모양으로 (Concept(syntheticID:)) ──
export const STUDIO_TABS = ["resume", "linkedin", "audition"];
export function studioTabTitle(labels, k) {
  if (k === "resume") return lbl(labels, "studioTab.resume", "이력서·취업", "Résumé");
  if (k === "linkedin") return lbl(labels, "studioTab.linkedin", "전문 프로필", "Professional");
  return lbl(labels, "studioTab.audition", "배우·모델", "Actor · model");
}
export function studioLooks(catalog, purpose) {
  return (catalog?.presets || []).filter((p) => p.purpose === purpose).map((p) => ({
    id: "studio:" + p.id, title: p.title?.ko || p.id, title_en: p.title?.en, thumb: p.thumb || null,
    studioPurpose: purpose, studioPreset: p.id,
  }));
}
export function dressList(dresses, kind, filter) {
  const ok = (axis, v) => !(filter?.[axis]?.length) || filter[axis].includes(v);
  return (dresses || []).filter((d) => d.kind === kind && ok("sil", d.silhouette) && ok("col", d.color) && ok("neck", d.neckline) && ok("slv", d.sleeve))
    .map((d) => ({ id: "dress:" + d.code, title: `${d.code} ${d.silhouette}`, thumb: d.thumb, dressCode: d.code }));
}
const axisValues = (dresses, axis, kind) => {
  const f = { sil: "silhouette", col: "color", neck: "neckline", slv: "sleeve" }[axis];
  return [...new Set((dresses || []).filter((d) => d.kind === kind).map((d) => d[f]))];
};
const isSynthetic = (it) => !!(it && (it.studioPreset || it.dressCode));
export const thumbOf = (it) => it.thumb || `/thumbs/${it.id}.webp`;
const largeOf = (it) => it.thumb || `/large/${it.id}.webp`;
const onThumbErr = (it) => (e) => { if (it.thumb) return; e.currentTarget.onerror = null; e.currentTarget.src = `/thumbs/${it.id}.webp`; };

// 브루클린 세부 조정 항목 → 서버 레시피 키(api/_lib/studio.js KNOB_KEY 와 1:1)
const RECIPE_KEY = {
  suits: "idSuit", inners: "idInner", bgs: "idBg", expressions: "expressionId", angles: "angleId",
  hair: "hairId", mono: "monochrome", actorOutfits: "actorOutfitId", moods: "actorLookId",
  beautyOutfits: "beautyOutfitId", beautyLooks: "actorLookId", retouch: "retouch", makeup: "makeup",
};
function knobTitle(knob, purpose) {
  switch (knob) {
    case "suits": return purpose === "audition" ? L("의상 색", "Outfit color") : L("정장 색", "Suit color");
    case "inners": return L("셔츠·블라우스 색", "Shirt · blouse color");
    case "bgs": return L("배경 색", "Background");
    case "expressions": return L("표정", "Expression");
    case "angles": return L("앵글", "Angle");
    case "hair": return L("헤어", "Hair");
    case "mono": return L("흑백으로", "Black & white");
    case "actorOutfits": return L("의상 종류", "Outfit type");
    case "moods": return L("분위기", "Mood");
    default: return knob;
  }
}
const BG_KO = { "pure white": "화이트", "soft warm light grey": "웜그레이", "warm ivory cream": "아이보리", "soft pastel pink": "파스텔 핑크",
  "light sky blue": "스카이블루", "soft muted teal": "뮤트 틸", "deep navy blue": "딥네이비", "deep muted purple": "딥퍼플" };
function valueLabel(v) {
  const t = v.title ? ((en() ? v.title.en : v.title.ko) || v.title.ko || v.title.en) : "";
  if (t) return t;
  return (en() ? v.name : BG_KO[v.name]) || v.name || v.id;
}
function knobValues(catalog, knob, purpose) {
  const ex = new Set(catalog?.purposeKnobExclude?.[purpose]?.[knob] || []);
  return (catalog?.knobs?.[knob] || []).filter((v) => !ex.has(v.id));
}

// 파일 하나 → data URL (옷 사진·신랑 사진)
function useFilePick(onPicked) {
  const ref = useRef(null);
  const input = (
    <input ref={ref} type="file" accept="image/*" style={{ display: "none" }}
      onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (!f || !f.type.startsWith("image/")) return;
        const fr = new FileReader();
        fr.onloadend = () => onPicked(fr.result);
        fr.readAsDataURL(f);
      }} />
  );
  return [input, () => ref.current?.click()];
}

// ============================================================
// 홈
// ============================================================
export function MakeHome({ pool, labels, seasons, isFeature, onOpenConcept, onPurpose, onAlbum, retouch, restore }) {
  const tiles = useMemo(() => albumTiles(pool, seasons), [pool, seasons]);
  return (
    <div style={W.page}>
      <div style={W.feat}>
        <FeatureCard title={lbl(labels, "feature.retouch", "말로 고치기", "Fix with words")} bg={DK_ACTINT} icon="pencil" c={retouch} onOpen={onOpenConcept} />
        <FeatureCard title={lbl(labels, "feature.restore", "옛날 사진 복원", "Restore old photo")} bg={DK.s2} icon="restore" c={restore} onOpen={onOpenConcept} />
      </div>
      <div style={W.purposes}>
        {PURPOSES.map((p) => {
          const cover = coverFor(pool, p.key, isFeature);
          return (
            <button key={p.key} type="button" className="dkBtn" style={W.purpose} onClick={() => onPurpose(p.key)}>
              <span style={W.pCover}>{cover && <img src={thumbOf(cover)} alt="" style={W.img} />}</span>
              <span style={W.pTitle}>{lbl(labels, p.lk, p.ko, p.en)}</span>
            </button>
          );
        })}
      </div>
      <div style={W.albums}>
        {tiles.map((t) => (
          <button key={t.name} type="button" className="dkCard" onClick={() => onAlbum(t.name)} aria-label={catLabel(labels, t.name)}>
            <div className="dkIm" style={W.albumIm}>
              {t.cover && <img src={`/large/${t.cover.id}.webp`} onError={onThumbErr(t.cover)} alt="" loading="lazy" style={W.img} />}
            </div>
            <div style={W.albumName}>{catLabel(labels, t.name)}</div>
            <div style={W.albumCount}>{L(`${t.count}장`, `${t.count}`)}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
const DK_ACTINT = "rgba(230,64,60,.14)";
function FeatureCard({ title, bg, icon, c, onOpen }) {
  return (
    <button type="button" className="dkBtn" style={{ ...W.featCard, background: bg, opacity: c ? 1 : 0.5 }} disabled={!c} onClick={() => c && onOpen(c)}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {icon === "pencil"
          ? <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M14 6l4 4" /><path d="M13 20h7" /></>
          : <><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" /><path d="M3 4v4.5h4.5" /><path d="M12 7.5V12l3 2" /></>}
      </svg>
      <span style={W.featTitle}>{title}</span>
    </button>
  );
}

// ============================================================
// 목적 화면 · 앨범 화면 (같은 격자)
// ============================================================
export function PurposePage({
  view, pool, labels, seasons, catalog, dresses, isFeature, isBatchable,
  cart, onToggle, onOpenConcept, studio, setStudio, onBack,
}) {
  const purpose = view.kind === "purpose" ? view.key : null;
  const [segment, setSegment] = useState("");
  const [showFilter, setShowFilter] = useState(false);
  const [lookViewer, setLookViewer] = useState(null); // 룩·드레스 크게 보기 {list, index}
  useEffect(() => { setSegment(""); }, [view.kind, view.key, view.name]);
  const tiles = useMemo(() => albumTiles(pool, seasons), [pool, seasons]);
  const [groomInput, pickGroom] = useFilePick((d) => setStudio((s) => ({ ...s, groom: d })));

  const segments = useMemo(() => {
    if (purpose === "profile") return catalog ? STUDIO_TABS.map((k) => [k, studioTabTitle(labels, k)]) : [];
    if (purpose === "wedding") return [
      ["concepts", `${lbl(labels, "weddingTab.concepts", "웨딩 컨셉", "Wedding")} ${conceptsFor(pool, "wedding", isFeature).length}`],
      ["main", `${lbl(labels, "weddingTab.main", "본식 드레스", "Ceremony gowns")} ${dressList(dresses, "main", studio.filter).length}`],
      ["after", `${lbl(labels, "weddingTab.after", "2부 드레스", "Reception gowns")} ${dressList(dresses, "after", studio.filter).length}`],
    ];
    if (purpose === "concept") return [["today", lbl(labels, "segment.today", "오늘의 새 컨셉", "New today")]].concat(tiles.map((t) => [t.name, catLabel(labels, t.name)]));
    return [];
  }, [purpose, catalog, labels, pool, dresses, studio.filter, tiles, isFeature]);
  const current = segment || segments[0]?.[0] || "";

  const items = useMemo(() => {
    if (view.kind === "album") return conceptsIn(pool, view.name).sort(byNewest);
    if (purpose === "profile") return studioLooks(catalog, current);
    if (purpose === "wedding") return current === "main" || current === "after" ? dressList(dresses, current, studio.filter) : conceptsFor(pool, "wedding", isFeature);
    if (purpose === "concept") return current === "today" ? pool.filter((c) => !isFeature(c)).sort(byNewest).slice(0, 12) : conceptsIn(pool, current).sort(byNewest);
    return conceptsFor(pool, "snap", isFeature);
  }, [view, purpose, current, catalog, dresses, studio.filter, pool, isFeature]);

  const title = view.kind === "album" ? catLabel(labels, view.name) : purposeTitle(labels, purpose);
  const nf = Object.values(studio.filter || {}).reduce((n, a) => n + (a?.length || 0), 0);
  const loading = purpose === "profile" && !catalog;
  const open = (it, i) => {
    if (isSynthetic(it)) setLookViewer({ list: items, index: i });
    else onOpenConcept(it);
  };

  return (
    <div style={W.page}>
      {groomInput}
      <div style={W.titleRow}>
        <button type="button" className="dkBtn" style={W.back} onClick={onBack} aria-label={L("뒤로", "Back")}>
          <svg width="11" height="18" viewBox="0 0 12 20" aria-hidden="true"><path d="M10 2L2 10l8 8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <h1 style={W.h1}>{title}</h1>
      </div>
      {segments.length > 1 && (
        <div style={W.segs}>
          {segments.map(([k, label]) => (
            <button key={k} type="button" className="dkBtn" style={{ ...W.seg, ...(current === k ? W.segOn : null) }} onClick={() => setSegment(k)}>{label}</button>
          ))}
        </div>
      )}
      {purpose === "wedding" && (
        <div style={W.tools}>
          {current !== "concepts" && (
            <ToolBtn on={nf > 0} onClick={() => setShowFilter(true)} icon="filter" title={L("필터", "Filter") + (nf > 0 ? ` · ${nf}` : "")} />
          )}
          <ToolBtn on={!!studio.groom} icon="heart" title={studio.groom ? L("신랑 사진 추가됨", "Groom added") : L("신랑도 함께", "With groom")}
            onClick={() => (studio.groom ? setStudio((s) => ({ ...s, groom: null })) : pickGroom())} />
        </div>
      )}
      {loading ? (
        <div style={W.grid}>{Array.from({ length: 12 }).map((_, i) => <div key={i} style={W.skel} />)}</div>
      ) : (
        <div style={W.grid}>
          {items.map((it, i) => {
            const idx = cart.findIndex((c) => String(c.id) === String(it.id));
            const selectable = isSynthetic(it) || isBatchable(it);
            return <Tile key={it.id} it={it} idx={idx} selectable={selectable} onOpen={() => open(it, i)} onToggle={() => onToggle(it)} />;
          })}
        </div>
      )}
      {showFilter && <DressFilterPanel kind={current} dresses={dresses} studio={studio} setStudio={setStudio} onClose={() => setShowFilter(false)} />}
      {lookViewer && (
        <LookViewer list={lookViewer.list} index={lookViewer.index} setIndex={(i) => setLookViewer((v) => ({ ...v, index: i }))}
          cart={cart} onToggle={onToggle} onClose={() => setLookViewer(null)} />
      )}
    </div>
  );
}

// 타일 — 클릭 = 크게 보기, 오른쪽 위 체크 = 담기/빼기(마우스를 올리면 보인다, 담은 건 순서 번호)
function Tile({ it, idx, selectable, onOpen, onToggle }) {
  const on = idx >= 0;
  return (
    <div className="dkTile" style={W.tile}>
      <button type="button" style={W.tileBtn} onClick={onOpen} aria-label={localizedTitle(it)} title={localizedTitle(it)}>
        <img src={thumbOf(it)} onError={onThumbErr(it)} alt="" loading="lazy" style={W.img} />
        <span className="dkTileName" style={W.tileName}>{localizedTitle(it)}</span>
      </button>
      {on && <span style={W.tileRing} aria-hidden="true" />}
      {selectable && (
        <button type="button" className="dkChk" data-on={on ? "" : undefined} style={{ ...W.chk, ...(on ? W.chkOn : null) }}
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          aria-pressed={on} aria-label={on ? L("담기 취소", "Remove") : L("담기", "Add")}>
          {on ? idx + 1 : (
            <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 7.3l3 3 6-6.6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          )}
        </button>
      )}
    </div>
  );
}

function ToolBtn({ on, onClick, icon, title }) {
  return (
    <button type="button" className="dkBtn" style={{ ...W.tool, ...(on ? W.toolOn : null) }} onClick={onClick}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {icon === "filter" ? <path d="M4 6h16M7 12h10M10 18h4" />
          : icon === "slider" ? <><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>
          : icon === "shirt" ? <path d="M8 4l-4 3 2 4 2-1v10h8V10l2 1 2-4-4-3c-.5 1.5-2 2.5-4 2.5S8.5 5.5 8 4z" />
          : <><circle cx="12" cy="12" r="9" /><path d="M12 16.5s-4-2.4-4-5.2A2.2 2.2 0 0 1 12 10a2.2 2.2 0 0 1 4 1.3c0 2.8-4 5.2-4 5.2z" /></>}
      </svg>
      <span>{title}</span>
    </button>
  );
}

// ── 룩·드레스 크게 보기 (앱 browse — 좌우로 넘기고 담기) ──
function LookViewer({ list, index, setIndex, cart, onToggle, onClose }) {
  const it = list[index];
  useEffect(() => {
    const f = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" && index < list.length - 1) setIndex(index + 1);
      else if (e.key === "ArrowLeft" && index > 0) setIndex(index - 1);
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [index, list.length, onClose, setIndex]);
  if (!it) return null;
  const on = cart.some((c) => String(c.id) === String(it.id));
  return (
    <div style={W.scrim} onClick={onClose}>
      <div style={W.viewer} onClick={(e) => e.stopPropagation()}>
        <div style={W.viewerImg}><img src={largeOf(it)} alt={localizedTitle(it)} style={{ ...W.img, objectFit: "contain" }} /></div>
        <div style={W.viewerBar}>
          <button type="button" className="dkBtn" style={W.navBtn} disabled={index === 0} onClick={() => setIndex(index - 1)} aria-label={L("이전", "Previous")}>‹</button>
          <div style={W.viewerTitle}>{localizedTitle(it)}</div>
          <button type="button" className="dkBtn" style={W.navBtn} disabled={index >= list.length - 1} onClick={() => setIndex(index + 1)} aria-label={L("다음", "Next")}>›</button>
          <button type="button" className="dkBtn" style={{ ...W.primary, minWidth: 120, ...(on ? W.primaryGhost : null) }} onClick={() => onToggle(it)}>
            {on ? L("빼기", "Remove") : L("담기", "Add")}
          </button>
          <button type="button" className="dkBtn" style={W.closeBtn} onClick={onClose} aria-label={L("닫기", "Close")}>✕</button>
        </div>
      </div>
    </div>
  );
}

// ── 담은 줄 (CartBar) ──
export function CartBar({ cart, onRemove, onMake, consentNeeded, consent, setConsent, consentText }) {
  if (!cart.length) return null;
  const off = consentNeeded && !consent;
  return (
    <div style={W.cartWrap}>
      <div style={W.cart}>
        <div style={W.cartThumbs}>
          {cart.map((c, i) => (
            <div key={c.id} style={W.cartThumb}>
              <img src={thumbOf(c)} onError={onThumbErr(c)} alt={localizedTitle(c)} title={localizedTitle(c)} style={{ ...W.img, borderRadius: 9 }} />
              <span style={W.cartNo}>{i + 1}</span>
              <button type="button" style={W.cartX} onClick={() => onRemove(i)} aria-label={L("빼기", "Remove")}>
                <svg width="9" height="9" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
              </button>
            </div>
          ))}
        </div>
        <div style={W.cartRight}>
          {consentNeeded && (
            <label style={W.consent}>
              <input type="checkbox" checked={!!consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>{consentText}</span>
            </label>
          )}
          <span style={W.cartCount}>{cart.length}/{CART_MAX}</span>
          <button type="button" className="dkBtn" style={{ ...W.primary, ...(off ? { opacity: 0.45, cursor: "not-allowed" } : null) }} disabled={off} onClick={onMake}>
            {L(`${cart.length}장 만들기`, `Create ${cart.length}`)}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── "N장 만들기" 다음 단계 — 담은 전문 프로필 룩을 탭별로 묶어 세부 조정·옷 바꾸기 (StudioStepSheet) ──
export function StudioStepPanel({ cart, labels, catalog, studio, setStudio, onClose, onMake }) {
  const tabs = STUDIO_TABS.filter((t) => cart.some((c) => c.studioPurpose === t));
  const [knobTab, setKnobTab] = useState(null);
  const outfitFor = useRef(null);
  const [outfitInput, pickOutfit] = useFilePick((d) => {
    const t = outfitFor.current;
    if (t) setStudio((s) => ({ ...s, outfit: { ...s.outfit, [t]: d } }));
  });
  useEffect(() => {
    const f = (e) => { if (e.key === "Escape") (knobTab ? setKnobTab(null) : onClose()); };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [knobTab, onClose]);

  if (knobTab) return <KnobPanel purpose={knobTab} catalog={catalog} studio={studio} setStudio={setStudio} onClose={() => setKnobTab(null)} />;
  // ⚠️ 숨은 file input 은 scrim 밖에 둔다 — input.click() 의 click 이벤트가 버블링돼 scrim 의 onClose 가 패널을 닫았다.
  return (
    <>
    {outfitInput}
    <div style={W.scrim} onClick={onClose}>
      <div style={W.sheet} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={purposeTitle(labels, "profile")}>
        <div style={W.sheetHead}>
          <span style={{ width: 80 }} />
          <div style={W.sheetTitle}>{purposeTitle(labels, "profile")}</div>
          <button type="button" className="dkBtn" style={W.textBtn} onClick={onClose}>{L("닫기", "Close")}</button>
        </div>
        <div style={W.sheetBody}>
          {tabs.map((t) => {
            const n = Object.keys(studio.overrides?.[t] || {}).length;
            const hasOutfit = !!studio.outfit?.[t];
            return (
              <section key={t} style={{ marginBottom: 28 }}>
                <div style={W.secTitle}>{studioTabTitle(labels, t)}</div>
                <div style={W.stepThumbs}>
                  {cart.filter((c) => c.studioPurpose === t).map((c) => (
                    <img key={c.id} src={thumbOf(c)} alt={localizedTitle(c)} title={localizedTitle(c)} style={W.stepThumb} />
                  ))}
                  {hasOutfit && <img src={studio.outfit[t]} alt="" style={{ ...W.stepThumb, outline: `2px solid ${DK.ac}`, outlineOffset: 2 }} />}
                </div>
                <div style={W.tools}>
                  <ToolBtn on={n > 0} icon="slider" title={L("세부 조정", "Fine-tune") + (n > 0 ? ` · ${n}` : "")} onClick={() => setKnobTab(t)} />
                  <ToolBtn on={hasOutfit} icon="shirt" title={hasOutfit ? L("옷 사진 적용 중", "Outfit applied") : L("옷 바꾸기", "Change outfit")}
                    onClick={() => {
                      if (hasOutfit) setStudio((s) => { const o = { ...s.outfit }; delete o[t]; return { ...s, outfit: o }; });
                      else { outfitFor.current = t; pickOutfit(); }
                    }} />
                </div>
              </section>
            );
          })}
        </div>
        <div style={W.sheetFoot}>
          <button type="button" className="dkBtn" style={{ ...W.primary, width: "100%" }} onClick={onMake}>{L(`${cart.length}장 만들기`, `Create ${cart.length}`)}</button>
        </div>
      </div>
    </div>
    </>
  );
}

// 세부 조정 (KnobSheet) — 항목·값은 서버 카탈로그가 정한다
function KnobPanel({ purpose, catalog, studio, setStudio, onClose }) {
  const o = studio.overrides?.[purpose] || {};
  const set = (key, v) => setStudio((s) => {
    const cur = { ...(s.overrides?.[purpose] || {}) };
    if (v === undefined) delete cur[key]; else cur[key] = v;
    return { ...s, overrides: { ...s.overrides, [purpose]: cur } };
  });
  const dimmed = studio.outfit?.[purpose] ? ["actorOutfits", "suits"] : [];
  return (
    <div style={W.scrim} onClick={onClose}>
      <div style={W.sheet} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={L("세부 조정", "Fine-tune")}>
        <div style={W.sheetHead}>
          <button type="button" className="dkBtn" style={{ ...W.textBtn, width: 80, textAlign: "left" }}
            onClick={() => setStudio((s) => ({ ...s, overrides: { ...s.overrides, [purpose]: {} } }))}>{L("기본값으로", "Reset")}</button>
          <div style={W.sheetTitle}>{L("세부 조정", "Fine-tune")}</div>
          <button type="button" className="dkBtn" style={{ ...W.textBtn, fontWeight: 800 }} onClick={onClose}>{L("닫기", "Close")}</button>
        </div>
        <div style={W.sheetBody}>
          {studio.outfit?.[purpose] && <div style={W.note}>👕 {L("옷 사진이 의상을 정해요", "The outfit photo sets the clothes")}</div>}
          {(catalog?.purposeKnobs?.[purpose] || []).map((knob) => {
            const key = RECIPE_KEY[knob] || knob;
            const dim = dimmed.includes(knob);
            return (
              <section key={knob} style={{ marginBottom: 22, opacity: dim ? 0.4 : 1, pointerEvents: dim ? "none" : "auto" }}>
                <div style={W.secTitle}>{knobTitle(knob, purpose)}</div>
                {knob === "mono" ? (
                  <label style={W.toggleRow}>
                    <input type="checkbox" checked={o[key] === true} onChange={(e) => set(key, e.target.checked ? true : undefined)} />
                    <span>{L("흑백으로", "Black & white")}</span>
                  </label>
                ) : (
                  <div style={W.flow}>
                    {(knob === "hair" ? [null] : []).concat(knobValues(catalog, knob, purpose)).map((v, i) => {
                      const cur = o[key];
                      const id = v ? (knob === "bgs" ? (v.hex || v.id) : v.id) : null;
                      const active = v == null ? (cur == null || cur === "") : cur === id;
                      const sw = v && (v.css || v.hex);
                      return (
                        <button key={i} type="button" className="dkBtn" style={{ ...W.chip, ...(active ? W.chipOn : null) }}
                          onClick={() => set(key, id != null ? id : (knob === "hair" ? "" : undefined))}>
                          {sw && /^#/.test(sw) && <span style={{ ...W.swatch, background: sw }} />}
                          {v ? valueLabel(v) : L("원본 유지", "Keep mine")}
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// 웨딩 드레스 필터 (DressFilterSheet) — 실루엣·컬러·넥라인·소매, 여러 개
function DressFilterPanel({ kind, dresses, studio, setStudio, onClose }) {
  const axes = [["sil", L("실루엣", "Silhouette")], ["col", L("컬러", "Color")], ["neck", L("넥라인", "Neckline")], ["slv", L("소매", "Sleeve")]];
  const n = dressList(dresses, kind, studio.filter).length;
  useEffect(() => {
    const f = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [onClose]);
  return (
    <div style={W.scrim} onClick={onClose}>
      <div style={W.sheet} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={L("필터", "Filter")}>
        <div style={W.sheetHead}>
          <button type="button" className="dkBtn" style={{ ...W.textBtn, width: 80, textAlign: "left" }} onClick={() => setStudio((s) => ({ ...s, filter: {} }))}>{L("기본값으로", "Reset")}</button>
          <div style={W.sheetTitle}>{L("필터", "Filter")}</div>
          <button type="button" className="dkBtn" style={{ ...W.textBtn, fontWeight: 800 }} onClick={onClose}>{L("닫기", "Close")}</button>
        </div>
        <div style={W.sheetBody}>
          {axes.map(([axis, title]) => (
            <section key={axis} style={{ marginBottom: 22 }}>
              <div style={W.secTitle}>{title}</div>
              <div style={W.flow}>
                {axisValues(dresses, axis, kind).map((v) => {
                  const on = (studio.filter?.[axis] || []).includes(v);
                  return (
                    <button key={v} type="button" className="dkBtn" style={{ ...W.chip, ...(on ? W.chipOn : null) }}
                      onClick={() => setStudio((s) => {
                        const cur = s.filter?.[axis] || [];
                        return { ...s, filter: { ...s.filter, [axis]: on ? cur.filter((x) => x !== v) : [...cur, v] } };
                      })}>{v}</button>
                  );
                })}
              </div>
            </section>
          ))}
          <div style={{ ...W.note, textAlign: "center" }}>{L(`조건에 맞는 드레스 ${n}벌`, `${n} gowns match`)}</div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 내 사진 — 컨셉별 앨범(표지 · 이름 · N장), 남은 시간 표시 없음 (MyPhotosView)
// ============================================================
// 서버는 룩·드레스 결과를 conceptId 0 으로 저장한다 → id 가 없으면 제목으로 묶는다(앱은 id 로만 묶어 한 앨범으로 합쳐진다).
export function groupAlbums(items, conceptById) {
  const sorted = [...items].sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
  const order = [];
  const groups = new Map();
  for (const it of sorted) {
    const k = it.conceptId && Number(it.conceptId) !== 0 ? "id:" + it.conceptId : "t:" + (it.conceptTitle || "");
    if (!groups.has(k)) { groups.set(k, []); order.push(k); }
    groups.get(k).push(it);
  }
  return order.map((k) => {
    const list = groups.get(k);
    const c = conceptById && list[0].conceptId ? conceptById.get(String(list[0].conceptId)) : null;
    return { key: k, title: (c ? localizedTitle(c) : list[0].conceptTitle) || L("내 사진", "My photos"), items: list };
  });
}
export function MyJobs({ jobs, onDismiss }) {
  if (!jobs?.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
      {jobs.map((j) => (
        <div key={j.id} style={W.job}>
          <img src={thumbOf(j.item)} onError={onThumbErr(j.item)} alt="" style={W.jobThumb} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 750, color: DK.tx }}>
              {j.status === "running" ? L("만드는 중…", "Creating…") : j.status === "done" ? L("완성됐어요", "Done") : L("만들지 못했어요", "Couldn't create")}
            </div>
            <div style={{ fontSize: 13, color: DK.mu, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {j.status === "failed" && j.error ? j.error : localizedTitle(j.item)}
            </div>
          </div>
          {j.status === "running" ? <span className="dkSpin" style={W.spin} aria-hidden="true" /> : (
            <button type="button" className="dkBtn" style={W.jobX} onClick={() => onDismiss(j.id)} aria-label={L("닫기", "Close")}>✕</button>
          )}
        </div>
      ))}
    </div>
  );
}
export function MyAlbumsGrid({ albums, onOpen }) {
  return (
    <div style={W.albums}>
      {albums.map((a) => (
        <button key={a.key} type="button" className="dkCard" onClick={() => onOpen(a.key)} aria-label={a.title}>
          <div className="dkIm" style={W.albumIm}>{a.items[0]?.url && <img src={a.items[0].url} alt="" loading="lazy" style={W.img} />}</div>
          <div style={W.albumName}>{a.title}</div>
          <div style={W.albumCount}>{L(`${a.items.length}장`, `${a.items.length}`)}</div>
        </button>
      ))}
    </div>
  );
}

export const DK_MAKE_CSS = `
.dkTile .dkChk { opacity: 0; transition: opacity .15s ease-out, transform .15s ease-out; }
.dkTile .dkChk[data-on], .dkTile .dkChk:focus-visible { opacity: 1; }
.dkTile .dkTileName { opacity: 0; transition: opacity .15s ease-out; }
@media (hover: hover) and (pointer: fine) {
  .dkTile:hover .dkChk { opacity: 1; }
  .dkTile:hover .dkTileName { opacity: 1; }
  .dkTile:hover img { filter: brightness(.94); }
  .dkTile .dkChk:hover { transform: scale(1.08); }
}
@media (hover: none) { .dkTile .dkChk { opacity: 1; } }
@keyframes dkSpin { to { transform: rotate(360deg); } }
.dkSpin { animation: dkSpin .8s linear infinite; }
@media (prefers-reduced-motion: reduce) { .dkSpin { animation-duration: 2.4s; } }
`;

const W = {
  page: { maxWidth: 1440, margin: "0 auto", padding: "32px 56px 140px", fontFamily: FONT, color: DK.tx },
  img: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
  feat: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 },
  featCard: { display: "flex", alignItems: "center", gap: 14, height: 84, padding: "0 24px", borderRadius: 18, border: 0, color: DK.tx, cursor: "pointer", fontFamily: FONT, textAlign: "left" },
  featTitle: { fontSize: 19, fontWeight: 750 },
  purposes: { marginTop: 14, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 },
  purpose: { display: "flex", alignItems: "center", gap: 14, padding: 12, borderRadius: 18, background: DK.s1, border: `1px solid ${DK.line}`, color: DK.tx, cursor: "pointer", fontFamily: FONT, textAlign: "left" },
  pCover: { width: 48, height: 62, borderRadius: 10, overflow: "hidden", background: DK.s2, flexShrink: 0 },
  pTitle: { fontSize: 17, fontWeight: 750, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  albums: { marginTop: 36, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: "28px 16px" },
  albumIm: { position: "relative", aspectRatio: "3 / 4", borderRadius: 16, overflow: "hidden", background: DK.s1 },
  albumName: { marginTop: 10, fontSize: 16, fontWeight: 700, color: DK.tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  albumCount: { marginTop: 2, fontSize: 14, color: DK.mu },
  titleRow: { display: "flex", alignItems: "center", gap: 14, marginBottom: 18 },
  back: { width: 40, height: 40, borderRadius: 12, border: `1px solid ${DK.line}`, background: DK.s1, color: DK.tx, cursor: "pointer", display: "grid", placeItems: "center" },
  h1: { fontSize: 30, fontWeight: 800, letterSpacing: "-0.03em", color: DK.tx, margin: 0 },
  segs: { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  seg: { height: 38, padding: "0 16px", borderRadius: 999, border: `1px solid ${DK.line}`, background: DK.s1, color: DK.tx, fontSize: 15, fontWeight: 650, cursor: "pointer", fontFamily: FONT },
  segOn: { background: DK.tx, color: DK.bg, border: `1px solid ${DK.tx}` },
  tools: { display: "flex", gap: 10, marginBottom: 16 },
  tool: { display: "flex", alignItems: "center", justifyContent: "center", gap: 8, height: 44, padding: "0 20px", minWidth: 150, borderRadius: 999, border: `1px solid ${DK.line}`, background: DK.s1, color: DK.tx, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: FONT },
  toolOn: { color: DK.ac, border: `1px solid ${DK.ac}`, background: "rgba(230,64,60,.10)" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 },
  skel: { aspectRatio: "3 / 4", borderRadius: 12, background: DK.s1 },
  tile: { position: "relative", aspectRatio: "3 / 4", borderRadius: 12, overflow: "hidden", background: DK.s1 },
  tileBtn: { position: "absolute", inset: 0, padding: 0, border: 0, background: "none", cursor: "zoom-in", display: "block" },
  tileName: { position: "absolute", left: 0, right: 0, bottom: 0, padding: "28px 10px 9px", fontSize: 13, fontWeight: 700, color: "#fff", textAlign: "left", background: "linear-gradient(transparent, rgba(0,0,0,.55))", pointerEvents: "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  tileRing: { position: "absolute", inset: 0, borderRadius: 12, boxShadow: `inset 0 0 0 3px ${DK.ac}`, pointerEvents: "none" },
  chk: { position: "absolute", top: 8, right: 8, width: 28, height: 28, borderRadius: 999, border: "2px solid #fff", background: "rgba(0,0,0,.28)", color: "#fff", display: "grid", placeItems: "center", cursor: "pointer", fontSize: 13, fontWeight: 800, padding: 0, fontFamily: FONT, boxShadow: "0 1px 4px rgba(0,0,0,.25)" },
  chkOn: { background: DK.ac, border: `2px solid ${DK.ac}` },
  scrim: { position: "fixed", inset: 0, zIndex: 90, background: "rgba(0,0,0,.55)", display: "grid", placeItems: "center", padding: 24, fontFamily: FONT },
  viewer: { width: "min(1100px, 100%)", height: "min(92vh, 980px)", display: "flex", flexDirection: "column", gap: 12 },
  viewerImg: { flex: 1, minHeight: 0, borderRadius: 18, overflow: "hidden" },
  viewerBar: { display: "flex", alignItems: "center", gap: 10, background: DK.s1, borderRadius: 16, padding: 10, border: `1px solid ${DK.line}` },
  viewerTitle: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: 750, color: DK.tx },
  navBtn: { width: 44, height: 44, borderRadius: 12, border: `1px solid ${DK.line}`, background: DK.bg, color: DK.tx, fontSize: 24, cursor: "pointer" },
  closeBtn: { width: 44, height: 44, borderRadius: 12, border: `1px solid ${DK.line}`, background: DK.bg, color: DK.tx, fontSize: 16, cursor: "pointer" },
  primary: { height: 48, padding: "0 26px", borderRadius: 14, border: 0, background: DK.ac, color: "#fff", fontSize: 16, fontWeight: 800, cursor: "pointer", fontFamily: FONT, whiteSpace: "nowrap" },
  primaryGhost: { background: "transparent", color: DK.tx, border: `1px solid ${DK.line}` },
  cartWrap: { position: "fixed", left: 0, right: 0, bottom: 20, zIndex: 70, display: "flex", justifyContent: "center", pointerEvents: "none", padding: "0 24px", fontFamily: FONT },
  cart: { pointerEvents: "auto", display: "flex", alignItems: "center", gap: 18, padding: "12px 14px 12px 16px", borderRadius: 22, background: DK.nav, backdropFilter: "blur(18px) saturate(1.4)", WebkitBackdropFilter: "blur(18px) saturate(1.4)", border: `1px solid ${DK.line}`, boxShadow: "0 12px 40px rgba(0,0,0,.28)", maxWidth: "100%" },
  cartThumbs: { display: "flex", gap: 10, paddingTop: 6, paddingRight: 6, overflowX: "auto" },
  cartThumb: { position: "relative", width: 48, height: 64, flexShrink: 0 },
  cartNo: { position: "absolute", top: 3, left: 3, minWidth: 16, height: 16, padding: "0 4px", borderRadius: 999, background: DK.ac, color: "#fff", fontSize: 10, fontWeight: 800, display: "grid", placeItems: "center", boxSizing: "border-box" },
  cartX: { position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: 999, border: 0, background: DK.tx, color: DK.bg, display: "grid", placeItems: "center", cursor: "pointer", padding: 0 },
  cartRight: { display: "flex", alignItems: "center", gap: 14, flexShrink: 0 },
  cartCount: { fontSize: 14, fontWeight: 800, color: DK.mu, fontVariantNumeric: "tabular-nums" },
  consent: { display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: DK.mu, maxWidth: 300, lineHeight: 1.4, cursor: "pointer" },
  sheet: { width: "min(560px, 100%)", maxHeight: "86vh", display: "flex", flexDirection: "column", background: DK.bg, color: DK.tx, borderRadius: 24, border: `1px solid ${DK.line}`, boxShadow: "0 24px 80px rgba(0,0,0,.4)", overflow: "hidden" },
  sheetHead: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: `1px solid ${DK.line}` },
  sheetTitle: { fontSize: 17, fontWeight: 750 },
  sheetBody: { padding: "20px 22px", overflowY: "auto", flex: 1 },
  sheetFoot: { padding: "14px 22px 18px", borderTop: `1px solid ${DK.line}` },
  textBtn: { width: 80, textAlign: "right", background: "none", border: 0, color: DK.tx, fontSize: 15, fontWeight: 650, cursor: "pointer", fontFamily: FONT, padding: 0 },
  secTitle: { fontSize: 16, fontWeight: 750, marginBottom: 10 },
  stepThumbs: { display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" },
  stepThumb: { width: 52, height: 68, borderRadius: 9, objectFit: "cover", background: DK.s1 },
  flow: { display: "flex", flexWrap: "wrap", gap: 8 },
  chip: { display: "inline-flex", alignItems: "center", gap: 6, height: 36, padding: "0 13px", borderRadius: 999, border: `1px solid ${DK.line}`, background: DK.s1, color: DK.tx, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: FONT },
  chipOn: { background: DK.tx, color: DK.bg, border: `1px solid ${DK.tx}` },
  swatch: { width: 14, height: 14, borderRadius: 999, border: `1px solid ${DK.line}`, flexShrink: 0 },
  toggleRow: { display: "flex", alignItems: "center", gap: 10, fontSize: 15, cursor: "pointer" },
  note: { fontSize: 13, color: DK.mu, marginBottom: 16 },
  job: { display: "flex", alignItems: "center", gap: 14, padding: 14, borderRadius: 16, background: DK.s1, border: `1px solid ${DK.line}`, maxWidth: 560 },
  jobThumb: { width: 42, height: 56, borderRadius: 8, objectFit: "cover", background: DK.s2 },
  jobX: { width: 30, height: 30, borderRadius: 999, border: 0, background: DK.s2, color: DK.mu, cursor: "pointer", fontSize: 12 },
  spin: { width: 20, height: 20, borderRadius: 999, border: `2.5px solid ${DK.line}`, borderTopColor: DK.ac, flexShrink: 0 },
};
