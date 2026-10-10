import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ToastAndroid } from "react-native";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import * as Haptics from "expo-haptics";
import { useAuth } from "./auth";
import { useStore } from "./store";
import { useGeneration, type JobInput } from "./generation";
import { useCreditGate } from "./creditGate";
import { useSaveAdGate } from "./saveAdGate";
import { ApiError, generateImage } from "./api";
import { encodeForUpload, pickPhotos, registerPhoto, type PhotoRef } from "./photo";
import { loadProfileRefs } from "./faceProfile";
import { showInterstitial } from "./ads";
import { saveDataUrlToAlbum } from "./nativeMedia";
import { conceptTitle, isArtOnly, isBatchable, type Concept } from "./concepts";
import {
  fetchStudioCatalog, fetchWeddingCatalog, type DressFilter, type StudioCatalog, type WeddingDress,
} from "./studio";
import { c21, loadLabels, labelsVersionSubscribe, t } from "./copy21";

// ============================================================================
// 2.1 앱 상태 — iOS `ios2/rimikimi/App/AppState.swift` 의 2.1 몫을 옮긴 것.
//   · 여러 장 담기(최대 8, 카테고리 상관없이) → "N장 만들기" = 컨셉마다 1장씩, 크레딧은 장수만큼
//   · 브루클린 룩·조세핀 드레스 카탈로그와 탭별 옵션(세부 조정·옷 사진·신랑 사진)
//   · 게스트 첫 1장(가입 없이, 기기당 1회, 미리보기 2장, 로그인은 "받기"에서)
//   · 튜토리얼(코치마크) 큐 · 토스트 · 크게 보기 목록 · 시작 화면 설정
// ============================================================================

export const CART_MAX = 8;
export const START_TAB_KEY = "ui.startTab";
const GUEST_USED_KEY = "guest.firstUsed";
const GUEST_ID_KEY = "rimikimi.guest.deviceId";
/**
 * 제3자 AI(Google Gemini) 전송 고지 — 첫 "만들기" 전 1회만(iOS `AppState.aiConsentKey`, 같은 키 이름).
 * v2(2026-10-07 리젝 5.1.1/5.1.2): 보내는 데이터·받는 곳을 명시한 문구. 동의하면 기기에 기록하고 다시 묻지 않는다.
 * "허용 안 함" = 이번 생성만 취소(대체 경로 없음). 다시 만들기를 누르면 또 뜬다.
 */
export const AI_CONSENT_KEY = "ai.consent.v2";

// ── 게스트 기기 ID ──────────────────────────────────────────────────────────
// iOS 는 키체인(앱을 지웠다 깔아도 같은 값). 안드로이드 SecureStore 는 앱을 지우면 같이 지워진다 —
// 그래도 서버(api/_lib/guestFirst.js)가 최종 판정이라 재설치 우회는 서버 쪽 몫이다.
async function guestDeviceId(): Promise<string> {
  try {
    const v = await SecureStore.getItemAsync(GUEST_ID_KEY);
    if (v) return v;
  } catch { /* 없음 */ }
  const id = Crypto.randomUUID();
  try { await SecureStore.setItemAsync(GUEST_ID_KEY, id); } catch { /* 저장 실패해도 이번 요청엔 쓴다 */ }
  return id;
}

