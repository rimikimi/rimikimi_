// ============================================================
// 네이티브 브릿지 — Capacitor 위에서 동작
//
// 웹 환경: false 반환 → 기존 <input type="file"> 등 웹 동작
// iOS/Android: true 반환 + 네이티브 카메라/저장소 사용
// ============================================================

import { Capacitor } from "@capacitor/core";

export const isNative = () => Capacitor.isNativePlatform();
export const platform = () => Capacitor.getPlatform(); // "web" | "ios" | "android"

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

// 생성된 이미지를 사진 앨범에 저장 (iOS / Android)
// dataUrl: "data:image/png;base64,..."
// 반환: { ok } 또는 { error }
export async function nativeSaveImage(dataUrl, filename = "rimikimi.png") {
  if (!isNative()) return { error: "web only" };
  try {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");

    // data: prefix 제거하고 base64 만 추출
    const m = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
    if (!m) return { error: "invalid data url" };
    const base64 = m[1];

    // 임시 폴더에 저장 (iOS Photos 접근은 별도 권한 필요해 우선 Documents 로)
    await Filesystem.writeFile({
      path: filename,
      data: base64,
      directory: Directory.Documents,
    });
    return { ok: true };
  } catch (e) {
    return { error: e?.message || String(e) };
  }
}

// 생성 결과(data URL)를 파일로 쓴 뒤 시스템 공유 시트로 저장/공유.
// data URL 은 Share 에 바로 못 넘기므로 Cache 에 파일로 쓰고 그 file:// URI 를 공유한다.
// 사용자는 시트에서 "이미지 저장"(사진 앱) 등을 고를 수 있음.
// 반환: true(성공/시트 표시) | false(실패 → 호출측에서 폴백)
export async function nativeShareImage(dataUrl, filename = "rimikimi.png") {
  if (!isNative()) return false;
  try {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");
    const m = (dataUrl || "").match(/^data:[^;]+;base64,(.+)$/);
    if (!m) return false;
    await Filesystem.writeFile({ path: filename, data: m[1], directory: Directory.Cache });
    const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Cache });
    await Share.share({ title: "rimikimi", url: uri, dialogTitle: "이미지 저장/공유" });
    return true;
  } catch (e) {
    return false;
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
