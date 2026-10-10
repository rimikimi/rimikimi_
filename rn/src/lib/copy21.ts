import AsyncStorage from "@react-native-async-storage/async-storage";
import { getEnv } from "./env";
import { isKo } from "./locale";

// ============================================================================
// 2.1 개편 문구 — iOS `ios2/rimikimi/Copy/Copy.swift`(+ CoachMarks·PurposeView·CameraFilterTab 안의
// L.t) 를 **글자 그대로** 옮긴 것. iOS 의 `L.t(ko, en)` 와 같은 모양으로 쓴다.
//
// 서버 이름표(`/labels.json`, iOS `LabelStore`) — 홈 카드·목적 탭·앨범 이름을 앱 빌드 없이 바꾸는 표.
// 키 하나에 {ko, en}. 서버에 없거나 못 받으면 코드의 기본 문구. 마지막으로 받은 표는 저장해 두고
// 다음 실행 첫 화면부터 쓴다(받기 전 한순간 옛 이름이 보이지 않게).
// ============================================================================

export const t = (ko: string, en: string): string => (isKo ? ko : en);

type LabelTable = Record<string, { ko?: string; en?: string }>;
const LABELS_CACHE_KEY = "labels.cache";
let labelTable: LabelTable = {};
const labelListeners = new Set<() => void>();

export function labelsVersionSubscribe(fn: () => void): () => void {
  labelListeners.add(fn);
  return () => { labelListeners.delete(fn); };
}

function setLabels(tbl: LabelTable) {
  labelTable = tbl;
  labelListeners.forEach((f) => f());
}

/** 앱 시작 때 1회 — 저장해 둔 표를 먼저 쓰고, 서버 표로 갈아끼운다. */
export async function loadLabels(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(LABELS_CACHE_KEY);
    if (raw) setLabels(JSON.parse(raw) as LabelTable);
  } catch { /* 캐시 없음 */ }
  try {
    const r = await fetch(`${getEnv().apiBase}/labels.json`, { cache: "no-cache" });
    if (!r.ok) return;
    const j = (await r.json()) as LabelTable;
    if (j && typeof j === "object") {
      setLabels(j);
      await AsyncStorage.setItem(LABELS_CACHE_KEY, JSON.stringify(j));
    }
  } catch { /* 오프라인 — 기본 문구 */ }
}

/** 서버 표에 값이 있으면 그것, 없으면 기본 문구(iOS `LabelStore.t`). */
export function label(key: string, ko: string, en: string): string {
  const v = labelTable[key]?.[isKo ? "ko" : "en"];
  return v ? v : t(ko, en);
}

