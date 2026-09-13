#!/usr/bin/env node
// ============================================================
// 성별·인종·나이 제약 지우기 (오너 지시 2026-09-13 — "여행 테마는 남녀 구분 없도록,
// 인종도 구분 없이, 나이도 constraint 없애줘")
//
//   지정한 카테고리의 컨셉 프롬프트에서
//     ① 사람을 가리키는 성별 명사(woman/man/girl/…) → person
//     ② 대명사 she/he → "the subject" (3인칭 단수라 동사 활용이 그대로 유지된다),
//        her/his → their, him/her(목적격) → them
//     ③ 나이 표현("in her late 20s", "25-year-old", "20-something") 제거
//     ④ 인종 표현(Korean/Asian/Caucasian + features/skin/…) 제거
//     ⑤ 맨 앞에 캐스팅 지시문을 붙인다 — 아래 묘사보다 **참조 사진의 실제 사람**이 우선
//   을 적용한다. 배경·의상·카메라 묘사는 건드리지 않는다.
//
//   node scripts/neutralize-people.mjs --cat=세계여행 [--dry] [--show=3]
// ============================================================
import { readFileSync, writeFileSync } from "node:fs";

const SRC = new URL("../api/_data/concepts.json", import.meta.url);
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const CAT = arg("cat", "세계여행");
const DRY = process.argv.includes("--dry");
const SHOW = Number(arg("show", "0"));

// ⚠️ 성별 단어만 지우면 부족하다 — 옷 자체가 드레스면 남성 사진에도 드레스를 입힌다(실측:
//    942 뉴욕의 우아 + 남성 사진 → 드레스·진주·붉은 립). 그래서 "안 맞는 옷은 같은 시대·색·
//    격식의 남녀 대응 아이템으로 바꿔 입혀라" 까지 지시한다.
export const CASTING =
  "CASTING — this overrides every description of the person below: use the person in the attached " +
  "reference photo exactly as they are. Keep their real gender, age, ethnicity, skin tone and body " +
  "type unchanged, and never restyle them into a different gender, age or ethnicity. Any wording " +
  "below that names a gender, age or ethnicity does not apply.\n" +
  "WARDROBE & HAIR — adapt, do not force: everything below describes the styling, scene, mood and " +
  "camera. If a garment, hairstyle or makeup described below does not suit this person's own gender " +
  "presentation, replace it with the natural equivalent for them (for example a tailored suit or a " +
  "shirt with trousers instead of a dress or gown, and no makeup where makeup would not suit them), " +
  "keeping the same era, colour palette, fabric, formality and mood. The location, lighting, framing " +
  "and overall look must stay exactly as described.\n\n";

// "her" 다음에 오면 목적격(→them)으로 봐야 하는 기능어들. 그 외에는 소유격(→their).
const AFTER_HER_OBJECT = new Set([
  "and","or","but","with","in","on","at","to","from","as","by","for","of","into","onto","over","under",
  "while","when","before","after","is","was","are","were","so","then","again","too","closer","away","there","here",
]);

// 사람 명사 앞에 붙는 수식어.
//  DROP = 나이·인종 (오너가 없애라고 한 constraint) → 지운다
//  KEEP = 분위기·스타일 (오너가 의도한 연출) → 그대로 둔다 ("elegant woman" → "elegant person")
const DROP_ADJ = "young|youthful|middle-aged|mature|teenage|adult|Korean|Asian|East[- ]Asian|Caucasian|European|Western|Hispanic|Latina|Latino|African(?:[- ]American)?|Black|White";
const KEEP_ADJ = "stunning|beautiful|gorgeous|elegant|glamorous|attractive|pretty|lovely|handsome|chic|striking|radiant|slim|slender|petite|tall|confident|sophisticated";
const ANY_ADJ = `(?:${DROP_ADJ}|${KEEP_ADJ})`;
// ⚠️ "lady" 는 넣지 않는다 — "Lady Dior / lady handbag" 같은 제품명을 망친다.
const GENDER_NOUN_S = "(?:woman|man|girl|boy|gentleman|guy)";
const GENDER_NOUN_P = "(?:women|men|girls|boys|gentlemen|guys)";
const dropRe = new RegExp(`^(?:${DROP_ADJ})$`, "i");

