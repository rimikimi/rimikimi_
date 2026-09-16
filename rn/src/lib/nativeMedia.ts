// ============================================================================
// 웹뷰(WebTool) 브리지가 쓰는 저장/공유 — result/[jobId].tsx 의 toLocalFile 과 같은 패턴
// (data URL 이든 원격 URL 이든 캐시 파일로 받아서 MediaLibrary/Sharing 에 넘긴다).
//
// ⚠️ 네이티브 모듈은 지연 import 한다(push.ts 의 교훈과 같은 이유) — expo-media-library
// 최신 버전은 모듈 최상단에서 바로 네이티브 참조를 만들어서, 이 파일을 최상단 import 로
// 물고 있으면 네이티브 모듈이 없는 번들(예: 웹 프리뷰 `/dev`)에서 그 화면까지 통째로
// 크래시난다 — 실제 기기(Android)에서 쓸 때만 필요하니 호출 시점에만 불러온다.
// ============================================================================

async function toLocalFile(src: string, name: string) {
  const { File, Paths } = await import("expo-file-system");
  const f = new File(Paths.cache, name);
  if (f.exists) f.delete();
  if (src.startsWith("data:")) {
    const m = src.match(/^data:([^;]+);base64,(.+)$/);
    if (!m) throw new Error("bad data url");
    f.write(Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0)));
    return f;
  }
  return File.downloadFileAsync(src, f);
}

/** 앨범 저장(writeOnly) — 성공하면 {ok:true}, 실패하면 {error}. src/nativeBridge.js nativeSaveToAlbum 과 같은 반환 모양. */
export async function saveDataUrlToAlbum(src: string, filename = "rimikimi"): Promise<{ ok: true } | { error: string }> {
  try {
    const MediaLibrary = await import("expo-media-library");
    const perm = await MediaLibrary.requestPermissionsAsync(true);
    if (!perm.granted) return { error: "permission denied" };
    const f = await toLocalFile(src, filename.endsWith(".png") || filename.endsWith(".jpg") ? filename : `${filename}.png`);
    await MediaLibrary.saveToLibraryAsync(f.uri);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** 시스템 공유 시트 — src/nativeBridge.js nativeShareImage 와 같은 반환 모양({ok,reason?}). */
export async function shareDataUrlOrUrl(src: string, filename = "rimikimi.png", dialogTitle = "공유하기"): Promise<{ ok: boolean; reason?: string }> {
  try {
    const Sharing = await import("expo-sharing");
    const f = await toLocalFile(src, filename);
    if (!(await Sharing.isAvailableAsync())) return { ok: false, reason: "unavailable" };
    await Sharing.shareAsync(f.uri, { mimeType: "image/png", dialogTitle });
    // expo-sharing 은 사용자가 실제로 뭘 골랐는지 알려주지 않는다(취소해도 resolve) —
    // 웹의 activityType 판정과 달리 "시트가 떴다" 까지만 보장한다.
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}
