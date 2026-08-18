// ============================================================
// AdMob 전면(interstitial) 광고 — 네이티브(iOS/Android) 전용.
//   - 웹에서는 no-op (웹 광고는 AdSense 가 담당).
//   - 해당 플랫폼 광고단위 ID 가 비어 있으면 no-op (안전).
//   - @capacitor-community/admob 플러그인 필요 (native 빌드에서 cap sync).
// ============================================================
import { isNative, platform, restoreWebViewTouch } from "./nativeBridge";
// ⚠️ 정적 import. (예전엔 동적 import(load())였는데 iOS WKWebView 에서 동적 청크
// 로딩이 끝나지 않아 광고가 영영 안 뜨는 버그가 있었음 → timeout@load.)
// registerPlugin 은 동기이고 native 메서드는 호출 전까지 아무것도 안 하므로,
// 앱 시작 시 같이 로드해도 안전(웹에서도 isNative 가드로 no-op).
import { AdMob, InterstitialAdPluginEvents } from "@capacitor-community/admob";

// AdMob 광고단위 ID (플랫폼별). 콘솔에서 만든 "전면 광고 단위" ID.
const IOS_INTERSTITIAL = "ca-app-pub-9458625554324585/8078673280";
const ANDROID_INTERSTITIAL = "ca-app-pub-9458625554324585/2330989758";

// 전면광고 스위치. (웹 AdSense 는 별도이며 영향 없음.)
const INTERSTITIAL_ENABLED = true;

// ⚠️ 테스트 광고 모드. true 면 실제 광고단위 대신 구글 "샘플 전면광고" 를 강제로
// 띄운다(재고/fill 여부와 무관하게 무조건 노출) → 광고 파이프라인/프리즈 검증용.
// 스토어 제출 빌드에서는 반드시 false 로 되돌릴 것! (안 그러면 수익 0)
const INTERSTITIAL_TESTING = false;

let inited = false;
let listenersReady = false;

// 어떤 단계가 영영 안 끝나면(성공/실패 둘 다 아님) 앱이 광고 파이프라인에서 멈춤.
// ms 안에 안 끝나면 강제로 reject → 어느 단계가 멈췄는지 드러나고, 프리즈도 방지.
function withTimeout(p, ms, label) {
  return Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error("timeout@" + label)), ms)),
  ]);
}

// 터치 복구는 nativeBridge 로 옮겼다 — 광고뿐 아니라 결제창에서도 같은
// 프리즈가 났고(2026-08-18), 앞으로 추가될 풀스크린 액티비티도 전부 겪는다.
// 이제 "포그라운드 복귀" 자체에 걸려 있어 여기선 이중 방어로만 부른다.

// 전면광고 생명주기 리스너는 한 번만 등록 (종료/실패 시 터치 복구).
async function ensureListeners() {
  if (listenersReady) return;
  try {
    await AdMob.addListener(InterstitialAdPluginEvents.Dismissed, restoreWebViewTouch);
    await AdMob.addListener(InterstitialAdPluginEvents.FailedToShow, restoreWebViewTouch);
    listenersReady = true;
  } catch (_) {}
}

export async function initAds() {
  if (!isNative() || inited) return;
  try {
    await AdMob.initialize({});
    inited = true;
  } catch (_) {}
}

// iOS 앱추적투명성(ATT) 동의 팝업 — 반드시 앱이 "활성" 상태일 때 호출해야 표시됨.
// (콜드스타트/스플래시 중 호출하면 iOS 가 조용히 무시 → 심사 리젝 원인이었음)
let attDone = false;
export async function requestATT() {
  if (!isNative() || attDone) return;
  try {
    const { status } = await AdMob.trackingAuthorizationStatus();
    if (status === "notDetermined") {
      await AdMob.requestTrackingAuthorization();
    }
    attDone = true;
  } catch (_) {}
}

export async function showInterstitial() {
  if (!isNative() || !INTERSTITIAL_ENABLED) return; // 킬스위치: 프리즈 방지
  const adId = platform() === "ios" ? IOS_INTERSTITIAL : ANDROID_INTERSTITIAL;
  if (!adId) return; // 광고단위 미설정 → 표시 안 함
  try {
    // 각 단계에 타임아웃 → 광고 로딩이 멈춰도 앱이 프리즈되지 않게.
    if (!inited) { await withTimeout(AdMob.initialize({}), 8000, "init"); inited = true; }
    await ensureListeners();
    await withTimeout(
      AdMob.prepareInterstitial({ adId, isTesting: INTERSTITIAL_TESTING }),
      12000,
      "prepare"
    );
    // show 는 광고가 닫힐 때 resolve 되므로 타임아웃 안 검(정상적으로 오래 걸릴 수 있음)
    await AdMob.showInterstitial();
  } catch (_) {
    // 준비/표시 중 예외가 나도 혹시 남았을 수 있는 잠금 상태 복구
    restoreWebViewTouch();
  }
}
