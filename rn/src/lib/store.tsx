import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { buildHome, loadConcepts, loadPopular, resolveFourcutStyles, type Concept, type FourcutStyle, type HomeData } from "./concepts";
import { loadRegisteredPhoto, type PhotoRef } from "./photo";
import {
  EMPTY_FAVORITES, FAVORITES_ALBUM, hasGenerated, loadFavorites, saveCategories, saveConcepts,
  saveMarks, withGenerated, withSaved, type FavoritesState,
} from "./favorites";
import { loadSeasons, orderCategories, type Season } from "./seasons";

// 컨셉 목록 + 홈 줄 + 등록 사진 — 앱 전체에 하나.

interface StoreValue {
  concepts: Concept[];
  loading: boolean;
  source: "remote" | "bundled" | null;
  home: HomeData | null;
  fourcutStyles: FourcutStyle[];
  byId: (id: string | number | undefined) => Concept | undefined;
  reload: () => void;
  /** 등록된 내 사진(기기 안) */
  photo: PhotoRef | null;
  setPhoto: (p: PhotoRef | null) => void;

  // ── 즐겨찾기 · 시즌 · "만든 컨셉" 표시 (오너 지시 2026-09-22, iOS 2.0 과 동일) ──
  favoriteCategories: string[];
  favoriteConcepts: string[];
  /** 활성 기간인 시즌 카테고리는 목록 맨 앞으로 — `seasons.ts orderCategories` 가 쓴다. */
  seasons: Season[];
  isFavoriteCategory: (name: string) => boolean;
  isFavoriteConcept: (id: string | number) => boolean;
  toggleFavoriteCategory: (name: string) => void;
  toggleFavoriteConcept: (id: string | number) => void;
  /** 격자 타일에 "만든 컨셉" 표시를 할지. */
  isGenerated: (id: string | number) => boolean;
  /** 생성 완료·갤러리 로드에서 부른다. */
  markGenerated: (entries: { id: string; at: number }[]) => void;
  /** 앨범에 저장했다 — 24시간이 지나도 표시가 남는다. */
  markSaved: (id: string | number) => void;
}

const Ctx = createContext<StoreValue | null>(null);
export function useStore(): StoreValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore outside StoreProvider");
  return v;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [popular, setPopular] = useState<Array<number | string>>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<StoreValue["source"]>(null);
  const [tick, setTick] = useState(0);
  const [photo, setPhoto] = useState<PhotoRef | null>(null);
  const [fav, setFav] = useState<FavoritesState>(EMPTY_FAVORITES);
  const [seasons, setSeasons] = useState<Season[]>([]);

  useEffect(() => {
    loadFavorites().then(setFav).catch(() => {});
    loadSeasons().then(setSeasons).catch(() => {});
  }, []);

  const toggleFavoriteCategory = useCallback((name: string) => {
    setFav((f) => {
      const on = f.categories.includes(name);
      const categories = on ? f.categories.filter((x) => x !== name) : [...f.categories, name];
      void saveCategories(categories);
      return { ...f, categories };
    });
  }, []);

  const toggleFavoriteConcept = useCallback((id: string | number) => {
    const key = String(id);
    setFav((f) => {
      const on = f.concepts.includes(key);
      const list = on ? f.concepts.filter((x) => x !== key) : [...f.concepts, key];
      void saveConcepts(list);
      return { ...f, concepts: list };
    });
  }, []);

  const markGenerated = useCallback((entries: { id: string; at: number }[]) => {
    if (!entries.length) return;
    setFav((f) => {
      const marks = withGenerated(f.marks, entries);
      void saveMarks(marks);
      return { ...f, marks };
    });
  }, []);

  const markSaved = useCallback((id: string | number) => {
    setFav((f) => {
      const marks = withSaved(f.marks, String(id));
      void saveMarks(marks);
      return { ...f, marks };
    });
  }, []);

  const isFavoriteCategory = useCallback((name: string) => fav.categories.includes(name), [fav.categories]);
  const isFavoriteConcept = useCallback((id: string | number) => fav.concepts.includes(String(id)), [fav.concepts]);
  const isGenerated = useCallback((id: string | number) => hasGenerated(fav.marks, String(id)), [fav.marks]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadConcepts().then(({ concepts: list, source: s }) => {
      if (cancelled) return;
      setConcepts(list);
      setSource(s);
      setLoading(false);
    });
    loadPopular().then((ids) => { if (!cancelled) setPopular(ids); });
    return () => { cancelled = true; };
  }, [tick]);

  useEffect(() => {
    loadRegisteredPhoto().then((p) => setPhoto(p));
  }, []);

  /**
   * 홈 = `buildHome` 결과에 **순서와 즐겨찾기 앨범**을 얹은 것.
   *
   * 오너 지시(2026-09-22):
   *  · 활성 기간인 시즌 카테고리가 **항상 맨 앞**.
   *  · 즐겨찾기한 카테고리가 그다음 — "실제로 배열도 바꿔주고".
   *  · **추천·새로 나왔어요 줄은 그대로 둔다**(순서를 건드리지 않는다).
   */
  const home = useMemo(() => {
    const base = concepts.length ? buildHome(concepts, popular) : null;
    if (!base) return null;
    const order = orderCategories(base.chips.map((c) => c.name), {
      seasons,
      favorites: fav.categories,
    });
    const rank = new Map(order.map((n, i) => [n, i]));
    const at = (n: string) => rank.get(n) ?? 9999;
    const rows = [...base.rows].sort((a, b) => at(a.name) - at(b.name));
    const chips = [...base.chips].sort((a, b) => at(a.name) - at(b.name));

    // "⭐ 즐겨찾기" 앨범 — 별을 단 컨셉만 모아 맨 앞에. 하나도 없으면 아예 안 보인다.
    const picked = fav.concepts
      .map((id) => concepts.find((c) => String(c.id) === id))
      .filter((c): c is Concept => !!c);
    if (picked.length) {
      rows.unshift({ name: FAVORITES_ALBUM, count: picked.length, items: picked.slice(0, 10) });
      chips.unshift({ name: FAVORITES_ALBUM, count: picked.length });
    }
    return { ...base, rows, chips };
  }, [concepts, popular, seasons, fav.categories, fav.concepts]);
  const fourcutStyles = useMemo(
    () => resolveFourcutStyles(concepts.find((c) => c.mode === "fourcut")?.fourcutStyles),
    [concepts]
  );
  const byId = useCallback((id: string | number | undefined) => (id == null ? undefined : concepts.find((c) => String(c.id) === String(id))), [concepts]);
  const reload = useCallback(() => setTick((n) => n + 1), []);

  const value = useMemo<StoreValue>(
    () => ({
      concepts, loading, source, home, fourcutStyles, byId, reload, photo, setPhoto,
      favoriteCategories: fav.categories, favoriteConcepts: fav.concepts, seasons,
      isFavoriteCategory, isFavoriteConcept, toggleFavoriteCategory, toggleFavoriteConcept,
      isGenerated, markGenerated, markSaved,
    }),
    [
      concepts, loading, source, home, fourcutStyles, byId, reload, photo,
      fav.categories, fav.concepts, seasons,
      isFavoriteCategory, isFavoriteConcept, toggleFavoriteCategory, toggleFavoriteConcept,
      isGenerated, markGenerated, markSaved,
    ]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
