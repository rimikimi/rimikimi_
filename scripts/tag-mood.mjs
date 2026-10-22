#!/usr/bin/env node
// 컨셉마다 시간대(tod)·날씨(wx) 꼬리표 — 홈 '추천'을 지금 날씨·시간 무드에 맞춰 올리는 데 쓴다(2026-10-22 오너).
//   tod: morning | day | golden | night | any(스튜디오 등 시간 무관)
//   wx : rain | snow | sunny | cloudy | indoor | any
// 프롬프트의 장면 묘사 단어로 정한다(LLM 안 씀). 매직부스·네컷 등 mode 컨셉은 any.
//   node scripts/tag-mood.mjs [--write]   (--write 없으면 통계·표본만)
import { readFileSync, writeFileSync } from "node:fs";
const P = new URL("../api/_data/concepts.json", import.meta.url);
const raw = readFileSync(P, "utf8"); const cs = JSON.parse(raw);
const has = (t, re) => re.test(t);
function tag(c) {
  if (c.mode) return { tod: "any", wx: "any" };
  const t = (c.text || "").toLowerCase()
    .replace(/snow[- ]?(leopard|white)|frosted (glass|lip\w*|makeup|cake|window)|frost(ed)? (pink|blue|finish)|ice[- ]?cream|rain ?coat|rainbow|brainstorm|storm(trooper)?s? of/g, " ");
  // ── 날씨
  let wx = "any";
  if (has(t, /\b(rain|raining|rainy|rainfall|raindrops?|drizzle|umbrella|wet (street|pavement|asphalt)|puddles?|monsoon|storm)\b/)) wx = "rain";
  else if (has(t, /\b(snow|snowy|snowfall|snowflakes?|snow-covered|blizzard|ski|skiing|snowboard|frost(ed|y)?|icicles?)\b/)) wx = "snow";
  else if (has(t, /\b(seamless (backdrop|background)|studio backdrop|in a (photo )?studio|studio portrait|studio set|softbox|cyclorama|paper backdrop)\b/)) wx = "indoor";
  else if (has(t, /\b(overcast|cloudy|grey sky|gray sky|fog|foggy|mist|misty|haze|hazy)\b/)) wx = "cloudy";
  else if (has(t, /\b(sunny|bright sun|sunlight|sunshine|clear (blue )?sky|blue sky|beach|summer|harsh noon|midday sun|dappled)\b/)) wx = "sunny";
  else if (has(t, /\b(café|cafe|restaurant|bar|kitchen|bedroom|living room|library|office|interior|indoors?|lobby|hotel room|gallery|museum|apartment)\b/)) wx = "indoor";
  // ── 시간대
  let tod = "any";
  if (has(t, /\b(night|nighttime|midnight|moonlight|moonlit|neon|city lights|starry|stars|after dark|evening lights|nightclub|fireworks|candlelit|lantern-lit)\b/)) tod = "night";
  else if (has(t, /\b(golden hour|sunset|sunrise|dusk|twilight|magic hour|late afternoon|warm low sun|blue hour)\b/)) tod = has(t, /\bsunrise\b/) && !has(t, /\bsunset\b/) ? "morning" : "golden";
  else if (has(t, /\b(morning|breakfast|brunch|early light|dawn)\b/)) tod = "morning";
  else if (wx === "sunny" || has(t, /\b(daylight|daytime|afternoon|noon|bright day)\b/)) tod = "day";
  if (wx === "indoor" && tod === "any" && has(t, /\bstudio\b/)) tod = "any";
  return { tod, wx };
}
const out = cs.map((c) => ({ ...c, mood: tag(c) }));
const count = (k) => out.reduce((m, c) => (m[c.mood[k]] = (m[c.mood[k]] || 0) + 1, m), {});
console.log("tod", count("tod")); console.log("wx", count("wx"));
if (process.argv.includes("--sample")) {
  const pick = (f) => out.filter(f).sort(() => Math.random() - 0.5).slice(0, 6);
  for (const [name, f] of [["rain", (c) => c.mood.wx === "rain"], ["snow", (c) => c.mood.wx === "snow"], ["night", (c) => c.mood.tod === "night"], ["golden", (c) => c.mood.tod === "golden"], ["sunny", (c) => c.mood.wx === "sunny"]])
    for (const c of pick(f)) console.log(name, c.id, c.title, "|", c.text.slice(0, 160).replace(/\n/g, " "));
}
if (process.argv.includes("--write")) {
  writeFileSync(P, JSON.stringify(out, null, 1) + (raw.endsWith("\n") ? "\n" : ""));
  console.log("written");
}
