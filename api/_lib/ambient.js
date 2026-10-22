// ============================================================
// 지금 사용자 쪽 날씨(앱 홈의 '창문' 연출용) — 2026-10-22 오너 "비 오면 앨범이 창문처럼, 눈 오면 소복이".
//   - 위치 권한을 묻지 않는다. Vercel 이 붙여 주는 접속 IP 의 대략 좌표(x-vercel-ip-latitude/longitude)만 쓴다.
//   - 좌표·IP·도시는 **저장도 로그도 하지 않는다**. 날씨 조회에만 쓰고 버린다(개인정보 라벨: 대략적 위치 · 앱 기능).
//   - Open-Meteo(무료, 키 없음) current weather_code·is_day + 오늘 일출·일몰 → { weather: clear|cloud|rain|snow|fog, isDay, sunrise, sunset }.
//   - 좌표를 소수 1자리(≈10km)로 반올림한 키로 10분 메모리 캐시.
// ============================================================
const cache = new Map();
const TTL = 10 * 60 * 1000;

function classify(code) {
  if (code == null) return "clear";
  if (code >= 95) return "storm";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code === 45 || code === 48) return "fog";
  if (code >= 1 && code <= 3) return "cloud";
  return "clear";
}

// ⚠️ 독립 함수(api/ambient.js)로 두면 Vercel Hobby 함수 12개 한도를 넘어 배포 전체가 실패한다(2026-10-22, 13개).
//    /api/ambient 는 vercel.json rewrite 로 /api/popular?kind=ambient 에 붙인다.
export default async function ambientHandler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "private, max-age=600");
  const lat = parseFloat(req.headers["x-vercel-ip-latitude"]);
  const lon = parseFloat(req.headers["x-vercel-ip-longitude"]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return res.status(200).json({ weather: "clear", isDay: true, known: false });
  const key = `${lat.toFixed(1)},${lon.toFixed(1)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return res.status(200).json(hit.body);
  try {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(2)}&longitude=${lon.toFixed(2)}&current=weather_code,is_day,wind_speed_10m,wind_direction_10m&daily=sunrise,sunset&timezone=auto&forecast_days=1&timeformat=unixtime`;
    const r = await fetch(u, { signal: AbortSignal.timeout(4000) });
    const j = await r.json();
    // 해 뜨는·지는 시각(unix 초) — 앱이 광원 위치(그림자 방향)를 하루 동안 옮기는 데 쓴다(vibesette useSky 와 같은 방식).
    const body = { weather: classify(j?.current?.weather_code), isDay: j?.current?.is_day !== 0, sunrise: j?.daily?.sunrise?.[0] ?? null, sunset: j?.daily?.sunset?.[0] ?? null, wind: j?.current?.wind_speed_10m ?? 0, windDir: j?.current?.wind_direction_10m ?? 0, known: true };
    cache.set(key, { at: Date.now(), body });
    return res.status(200).json(body);
  } catch (_) {
    return res.status(200).json({ weather: "clear", isDay: true, known: false });
  }
}
