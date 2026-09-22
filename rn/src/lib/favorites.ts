import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * 즐겨찾기(카테고리·컨셉)와 "이미 만들어 본 컨셉" 표시 — 전부 기기에 저장한다.
 * iOS `FavoritesStore.swift` 를 그대로 옮긴 것(오너 지시 2026-09-22 "안드로이드도 동일하게").
 *
 * - **카테고리 즐겨찾기**: 홈 앨범 격자에서 위로 올라온다. 별은 카테고리 화면 오른쪽 위.
 * - **컨셉 즐겨찾기**: 홈 맨 위 "⭐ 즐겨찾기" 앨범으로 모인다. 별은 브라우저 오른쪽 위.
 * - **이미 만든 컨셉**: 격자 타일에 반투명 그라데이션 + 체크.
 *   ⚠️ 표시 규칙(오너 지시): **앨범에 저장까지 한 것만 영구 표시**. 저장 안 한 것은 보관 기간
 *   (24시간) 동안만 표시하고 지나면 **되돌린다** — 갤러리에서 사라진 결과를 "만든 컨셉"으로
 *   남겨 두면 사용자가 찾으러 갔다가 헛걸음한다.
 */

const CATEGORIES_KEY = "fav.categories.v1";
const CONCEPTS_KEY = "fav.concepts.v1";
/** v1 은 "만들었다"만 기록한 id 배열이었다. v2 는 만든 시각 + 저장 여부를 같이 둔다. */
const GENERATED_KEY = "gen.concepts.v2";
/** 저장 안 한 컨셉의 표시 수명 — 서버 갤러리 보관 기간과 같아야 한다(`api/_lib/gallery.js` TTL). */
export const UNSAVED_TTL_MS = 24 * 60 * 60 * 1000;

/** 즐겨찾기 앨범의 이름 — 실제 카테고리가 아니라 목록을 만들 때 가로채는 특별한 이름. */
export const FAVORITES_ALBUM = "⭐ 즐겨찾기";

/** 만든 기록 한 건. */
export interface Mark {
  /** 마지막으로 만든 시각(ms). 다시 만들면 갱신된다(갤러리에 다시 24시간 남으므로). */
  at: number;
  /** 앨범에 저장했는가. true 면 시간과 무관하게 계속 표시한다. */
  saved: boolean;
}

export interface FavoritesState {
  categories: string[];
  concepts: string[];
  marks: Record<string, Mark>;
}

export const EMPTY_FAVORITES: FavoritesState = { categories: [], concepts: [], marks: {} };

/** 저장 안 한 채 보관 기간이 지난 기록은 버린다 — 표시가 원래대로 돌아간다. */
export function pruneExpired(marks: Record<string, Mark>, now = Date.now()): Record<string, Mark> {
  const out: Record<string, Mark> = {};
  for (const [id, m] of Object.entries(marks)) {
    if (m.saved || now - m.at < UNSAVED_TTL_MS) out[id] = m;
  }
  return out;
}

/** "만든 컨셉" 표시 여부 — 앨범에 저장했으면 계속, 아니면 24시간 안일 때만. */
export function hasGenerated(marks: Record<string, Mark>, id: string, now = Date.now()): boolean {
  const m = marks[id];
  if (!m) return false;
  return m.saved || now - m.at < UNSAVED_TTL_MS;
}

/**
 * 생성 완료·갤러리 로드에서 부른다. `at` 은 그 결과가 만들어진 시각.
 * 더 최근 기록만 남긴다 — 다시 만들면 갤러리에 24시간이 새로 생기므로 표시도 같이 연장된다.
 */
export function withGenerated(
  marks: Record<string, Mark>,
  entries: { id: string; at: number }[],
): Record<string, Mark> {
  const next = { ...marks };
  for (const { id, at } of entries) {
    if (!id) continue;
    const old = next[id];
    if (old) {
      if (at <= old.at) continue;
      next[id] = { at, saved: old.saved };
    } else {
      next[id] = { at, saved: false };
    }
  }
  return pruneExpired(next);
}

/** 앨범에 저장했다 — 이제 시간이 지나도 표시가 남는다. */
export function withSaved(marks: Record<string, Mark>, id: string): Record<string, Mark> {
  if (!id) return marks;
  return { ...marks, [id]: { at: marks[id]?.at ?? Date.now(), saved: true } };
}

// ── 기기 저장 ───────────────────────────────────────────────────────────────

async function readJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function loadFavorites(): Promise<FavoritesState> {
  const [categories, concepts, marks] = await Promise.all([
    readJSON<string[]>(CATEGORIES_KEY, []),
    readJSON<string[]>(CONCEPTS_KEY, []),
    readJSON<Record<string, Mark>>(GENERATED_KEY, {}),
  ]);
  return { categories, concepts, marks: pruneExpired(marks) };
}

export async function saveCategories(v: string[]): Promise<void> {
  try { await AsyncStorage.setItem(CATEGORIES_KEY, JSON.stringify(v)); } catch { /* 무시 */ }
}
export async function saveConcepts(v: string[]): Promise<void> {
  try { await AsyncStorage.setItem(CONCEPTS_KEY, JSON.stringify(v)); } catch { /* 무시 */ }
}
export async function saveMarks(v: Record<string, Mark>): Promise<void> {
  try { await AsyncStorage.setItem(GENERATED_KEY, JSON.stringify(v)); } catch { /* 무시 */ }
}
