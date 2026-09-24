import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { ApiError, fetchGallery, generateImage, type GenerateMeta, type GalleryItem } from "./api";
import { useAuth } from "./auth";
import { useQuota } from "./quota";
import { encodeForUpload, type EncodedPhoto, type PhotoRef } from "./photo";
import { RESULT_W, RESULT_H, fitResultToRatio, fitResultToSize, fileRatio } from "./fitToSize";
import { type Concept, ID_BGS, buildIdPhotoPrompt, conceptTitle, isArtOnly, isIdPhoto, isRestoreConcept } from "./concepts";
import { getPushToken } from "./push";
import { showInterstitial } from "./ads";
import { loadProfileRefs } from "./faceProfile";
import { clearLastDoneJob, setLastDoneJob } from "./lastJob";
import { FIRST_GEN_DONE_KEY, INVITE_CARD_DUE_KEY, getFlag, setFlag } from "./prefs";
import { copy } from "./copy";

// ============================================================================
// 생성 — SPEC §3: 만들기 → 홈으로 복귀 + 내 사진 진행 카드 → 완료 시 카드가 결과로 → 결과 화면.
//
// 웹 PortraitStudio.jsx 의 복구 로직을 그대로 옮겼다:
//   · 생성 시작 시 마커(rimikimi_pending_gen:<jobId>)를 남긴다(앱 재시작에도 생존, 10분 유효)
//   · fetch 자체가 끊기면(networkFail) 서버는 계속 만들고 있으므로 /api/gallery 를 5초마다,
//     최대 5분 폴링해 "시작 시각 이후 · 같은 컨셉" 결과를 찾는다. 갤러리 조회조차 3번 연속
//     실패하면 오프라인 → 포기.
//   · 402/429 같은 서버 거절은 즉시 실패로 보여준다.
//
// ⚠️ 마커·복구 가드는 **작업(job)별로 분리**돼 있다 (오너 보고 2026-09-18:
//    "이미지 생성 중일 때 다른거 이미지 생성 또 요청하면 생성 안하네??").
//    예전엔 마커가 전역 키 하나(rimikimi_pending_gen)라 두 요청이 같은 자리에 덮어썼고,
//    먼저 끝난 요청의 clearPendingGen() 이 **남의 마커까지 지웠다** → 남은 요청이 끊기면
//    복구할 근거가 사라져 "실패" 로 확정됐다(실제로는 서버가 만들어 갤러리에 넣어둔 상태).
//    복구 가드도 전역 boolean 하나라, 한 요청이 폴링 중이면 다른 요청은 복구 시도조차 못 했다.
//    그래서 마커는 작업당 키 1개, 복구 가드는 작업 id 집합(Set)으로 쪼갰다.
//    (키를 나눈 이유: 배열 한 칸에 모으면 읽기→쓰기 사이에 다른 작업이 끼어들어
//     서로의 항목을 날릴 수 있다. 작업마다 다른 키면 그 경합 자체가 없다.)
// ============================================================================

/** 구버전(2.0 이전) 단일 마커 키 — 이관용으로만 읽는다. */
const PENDING_GEN_LEGACY_KEY = "rimikimi_pending_gen";
/** 신버전: 작업 하나당 키 하나. 전체 키는 `${PENDING_GEN_PREFIX}${jobId}`. */
const PENDING_GEN_PREFIX = "rimikimi_pending_gen:";
const PENDING_GEN_MAX_AGE = 10 * 60 * 1000;
const RECOVER_WINDOW_MS = 5 * 60 * 1000;
const RECOVER_INTERVAL_MS = 5000;
const RECOVER_OFFLINE_STRIKES = 3;

export interface ResultImage { uri: string; galleryId?: string; galleryExpiresAt?: string }

export interface Job {
  id: string;
  concept: Concept;
  count: number;
  startedAt: number;
  status: "running" | "waiting" | "done" | "failed";
  error?: string;
  images: ResultImage[];
  /** 결과 화면에서 "한 장 더" 를 위해 보관 */
  input?: JobInput;
}

