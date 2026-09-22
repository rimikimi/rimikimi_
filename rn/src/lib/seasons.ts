import { getEnv } from "./env";

/**
 * 시즌 — 명절·기념일 카테고리가 **그 기간에만 맨 앞으로** 올라오게 하는 표.
 * iOS `Season.swift` 를 그대로 옮긴 것(오너 지시 2026-09-22 "안드로이드도 동일하게").
 *
 * 추천·새로 나왔어요 줄은 그대로 두고, 그 아래 카테고리(앨범 격자·칩 줄)에서만 순서가 바뀐다.
 * 표는 서버(`/seasons.json`)에서 받는다 — 설날·추석처럼 해마다 날짜가 움직이는 시즌을 앱 업데이트
 * 없이 고치기 위해서다. 못 받으면 아무 시즌도 없는 것으로 친다(순서는 기본값 그대로).
 *
 * 날짜는 **KST 기준 날짜(`yyyy-MM-dd`)** 로만 적는다(시각·시간대 없음). `end` 는 그날까지 포함.
 */
export interface Season {
  /** 실제 컨셉에 붙어 있는 카테고리 이름과 **정확히 같아야** 한다. 다르면 조용히 아무 일도 안 일어난다. */
  category: string;
  name: string;
  start: string;
  end: string;
}

/** KST 자정의 UTC 시각(ms). 기기 시간대와 무관하게 같은 값이 나와야 한다. */
function kstMidnight(ymd: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  const [, y, mo, d] = m;
  // KST = UTC+9 → 그날 00:00 KST 는 전날 15:00 UTC.
  return Date.UTC(Number(y), Number(mo) - 1, Number(d), -9, 0, 0, 0);
}

/** `now` 가 시작일 00:00 ~ 종료일 24:00(KST) 안인가. */
export function isActive(s: Season, now: number = Date.now()): boolean {
  const start = kstMidnight(s.start);
  const end = kstMidnight(s.end);
  if (start === null || end === null) return false;
  return now >= start && now < end + 24 * 60 * 60 * 1000;
}

/** 지금 활성인 시즌들 — 표에 적힌 순서를 지킨다. */
export function activeSeasons(all: Season[], now: number = Date.now()): Season[] {
  return all.filter((s) => isActive(s, now));
}

export async function loadSeasons(): Promise<Season[]> {
  try {
    const r = await fetch(`${getEnv().apiBase}/seasons.json`, { cache: "no-cache" });
    const j = (await r.json()) as unknown;
    const rows = Array.isArray(j) ? j : (j as { seasons?: unknown })?.seasons;
    if (!Array.isArray(rows)) return [];
    return rows.filter(
      (s): s is Season =>
        !!s &&
        typeof (s as Season).category === "string" &&
        typeof (s as Season).start === "string" &&
        typeof (s as Season).end === "string",
    );
  } catch {
    return [];
  }
}

/**
 * 카테고리 순서 — **활성 시즌이 맨 앞**, 그다음 즐겨찾기, 나머지는 원래 순서.
 * (오너 지시: "활성화 기간에는 항상 제일 먼저 해당 카테고리가 보이도록. 추천이랑 New는 그대로 두고.")
 */
export function orderCategories(
  names: string[],
  opts: { seasons: Season[]; favorites: string[]; now?: number },
): string[] {
  const now = opts.now ?? Date.now();
  const season = activeSeasons(opts.seasons, now).map((s) => s.category);
  const fav = new Set(opts.favorites);
  const rank = (n: string) => {
    const si = season.indexOf(n);
    if (si >= 0) return si;                 // 시즌: 표에 적힌 순서대로 맨 앞
    return fav.has(n) ? 1000 : 2000;        // 그다음 즐겨찾기, 그다음 나머지
  };
  return names
    .map((n, i) => ({ n, i }))
    .sort((a, b) => rank(a.n) - rank(b.n) || a.i - b.i)   // 같은 등급이면 원래 순서 유지
    .map((x) => x.n);
}
