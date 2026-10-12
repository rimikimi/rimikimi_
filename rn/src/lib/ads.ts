import { Platform } from "react-native";

// ============================================================================
// AdMob 전면(interstitial) 광고 — 1.x `src/ads.js` 를 RN 으로 그대로 옮긴 것.
//
// 규칙은 **새로 만들지 않았다**. 1.x PortraitStudio.jsx 가 쓰던 것과 같다:
//   · 무료 사용자에게만 (`showAds = quotaLoaded && !unlimited && credits === 0`)
//   · **생성이 끝난 뒤** 1회. 크레딧을 쓴 생성·무제한 계정엔 안 띄운다.
//   호출 자리는 src/lib/generation.tsx 의 성공 경로 한 곳뿐이다.
//
// 1.x 와 다른 점은 "미리 로드" 하나다. capacitor-community/admob 은 prepare→show 를
// 매번 붙여서 했지만, react-native-google-mobile-ads 는 로드된 광고 객체를 들고 있을 수
// 있어서 **표시 → 곧바로 다음 것을 미리 로드** 해 둔다(두 번째부터는 대기 0).
// 첫 광고만 1.x 처럼 그 자리에서 로드한다.
//
// ⚠️ 프리즈 방지(1.x 사고 기록과 같은 이유):
//    어떤 단계가 성공도 실패도 아닌 채로 영영 안 끝나면 앱이 광고 파이프라인에서 멈춘다.
//    그래서 init·load·show 각각에 타임아웃을 건다. 호출부도 await 하지 않으므로
//    (generation.tsx 는 `void showInterstitial()`), 여기서 무슨 일이 나든 생성 흐름은
//    그대로 끝난다.
//
// 네이티브 모듈은 **지연 require** — 모듈이 없는 번들(웹 프리뷰 `/dev` 등)에서 이 파일을
// 최상단 import 로 물고 있으면 그 화면까지 통째로 죽는다(push.ts·nativeMedia.ts 와 같은 교훈).
// ============================================================================

// AdMob 광고단위 ID — 1.x src/ads.js ANDROID_INTERSTITIAL 과 같은 값(같은 AdMob 앱).
const ANDROID_INTERSTITIAL = "ca-app-pub-9458625554324585/2330989758";

// 전면광고 스위치. 끄면 아래 전부 no-op (킬스위치 — 프리즈·사고 시 한 줄로 끈다).
const INTERSTITIAL_ENABLED = true;

// ⚠️ 테스트 광고 모드. true 면 실제 광고단위 대신 구글 "샘플 전면광고" 를 띄운다
// (재고/fill 과 무관하게 무조건 노출) → 광고 파이프라인·프리즈 검증용.
// 스토어 제출 빌드에서는 반드시 false! (안 그러면 수익 0)
const INTERSTITIAL_TESTING = false;

const INIT_TIMEOUT_MS = 8000;
const LOAD_TIMEOUT_MS = 12000;
// show() 는 "광고가 화면에 떴다" 에서 resolve 된다(닫힐 때까지 기다리지 않는다).
const SHOW_TIMEOUT_MS = 8000;
// 표시 중 플래그가 CLOSED 를 못 받고 남는 최악의 경우 — 이 시간이 지나면 스스로 푼다.
// (안 풀면 그 뒤로 광고가 영영 안 뜬다. 앱이 멈추진 않지만 수익이 0 이 된다.)
const SHOWING_STALE_MS = 5 * 60 * 1000;
// 표시할 때 "아직 못 받았으면 얼마나 기다릴까". 아이폰(AdManager.showWait)과 같은 3초.
// ⚠️ 이 상한이 없으면 최악의 경우 init 8초 + load 12초 = **20초 뒤**에 광고가 튀어나온다.
//    그때는 사용자가 이미 다른 화면에 가 있다 — 결과를 보다 말고 광고에 덮인다.
//    못 받았으면 이번 회는 걸러 보내고, 받아진 건 `ready` 에 남아 다음 회에 즉시 뜬다.
const SHOW_WAIT_MS = 3000;

type AdsModule = typeof import("react-native-google-mobile-ads");
// InstanceType<…> 은 못 쓴다 — InterstitialAd 의 생성자가 protected 라서. 팩토리의 반환형으로 집는다.
type Interstitial = ReturnType<AdsModule["InterstitialAd"]["createForAdRequest"]>;

