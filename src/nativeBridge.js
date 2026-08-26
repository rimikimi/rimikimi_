// ============================================================
// 네이티브 브릿지 — Capacitor 위에서 동작
//
// 웹 환경: false 반환 → 기존 <input type="file"> 등 웹 동작
// iOS/Android: true 반환 + 네이티브 카메라/저장소 사용
// ============================================================

import { Capacitor } from "@capacitor/core";
// ⚠️ 정적 import 필수 (ads.js/iap.js 와 동일한 이유) — 네이티브 WKWebView 에서 동적
// import() 가 영원히 pending 되는 버그가 있었음. registerPlugin 은 동기이고 native
// 메서드는 호출 전까지 아무 것도 안 하므로 앱 시작 시 같이 로드해도 안전
// (웹에서도 isNative 가드로 no-op).
import { Media } from "@capacitor-community/media";
import { App as CapApp } from "@capacitor/app";

export const isNative = () => Capacitor.isNativePlatform();
export const platform = () => Capacitor.getPlatform(); // "web" | "ios" | "android"

/* ---------- 안드로이드 WebView 터치 복구 ---------- */
// targetSdk 35/36(edge-to-edge)에서 풀스크린 네이티브 액티비티가 닫히고 WebView 로
// 돌아올 때 WebView 가 터치를 못 받는 프리즈가 있다. 전면광고에서 먼저 발견해
// 광고 경로에만 복구를 걸어놨었는데, **결제창(Play 결제 시트)도 똑같은 별도
// 액티비티**라 같은 증상이 났다(2026-08-18 신고: "결제하면 터치가 아예 안 됨").
//
// → 개별 경로마다 붙이는 대신 "포그라운드 복귀" 자체에 건다. 광고·결제·권한창·
//   공유시트·카메라 등 앞으로 뭐가 추가돼도 자동으로 커버된다.
export function restoreWebViewTouch() {
  if (platform() !== "android") return;
  try {
    window.dispatchEvent(new Event("resize"));
    if (document.body) {
      // 강제 리플로우 → 히트테스트 영역 갱신
      document.body.style.pointerEvents = "none";
      void document.body.offsetHeight;
      requestAnimationFrame(() => {
        try {
          document.body.style.pointerEvents = "";
          void document.body.offsetHeight;
          window.focus && window.focus();
        } catch (_) {}
      });
    }
  } catch (_) {}
}

let touchRestoreReady = false;
export function installTouchRestore() {
  if (!isNative() || platform() !== "android" || touchRestoreReady) return;
  touchRestoreReady = true;
  try {
    CapApp.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) return;
      // 액티비티가 완전히 붙기 전에 부르면 소용없어서 한 번 더 늦게 시도한다.
      restoreWebViewTouch();
      setTimeout(restoreWebViewTouch, 350);
    });
  } catch (_) { /* 복구는 실패해도 앱 동작과 무관 */ }
}

// 네이티브 호출이 응답 없이 멈추는 것 방지 (ads.js/iap.js 와 동일 패턴)
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

// 네이티브 카메라/앨범 picker — Photos data URL 반환
// source: "camera" | "photos" | "prompt"(사용자 선택)
export async function nativePickPhoto(source = "prompt") {
  if (!isNative()) return null;
  const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
  const sourceMap = {
    camera: CameraSource.Camera,
    photos: CameraSource.Photos,
    prompt: CameraSource.Prompt,
  };
  try {
    const img = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: sourceMap[source] || CameraSource.Prompt,
      promptLabelHeader: "사진 선택",
      promptLabelPhoto: "앨범에서 선택",
      promptLabelPicture: "카메라로 촬영",
      promptLabelCancel: "취소",
    });
    return img.dataUrl || null;
  } catch (e) {
    // 사용자 취소
    return null;
  }
}

// 앨범에서 여러 장 선택 (필터 스튜디오용). webPath URL 배열 반환, 취소면 null.
// getPhoto 와 달리 카메라 없이 앨범 다중 선택 UI 가 뜬다.
export async function nativePickPhotos(limit = 10) {
  if (!isNative()) return null;
  const { Camera } = await import("@capacitor/camera");
  try {
    const r = await Camera.pickImages({ quality: 92, limit });
    const paths = (r.photos || []).map((p) => p.webPath).filter(Boolean);
    return paths.length ? paths.slice(0, limit) : null;
  } catch (_) {
    return null; // 사용자 취소
  }
}

