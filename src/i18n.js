// ============================================================
// 가벼운 다국어 (i18n) — 라이브러리 없이 직접
//
// 사용:
//   import { t, getLang, setLang } from "./i18n";
//   t("login.title")  → "로그인" 또는 "Sign in"
//   t("home.greeting", { name: "Alex" }) → "Hi Alex!"
//
// 결정 우선순위:
//   1) localStorage "rimikimi_lang" (사용자 수동 선택)
//   2) navigator.languages[0] 의 첫 두 글자 (ko / en / ...)
//   3) 기본값 "ko"
// ============================================================

import { STR } from "./i18nStrings.js";

const STORAGE_KEY = "rimikimi_lang";
const SUPPORTED = ["ko", "en"];
const DEFAULT = "ko";

let listeners = [];

function detectSystemLang() {
  try {
    const langs = navigator.languages && navigator.languages.length
      ? navigator.languages
      : [navigator.language || ""];
    for (const l of langs) {
      const two = (l || "").slice(0, 2).toLowerCase();
      if (SUPPORTED.includes(two)) return two;
    }
  } catch (_) {}
  return DEFAULT;
}

function readSaved() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "auto") return null; // "auto" = 시스템 따라감
    if (SUPPORTED.includes(saved)) return saved;
  } catch (_) {}
  return null;
}

// 2.0 네이티브 웹뷰(`?tool=`)는 자기 언어를 `?lang=` 으로 넘긴다. 웹뷰의 localStorage 는
// 네이티브 앱과 별개 저장소이고 navigator.language 는 기기 언어를 따라가기 때문에,
// 이게 없으면 **네이티브 껍데기는 한국어인데 안쪽 편집기·카메라만 영어**로 뜬다
// (실측: 영어 시뮬레이터에서 상단바 "다듬기" + 내용 "Edit/Share/Save").
function readURLLang() {
  try {
    const v = new URLSearchParams(window.location.search).get("lang");
    if (SUPPORTED.includes(v)) return v;
  } catch (_) {}
  return null;
}

let currentLang = readURLLang() || readSaved() || detectSystemLang();
// 첫 렌더 전에 한 번 맞춘다 — 크롤러가 보는 스냅샷이 모순되지 않게.
try { if (typeof document !== "undefined") queueMicrotask(() => syncDocumentLang()); } catch (_) {}

export function getLang() {
  return currentLang;
}

// "auto" | "ko" | "en"
// auto = localStorage 에서 키 지워서 다음 로드부터 시스템 따라가게
export function setLang(lang) {
  try {
    if (lang === "auto") {
      localStorage.removeItem(STORAGE_KEY);
      currentLang = detectSystemLang();
    } else if (SUPPORTED.includes(lang)) {
      localStorage.setItem(STORAGE_KEY, lang);
      currentLang = lang;
    } else {
      return;
    }
  } catch (_) {}
  syncDocumentLang();
  listeners.forEach((fn) => { try { fn(currentLang); } catch (_) {} });
}

/* ── 문서 메타를 "지금 그려지는 언어"와 맞춘다 ───────────────────────────────
   왜 필요한가 (2026-09-18 감사에서 잡힘):
     정적 HTML 은 lang="ko" · 한국어 title/description · og:locale=ko_KR 인데,
     언어는 navigator.languages 로 고른다. **구글봇은 en-US 로 크롤한다** — 그래서
     구글이 저장한 스냅샷은 "한국어 메타 + 영어 본문 + lang=ko" 라는 모순 조합이었다.
     한국어로도 영어로도 확신을 못 준다.
   어떻게 푸나:
     렌더 언어에 맞춰 html[lang]·title·description·og 를 갈아끼우고, canonical 을
     그 언어판 주소(?lang=ko / ?lang=en)로 자기참조시킨다. index.html 의 hreflang 이
     두 주소를 가리키므로, 구글봇이 ?lang=ko 를 크롤하면 readURLLang() 이 이겨
     **한국어로 렌더된 한국어판**을 제대로 색인한다. */
