import { getEnv } from "./env";
import { FAVORITES_ALBUM } from "./favorites";

// ============================================================================
// 컨셉 목록 — 원격 우선(https://rimikimi-app.vercel.app/concepts.json), 실패하면 번들 폴백.
// 판정 함수·홈 줄 구성은 웹 src/PortraitStudio.jsx 의 것을 그대로 옮겼다.
// ============================================================================

export interface FourcutStyle {
  key: string;
  label: string;
  emoji?: string;
}

export interface Concept {
  id: number | string;
  title: string;
  title_en?: string;
  category?: string;
  categories?: string[];
  text?: string;
  sensitive?: boolean;
  publishAt?: string;
  mode?: "couple" | "dressroom" | "fourcut" | "idphoto" | string;
  fourcutStyle?: string;
  fourcutStyles?: FourcutStyle[];
  pinFeatured?: number;
}

export const GARMENT_MAX = 5;
export const FOURCUT_COUNTS = [2, 3, 4, 6] as const;

// 번들 폴백 스타일(웹 src/fourcut.js). 서버 concepts.json 의 인생네컷 컨셉 `fourcutStyles` 가 우선.
export const FOURCUT_STYLES: FourcutStyle[] = [
  { key: "cute", label: "큐티", emoji: "🎀" },
  { key: "luxury", label: "럭셔리", emoji: "🖤" },
  { key: "funky", label: "펑키", emoji: "⚡" },
  { key: "playful", label: "플레이풀", emoji: "🎉" },
  { key: "birthday", label: "버스데이", emoji: "🎂" },
  { key: "film", label: "필름", emoji: "🎞" },
  { key: "summer", label: "썸머", emoji: "🌊" },
  { key: "mono", label: "모노", emoji: "◻️" },
  { key: "school", label: "교복", emoji: "🎒" },
  { key: "couple", label: "커플", emoji: "💑" },
  { key: "wedding", label: "웨딩", emoji: "💍" },
  { key: "party", label: "파티", emoji: "🥂" },
  { key: "beach", label: "여름", emoji: "🏖" },
  { key: "vintage", label: "빈티지", emoji: "📻" },
  { key: "christmas", label: "크리스마스", emoji: "🎄" },
  { key: "newtro", label: "뉴트로", emoji: "🕹" },
  { key: "editorial", label: "화보", emoji: "📷" },
];

export function resolveFourcutStyles(remote: unknown): FourcutStyle[] {
  if (!Array.isArray(remote)) return FOURCUT_STYLES;
  const list = (remote as Partial<FourcutStyle>[])
    .filter((s) => s && typeof s.key === "string" && s.key && typeof s.label === "string" && s.label)
    .map((s) => ({ ...(FOURCUT_STYLES.find((b) => b.key === s.key) || FOURCUT_STYLES[0]), ...s }) as FourcutStyle);
  return list.length ? list : FOURCUT_STYLES;
}

export const ART_CATEGORY = "🪄 매직 부스";
export const COUPLE_CATEGORY = "커플";

export function categoriesOf(c: Concept): string[] {
  return c.categories || (c.category ? [c.category] : []);
}
export function isDressroom(c?: Concept | null): boolean { return c?.mode === "dressroom"; }
export function isArtConcept(c?: Concept | null): boolean { return !!c && categoriesOf(c).includes(ART_CATEGORY); }
export function isCoupleConcept(c?: Concept | null): boolean {
  if (!c) return false;
  if (c.mode === "couple") return true;
  return categoriesOf(c).includes(COUPLE_CATEGORY);
}
export function isIdPhoto(c?: Concept | null): boolean { return !!c && (c.mode === "idphoto" || /증명사진/.test(c.title || "")); }