let adsMod: AdsModule | null | undefined;
function ads(): AdsModule | null {
  if (adsMod !== undefined) return adsMod;
  adsMod = null;
  // 웹 프리뷰엔 네이티브 SDK 가 없다 — 아예 건드리지 않는다.
  if (Platform.OS === "web") return adsMod;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    adsMod = require("react-native-google-mobile-ads") as AdsModule;
  } catch {
    adsMod = null;
  }
  return adsMod;
}

/** ms 안에 안 끝나면 강제로 reject → 어느 단계가 멈췄는지 드러나고, 프리즈도 막는다. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`timeout@${label}`)), ms)),
  ]);
}

let inited = false;
/** 로드가 끝나 대기 중인 광고 1개. 없으면 그 자리에서 로드한다. */
let ready: Interstitial | null = null;
/** 진행 중인 로드 — 같은 광고를 두 번 받지 않게 공유한다. */
let loading: Promise<Interstitial | null> | null = null;
let showing = false;
let shownAt = 0;

async function ensureInit(): Promise<AdsModule | null> {
  const m = ads();
  if (!m) return null;
  if (!inited) {
    // 실패해도 inited 를 세운다 — 매번 8초씩 다시 기다리는 게 더 나쁘다.
    // (SDK 는 초기화가 늦어도 load 시점에 스스로 다시 시도한다.)
    try {
      await withTimeout(m.default().initialize(), INIT_TIMEOUT_MS, "init");
    } catch {
      /* ignore */
    }
    inited = true;
  }
  return m;
}

/** 전면광고 하나를 받아온다. 실패·타임아웃이면 null. */
async function loadOne(): Promise<Interstitial | null> {
  const m = await ensureInit();
  if (!m) return null;
  const { InterstitialAd, AdEventType, TestIds } = m;
  const adUnitId = INTERSTITIAL_TESTING ? TestIds.INTERSTITIAL : ANDROID_INTERSTITIAL;
  if (!adUnitId) return null; // 광고단위 미설정 → 표시 안 함(1.x 와 같은 안전장치)
  const ad = InterstitialAd.createForAdRequest(adUnitId);
  try {
    await withTimeout(
      new Promise<void>((resolve, reject) => {
        const offLoaded = ad.addAdEventListener(AdEventType.LOADED, () => {
          offLoaded();
          offError();
          resolve();
        });
        const offError = ad.addAdEventListener(AdEventType.ERROR, (e) => {
          offLoaded();
          offError();
          reject(e instanceof Error ? e : new Error("ad load failed"));
        });
        ad.load();
      }),
      LOAD_TIMEOUT_MS,
      "load"
    );
    return ad;
  } catch {
    // 타임아웃으로 빠져나온 경우 리스너가 남아 있다 — 늦게 도착한 이벤트가 죽은
    // 클로저를 붙들지 않게 여기서 끊는다.
    try { ad.removeAllListeners(); } catch { /* ignore */ }
    return null;
  }
}

/** ms 안에 안 오면 null. **로드를 취소하지는 않는다** — 늦게 도착한 광고는 `ready` 에 남아 다음 회에 쓴다. */
function raceTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p.catch(() => null),
    new Promise<null>((r) => setTimeout(() => r(null), ms)),
  ]);
}

/** 다음 광고를 미리 받아 둔다(fire-and-forget). 이미 대기 중이면 아무것도 안 한다. */
function preload(): void {
  if (!INTERSTITIAL_ENABLED || ready || loading) return;
  const p = loadOne()
    .then((ad) => {
      ready = ad;
      return ad;
    })
    .catch(() => null)
    .finally(() => {
      loading = null;
    });
  loading = p;
}

/**
 * 앱 시작 시 1회 — SDK 초기화만 한다.
 * 광고를 여기서 미리 받지는 않는다: 무제한·유료 크레딧 사용자는 광고를 영영 안 보는데
 * 시작하자마자 광고를 한 장 받아 두면 노출 없는 요청만 쌓인다(fill rate 를 깎는다).
 */
export function initAds(): void {
  if (!INTERSTITIAL_ENABLED) return;
  void ensureInit();
}