function neutralize(text) {
  let s = text;

  // ① 성별 명사 → person/people. 앞의 수식어는 나이·인종만 떨어내고 나머지는 살린다.
  const nounRe = new RegExp(`\\b((?:${ANY_ADJ})(?:[ ,]+(?:${ANY_ADJ}))*[ ,]+)?(${GENDER_NOUN_P}|${GENDER_NOUN_S})\\b`, "gi");
  s = s.replace(nounRe, (m, adjs, noun) => {
    const plural = new RegExp(`^${GENDER_NOUN_P}$`, "i").test(noun);
    const kept = (adjs || "")
      .split(/[ ,]+/)
      .filter((w) => w && !dropRe.test(w));
    let base = plural ? "people" : "person";
    if (/^[A-Z]/.test(m) && !kept.length) base = base[0].toUpperCase() + base.slice(1);
    return kept.length ? `${kept.join(" ")} ${base}` : base;
  });
  // "an person" → "a person"
  s = s.replace(/\ban\s+(?=person\b)/gi, "a ").replace(/\ban\s+(?=people\b)/gi, "");

  // ② 대명사
  s = s.replace(/\bShe\b/g, "The subject").replace(/\bHe\b/g, "The subject");
  s = s.replace(/\bshe\b/g, "the subject").replace(/\bhe\b/g, "the subject");
  // 단독으로 쓰인 his(= 소유대명사)는 "theirs" — "her arm linked through his," → "… through theirs,"
  s = s.replace(/\bhis\b(?=\s*(?:[,.;:)!?]|$))/gi, (m) => (m[0] === "H" ? "Theirs" : "theirs"));
  s = s.replace(/\bhis\b/gi, (m) => (m[0] === "H" ? "Their" : "their"));
  s = s.replace(/\bhim\b/gi, (m) => (m[0] === "H" ? "Them" : "them"));
  s = s.replace(/\b(herself|himself)\b/gi, (m) => (m[0] === m[0].toUpperCase() ? "Themselves" : "themselves"));
  s = s.replace(/\bhers\b/gi, "theirs");
  s = s.replace(/\bher\b(\s*)([A-Za-z'’-]*)/gi, (m, sp, next) => {
    const cap = m[0] === "H";
    const obj = !next || AFTER_HER_OBJECT.has(next.toLowerCase());
    const word = obj ? "them" : "their";
    return (cap ? word[0].toUpperCase() + word.slice(1) : word) + sp + next;
  });

  // ③ 나이
  s = s.replace(/\bin\s+(?:the subject'?s?|their|her|his)\s+(?:early|mid|mid-|late)?\s*(?:20s|30s|40s|twenties|thirties|forties)\b[ ,]*/gi, "");
  s = s.replace(/\b(?:aged\s+)?\d{2}[- ]years?[- ]old\b[ ,]*/gi, "");
  s = s.replace(/\b\d{2}-something\b[ ,]*/gi, "");
  s = s.replace(/\baged\s+\d{2}\b[ ,]*/gi, "");

  // ④ 인종 (사람의 특징을 수식할 때만 — "Korean street food" 같은 배경 묘사는 남긴다)
  s = s.replace(/\b(?:Korean|East[- ]Asian|Asian|Caucasian|Hispanic|Latina|Latino)\s+(features|face|facial features|skin|complexion|beauty|descent|ethnicity|heritage)\b/gi, "$1");
  s = s.replace(/\bof\s+(?:Korean|Asian|European|African)\s+descent\b[ ,]*/gi, "");

  // 한국어 표현
  s = s.replace(/(?:젊은\s*|아름다운\s*|20대\s*|30대\s*|한국인\s*)*(여성|여자|남성|남자|소녀|소년)/g, "인물");

  // 정리: 공백/쉼표 중복
  s = s.replace(/ {2,}/g, " ").replace(/\s+,/g, ",").replace(/,\s*,/g, ",").replace(/,\s*\./g, ".");
  return s;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const raw = readFileSync(SRC, "utf8");
  const indent = ((raw.split("\n")[1] || "").match(/^ */) || [""])[0].length || 1;
  const all = JSON.parse(raw);

  let changed = 0, shown = 0;
  for (const c of all) {
    const cats = c.categories || (c.category ? [c.category] : []);
    if (!cats.includes(CAT) || !c.text) continue;
    if (c.text.startsWith("CASTING —")) continue; // 이미 적용됨(idempotent)
    const next = CASTING + neutralize(c.text);
    if (next === c.text) continue;
    changed++;
    if (shown < SHOW) {
      shown++;
      console.log(`\n───── ${c.id} ${c.title}`);
      console.log("BEFORE: " + c.text.slice(0, 420).replace(/\s+/g, " "));
      console.log("AFTER : " + neutralize(c.text).slice(0, 420).replace(/\s+/g, " "));
    }
    if (!DRY) c.text = next;
  }
  console.log(`\n${CAT} · 프롬프트 ${changed}종 중성화${DRY ? " (dry)" : ""}`);
  if (!DRY && changed) {
    writeFileSync(SRC, JSON.stringify(all, null, indent) + (raw.endsWith("\n") ? "\n" : ""));
    console.log("concepts.json 기록 — scripts/build-fallback.mjs 를 이어서 돌릴 것");
  }
}