// 증명사진 옵션 — 웹 src/PortraitStudio.jsx 의 ID_SUITS/ID_BGS/ID_DISCLAIMER 를 그대로 옮긴 것.
// 실제 정장·배경 스와치 색이라 UI 테마 토큰이 아니다(라이트/다크 무관, 웹과 동일한 값 고정).
export interface IdSuit { key: string; label: string; css: string }
export const ID_SUITS: IdSuit[] = [
  { key: "dark navy", label: "다크 네이비", css: "#1f2a44" },
  { key: "charcoal dark grey", label: "다크 그레이", css: "#3b3e44" },
  { key: "light grey", label: "라이트 그레이", css: "#b7bcc4" },
  { key: "black", label: "블랙", css: "#15171a" },
];
export interface IdBg { hex: string; name: string }
export const ID_BGS: IdBg[] = [
  { hex: "#FFFFFF", name: "pure white" },
  { hex: "#f7f4f5", name: "soft warm light grey" },
  { hex: "#fff9eb", name: "warm ivory cream" },
  { hex: "#ffeaeb", name: "soft pastel pink" },
  { hex: "#c4ecf0", name: "light sky blue" },
  { hex: "#a5d2d8", name: "soft muted teal" },
  { hex: "#1b3c5a", name: "deep navy blue" },
  { hex: "#4d3f64", name: "deep muted purple" },
];
/** 웹 buildIdPhotoPrompt() 그대로 — 서버가 idSuit/idBg 로 프롬프트를 조립하지만
 * 구버전 호환용으로 완성된 프롬프트 문자열도 함께 보낸다. */
export function buildIdPhotoPrompt(suitKey: string, bgHex: string, bgName: string): string {
  return (
    "Create a clean, professional ID / passport-style photograph of the person in the provided photo. " +
    "Keep their exact face, identity, facial features and natural likeness — do not beautify, slim, or change who they are. " +
    "Front-facing head-AND-shoulders headshot, looking straight at the camera, neutral relaxed expression with the mouth closed, " +
    "eyes open and clearly visible, face and both ears visible, hair tidy, no hat and no sunglasses. " +
    "Framing: do not crop tightly on the face — leave a little space above the hair and include the full shoulder line down to the upper chest (standard ID photo crop); never cut off the shoulders. " +
    "Dress the person in a formal " + suitKey + " suit jacket over a crisp collared shirt with a BESPOKE, made-to-measure tailored fit precisely tailored to the person's own frame. " +
    "It must look completely real and natural (realistic fabric texture, natural lapels/folds and shadows, seamless transitions at the neck and shoulders; clean tailored shoulders following the natural shoulder line; never flat, pasted-on, plastic, or costume-like). " +
    "Replace the background with a solid " + bgName + " (" + bgHex + ") studio backdrop that has a very subtle, smooth gradient — " +
    "slightly brighter just behind the head and gently darker toward the edges. " +
    "Soft, even studio lighting with no harsh shadows on the face or the background. " +
    "Sharp focus, high resolution, true-to-life natural skin tones, vertical portrait composition centered like an official ID photo."
  );
}

export const ID_DISCLAIMER =
  "AI로 생성된 증명사진이에요. 공공기관·여권·비자 심사 등 공식 제출용으로는 규격 불일치로 거절될 수 있으니 참고용으로 사용해 주세요.";
export function isFourcut(c?: Concept | null): boolean { return !!c && (c.mode === "fourcut" || /인생네컷/.test(c.title || "")); }
export function isRestoreConcept(c?: Concept | null): boolean { return !!c && (Number(c.id) === 408 || /복원|restor/i.test(c.title || "")); }
export function isFeatureConcept(c: Concept): boolean { return isArtConcept(c) || isIdPhoto(c) || isFourcut(c); }
/** 일회용 사진을 쓰는 아트 변환(드레스룸 제외) */
export function isArtOnly(c?: Concept | null): boolean { return isArtConcept(c) && !isDressroom(c); }

export function byNewest(a: Concept, b: Concept): number {
  const ta = a.publishAt ? Date.parse(a.publishAt) : 0;
  const tb = b.publishAt ? Date.parse(b.publishAt) : 0;
  if (ta !== tb) return tb - ta;
  return Number(b.id) - Number(a.id);
}

// 카테고리 칩 노출 순서(웹 CATEGORY_ORDER). "🎞️ 필터" 는 2.0 에서 필터 탭으로 갔으므로 칩에 없다.
export const CATEGORY_ORDER = [
  "🪄 매직 부스",
  "📸 인생네컷",
  "세계여행",
  "일상 스냅",
  "스튜디오 프로필",
  "하이패션 / 화보",
  "웨딩 / 브라이덜",
  "커플",
  "남성",
  "스트릿 패션",
  "파티 / 이벤트",
  "비치 / 리조트",
  "예술 / 클래식",
  "판타지 / 콘셉트",
];

/**
 * 어떤 앨범(카테고리)에 속한 컨셉들 — 최신순.
 *
 * "⭐ 즐겨찾기" 는 실제 카테고리가 아니라 **여기서 가로채는 특별한 이름**이다. 별을 단 순서를
 * 그대로 쓴다(최신순으로 다시 정렬하지 않는다 — 사용자가 고른 순서가 더 뜻이 있다).
 */
