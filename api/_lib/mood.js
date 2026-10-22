// 컨셉 무드 꼬리표(시간대·날씨) — 홈 '추천'을 지금 날씨·시간에 맞춰 올리는 데 쓴다(2026-10-22 오너).
//   tod: morning | day | golden | night | any   wx: rain | snow | sunny | cloudy | indoor | any
// 프롬프트 장면 묘사 단어로 정하고(LLM 안 씀), 오탐은 OVERRIDES 로 고친다(비·눈 판정은 전부 사람이 읽고 확인).
// 앱에는 프롬프트를 안 보내므로 서버가 목록을 만들 때 붙인다 — 새 컨셉도 자동으로 붙는다.
const has = (t, re) => re.test(t);
const OVERRIDES = {
  // 비 아님 — 소품 우산·구름만
  916: { wx: "indoor" }, 537: { wx: "sunny" }, 488: { wx: "sunny" }, 653: { wx: "cloudy" }, 731: { wx: "cloudy" },
  // 눈 아님 — 눈 덮인 산·케이크 프로스팅 등
  878: { wx: "sunny" }, 381: { wx: "indoor" }, 851: { wx: "any" }, 853: { wx: "any" }, 130: { wx: "any" },
};
function tagRaw(c) {
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

const cache = new Map();
export function moodOf(c) {
  const key = c.id + ":" + (c.text || "").length;
  if (!cache.has(key)) cache.set(key, { ...tagRaw(c), ...(OVERRIDES[Number(c.id)] || {}) });
  return cache.get(key);
}
