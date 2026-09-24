import { I18nManager } from "react-native";

// ============================================================================
// UI 언어 — 기기 첫 번째 선호 언어가 한국어면 한국어, 아니면 영어. 앱 시작 때 한 번만 정한다.
//
// 네이티브 의존성 추가 없이(expo-localization 미설치 → prebuild 불필요) RN 기본 모듈만 쓴다:
//   ① I18nManager.localeIdentifier — 안드로이드는 ConfigurationCompat.getLocales()[0].toString()
//      (= 기기 설정의 첫 번째 선호 언어, 앱별 언어 설정도 반영) 예: "ko_KR", "en_US".
//   ② Intl.DateTimeFormat().resolvedOptions().locale — Hermes 가 기기 기본 로케일을 준다.
//   ③ 둘 다 없으면 "en".
// ============================================================================

function detectLocaleTag(): string {
  try {
    const id = I18nManager.getConstants?.().localeIdentifier;
    if (typeof id === "string" && id) return id.replace(/_/g, "-");
  } catch { /* 폴백 */ }
  try {
    const loc = Intl.DateTimeFormat().resolvedOptions().locale;
    if (typeof loc === "string" && loc) return loc;
  } catch { /* 폴백 */ }
  return "en";
}

/** 기기 로케일 태그(BCP-47 비슷하게, 예 "ko-KR", "en-US") — 날짜·숫자 포맷용. */
export const localeTag: string = detectLocaleTag();
/** UI 언어. 한국어가 아니면 전부 영어. */
export const lang: "ko" | "en" = localeTag.split(/[-_]/)[0].toLowerCase() === "ko" ? "ko" : "en";
export const isKo: boolean = lang === "ko";

/**
 * 카테고리 이름(서버 데이터·내부 키는 한국어 그대로) → 영어 표시 이름.
 * 웹 src/i18nStrings.js en.__categories 와 같은 값 — iOS 도 같은 표를 쓴다(세 플랫폼 동일, SPEC §6-6).
 * 여기 없는 이름은 원문 그대로 보인다.
 */
export const CATEGORY_EN: Record<string, string> = {
  "전체": "All",
  "웨딩 / 브라이덜": "Wedding / Bridal",
  "하이패션 / 화보": "High Fashion",
  "스튜디오 프로필": "Studio Portrait",
  "세계여행": "World Travel",
  "일상 스냅": "Everyday Snap",
  "예술 / 클래식": "Art / Classic",
  "스트릿 패션": "Streetwear",
  "판타지 / 콘셉트": "Fantasy / Concept",
  "파티 / 이벤트": "Party / Event",
  "비치 / 리조트": "Beach / Resort",
  "커플": "Couple",
  "남성": "Men",
  "🌕 추석 인사": "🌕 Chuseok Greetings",
  "🪄 매직 부스": "🪄 Magic Booth",
  "📸 인생네컷": "📸 Photo Booth",
  "🪪 증명사진": "🪪 ID Photo",
  "⭐ 즐겨찾기": "⭐ Favorites",
};

/** 카테고리 표시 이름 — 키(한국어)는 그대로 두고 화면에 보일 때만 바꾼다. */
export function categoryLabel(name: string): string {
  if (isKo) return name;
  return CATEGORY_EN[name] ?? name;
}

/** 한국어/영어 중 하나를 고른다(데이터에 _en 필드가 있는 경우용). 영어가 비어 있으면 한국어. */
export function pick(ko: string, en?: string | null): string {
  return !isKo && en ? en : ko;
}