export interface JobInput {
  concept: Concept;
  photo: PhotoRef;
  partner?: PhotoRef | null;
  garments?: PhotoRef[];
  dressStyle?: "mirror" | "model";
  batchCount: number;
  fourcutCount?: number;
  fourcutStyle?: string;
  /** 증명사진: 정장색 키 + 배경 hex (concepts.ts ID_SUITS/ID_BGS) */
  idSuit?: string;
  idBg?: string;
}

interface PendingMarker { jobId: string; startedAt: number; conceptId: string | number; conceptTitle: string; count: number }

const pendingKey = (jobId: string) => `${PENDING_GEN_PREFIX}${jobId}`;

async function writePendingGen(p: PendingMarker) {
  try { await AsyncStorage.setItem(pendingKey(p.jobId), JSON.stringify(p)); } catch { /* ignore */ }
}

/** **자기 작업 것만** 지운다. 예전엔 전역 키라 먼저 끝난 작업이 남의 마커까지 지웠다. */
async function clearPendingGen(jobId: string) {
  try { await AsyncStorage.removeItem(pendingKey(jobId)); } catch { /* ignore */ }
}

async function readPendingGen(jobId: string): Promise<PendingMarker | null> {
  try {
    const p = JSON.parse((await AsyncStorage.getItem(pendingKey(jobId))) || "null") as PendingMarker | null;
    if (!p || !p.startedAt) return null;
    if (Date.now() - p.startedAt > PENDING_GEN_MAX_AGE) { await clearPendingGen(jobId); return null; }
    return p;
  } catch { return null; }
}

/**
 * 구버전 단일 마커를 작업별 키로 옮긴다. 업데이트 직후(=구버전이 남긴 마커가 있는 채로 첫 실행)
 * 진행 중이던 건을 잃지 않기 위한 이관. 한 번 옮기면 구버전 키는 지운다.
 */
async function migrateLegacyPendingGen() {
  try {
    const raw = await AsyncStorage.getItem(PENDING_GEN_LEGACY_KEY);
    if (!raw) return;
    await AsyncStorage.removeItem(PENDING_GEN_LEGACY_KEY);
    const p = JSON.parse(raw) as PendingMarker | null;
    if (!p || !p.startedAt) return;
    if (Date.now() - p.startedAt > PENDING_GEN_MAX_AGE) return;  // 만료된 건 옮길 필요 없다
    // 구버전도 jobId 를 넣어 저장했지만, 없더라도 복구가 돌아가도록 시작 시각으로 하나 만들어 준다.
    const jobId = p.jobId || `job_legacy_${p.startedAt}`;
    await writePendingGen({ ...p, jobId });
  } catch { /* ignore */ }
}

/** 살아 있는 마커 **전부**. 만료·깨진 건 지우면서 읽는다(오래된 키가 쌓이지 않게). */
async function readPendingGens(): Promise<PendingMarker[]> {
  await migrateLegacyPendingGen();
  let keys: readonly string[];
  try { keys = await AsyncStorage.getAllKeys(); } catch { return []; }
  const out: PendingMarker[] = [];
  for (const k of keys) {
    if (!k.startsWith(PENDING_GEN_PREFIX)) continue;
    let p: PendingMarker | null = null;
    try { p = JSON.parse((await AsyncStorage.getItem(k)) || "null") as PendingMarker | null; } catch { /* 깨진 값 */ }
    if (!p || !p.startedAt || Date.now() - p.startedAt > PENDING_GEN_MAX_AGE) {
      try { await AsyncStorage.removeItem(k); } catch { /* ignore */ }
      continue;
    }
    // 키에서 jobId 를 복원해 둔다 — 값 쪽 jobId 가 비어 있어도 복구가 그 작업을 가리키게.
    out.push({ ...p, jobId: p.jobId || k.slice(PENDING_GEN_PREFIX.length) });
  }
  return out.sort((a, b) => b.startedAt - a.startedAt);  // 최신 먼저
}

interface GenerationValue {
  jobs: Job[];
  /** 만들기 — 로그인은 호출부(requireLogin)가 보장한다. 즉시 돌아오고 카드가 진행을 보여준다. */
  start: (input: JobInput) => string;
  dismiss: (jobId: string) => void;
  job: (jobId: string | undefined) => Job | undefined;
}