export function conceptsIn(pool: Concept[], name: string, favoriteConcepts: string[]): Concept[] {
  if (name === FAVORITES_ALBUM) {
    return favoriteConcepts
      .map((id) => pool.find((c) => String(c.id) === id))
      .filter((c): c is Concept => !!c);
  }
  return pool.filter((c) => categoriesOf(c).includes(name)).sort(byNewest);
}

export function thumbUrl(id: number | string): string {
  return `${getEnv().apiBase}/thumbs/${id}.webp`;
}

export async function loadConcepts(): Promise<{ concepts: Concept[]; source: "remote" | "bundled" }> {
  try {
    const r = await fetch(`${getEnv().apiBase}/concepts.json`, { cache: "no-cache" });
    const data = (await r.json()) as unknown;
    if (Array.isArray(data) && data.length) return { concepts: data as Concept[], source: "remote" };
  } catch {
    /* 번들 폴백 */
  }
  const bundled = (await import("@/assets/data/concepts.fallback.json")).default as Concept[];
  return { concepts: bundled, source: "bundled" };
}

export async function loadPopular(): Promise<Array<number | string>> {
  try {
    const r = await fetch(`${getEnv().apiBase}/api/popular`);
    const j = (await r.json()) as { popular?: { id: number | string }[] };
    return Array.isArray(j?.popular) ? j.popular.map((x) => x.id) : [];
  } catch {
    return [];
  }
}

export interface CategoryRow { name: string; count: number; items: Concept[] }

export interface HomeData {
  featured: Concept[];
  newest: Concept[];
  rows: CategoryRow[];
  chips: { name: string; count: number }[];
}

/** 웹 HomeLayout 의 homeData 계산을 그대로 옮긴 것. */
export function buildHome(pool: Concept[], popular: Array<number | string>): HomeData {
  const byId = new Map(pool.map((p) => [String(p.id), p]));
  let featured = popular.map((id) => byId.get(String(id))).filter((p): p is Concept => !!p).slice(0, 5);
  if (featured.length < 5) {
    const have = new Set(featured.map((p) => String(p.id)));
    const fill = [...pool].sort(byNewest).filter((p) => !have.has(String(p.id)));
    featured = [...featured, ...fill].slice(0, 5);
  }
  const pinned = pool.filter((p) => Number(p.pinFeatured) > 0).sort((a, b) => Number(a.pinFeatured) - Number(b.pinFeatured));
  for (const p of pinned) {
    featured = featured.filter((f) => String(f.id) !== String(p.id));
    const at = Math.min(Math.max(1, Number(p.pinFeatured)), featured.length + 1);
    featured.splice(at - 1, 0, p);
  }
  featured = featured.slice(0, 5);

  const newest = [...pool].filter((p) => !isFeatureConcept(p)).sort(byNewest).slice(0, 10);

  const byCat = new Map<string, { items: Concept[]; latest: number }>();
  for (const p of pool) {
    const key = p.publishAt ? Date.parse(p.publishAt) : Number(p.id);
    for (const cat of categoriesOf(p)) {
      if (!byCat.has(cat)) byCat.set(cat, { items: [], latest: -Infinity });
      const g = byCat.get(cat)!;
      g.items.push(p);
      if (key > g.latest) g.latest = key;
    }
  }
  const rows: CategoryRow[] = Array.from(byCat.entries())
    .map(([name, g]) => ({ name, latest: g.latest, count: g.items.length, items: g.items.sort(byNewest).slice(0, 10) }))
    .sort((a, b) => b.latest - a.latest)
    .map(({ name, count, items }) => ({ name, count, items }));

  const chips = Array.from(byCat.entries())
    .map(([name, g]) => ({ name, count: g.items.length }))
    .sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a.name);
      const ib = CATEGORY_ORDER.indexOf(b.name);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });

  return { featured, newest, rows, chips };
}

/** 비슷한 컨셉 — 같은 카테고리에서 최신순, 자기 자신 제외. */
export function similarConcepts(pool: Concept[], c: Concept, n = 10): Concept[] {
  const cats = new Set(categoriesOf(c));
  return pool
    .filter((p) => String(p.id) !== String(c.id) && categoriesOf(p).some((k) => cats.has(k)))
    .sort(byNewest)
    .slice(0, n);
}
