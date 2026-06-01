// ============================================================
// 인앱브라우저(카톡/인스타/페북/라인 등) 감지 + 외부 브라우저 우회
//
// Why:
//   Google 은 2021 년부터 인앱브라우저 OAuth 를 차단함
//   (403 disallowed_useragent). 사용자가 카카오톡에서 우리 링크를
//   누르고 "Google 로 시작" 버튼을 누르면 막혀버림.
//
// 전략:
//   1) 카톡 안드: kakaotalk://web/openExternal?url=... 로 시스템 브라우저 강제 열기 (대부분 작동)
//   2) iOS 카톡 / 기타 인앱: 자동 우회 어려움 → 명확한 안내문 표시
// ============================================================

export function detectInApp() {
  const ua = (navigator.userAgent || "").toLowerCase();
  if (/kakaotalk/.test(ua)) return "kakao";
  if (/instagram/.test(ua)) return "instagram";
  if (/(fban|fbav|fb_iab)/.test(ua)) return "facebook";
  if (/line\//.test(ua)) return "line";
  if (/(naver|naverapp)/.test(ua) && !/safari/.test(ua)) return "naver";
  return null;
}

export function isIOS() {
  const ua = navigator.userAgent || "";
  return /iPhone|iPad|iPod/.test(ua);
}

export function isAndroid() {
  return /android/i.test(navigator.userAgent || "");
}

// 카톡 안드에서 외부 브라우저로 강제 이동
export function tryEscapeKakaoAndroid(targetUrl) {
  if (!isAndroid()) return false;
  if (detectInApp() !== "kakao") return false;
  try {
    const u = targetUrl || window.location.href;
    window.location.href = "kakaotalk://web/openExternal?url=" + encodeURIComponent(u);
    return true;
  } catch (_) {
    return false;
  }
}

export function inAppEscapeInstructions(app) {
  if (app === "kakao") {
    if (isIOS()) {
      return {
        title: "카카오톡 안에서는 구글 로그인이 막혀요",
        steps: [
          "우측 아래 ⇧ (공유) 버튼을 눌러주세요",
          '"Safari로 열기" 를 선택해 주세요',
          "사파리에서 다시 시도해 주세요",
        ],
      };
    }
    return {
      title: "카카오톡 안에서는 구글 로그인이 막혀요",
      steps: [
        "우측 위 ⋮ (점 세 개) 메뉴를 눌러주세요",
        '"다른 브라우저로 열기" 를 선택해 주세요',
        "Chrome 등에서 다시 시도해 주세요",
      ],
    };
  }
  if (app === "instagram" || app === "facebook" || app === "line") {
    return {
      title: "앱 안의 브라우저에서는 구글 로그인이 막혀요",
      steps: [
        "우측 위 ⋮ 또는 ⇧ 메뉴를 눌러주세요",
        '"Chrome / Safari 로 열기" 를 선택해 주세요',
        "외부 브라우저에서 다시 시도해 주세요",
      ],
    };
  }
  return null;
}