/**
 * 전면광고 1회. **호출부가 "무료 사용자 + 생성 성공" 을 이미 판정했다고 본다**
 * (규칙은 generation.tsx 에 있고 1.x PortraitStudio.jsx 의 showAds 와 같다).
 * await 하지 말 것 — 여기서 무슨 일이 나도 호출 흐름은 멈추지 않아야 한다.
 */
export async function showInterstitial(onDone?: () => void): Promise<void> {
  // onDone: 광고가 닫히거나(정상) 못 띄우고 끝났을 때 **한 번** 부른다 — 저장 전 광고(showAndWait)용.
  let finished = false;
  const finish = () => { if (!finished) { finished = true; try { onDone?.(); } catch { /* ignore */ } } };
  if (!INTERSTITIAL_ENABLED) return finish();
  // 이미 광고가 떠 있으면 겹쳐 띄우지 않는다(뒤늦게 끝난 생성이 지금 광고를 덮지 않게).
  if (showing && Date.now() - shownAt < SHOWING_STALE_MS) return finish();
  const m = ads();
  if (!m) return finish();
  showing = true;
  shownAt = Date.now();
  try {
    // 미리 받아 둔 게 있으면 즉시, 없으면 1.x 처럼 그 자리에서 로드(타임아웃 포함).
    // preload() 는 `ready` 가 있으면 no-op 이고, 없으면 `loading` 을 동기로 채운다.
    preload();
    const ad = ready ?? (loading ? await raceTimeout(loading, SHOW_WAIT_MS) : null);
    ready = null;
    if (!ad) {
      showing = false;
      finish();
      return;
    }
    // 닫히거나(정상) 표시에 실패하면 → 표시 중 해제 + 다음 광고 미리 로드.
    const done = () => {
      try { ad.removeAllListeners(); } catch { /* ignore */ }
      showing = false;
      preload();
      finish();
    };
    ad.addAdEventListener(m.AdEventType.CLOSED, done);
    ad.addAdEventListener(m.AdEventType.ERROR, done);
    try {
      await withTimeout(ad.show(), SHOW_TIMEOUT_MS, "show");
    } catch {
      // ⚠️ 여기서 리스너를 안 떼면, 타임아웃 뒤 늦게 광고가 뜰 때 done() 이 뒤늦게 돌아
      //    이미 새로 받아둔 광고와 **두 장이 겹쳐 뜰 수** 있다. 버린 광고는 여기서 끊는다.
      try { ad.removeAllListeners(); } catch { /* ignore */ }
      throw new Error("show failed");
    }
  } catch {
    // 로드·표시 어디서 터져도 조용히 넘어간다 — 사용자는 광고가 없었다는 것 외엔 모른다.
    showing = false;
    preload();
    finish();
  }
}

/**
 * 저장 전 광고 — 광고가 **닫힌 뒤에** resolve 한다(못 띄우면 바로).
 * 오너 지시 2026-10-07: 무료 사용자는 이미지를 저장하려면 광고를 봐야 한다(판정은 saveAdGate.ts).
 * 광고 재고가 없거나 실패해도 저장을 막지 않는다. 닫힘 이벤트가 끝내 안 오면 2분 뒤 풀어 준다.
 */
export function showAndWait(): Promise<void> {
  return new Promise<void>((resolve) => {
    let done = false;
    const fin = () => { if (!done) { done = true; resolve(); } };
    setTimeout(fin, 120_000);
    void showInterstitial(fin);
  });
}

// ============================================================================
// 보상형(rewarded) 광고 — 만들기 직전에 "광고 보고 만들기" 로 고른 무료 사용자에게(오너 결정 2026-10-12, iOS 와 같다).
//   · 끝까지 봐서 보상(EARNED_REWARD)이 오면 true → 생성 진행
//   · 보상 전에 닫으면 false → 생성 안 함(호출부가 안내 토스트)
//   · 광고가 없거나(no-fill)·에러·타임아웃이면 true — 광고 재고 때문에 만들기를 막지 않는다
// 생성 뒤 전면광고는 이걸로 대체돼 없어졌다(generation.tsx 주석). 저장 전 광고(showAndWait)는 그대로 전면광고.
// ============================================================================