const Ctx = createContext<GenerationValue | null>(null);
export function useGeneration(): GenerationValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useGeneration outside GenerationProvider");
  return v;
}

let seq = 0;

export function GenerationProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const { quota, loaded: quotaLoaded, refresh: refreshQuota } = useQuota();
  const [jobs, setJobs] = useState<Job[]>([]);
  // 전면광고 대상인가 — 1.x PortraitStudio.jsx 의 `showAds` 와 **같은 식**이다:
  //   showAds = quotaLoaded && !unlimited && credits === 0
  // (무제한 계정·유료 크레딧 보유자는 제외 = 무료 사용자만). 규칙을 새로 만들지 않았다.
  // ref 로 두는 이유: start() 의 deps 에 크레딧을 넣으면 숫자가 바뀔 때마다 start 가
  // 새로 만들어진다. 값은 **만들기를 누른 시점**에 한 번 읽는다 — 1.x 도 생성 시작 시점의
  // 값을 클로저에 담고 있었다(생성으로 크레딧이 깎여도 그 판정은 안 바뀐다).
  const showAdsRef = useRef(false);
  showAdsRef.current = quotaLoaded && !!quota && !quota.unlimited && quota.credits === 0;
  // 복구 중인 작업 id 집합. 예전엔 boolean 하나라 한 작업이 폴링 중이면 다른 작업은
  // 복구 시도조차 못 했다. 이제 **같은 작업의 중복 폴링만** 막고 다른 작업은 통과시킨다.
  const recovering = useRef<Set<string>>(new Set());
  const tokenRef = useRef<string | undefined>(undefined);
  tokenRef.current = session?.access_token;
  // 지금 로그인한 사람. 작업은 시작한 사람 것이다 — 로그아웃·계정 전환 뒤 늦게 끝난 결과가
  // 다음 사람 화면에 뜨지 않게, 시작 시 owner 를 잡아 두고 결과를 쓸 때 대조한다.
  const uid = session?.user?.id;
  const uidRef = useRef<string | undefined>(uid);
  uidRef.current = uid;
  const prevUid = useRef<string | undefined>(uid);
  useEffect(() => {
    if (prevUid.current && prevUid.current !== uid) {
      // 로그아웃(또는 다른 계정) — 앞사람의 진행/완성 카드·복구 마커·푸시 대상을 전부 버린다.
      setJobs([]);
      void (async () => {
        try {
          const keys = await AsyncStorage.getAllKeys();
          await AsyncStorage.multiRemove(keys.filter((k) => k.startsWith(PENDING_GEN_PREFIX) || k === PENDING_GEN_LEGACY_KEY));
        } catch { /* ignore */ }
        await clearLastDoneJob();
      })();
    }
    prevUid.current = uid;
  }, [uid]);

  const patch = useCallback((id: string, p: Partial<Job>) => {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...p } : j)));
  }, []);

  // 첫 생성 완료 → 홈 상단 초대 카드 1회 (SPEC §3). ATT 는 iOS 전용이라 안드로이드는 초대 카드만.
  const noteDone = useCallback(async () => {
    if (await getFlag(FIRST_GEN_DONE_KEY)) return;
    await setFlag(FIRST_GEN_DONE_KEY, true);
    await setFlag(INVITE_CARD_DUE_KEY, true);
  }, []);

  // 갤러리를 한 번 조회해 방금 만든 결과를 찾는다. true / false / "offline".
  const lookupPendingResult = useCallback(async (p: PendingMarker): Promise<boolean | "offline"> => {
    const token = tokenRef.current;
    if (!token) return false;
    const owner = uidRef.current;
    let items: GalleryItem[];
    try {
      items = await fetchGallery(token);
    } catch {
      return "offline";
    }
    const mine = items.filter(
      (it) => it.url && String(it.conceptId) === String(p.conceptId) && new Date(it.createdAt).getTime() >= p.startedAt - 5000
    );
    if (mine.length && uidRef.current === owner) {
      const images = mine.map((it) => ({ uri: it.url!, galleryId: it.id, galleryExpiresAt: it.expiresAt }));
      setJobs((prev) => {
        const exists = prev.some((j) => j.id === p.jobId);
        const done: Job = {
          id: p.jobId,
          concept: { id: p.conceptId, title: p.conceptTitle },
          count: p.count,
          startedAt: p.startedAt,
          status: "done",
          images,
        };
        return exists ? prev.map((j) => (j.id === p.jobId ? { ...j, status: "done", images, error: undefined } : j)) : [done, ...prev];
      });
      await clearPendingGen(p.jobId);
      refreshQuota();
      void noteDone();
      void setLastDoneJob({ jobId: p.jobId, conceptId: String(p.conceptId), title: p.conceptTitle, url: images[0].uri });
      return true;
    }
    return false;
  }, [refreshQuota, noteDone]);

  /** 작업 하나를 갤러리에서 되찾는다. 가드·마커 모두 그 작업 id 로만 본다. */
  const tryRecover = useCallback(async (jobId: string, { poll }: { poll: boolean }): Promise<boolean> => {
    if (recovering.current.has(jobId)) return false;
    recovering.current.add(jobId);
    try {
      let strikes = 0;
      for (;;) {
        const p = await readPendingGen(jobId);
        if (!p) return false;
        const r = await lookupPendingResult(p);
        if (r === true) return true;
        if (r === "offline") { if (++strikes >= RECOVER_OFFLINE_STRIKES) return false; } else strikes = 0;
        if (!poll || Date.now() - p.startedAt > RECOVER_WINDOW_MS) return false;
        patch(p.jobId, { status: "waiting" });
        await new Promise((res) => setTimeout(res, RECOVER_INTERVAL_MS));
      }
    } finally {
      recovering.current.delete(jobId);
    }
  }, [lookupPendingResult, patch]);

  // 앱 시작·복귀 시 살아 있는 마커가 있으면 갤러리에서 되찾는다.
  // 마커가 여러 개면 **전부** 돌린다 — 예전엔 전역 키라 한 건밖에 없었고, 지금은
  // 동시에 여러 건이 떠 있을 수 있어서 하나만 되살리면 나머지가 그대로 묻힌다.
  useEffect(() => {
    if (!session?.access_token) return;
    const run = () => {
      void (async () => {
        for (const p of await readPendingGens()) await tryRecover(p.jobId, { poll: false });
      })();
    };
    run();
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") run(); });
    return () => sub.remove();
  }, [session?.access_token, tryRecover]);

  const start = useCallback<GenerationValue["start"]>((input) => {
    // ⚠️ 여기에 "이미 돌고 있으면 return" 같은 가드를 넣지 말 것 — 동시에 여러 건을 만들 수 있어야 한다.
    //    아래 마커·복구는 전부 이 id 기준이라 작업끼리 서로의 상태를 건드리지 않는다.
    const id = `job_${Date.now()}_${++seq}`;
    const { concept } = input;
    const count = input.fourcutCount ?? (isArtOnly(concept) ? 1 : input.batchCount);
    const startedAt = Date.now();
    const job: Job = { id, concept, count, startedAt, status: "running", images: [], input };
    const showAds = showAdsRef.current; // 1.x 와 같이 "누른 시점" 판정
    const owner = uidRef.current;
    const mine = () => uidRef.current === owner; // 끝났을 때도 같은 사람인가
    setJobs((prev) => [job, ...prev]);
    // 햅틱은 확정 시점에만 — 만들기가 확정된 지금.
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);

    (async () => {
      const token = tokenRef.current;
      if (!token) { patch(id, { status: "failed", error: copy.errors.needLogin }); return; }
      await writePendingGen({ jobId: id, startedAt, conceptId: concept.id, conceptTitle: conceptTitle(concept), count });
      try {
        const photo = await encodeForUpload(input.photo, 1024);
        // 1.x 와 동일: 이 기기의 푸시 토큰(완료 알림용) + 페이스 프로필 앵커(있을 때만, 요청 1회용).
        const meta: GenerateMeta = { id: concept.id, title: concept.title, pushToken: getPushToken() };
        let promptText = concept.text || "";
        if (!isArtOnly(concept)) {
          try { meta.faceRefs = await loadProfileRefs(); } catch { meta.faceRefs = []; }
        }
        if (input.fourcutCount) {
          promptText = "인생네컷";
          meta.fourcutStyle = input.fourcutStyle;
          meta.cutCount = input.fourcutCount;
          meta.keepRatio = false;
        } else {
          meta.skipFacePrecheck = isArtOnly(concept);
          meta.keepRatio = isRestoreConcept(concept);
          meta.count = count;
          if (isIdPhoto(concept)) {
            const bg = ID_BGS.find((b) => b.hex.toLowerCase() === (input.idBg || "").toLowerCase()) || { hex: input.idBg || ID_BGS[0].hex, name: "custom solid" };
            const suit = input.idSuit || "dark navy";
            promptText = buildIdPhotoPrompt(suit, bg.hex, bg.name);
            meta.idSuit = suit;
            meta.idBg = bg.hex;
            meta.idBgName = bg.name;
          }
          if (input.partner) meta.photo2 = await encodeForUpload(input.partner, 1024);
          if (input.garments && input.garments.length) {
            const garments: EncodedPhoto[] = [];
            for (const g of input.garments.slice(0, 5)) garments.push(await encodeForUpload(g, 896));
            meta.garments = garments;
            meta.dressStyle = input.dressStyle ?? "mirror";
          }
        }
        const r = await generateImage(token, photo, promptText, meta);
        // 웹과 동일한 결과 재크롭(fitToSize/fitToRatio) — 표시·저장·공유 전에 1회 적용.
        // keepRatio(사진 복원) 만 원본 비율로 크롭, 그 외(인생네컷·묶음·증명사진 포함)는 768×1024.
        const ratio = meta.keepRatio ? (await fileRatio(input.photo.uri)) ?? RESULT_W / RESULT_H : null;
        const fitOne = (dataUrl: string) => (ratio ? fitResultToRatio(dataUrl, ratio) : fitResultToSize(dataUrl));
        const images: ResultImage[] = r.batch
          ? await Promise.all(r.batch.map(async (b) => ({ uri: await fitOne(b.imageDataUrl), galleryId: b.galleryId, galleryExpiresAt: b.galleryExpiresAt })))
          : [{ uri: await fitOne(r.imageDataUrl), galleryId: r.galleryId, galleryExpiresAt: r.galleryExpiresAt }];
        await clearPendingGen(id);
        if (!mine()) return; // 그새 로그아웃·계정 전환 — 결과를 다음 사람에게 보이지 않는다
        patch(id, { status: "done", images });
        refreshQuota();
        void noteDone();
        if (images[0]) void setLastDoneJob({ jobId: id, conceptId: String(concept.id), title: conceptTitle(concept), url: images[0].uri });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        // 무료 사용자 → 생성이 끝난 뒤 전면광고 1회 (1.x src/PortraitStudio.jsx 와 같은 자리·같은 조건).
        // ⚠️ await 금지 — 광고가 늦거나 실패해도 이 흐름이 여기서 멈추면 안 된다.
        if (showAds) void showInterstitial();
      } catch (err) {
        const e = err as ApiError;
        const recovered = await tryRecover(id, { poll: !!e?.networkFail });
        if (!recovered) {
          await clearPendingGen(id);
          if (!mine()) return;
          patch(id, { status: "failed", error: e?.message || copy.errors.genFail });
          if (e?.quotaExceeded) refreshQuota();
        }
      }
    })();
    return id;
  }, [patch, refreshQuota, tryRecover, noteDone]);

  const dismiss = useCallback((jobId: string) => setJobs((prev) => prev.filter((j) => j.id !== jobId)), []);
  const job = useCallback((jobId: string | undefined) => jobs.find((j) => j.id === jobId), [jobs]);

  const value = useMemo<GenerationValue>(() => ({ jobs, start, dismiss, job }), [jobs, start, dismiss, job]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