const DOC_META = {
  ko: {
    title: "rimikimi — 내 얼굴로 만드는 AI 인생 프로필",
    desc: "셀카 한 장으로 만드는 AI 인생 프로필 앱 rimikimi. 증명사진, 이력서용 프로필 사진부터 카페·웨딩·스튜디오 컨셉의 화보풍 셀카 화보까지 내 얼굴로 몇 분 만에 완성해 원하는 배경과 스타일을 골라 바로 다운로드하세요.",
    ogTitle: "rimikimi — 내 얼굴로 만드는 AI 인생 프로필",
    ogDesc: "내 얼굴로 인생 프로필 만들기 ✨",
    locale: "ko_KR",
  },
  en: {
    title: "rimikimi — AI portraits from one selfie",
    desc: "Turn one selfie into AI portraits: ID photos, resume headshots, couple shots, photo-booth strips and editorial concepts. Hundreds of concepts, ready in minutes, free to try once a day.",
    ogTitle: "rimikimi — AI portraits from one selfie",
    ogDesc: "One selfie. Hundreds of concepts. ✨",
    locale: "en_US",
  },
};
const BASE_URL = "https://rimikimi-app.vercel.app/";

function setMeta(sel, attr, value) {
  try {
    const el = document.querySelector(sel);
    if (el) el.setAttribute(attr, value);
  } catch (_) {}
}

export function syncDocumentLang() {
  if (typeof document === "undefined") return;
  const m = DOC_META[currentLang] || DOC_META.ko;
  try { document.documentElement.setAttribute("lang", currentLang); } catch (_) {}
  try { document.title = m.title; } catch (_) {}
  setMeta('meta[name="description"]', "content", m.desc);
  setMeta('meta[property="og:title"]', "content", m.ogTitle);
  setMeta('meta[property="og:description"]', "content", m.ogDesc);
  setMeta('meta[property="og:locale"]', "content", m.locale);
  // 각 언어판이 자기 자신을 canonical 로 — 안 그러면 hreflang 이 무시된다.
  setMeta('link[rel="canonical"]', "href", `${BASE_URL}?lang=${currentLang}`);
}

// "auto" 인지 알고 싶을 때 (프로필 UI 가 라디오 표시할 때)
export function getLangPreference() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === null) return "auto";
    if (SUPPORTED.includes(saved)) return saved;
  } catch (_) {}
  return "auto";
}

// React 훅 — 언어 바뀌면 컴포넌트 리렌더
import { useState, useEffect } from "react";
export function useLang() {
  const [lang, setLocal] = useState(currentLang);
  useEffect(() => {
    const fn = (l) => setLocal(l);
    listeners.push(fn);
    return () => { listeners = listeners.filter((x) => x !== fn); };
  }, []);
  return lang;
}

// 번역
export function t(key, vars) {
  const dict = STR[currentLang] || STR[DEFAULT];
  let s = dict[key];
  if (s === undefined) {
    // ko fallback → 그래도 없으면 key 자체
    s = (STR[DEFAULT] || {})[key];
    if (s === undefined) return key;
  }
  if (vars) {
    for (const k in vars) {
      s = s.replace(new RegExp(`\\{${k}\\}`, "g"), vars[k]);
    }
  }
  return s;
}

// 컨셉 제목/카테고리는 데이터에 ko/en 가 같이 있음.
// concept.title_en 있으면 영어, 없으면 한글 fallback.
export function localizedTitle(concept) {
  if (currentLang === "en" && concept?.title_en) return concept.title_en;
  return concept?.title || "";
}

export function localizedCategory(cat) {
  if (typeof cat !== "string") return cat;
  if (currentLang !== "en") return cat;
  const map = (STR.en && STR.en.__categories) || {};
  return map[cat] || cat;
}