// 안드로이드 전용: 우리 앱 전용 앨범 폴더("rimikimi")를 준비하고 식별자(경로)를 돌려준다.
// Media.savePhoto 는 Android 에서 albumIdentifier 가 필수(없으면 거절)라 세션당 1회 확인/생성해 캐시.
// (androidGalleryMode 를 켜지 않은 기본 모드라 별도 권한/팝업 없이 앱 전용 폴더에만 접근.)
const ANDROID_ALBUM_NAME = "rimikimi";
let androidAlbumIdentifier = null;
async function ensureAndroidAlbum() {
  if (androidAlbumIdentifier) return androidAlbumIdentifier;
  try {
    await withTimeout(Media.createAlbum({ name: ANDROID_ALBUM_NAME }), 8000);
  } catch (_) {
    // 이미 있으면 "Album already exists" 로 거절됨 — 정상, 무시
  }
  try {
    const { path } = await withTimeout(Media.getAlbumsPath(), 8000);
    androidAlbumIdentifier = path + "/" + ANDROID_ALBUM_NAME;
  } catch (_) {
    androidAlbumIdentifier = null;
  }
  return androidAlbumIdentifier;
}

// 생성 결과(data URL)를 시스템 사진첩(카메라롤)에 곧바로 저장한다.
// 공유 시트/중간 다이얼로그 없음 — @capacitor-community/media 로 무팝업 직접 저장.
//   iOS: 앨범 없이 바로 카메라롤에 추가(add-only 권한, NSPhotoLibraryAddUsageDescription).
//   Android: 앱 전용 "rimikimi" 앨범 폴더에 저장 + MediaStore 스캔으로 사진첩에 노출.
// filename 은 확장자 없이 넘길 것(Android 요구사항, iOS는 무시함).
// 반환: { ok: true } | { error }
export async function nativeSaveToAlbum(dataUrl, filename = "rimikimi") {
  if (!isNative()) return { error: "web only" };
  try {
    const opts = { path: dataUrl, fileName: filename };
    if (platform() === "android") {
      const albumIdentifier = await ensureAndroidAlbum();
      if (!albumIdentifier) return { error: "album unavailable" };
      opts.albumIdentifier = albumIdentifier;
    }
    await withTimeout(Media.savePhoto(opts), 20000);
    return { ok: true };
  } catch (e) {
    return { error: e?.message || String(e) };
  }
}

// 네이티브 공유 시트 (카톡/메시지/저장 등 시스템 시트)
export async function nativeShare({ title, text, url }) {
  if (!isNative()) return false;
  try {
    const { Share } = await import("@capacitor/share");
    await Share.share({ title, text, url, dialogTitle: "공유하기" });
    return true;
  } catch (e) {
    return false;
  }
}

// ============================================================
// 결과 이미지 파일 공유 (viral-loop-and-funnel-standard.md §A) — 저장(nativeSaveToAlbum)과
// 완전히 별개 경로. @capacitor/share 의 files 옵션은 Android 에서 file:// URI 만 받으므로
// (원격 https 서명 URL 은 거부됨), data URL 이든 원격 URL 이든 먼저 로컬 캐시 파일로 써서
// file:// URI 를 만든 뒤 공유한다.
//
// 완료 판정: 네이티브 Share 플러그인은 "사용자가 취소"하면 reject 하고(iOS 는
// completionWithItemsHandler 의 completed=false 일 때 바로 reject, Android 는
// RESULT_CANCELED 일 때 reject), 실제로 대상 앱을 골랐을 때만 resolve 한다 — 그래서
// 이 함수는 resolve=완료, reject/에러=미완료(호출부가 크레딧 클레임을 스킵)로 처리하면
// §A 표준의 "iOS activityType 확인 / Android resolve 기준" 판정과 실질적으로 동일하다.
export async function nativeShareImage({ src, filename = "rimikimi.png", title, text }) {
  if (!isNative()) return { ok: false, reason: "web only" };
  if (!src) return { ok: false, reason: "no src" };
  try {
    const base64 = await toBase64Payload(src);
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const path = `share-cache/${filename}`;
    await Filesystem.writeFile({
      path,
      data: base64,
      directory: Directory.Cache,
      recursive: true,
    });
    const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
    const { Share } = await import("@capacitor/share");
    const result = await Share.share({ title, text, files: [uri], dialogTitle: "공유하기" });
    return { ok: true, activityType: result?.activityType || "" };
  } catch (e) {
    // 사용자 취소(reject) 또는 파일 변환/쓰기 실패 — 어느 쪽이든 미완료로 처리(크레딧 미지급)
    return { ok: false, reason: e?.message || "cancelled" };
  }
}

// data: URL 또는 http(s) URL → base64 페이로드 (Filesystem.writeFile 용)
async function toBase64Payload(src) {
  if (/^data:/.test(src)) {
    const b64 = String(src).split(",")[1];
    if (!b64) throw new Error("invalid data url");
    return b64;
  }
  const res = await fetch(src);
  if (!res.ok) throw new Error("fetch failed: " + res.status);
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || "");
      const b64 = result.split(",")[1] || "";
      if (!b64) reject(new Error("blob read failed"));
      else resolve(b64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
