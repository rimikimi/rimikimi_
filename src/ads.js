// ============================================================
// AdMob 전면(interstitial) 광고 — 네이티브(iOS/Android) 전용.
//   - 웹에서는 no-op (웹 광고는 AdSense 가 담당).
//   - 해당 플랫폼 광고단위 ID 가 비어 있으면 no-op (안전).
//   - @capacitor-community/admob 플러그인 필요 (native 빌드에서 cap sync).
// ============================================================
import { isNative, platform } from "./nativeBridge";

// AdMob 광고단위 ID (플랫폼별). 콘솔에서 만든 "전면 광고 단위" ID.
const IOS_INTERSTITIAL = "ca-app-pub-9458625554324585/8078673280";
const ANDROID_INTERSTITIAL = "ca-app-pub-9458625554324585/2330989758";

let inited = false;

async function load() {
  const mod = await import("@capacitor-community/admob");
  return mod.AdMob;
}

export async function initAds() {
  if (!isNative() || inited) return;
  try {
    const AdMob = await load();
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
    const AdMob = await load();
    const { status } = await AdMob.trackingAuthorizationStatus();
    if (status === "notDetermined") {
      await AdMob.requestTrackingAuthorization();
    }
    attDone = true;
  } catch (_) {}
}

export async function showInterstitial() {
  if (!isNative()) return;
  const adId = platform() === "ios" ? IOS_INTERSTITIAL : ANDROID_INTERSTITIAL;
  if (!adId) return; // 해당 플랫폼 광고단위 미설정 → 표시 안 함
  try {
    const AdMob = await load();
    if (!inited) { await AdMob.initialize({}); inited = true; }
    await AdMob.prepareInterstitial({ adId });
    await AdMob.showInterstitial();
  } catch (_) {}
}