// ── 튜토리얼(코치마크) ───────────────────────────────────────────────────────
export interface CoachStep { key: string; title: string; text: string }
export const Coach = {
  home: (): CoachStep[] => [
    { key: "cards", title: t("내 사진 고치기", "Fix your photos"), text: t("말로 적으면 그 부분만 고치고, 옛날 사진은 선명하게 되살려요.", "Describe a fix and only that part changes. Old photos come back sharp.") },
    { key: "purposes", title: t("목적 고르기", "Pick a purpose"), text: t("이력서·프사·웨딩·화보 중 고르면 거기에 맞는 룩이 나와요.", "Résumé, profile, wedding or concept — looks that fit appear.") },
    { key: "albums", title: t("컨셉 앨범", "Concept albums"), text: t("카테고리별로 모아 뒀어요. 앨범을 열어 둘러봐요.", "Grouped by category. Open one to browse.") },
    { key: "cameraTab", title: t("카메라·필터", "Camera"), text: t("찍고 필터를 입히는 건 여기서. 무료예요.", "Shoot and add filters here. Free.") },
  ],
  grid: (): CoachStep => ({ key: "firstTile", title: t("여러 개 담기", "Pick several"), text: t("길게 누르면 아래에 담겨요. 다른 카테고리와 섞어서 한 번에 8장까지. 탭하면 크게 보기.", "Press and hold to pick. Mix categories, up to 8 at once. Tap to view.") }),
  cart: (): CoachStep => ({ key: "cartMake", title: t("한 번에 만들기", "Make them at once"), text: t("담은 건 여기 모여요. 다 골랐으면 누르고 셀카 한 장이면 끝.", "Your picks gather here. Tap and add one selfie.") }),
  badge: (): CoachStep => ({ key: "cartBadge", title: t("담은 것", "Your picks"), text: t("다른 화면에 가도 그대로 있어요. 여기를 누르면 다시 열려요.", "They stay while you browse. Tap to open.") }),
  filter: (): CoachStep => ({ key: "filterStrip", title: t("필터 즐겨찾기", "Favorite filters"), text: t("필터를 길게 누르면 즐겨찾기에 들어가서 맨 앞에 모여요.", "Press and hold a filter to favorite it — favorites come first.") }),
};
const coachSeen = new Set<string>();
let coachLoaded = false;
async function loadCoachSeen() {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith("coach."));
    for (const k of keys) if ((await AsyncStorage.getItem(k)) === "1") coachSeen.add(k.slice(6));
  } catch { /* 없음 */ }
  coachLoaded = true;
}
function markCoachSeen(key: string) {
  coachSeen.add(key);
  void AsyncStorage.setItem(`coach.${key}`, "1").catch(() => undefined);
}

/** 크레딧 확인용 — 묶음(2장+)은 서버에서 크레딧 전용이다. */
export interface GenOpts { cost?: number; creditsOnly?: boolean }

export interface GuestFlow { title: string; images: string[]; error?: string }

interface App21Value {
  // 담기
  cart: Concept[];
  cartExpanded: boolean;
  setCartExpanded: (v: boolean) => void;
  cartIndex: (c: Concept) => number;
  toggleCart: (c: Concept, longPress?: boolean) => boolean;
  removeFromCart: (i: number) => void;
  clearCart: () => void;
  generateCart: (optionsDone?: boolean) => void;
  studioStep: boolean;
  setStudioStep: (v: boolean) => void;
  // 카탈로그·옵션
  catalog: StudioCatalog | null;
  dresses: WeddingDress[];
  loadStudio: () => void;
  overrides: Record<string, Record<string, unknown>>;
  setOverride: (purpose: string, key: string, v: unknown) => void;
  resetOverrides: (purpose: string) => void;
  outfit: Record<string, PhotoRef | undefined>;
  setOutfit: (purpose: string, p: PhotoRef | undefined) => void;
  groom: PhotoRef | null;
  setGroom: (p: PhotoRef | null) => void;
  dressFilter: DressFilter;
  setDressFilter: (f: DressFilter) => void;
  // 생성(옵션 화면·담기 공용)
  requestGenerate: (input: JobInput, opts?: GenOpts) => void;
  // 게스트
  guestFlow: GuestFlow | null;
  closeGuest: () => void;
  guestReceive: (uri: string) => void;
  // 크게 보기 목록(목적 칸·룩·드레스도 필름스트립으로)
  browseList: Concept[] | null;
  setBrowseList: (l: Concept[] | null) => void;
  // 튜토리얼
  coachStep: CoachStep | null;
  coachIndex: number;
  coachTotal: number;
  startHomeCoach: () => void;
  enqueueCoach: (s: CoachStep) => void;
  advanceCoach: () => void;
  skipCoach: () => void;
  // 제3자 AI 전송 동의
  consentOpen: boolean;
  agreeConsent: () => void;
  declineConsent: () => void;
  /** ⚠️ DEV 캡처용 — 동의 시트만 바로 연다(iOS dev/consent 와 같은 용도). 호출부가 __DEV__ 로 막는다. */
  devOpenConsent: () => void;
  // 그 밖
  toast: (m: string) => void;
  labelsVersion: number;
}

