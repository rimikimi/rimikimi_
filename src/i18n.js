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

let currentLang = readSaved() || detectSystemLang();

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
  listeners.forEach((fn) => { try { fn(currentLang); } catch (_) {} });
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
