import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { ApiError, fetchGallery, generateImage, type GenerateMeta, type GalleryItem } from "./api";
import { useAuth } from "./auth";
import { useQuota } from "./quota";
import { encodeForUpload, type EncodedPhoto, type PhotoRef } from "./photo";
import { RESULT_W, RESULT_H, fitResultToRatio, fitResultToSize, fileRatio } from "./fitToSize";
import { type Concept, ID_BGS, buildIdPhotoPrompt, isArtOnly, isIdPhoto, isRestoreConcept } from "./concepts";
import { getPushToken } from "./push";
import { loadProfileRefs } from "./faceProfile";
import { setLastDoneJob } from "./lastJob";
import { FIRST_GEN_DONE_KEY, INVITE_CARD_DUE_KEY, getFlag, setFlag } from "./prefs";

// ============================================================================
// 생성 — SPEC §3: 만들기 → 홈으로 복귀 + 내 사진 진행 카드 → 완료 시 카드가 결과로 → 결과 화면.
//
// 웹 PortraitStudio.jsx 의 복구 로직을 그대로 옮겼다:
//   · 생성 시작 시 마커(rimikimi_pending_gen)를 남긴다(앱 재시작에도 생존, 10분 유효)
//   · fetch 자체가 끊기면(networkFail) 서버는 계속 만들고 있으므로 /api/gallery 를 5초마다,
//     최대 5분 폴링해 "시작 시각 이후 · 같은 컨셉" 결과를 찾는다. 갤러리 조회조차 3번 연속
//     실패하면 오프라인 → 포기.
//   · 402/429 같은 서버 거절은 즉시 실패로 보여준다.
// ============================================================================

const PENDING_GEN_KEY = "rimikimi_pending_gen";
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

async function writePendingGen(p: PendingMarker) { try { await AsyncStorage.setItem(PENDING_GEN_KEY, JSON.stringify(p)); } catch { /* ignore */ } }
async function readPendingGen(): Promise<PendingMarker | null> {
  try {
    const p = JSON.parse((await AsyncStorage.getItem(PENDING_GEN_KEY)) || "null") as PendingMarker | null;
    if (!p || !p.startedAt) return null;
    if (Date.now() - p.startedAt > PENDING_GEN_MAX_AGE) { await clearPendingGen(); return null; }
    return p;
  } catch { return null; }
}
async function clearPendingGen() { try { await AsyncStorage.removeItem(PENDING_GEN_KEY); } catch { /* ignore */ } }

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
  const { refresh: refreshQuota } = useQuota();
  const [jobs, setJobs] = useState<Job[]>([]);
  const recovering = useRef(false);
  const tokenRef = useRef<string | undefined>(undefined);
  tokenRef.current = session?.access_token;

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
    let items: GalleryItem[];
    try {
      items = await fetchGallery(token);
    } catch {
      return "offline";
    }
    const mine = items.filter(
      (it) => it.url && String(it.conceptId) === String(p.conceptId) && new Date(it.createdAt).getTime() >= p.startedAt - 5000
    );
    if (mine.length) {
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
      await clearPendingGen();
      refreshQuota();
      void noteDone();
      void setLastDoneJob({ jobId: p.jobId, conceptId: String(p.conceptId), title: p.conceptTitle, url: images[0].uri });
      return true;
    }
    return false;
  }, [refreshQuota, noteDone]);

  const tryRecover = useCallback(async ({ poll }: { poll: boolean }): Promise<boolean> => {
    if (recovering.current) return false;
    recovering.current = true;
    try {
      let strikes = 0;
      for (;;) {
        const p = await readPendingGen();
        if (!p) return false;
        const r = await lookupPendingResult(p);
        if (r === true) return true;
        if (r === "offline") { if (++strikes >= RECOVER_OFFLINE_STRIKES) return false; } else strikes = 0;
        if (!poll || Date.now() - p.startedAt > RECOVER_WINDOW_MS) return false;
        patch(p.jobId, { status: "waiting" });
        await new Promise((res) => setTimeout(res, RECOVER_INTERVAL_MS));
      }
    } finally {
      recovering.current = false;
    }
  }, [lookupPendingResult, patch]);

  // 앱 시작·복귀 시 살아 있는 마커가 있으면 갤러리에서 되찾는다.
  useEffect(() => {
    if (!session?.access_token) return;
    const run = () => { void tryRecover({ poll: false }); };
    run();
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") run(); });
    return () => sub.remove();
  }, [session?.access_token, tryRecover]);

  const start = useCallback<GenerationValue["start"]>((input) => {
    const id = `job_${Date.now()}_${++seq}`;
    const { concept } = input;
    const count = input.fourcutCount ?? (isArtOnly(concept) ? 1 : input.batchCount);
    const startedAt = Date.now();
    const job: Job = { id, concept, count, startedAt, status: "running", images: [], input };
    setJobs((prev) => [job, ...prev]);
    // 햅틱은 확정 시점에만 — 만들기가 확정된 지금.
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);

    (async () => {
      const token = tokenRef.current;
      if (!token) { patch(id, { status: "failed", error: "로그인이 필요해요." }); return; }
      await writePendingGen({ jobId: id, startedAt, conceptId: concept.id, conceptTitle: concept.title, count });
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
        await clearPendingGen();
        patch(id, { status: "done", images });
        refreshQuota();
        void noteDone();
        if (images[0]) void setLastDoneJob({ jobId: id, conceptId: String(concept.id), title: concept.title, url: images[0].uri });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      } catch (err) {
        const e = err as ApiError;
        const recovered = await tryRecover({ poll: !!e?.networkFail });
        if (!recovered) {
          await clearPendingGen();
          patch(id, { status: "failed", error: e?.message || "이미지 생성에 실패했어요." });
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