const Ctx = createContext<App21Value | null>(null);
export function useApp21(): App21Value {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp21 outside App21Provider");
  return v;
}

/** 셀카 한 장으로 되는 컨셉·룩·드레스만, 옵션(세부 조정·옷·신랑) 없이 — 서버도 같은 기준(403 needLogin). */
function guestEligible(i: JobInput): boolean {
  return isBatchable(i.concept)
    && Object.keys(i.studioOverrides ?? {}).length === 0 && !i.outfit && !i.groom;
}

export function App21Provider({ children }: { children: React.ReactNode }) {
  const { session, requireLogin } = useAuth();
  const { photo, setPhoto } = useStore();
  const { start } = useGeneration();
  const gate = useCreditGate();
  const adGate = useSaveAdGate();
  const signedIn = !!session?.user?.id;

  const [cart, setCart] = useState<Concept[]>([]);
  const [cartExpanded, setCartExpanded] = useState(false);
  const [studioStep, setStudioStep] = useState(false);
  const [catalog, setCatalog] = useState<StudioCatalog | null>(null);
  const [dresses, setDresses] = useState<WeddingDress[]>([]);
  const [overrides, setOverrides] = useState<Record<string, Record<string, unknown>>>({});
  const [outfit, setOutfitMap] = useState<Record<string, PhotoRef | undefined>>({});
  const [groom, setGroom] = useState<PhotoRef | null>(null);
  const [dressFilter, setDressFilter] = useState<DressFilter>({});
  const [guestFlow, setGuestFlow] = useState<GuestFlow | null>(null);
  const [browseList, setBrowseList] = useState<Concept[] | null>(null);
  const [coachQueue, setCoachQueue] = useState<CoachStep[]>([]);
  const [coachIndex, setCoachIndex] = useState(0);
  const [coachTotal, setCoachTotal] = useState(0);
  const [labelsVersion, setLabelsVersion] = useState(0);
  const [, setCoachReady] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const consentGiven = useRef(false);
  const pendingAfterConsent = useRef<(() => void) | null>(null);

  useEffect(() => {
    const off = labelsVersionSubscribe(() => setLabelsVersion((n) => n + 1));
    void loadLabels();
    void loadCoachSeen().then(() => setCoachReady(true));
    void AsyncStorage.getItem(AI_CONSENT_KEY).then((v) => { consentGiven.current = v === "1"; }).catch(() => undefined);
    return off;
  }, []);

  const toast = useCallback((m: string) => { ToastAndroid.show(m, ToastAndroid.SHORT); }, []);

  // ── 튜토리얼 ──
  const enqueueCoach = useCallback((s: CoachStep) => {
    if (!coachLoaded || coachSeen.has(s.key)) return;
    setCoachQueue((q) => {
      if (q.some((x) => x.key === s.key)) return q;
      if (q.length === 0) { setCoachIndex(0); setCoachTotal(1); }
      return [...q, s];
    });
  }, []);
  const startHomeCoach = useCallback(() => {
    if (!coachLoaded || coachSeen.has("home")) return;
    setCoachQueue((q) => {
      if (q.length) return q;
      const steps = Coach.home();
      setCoachIndex(0); setCoachTotal(steps.length);
      return steps;
    });
  }, []);
  const advanceCoach = useCallback(() => {
    setCoachQueue((q) => {
      const s = q[0];
      if (!s) return q;
      markCoachSeen(s.key);
      const rest = q.slice(1);
      setCoachIndex((i) => i + 1);
      if (!rest.length) {
        setCoachTotal((tot) => { if (tot > 1) markCoachSeen("home"); return 0; });
        setCoachIndex(0);
      }
      return rest;
    });
  }, []);
  const skipCoach = useCallback(() => {
    setCoachQueue((q) => { q.forEach((s) => markCoachSeen(s.key)); return []; });
    markCoachSeen("home");
    setCoachTotal(0); setCoachIndex(0);
  }, []);

  // ── 담기 ──
  const cartRef = useRef(cart);
  cartRef.current = cart;
  const cartIndex = useCallback((c: Concept) => cart.findIndex((x) => String(x.id) === String(c.id)), [cart]);
  const toggleCart = useCallback((c: Concept, longPress = false) => {
    const cur = cartRef.current;
    const haptic = () => (longPress
      ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)
      : Haptics.selectionAsync()).catch(() => undefined);
    const i = cur.findIndex((x) => String(x.id) === String(c.id));
    if (i >= 0) { setCart(cur.filter((_, n) => n !== i)); haptic(); return true; }
    if (cur.length >= CART_MAX) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
      toast(c21.cartFull(CART_MAX));
      return false;
    }
    setCart([...cur, c]);
    haptic();
    if (cur.length === 0) enqueueCoach(Coach.cart());
    return true;
  }, [toast, enqueueCoach]);
  const removeFromCart = useCallback((i: number) => setCart((cur) => cur.filter((_, n) => n !== i)), []);
  const clearCart = useCallback(() => { setCart([]); setCartExpanded(false); }, []);

  const loadStudio = useCallback(() => {
    if (!catalog) void fetchStudioCatalog().then((c) => { if (c) setCatalog(c); });
    if (!dresses.length) void fetchWeddingCatalog().then((d) => { if (d && Array.isArray(d)) setDresses(d); });
  }, [catalog, dresses.length]);

  const setOverride = useCallback((purpose: string, key: string, v: unknown) => {
    setOverrides((o) => {
      const cur = { ...(o[purpose] ?? {}) };
      if (v === undefined || v === null) delete cur[key]; else cur[key] = v;
      return { ...o, [purpose]: cur };
    });
  }, []);
  const resetOverrides = useCallback((purpose: string) => setOverrides((o) => ({ ...o, [purpose]: {} })), []);
  const setOutfit = useCallback((purpose: string, p: PhotoRef | undefined) => setOutfitMap((o) => ({ ...o, [purpose]: p })), []);

  // ── 제3자 AI 전송 동의(iOS: 동의 전이면 요청을 미뤄두고 시트, 시트가 완전히 닫힌 뒤 이어간다) ──
  const withConsent = useCallback((fn: () => void) => {
    if (consentGiven.current) { fn(); return; }
    pendingAfterConsent.current = fn;
    setConsentOpen(true);
  }, []);
  const agreeConsent = useCallback(() => {
    consentGiven.current = true;
    void AsyncStorage.setItem(AI_CONSENT_KEY, "1").catch(() => undefined);
    setConsentOpen(false);
    const fn = pendingAfterConsent.current;
    pendingAfterConsent.current = null;
    // 시트 닫힘(220ms) 뒤에 이어간다 — 크레딧 시트 등 다음 시트와 겹치지 않게.
    if (fn) setTimeout(fn, 300);
  }, []);
  const declineConsent = useCallback(() => {
    pendingAfterConsent.current = null;
    setConsentOpen(false);
  }, []);

  // ── 생성 ──
  const goMyPhotos = useCallback(() => {
    try { router.dismissAll(); } catch { /* 이미 루트 */ }
    router.navigate("/(tabs)/photos");
  }, []);

  /** 로그인·크레딧 확인 뒤 한 건 시작(iOS perform(.generate)). */
  const performOne = useCallback((input: JobInput, opts?: GenOpts) => {
    withConsent(() => {
      gate.request(opts?.cost ?? 1, () => { start({ ...input, autoPresent: true }); goMyPhotos(); }, { creditsOnly: !!opts?.creditsOnly });
    });
  }, [gate, start, goMyPhotos, withConsent]);

  const startGuest = useCallback((input: JobInput) => {
    if (!consentGiven.current) { withConsent(() => startGuest(input)); return; }
    const title = conceptTitle(input.concept);
    setGuestFlow({ title, images: [] });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    void (async () => {
      try {
        const deviceId = await guestDeviceId();
        const enc = await encodeForUpload(input.photo, 1024);
        let faceRefs: { mimeType: string; base64: string; angle: string }[] = [];
        if (!isArtOnly(input.concept)) {
          try { faceRefs = await loadProfileRefs(); } catch { faceRefs = []; }
          if (!faceRefs.length) faceRefs = [{ ...enc, angle: "anchor" }];
        }
        const c = input.concept;
        const r = await generateImage("", enc, c.text || "", {
          id: c.id, title: c.title, count: 1, skipFacePrecheck: isArtOnly(c),
          ...(c.studioPreset && c.studioPurpose ? { studio: { purpose: c.studioPurpose, presetId: c.studioPreset, overrides: {} } } : {}),
          ...(c.dressCode ? { wedding: { dressCode: c.dressCode } } : {}),
          faceRefs,
          guest: { platform: "android", deviceId },
        });
        await AsyncStorage.setItem(GUEST_USED_KEY, "1").catch(() => undefined);
        const images = r.batch ? r.batch.map((b) => b.imageDataUrl) : [r.imageDataUrl];
        setGuestFlow((g) => (g ? { ...g, images } : g));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        void showInterstitial(); // 무료 = 생성 광고 1번(오너 지시 2026-10-07)
      } catch (err) {
        const e = err as ApiError;
        if (e?.status === 403) {
          // 이 기기는 이미 첫 1장을 썼다 → 로그인하고 이어서.
          await AsyncStorage.setItem(GUEST_USED_KEY, "1").catch(() => undefined);
          setGuestFlow(null);
          requireLogin("make", () => performOne(input), undefined, e.message);
        } else {
          setGuestFlow((g) => (g ? { ...g, error: e?.networkFail ? c21.errNetwork : e?.message || c21.errNetwork } : g));
        }
      }
    })();
  }, [requireLogin, performOne, withConsent]);

  /** iOS `requireLogin(.generate(req))` — 로그인돼 있으면 바로, 아니면 게스트 첫 1장 또는 로그인 시트. */
  const requestGenerate = useCallback((input: JobInput, opts?: GenOpts) => {
    if (signedIn) { performOne(input, opts); return; }
    void (async () => {
      const used = (await AsyncStorage.getItem(GUEST_USED_KEY).catch(() => null)) === "1";
      if (!used && guestEligible(input)) startGuest(input);
      else requireLogin("make", () => performOne(input, opts), undefined, c21.loginToSave);
    })();
  }, [signedIn, performOne, startGuest, requireLogin]);

  const guestReceive = useCallback((uri: string) => {
    const doSave = async () => {
      await adGate();
      const r = await saveDataUrlToAlbum(uri, "rimikimi");
      toast("ok" in r ? c21.savedToAlbum : c21.noAlbumPermission);
      setGuestFlow(null);
      setCart([]); setCartExpanded(false);
    };
    if (signedIn) void doSave();
    else requireLogin("make", () => { void doSave(); }, undefined, c21.guestLogin);
  }, [signedIn, adGate, toast, requireLogin]);

  /** "N장 만들기" — 등록 사진으로 담은 컨셉을 한꺼번에(iOS generateCart). */
  const generateCart = useCallback((optionsDone = false) => {
    const items = cartRef.current;
    if (!items.length) return;
    if (!optionsDone && items.some((c) => !!c.studioPurpose)) { setStudioStep(true); return; }
    void (async () => {
      let me = photo;
      if (!me) {
        // 담은 걸 만들려는데 등록된 내 사진이 없을 때 — 한 장 고르면 등록하고 바로 이어서 만든다.
        toast(c21.cartPhotoTitle);
        const [p] = await pickPhotos();
        if (!p) return;
        me = await registerPhoto(p);
        setPhoto(me);
      }
      const inputs: JobInput[] = items.map((c) => ({
        concept: c,
        photo: me!,
        batchCount: 1,
        // 옵션은 그 탭에서 담은 사진에만(이력서·취업 탭의 옷 사진은 이력서·취업 룩에만).
        ...(c.studioPurpose ? { studioOverrides: overrides[c.studioPurpose] ?? {}, outfit: outfit[c.studioPurpose] ?? null } : {}),
        ...(c.dressCode ? { groom } : {}),
      }));
      if (inputs.length === 1) { requestGenerate(inputs[0]); return; }
      const many = () => withConsent(() => {
        // 여러 장은 크레딧 전용(서버 묶음 규칙과 같다) — 장수만큼 있어야 한다.
        gate.request(inputs.length, () => {
          void (async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
            // 동시에 다 던지면 서버(Vertex) 분당 한도에 걸린다 — 조금씩 띄워 보낸다.
            for (let i = 0; i < inputs.length; i++) {
              if (i > 0) await new Promise((r) => setTimeout(r, 700));
              start({ ...inputs[i], autoPresent: false }); // 여러 장 = 결과 화면 자동으로 안 띄움(iOS silentJobs)
              if (i === 0) { setCart([]); setCartExpanded(false); goMyPhotos(); }
            }
          })();
        }, { creditsOnly: true });
      });
      if (signedIn) many();
      else requireLogin("make", many, undefined, c21.cartManyNeedsLogin);
    })();
  }, [photo, setPhoto, overrides, outfit, groom, requestGenerate, gate, start, signedIn, requireLogin, goMyPhotos, toast, withConsent]);

  const value = useMemo<App21Value>(() => ({
    cart, cartExpanded, setCartExpanded, cartIndex, toggleCart, removeFromCart, clearCart, generateCart,
    studioStep, setStudioStep,
    catalog, dresses, loadStudio, overrides, setOverride, resetOverrides, outfit, setOutfit, groom, setGroom,
    dressFilter, setDressFilter,
    requestGenerate,
    guestFlow, closeGuest: () => setGuestFlow(null), guestReceive,
    browseList, setBrowseList,
    coachStep: coachQueue[0] ?? null, coachIndex, coachTotal, startHomeCoach, enqueueCoach, advanceCoach, skipCoach,
    consentOpen, agreeConsent, declineConsent, devOpenConsent: () => setConsentOpen(true),
    toast, labelsVersion,
  }), [
    consentOpen, agreeConsent, declineConsent,
    cart, cartExpanded, cartIndex, toggleCart, removeFromCart, clearCart, generateCart, studioStep,
    catalog, dresses, loadStudio, overrides, setOverride, resetOverrides, outfit, setOutfit, groom,
    dressFilter, requestGenerate, guestFlow, guestReceive, browseList,
    coachQueue, coachIndex, coachTotal, startHomeCoach, enqueueCoach, advanceCoach, skipCoach, toast, labelsVersion,
  ]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** 시작 화면(설정) — "make" | "camera". */
export async function getStartTab(): Promise<"make" | "camera"> {
  try { return (await AsyncStorage.getItem(START_TAB_KEY)) === "camera" ? "camera" : "make"; } catch { return "make"; }
}
export async function setStartTab(v: "make" | "camera"): Promise<void> {
  try { await AsyncStorage.setItem(START_TAB_KEY, v); } catch { /* 무시 */ }
}
