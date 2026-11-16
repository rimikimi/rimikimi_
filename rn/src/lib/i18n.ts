// 영어 문구 → 일본어·번체·인도네시아어·태국어·말레이어(2026-11-16 오너). iOS Copy/I18N.swift 와 같은 사전(src/i18n/*.json).
// 키는 화면에 그려지는 영어 문장. 숫자·이름이 끼는 문장은 키에 {0} {1} 자리표시가 있고, 렌더된 영어를 그 틀에 맞춰
// 값을 뽑아 번역문의 같은 자리에 넣는다. 사전에 없으면 영어 그대로.
// ⚠️ locale.ts 를 import 하지 않는다(locale.ts 가 이 파일을 쓰므로 순환 초기화가 된다) — 언어 판정을 여기서 따로 한다.
import { I18nManager } from "react-native";

function deviceTag(): string {
  try { const id = I18nManager.getConstants?.().localeIdentifier; if (typeof id === "string" && id) return id.replace(/_/g, "-"); } catch { /* */ }
  try { const loc = Intl.DateTimeFormat().resolvedOptions().locale; if (typeof loc === "string" && loc) return loc; } catch { /* */ }
  return "en";
}
export type UiLang = "ko" | "en" | "ja" | "zh-Hant" | "id" | "th" | "ms";
function resolve(tag: string): UiLang {
  const t = tag.toLowerCase();
  if (t.startsWith("ko")) return "ko";
  if (t.startsWith("ja")) return "ja";
  if (/^zh-(hant|tw|hk|mo)/.test(t) || /^zh.*-(tw|hk|mo)\b/.test(t)) return "zh-Hant";
  if (t.startsWith("id") || t.startsWith("in-") || t === "in") return "id";
  if (t.startsWith("th")) return "th";
  if (t.startsWith("ms")) return "ms";
  return "en";
}
export const uiLang: UiLang = resolve(deviceTag());

/* eslint-disable @typescript-eslint/no-require-imports */
const DICTS: Partial<Record<UiLang, () => Record<string, string>>> = {
  ja: () => require("../i18n/ja.json"),
  "zh-Hant": () => require("../i18n/zh-Hant.json"),
  id: () => require("../i18n/id.json"),
  th: () => require("../i18n/th.json"),
  ms: () => require("../i18n/ms.json"),
};
/* eslint-enable @typescript-eslint/no-require-imports */

type Table = { exact: Record<string, string>; templates: { re: RegExp; out: string; n: number; len: number }[] };
let table: Table | null = null;
function load(): Table | null {
  if (table) return table;
  const get = DICTS[uiLang];
  if (!get) return null;
  const dict = get();
  const exact: Record<string, string> = {};
  const templates: Table["templates"] = [];
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const [k, v] of Object.entries(dict)) {
    const parts = k.split(/\{\d\}/);
    if (parts.length === 1) { exact[k] = v; continue; }
    // 짧은 틀("{0} photos")은 빈칸에 숫자가 있어야만 — "Restore old photos" 를 삼키지 않게. 14자 이상 긴 틀만 아무 글 허용(iOS 와 같은 규칙).
    const cap = parts.join("").length >= 14 ? "(.+?)" : "([^\\n]*?\\d[^\\n]*?)";
    templates.push({ re: new RegExp("^" + parts.map(esc).join(cap) + "$", "s"), out: v, n: parts.length - 1, len: parts.join("").length });
  }
  templates.sort((a, b) => b.len - a.len);
  table = { exact, templates };
  return table;
}

/** 영어 문구를 지금 언어로. 한국어·영어 UI 거나 사전에 없으면 그대로. */
export function tr(en: string): string {
  if (uiLang === "ko" || uiLang === "en" || typeof en !== "string" || !en) return en;
  const t = load();
  if (!t) return en;
  const hit = t.exact[en];
  if (hit !== undefined) return hit;
  for (const { re, out, n } of t.templates) {
    const m = en.match(re);
    if (!m) continue;
    let r = out;
    for (let i = 0; i < n; i++) r = r.split(`{${i}}`).join(m[i + 1]);
    return r;
  }
  return en;
}

/** 영어 문구 표(copyEn)를 통째로 지금 언어로 — 문자열은 바꾸고, 함수는 결과를 바꿔 준다. */
export function translateDeep<T>(obj: T): T {
  if (uiLang === "ko" || uiLang === "en") return obj;
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return tr(v);
    if (typeof v === "function") return (...a: unknown[]) => { const r = (v as (...x: unknown[]) => unknown)(...a); return typeof r === "string" ? tr(r) : r; };
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(obj) as T;
}
