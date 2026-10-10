import { byNewest, categoriesOf, conceptLarge, conceptPool, conceptThumb, isFeatureConcept, type Concept } from "./concepts";
import { FAVORITES_ALBUM } from "./favorites";
import { activeSeasons, type Season } from "./seasons";
import { c21 } from "./copy21";
import { CATEGORY_EN, categoryLabel } from "./locale";

// ============================================================================
// 2.1 홈 계산 — iOS `ConceptStore.albumTiles` · `Purpose` · `concepts(for:)` 를 그대로 옮긴 것.
// ============================================================================

export type Purpose = "profile" | "snap" | "wedding" | "concept";
export const PURPOSES: Purpose[] = ["profile", "snap", "wedding", "concept"];

export const purposeTitle = (p: Purpose): string =>
  p === "profile" ? c21.purposeProfile : p === "snap" ? c21.purposeSnap : p === "wedding" ? c21.purposeWedding : c21.purposeConcept;

/** 카테고리 표시 이름 — 서버 이름표(category.<이름>)가 있으면 그것(iOS `Copy.category`). */
export const albumName = (name: string): string => c21.category(name, CATEGORY_EN[name] ?? categoryLabel(name));

/** 서버 데이터에 `purposes` 가 아직 없을 때 쓰는 카테고리(빌드 없이 데이터로 갈아끼운다). */
const FALLBACK_CATEGORY: Record<Purpose, string | null> = {
  profile: "스튜디오 프로필",
  snap: "일상 스냅",
  wedding: "웨딩 / 브라이덜",
  concept: null,
};
/** 표지 컨셉(오너 지정: 프사·소개팅 = 454 한옥카페 빙수). */
const COVER_ID: Partial<Record<Purpose, string>> = { snap: "454" };

export function newestOf(pool: Concept[], n = 10): Concept[] {
  return pool.filter((c) => !isFeatureConcept(c)).sort(byNewest).slice(0, n);
}

/** 목적에 들어가는 컨셉 — 서버가 `purposes` 로 정한 것, 없으면 대체 카테고리. */
export function conceptsForPurpose(all: Concept[], p: Purpose): Concept[] {
  const pool = conceptPool(all);
  const tagged = pool.filter((c) => (c.purposes ?? []).includes(p)).sort(byNewest);
  if (tagged.length) return tagged;
  const cat = FALLBACK_CATEGORY[p];
  if (cat) return pool.filter((c) => categoriesOf(c).includes(cat)).sort(byNewest);
  return newestOf(pool);
}

export function purposeCover(all: Concept[], p: Purpose): Concept | undefined {
  const id = COVER_ID[p];
  if (id) {
    const c = all.find((x) => String(x.id) === id);
    if (c) return c;
  }
  return p === "concept" ? newestOf(conceptPool(all))[0] : conceptsForPurpose(all, p)[0];
}

export interface AlbumTile { name: string; count: number; cover?: string; coverFallback?: string }

/**
 * 홈 앨범 격자 — 카테고리별 표지 1장 + 이름 + 장수.
 * 순서(iOS 그대로): 최근에 새 컨셉이 들어온 카테고리가 위 → 즐겨찾기 카테고리를 위로 →
 * 활성 시즌(서버 seasons.json 순서)을 맨 앞 → 고른 컨셉이 있으면 맨 앞에 "⭐ 즐겨찾기".
 */
export function albumTiles(all: Concept[], seasons: Season[], favCategories: string[], favConcepts: string[]): AlbumTile[] {
  const pool = conceptPool(all);
  const groups = new Map<string, { items: Concept[]; latest: number }>();
  for (const c of pool) {
    const key = c.publishAt ? Date.parse(c.publishAt) : Number(c.id) || 0;
    for (const cat of categoriesOf(c)) {
      const g = groups.get(cat) ?? { items: [], latest: -Infinity };
      g.items.push(c);
      if (key > g.latest) g.latest = key;
      groups.set(cat, g);
    }
  }
  let tiles: AlbumTile[] = [...groups.entries()]
    .sort((a, b) => b[1].latest - a[1].latest)
    .map(([name, g]) => {
      const first = [...g.items].sort(byNewest)[0];
      return { name, count: g.items.length, cover: first ? conceptLarge(first) : undefined, coverFallback: first ? conceptThumb(first) : undefined };
    });
  const fav = new Set(favCategories);
  tiles = [...tiles.filter((t) => fav.has(t.name)), ...tiles.filter((t) => !fav.has(t.name))];
  const season = [...new Set(activeSeasons(seasons).map((s) => s.category))];
  const seasonTiles = season.map((n) => tiles.find((t) => t.name === n)).filter((t): t is AlbumTile => !!t);
  tiles = [...seasonTiles, ...tiles.filter((t) => !season.includes(t.name))];
  const favItems = favConcepts.map((id) => pool.find((c) => String(c.id) === id)).filter((c): c is Concept => !!c);
  if (favItems.length) {
    tiles.unshift({ name: FAVORITES_ALBUM, count: favItems.length, cover: conceptLarge(favItems[0]), coverFallback: conceptThumb(favItems[0]) });
  }
  return tiles;
}
