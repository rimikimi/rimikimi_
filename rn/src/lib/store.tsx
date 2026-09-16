import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { buildHome, loadConcepts, loadPopular, resolveFourcutStyles, type Concept, type FourcutStyle, type HomeData } from "./concepts";
import { loadRegisteredPhoto, type PhotoRef } from "./photo";

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

  const home = useMemo(() => (concepts.length ? buildHome(concepts, popular) : null), [concepts, popular]);
  const fourcutStyles = useMemo(
    () => resolveFourcutStyles(concepts.find((c) => c.mode === "fourcut")?.fourcutStyles),
    [concepts]
  );
  const byId = useCallback((id: string | number | undefined) => (id == null ? undefined : concepts.find((c) => String(c.id) === String(id))), [concepts]);
  const reload = useCallback(() => setTick((n) => n + 1), []);

  const value = useMemo<StoreValue>(
    () => ({ concepts, loading, source, home, fourcutStyles, byId, reload, photo, setPhoto }),
    [concepts, loading, source, home, fourcutStyles, byId, reload, photo]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