const ANDROID_REWARDED = "ca-app-pub-9458625554324585/1900552754";
// 개발 빌드에선 구글 테스트 보상형 단위(재고와 무관하게 항상 뜬다).
const REWARDED_TEST = "ca-app-pub-3940256099942544/5224354917";
const REWARDED_ENABLED = true;
/** 표시하려는데 아직 못 받았으면 최대 이만큼 기다린다. 넘기면 광고 없이 만들기 진행. */
const REWARDED_WAIT_MS = 8000;
/** CLOSED 가 끝내 안 오는 최악의 경우 — 이 시간 뒤엔 보상 여부대로 풀어 준다(앱이 멈추지 않게). */
const REWARDED_STALE_MS = 3 * 60 * 1000;

type Rewarded = ReturnType<AdsModule["RewardedAd"]["createForAdRequest"]>;

let rewardedReady: Rewarded | null = null;
let rewardedLoading: Promise<Rewarded | null> | null = null;
let rewardedShowing = false;

async function loadRewardedOne(): Promise<Rewarded | null> {
  const m = await ensureInit();
  if (!m) return null;
  const { RewardedAd, RewardedAdEventType, AdEventType } = m;
  const adUnitId = __DEV__ ? REWARDED_TEST : ANDROID_REWARDED;
  const ad = RewardedAd.createForAdRequest(adUnitId);
  try {
    await withTimeout(
      new Promise<void>((resolve, reject) => {
        const offLoaded = ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
          offLoaded();
          offError();
          resolve();
        });
        const offError = ad.addAdEventListener(AdEventType.ERROR, (e) => {
          offLoaded();
          offError();
          reject(e instanceof Error ? e : new Error("rewarded load failed"));
        });
        ad.load();
      }),
      LOAD_TIMEOUT_MS,
      "rewarded-load"
    );
    return ad;
  } catch {
    try { ad.removeAllListeners(); } catch { /* ignore */ }
    return null;
  }
}

/** 보상형 광고를 미리 받아 둔다(fire-and-forget). 이미 대기·로드 중이면 no-op. */
export function preloadRewarded(): void {
  if (!REWARDED_ENABLED || rewardedReady || rewardedLoading) return;
  if (!ads()) return;
  const p = loadRewardedOne()
    .then((ad) => {
      rewardedReady = ad;
      return ad;
    })
    .catch(() => null)
    .finally(() => {
      rewardedLoading = null;
    });
  rewardedLoading = p;
}

/**
 * 만들기 직전 보상형 광고. true = 만들어도 된다(끝까지 봤거나, 광고를 못 띄움), false = 보상 전에 닫음.
 * 어떤 경우에도 resolve 된다(reject 없음).
 */
export async function showRewardedForCreate(): Promise<boolean> {
  if (!REWARDED_ENABLED) return true;
  const m = ads();
  if (!m) return true;
  if (rewardedShowing) return false; // 두 번 눌러 겹치는 경우 — 앞의 광고 결과를 따른다
  rewardedShowing = true;
  let ad: Rewarded | null = null;
  try {
    preloadRewarded();
    ad = rewardedReady ?? (rewardedLoading ? await raceTimeout(rewardedLoading, REWARDED_WAIT_MS) : null);
    rewardedReady = null;
    if (!ad) {
      rewardedShowing = false;
      preloadRewarded();
      return true; // 광고 없음 → 막지 않는다
    }
    const shown = ad;
    return await new Promise<boolean>((resolve) => {
      let earned = false;
      let settled = false;
      const settle = (v: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(stale);
        try { shown.removeAllListeners(); } catch { /* ignore */ }
        rewardedShowing = false;
        preloadRewarded();
        resolve(v);
      };
      const stale = setTimeout(() => settle(earned), REWARDED_STALE_MS);
      shown.addAdEventListener(m.RewardedAdEventType.EARNED_REWARD, () => { earned = true; });
      shown.addAdEventListener(m.AdEventType.CLOSED, () => settle(earned));
      // 표시 중 에러 → 사용자 잘못이 아니다. 보상을 이미 받았든 아니든 막지 않는다.
      shown.addAdEventListener(m.AdEventType.ERROR, () => settle(true));
      withTimeout(shown.show(), SHOW_TIMEOUT_MS, "rewarded-show").catch(() => settle(true));
    });
  } catch {
    rewardedShowing = false;
    preloadRewarded();
    return true;
  }
}