export const c21 = {
  // 탭
  get tabMake() { return t("만들기", "Create"); },
  get tabCameraFilter() { return t("카메라·필터", "Camera"); },
  get tabMyPhotos() { return t("내 사진", "My Photos"); },
  get settingsTitle() { return t("설정", "Settings"); },
  get signIn() { return t("로그인", "Sign in"); },
  get creditsLabel() { return t("크레딧", "Credits"); },
  get chipUnlimited() { return t("∞ 무제한", "∞ Unlimited"); },
  chipFree: (n: number) => (isKo ? `무료 ${n}장` : `${n} free`),
  // 홈
  get featureRetouch() { return label("feature.retouch", "말로 고치기", "Fix with words"); },
  get featureRestore() { return label("feature.restore", "옛날 사진 복원", "Restore old photo"); },
  get purposeProfile() { return label("purpose.profile", "증명·프로필", "ID · Profile"); },
  get purposeSnap() { return label("purpose.snap", "프사·소개팅", "Profile pic · Dating"); },
  get purposeWedding() { return label("purpose.wedding", "웨딩·커플", "Wedding · Couple"); },
  get purposeConcept() { return label("purpose.concept", "컨셉화보", "Concept shoots"); },
  get segToday() { return label("segment.today", "오늘의 새 컨셉", "New today"); },
  albumCount: (n: number) => (isKo ? `${n}장` : `${n}`),
  category: (name: string, en: string) => label(`category.${name}`, name, en),
  // 담기
  cartFull: (n: number) => t(`한 번에 ${n}장까지 고를 수 있어요`, `You can pick up to ${n} at once`),
  cartMake: (n: number) => t(`${n}장 만들기`, `Create ${n}`),
  cartCount: (n: number, max: number) => `${n}/${max}`,
  get cartPhotoTitle() { return t("내 사진을 먼저 골라 주세요", "Pick your photo first"); },
  get cartNeedsOptions() { return t("이 컨셉은 따로 만들어요 — 눌러서 옵션을 골라 주세요", "This one needs options — tap it to set them up"); },
  get a11yRemoveFromCart() { return t("빼기", "Remove"); },
  get a11yCart() { return t("담은 사진", "Picked"); },
  get cartManyNeedsLogin() { return t("2장부터는 로그인하고 만들어요 · 첫 1장은 가입 없이", "Sign in to make 2 or more · your first one is free without signing up"); },
  // 설정 — 시작 화면
  get startScreen() { return t("앱을 켜면 먼저 보일 화면", "Opens to"); },
  get startMake() { return t("만들기", "Create"); },
  get startCamera() { return t("카메라·필터", "Camera"); },
  // 목적 화면
  get filter() { return t("필터", "Filter"); },
  get groomAdded() { return t("신랑 사진 추가됨", "Groom added"); },
  get withGroom() { return t("신랑도 함께", "With groom"); },
  get fineTune() { return t("세부 조정", "Fine-tune"); },
  get reset() { return t("기본값으로", "Reset"); },
  get close() { return t("닫기", "Close"); },
  get outfitSetsClothes() { return t("옷 사진이 의상을 정해요", "The outfit photo sets the clothes"); },
  get keepMine() { return t("원본 유지", "Keep mine"); },
  get outfitApplied() { return t("옷 사진 적용 중", "Outfit applied"); },
  get changeOutfit() { return t("옷 바꾸기", "Change outfit"); },
  get axisSil() { return t("실루엣", "Silhouette"); },
  get axisCol() { return t("컬러", "Color"); },
  get axisNeck() { return t("넥라인", "Neckline"); },
  get axisSlv() { return t("소매", "Sleeve"); },
  dressMatch: (n: number) => t(`조건에 맞는 드레스 ${n}벌`, `${n} gowns match`),
  get noResults() { return t("검색 결과가 없어요", "No results"); },
  studioTab: (k: string) =>
    k === "resume" ? label("studioTab.resume", "이력서·취업", "Résumé")
      : k === "linkedin" ? label("studioTab.linkedin", "전문 프로필", "Professional")
        : label("studioTab.audition", "배우·모델", "Actor · model"),
  weddingTab: (k: "concepts" | "main" | "after") =>
    k === "concepts" ? label("weddingTab.concepts", "웨딩 컨셉", "Wedding")
      : k === "main" ? label("weddingTab.main", "본식 드레스", "Ceremony gowns")
        : label("weddingTab.after", "2부 드레스", "Reception gowns"),
  knobTitle: (knob: string, purpose: string) => {
    switch (knob) {
      case "suits": return purpose === "audition" ? t("의상 색", "Outfit color") : t("정장 색", "Suit color");
      case "inners": return t("셔츠·블라우스 색", "Shirt · blouse color");
      case "bgs": return t("배경 색", "Background");
      case "expressions": return t("표정", "Expression");
      case "angles": return t("앵글", "Angle");
      case "hair": return t("헤어", "Hair");
      case "mono": return t("흑백으로", "Black & white");
      case "actorOutfits": return t("의상 종류", "Outfit type");
      case "moods": return t("분위기", "Mood");
      default: return knob;
    }
  },
  // 게스트 첫 1장
  get guestMaking() { return t("만드는 중이에요", "Creating"); },
  get guestPick() { return t("마음에 드는 1장을 골라요", "Pick the one you like"); },
  get guestReceive() { return t("이 사진 받기 · 무료", "Get this photo · free"); },
  get guestAgain() { return t("다른 스타일로 다시", "Try another style"); },
  get guestIdentity() { return t("내 얼굴과 같은 사람인지 확인했어요", "Checked it's the same person"); },
  get guestLogin() { return t("사진을 받으려면 로그인해 주세요", "Sign in to get your photo"); },
  get errNetwork() { return t("네트워크 요청에 실패했어요. 잠시 후 다시 시도해 주세요.", "Network request failed. Please try again shortly."); },
  get loginToSave() { return t("생성된 이미지 저장을 위해 로그인이 필요합니다", "Sign in to save your generated image"); },
  // 저장
  get savedToAlbum() { return t("앨범에 저장했어요", "Saved to your album"); },
  get noAlbumPermission() { return t("앨범 저장 권한이 없어요", "No permission to save to your album"); },
  savedNToAlbum: (n: number) => (isKo ? `${n}장을 앨범에 저장했어요` : `Saved ${n} ${n === 1 ? "photo" : "photos"} to your album`),
  // 내 사진
  get mineLoginPrompt() { return t("로그인하면 내가 만든 이미지를 볼 수 있어요", "Sign in to see the images you've created"); },
  get mineEmpty() { return t("아직 생성한 이미지가 없어요", "No generated images yet"); },
  get mineEmptyCta() { return t("컨셉 선택하러 가기", "Pick a concept"); },
  get mineLoadFailed() { return t("갤러리를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.", "Couldn't load your gallery. Please try again in a moment."); },
  // 커스텀 보정
  get retouchPhotoTitle() { return t("고칠 사진", "Photo to fix"); },
  get retouchPhotoSub() { return t("고치고 싶은 사진을 골라 주세요", "Choose the photo you want to fix"); },
  get retouchTitle() { return t("어떻게 고칠까요?", "What should we fix?"); },
  get retouchPlaceholder() { return t("예) 뒤에 지나가는 사람 지워줘\n예) 베일이 처졌어, 머리도 정리해줘", "e.g. Remove the person walking behind me\ne.g. My veil is drooping, tidy my hair too"); },
  get needRetouchText() { return t("고칠 내용을 적어 주세요", "Tell us what to fix"); },
  // 카메라·필터 탭
  get cameraNeeded() { return t("카메라 권한이 필요해요", "Camera access is needed"); },
  get openSettings() { return t("설정 열기", "Open Settings"); },
  get aeafLock() { return t("AE/AF 잠금", "AE/AF LOCK"); },
  get mirror() { return t("좌우반전", "Mirror"); },
  get colorAmount() { return t("색감", "Color"); },
  get album() { return t("앨범", "Album"); },
  get flip() { return t("전환", "Flip"); },
  get original() { return t("원본", "Original"); },
  burstDone: (n: number) => (isKo ? `완료 ${n}` : `Done ${n}`),
  get favRemoved() { return t("즐겨찾는 필터에서 뺐어요", "Removed from favorites"); },
  get favAdded() { return t("즐겨찾는 필터에 넣었어요 · 맨 앞에 모여요", "Added to favorites · shown first"); },
  // 제3자 AI 전송 고지(iOS AIConsentSheet · Copy.consent*)
  get consentTitle() { return t("사진을 Google AI로 보내도 될까요?", "Share your photo with Google's AI?"); },
  get consentAI() { return t("보내는 데이터: 고른 사진, 등록한 얼굴 스캔 사진(있다면), 입력한 요청 문구와 선택한 컨셉.", "What is sent: the photo you choose, your saved face-scan photos (if any), and the request text / concept you pick."); },
  get consentUpload() { return t("받는 곳: Google LLC의 Gemini API(미국). 이미지 생성과 결과 품질 확인에만 쓰이고, 광고·학습 등 다른 목적으로 쓰지 않아요.", "Sent to: Google LLC's Gemini API (United States), only to create your image and check its quality — never for ads or any other purpose."); },
  get consentDevice() { return t("보관: 올린 사진은 우리 서버에 저장하지 않고 처리 후 바로 폐기해요. 결과 이미지는 24시간 뒤 자동 삭제되고, 얼굴 스캔 사진은 이 기기에만 저장돼요.", "Storage: your uploads are not stored on our servers and are discarded right after processing. Results are auto-deleted after 24 hours; face-scan photos stay on this device."); },
  get consentOwnPhoto() { return t("본인 사진이거나, 사진 속 사람에게 동의를 받은 사진이에요.", "It's my photo, or I have consent from the person in it."); },
  get consentIDNote() { return t("여권·신분증용 사진은 사진관에서 찍어 주세요.", "For passports and ID cards, please use a photo studio."); },
  get consentPrivacyLink() { return t("개인정보처리방침에서 자세히 보기", "Learn more in our Privacy Policy"); },
  get consentAgree() { return t("허용하고 계속", "Allow and continue"); },
  get consentLater() { return t("허용 안 함", "Don't allow"); },
  // 코치마크
  get coachSkip() { return t("건너뛰기", "Skip"); },
  get coachGotIt() { return t("알겠어요", "Got it"); },
  get coachStart() { return t("시작하기", "Start"); },
  get coachNext() { return t("다음", "Next"); },
};
