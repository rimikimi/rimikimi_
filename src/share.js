// ============================================================
// 결과 이미지 공유(+공유 리워드 클레임) — 저장 버튼과 별개 경로.
// 표준: rimikimi studios/_reliability/viral-loop-and-funnel-standard.md §A
//
// 테스트 용이성을 위해 네이티브 판정/공유 함수/네트워크를 모두 인자로 주입할 수
// 있게 설계했다(기본값은 실제 nativeBridge/navigator/fetch, 테스트에선 목으로 교체).
// 순수 로직만 있고 React/JSX 를 쓰지 않아 plain Node 로도 바로 임포트해 테스트 가능.
// ============================================================
import { isNative, nativeShareImage } from "./nativeBridge";

// 공유 캡션에 넣는 앱 다운로드 링크 (rimikimi 정적 다운로드 페이지)
export const SHARE_APP_URL = "https://rimikimi-app.vercel.app/download.html";

// 웹: navigator.share (파일 첨부가 가능하면 함께, 아니면 텍스트+링크만) — resolve=완료.
// 브라우저가 Web Share API 자체를 지원 안 하면 { ok:false, reason:"unsupported" }.
export async function webShareImage({ src, filename = "rimikimi.png", title, text, nav }) {
  const n = nav || (typeof navigator !== "undefined" ? navigator : null);
  if (!n || typeof n.share !== "function") {
    return { ok: false, reason: "unsupported" };
  }
  let payload = { title, text };
  try {
    if (src && typeof n.canShare === "function" && typeof File !== "undefined" && typeof fetch === "function") {
      const res = await fetch(src);
      const blob = await res.blob();
      const file = new File([blob], filename, { type: blob.type || "image/png" });
      if (n.canShare({ files: [file] })) {
        payload = { ...payload, files: [file] };
      }
    }
  } catch (_) {
    // 파일 첨부 실패(CORS 등) — 텍스트+링크 공유로 안전하게 폴백
  }
  try {
    await n.share(payload);
    return { ok: true };
  } catch (e) {
    // 사용자가 공유 시트를 취소하면 여기로 옴(reject) — 미완료로 처리(크레딧 미지급)
    return { ok: false, reason: e?.message || "cancelled" };
  }
}

// 플랫폼 분기 — 네이티브면 파일 공유(Capacitor Share), 아니면 웹 공유.
// resolve 된 경우만 { ok: true }. 취소/미지원이면 { ok: false, reason }.
export async function shareImage({
  src,
  filename = "rimikimi.png",
  title,
  text,
  url = SHARE_APP_URL,
  nativeCheck = isNative,
  nativeShareFn = nativeShareImage,
  webShareFn = webShareImage,
}) {
  const fullText = url ? `${text} ${url}` : text;
  if (nativeCheck()) {
    return nativeShareFn({ src, filename, title, text: fullText });
  }
  return webShareFn({ src, filename, title, text: fullText });
}

// 공유 완료 후 서버에 리워드 클레임(best-effort). 실패해도 공유 자체는 이미 끝난 뒤라
// 호출부는 "공유 완료" UI 는 그대로 두고 크레딧 지급 여부만 결과에 반영하면 된다.
// 로그인 안 된 상태(accessToken 없음)면 호출조차 하지 않는다(§A: "익명은 버튼은 동작하되
// 보상 없음") — 호출부가 별도로 로그인 유도 문구를 보여줄 수 있다.
export async function claimShareRewardApi({ accessToken, itemId, fetchImpl }) {
  const f = fetchImpl || (typeof fetch === "function" ? fetch : null);
  if (!f) return { ok: false, reason: "no_fetch" };
  if (!accessToken) return { ok: false, reason: "not_logged_in" };
  if (!itemId) return { ok: false, reason: "no_item" };
  try {
    const r = await f("/api/share/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + accessToken },
      body: JSON.stringify({ itemId }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      return { ok: false, reason: j?.error || "claim_failed", capped: !!j?.capped, status: r.status };
    }
    return { ok: true, ...j };
  } catch (e) {
    return { ok: false, reason: e?.message || "network" };
  }
}
