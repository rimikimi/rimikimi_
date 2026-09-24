import Foundation

// 화면에 보이는 모든 문구 — 한국어(ko) / 영어(en) 한 곳에 모은다. 언어 판정은 `L`(L10n.swift).
// ⚠️ 한국어 문구는 옮기기 전 하드코딩 문구와 글자 하나까지 같다. 바꿀 땐 여기만 고치면 된다.
// 영어는 웹 `src/i18nStrings.js` 의 en 표와 같은 뜻·톤을 따른다(짧고 친근하게, 브랜드는 소문자 rimikimi).
// 서버가 보내는 문구(푸시 본문, `json["error"]`)는 여기 없다 — 서버가 한국어로 보낸다.

/// 영어 복수형 — "1 photo" / "3 photos".
private func plural(_ n: Int, _ one: String, _ many: String) -> String { n == 1 ? "1 \(one)" : "\(n) \(many)" }

enum Copy {
    // MARK: 공통

    static var close: String { L.t("닫기", "Close") }
    static var cancel: String { L.t("취소", "Cancel") }
    static var change: String { L.t("변경", "Change") }
    static var choose: String { L.t("고르기", "Choose") }
    static var delete: String { L.t("삭제", "Delete") }
    static var share: String { L.t("공유", "Share") }
    static var shareAction: String { L.t("공유하기", "Share") }
    static var signIn: String { L.t("로그인", "Sign in") }
    static var camera: String { L.t("카메라", "Camera") }
    static var loading: String { L.t("불러오는 중", "Loading") }
    static var unlimited: String { L.t("무제한", "Unlimited") }
    static var retryNetwork: String { L.t("인터넷 연결을 확인한 뒤 다시 시도해 주세요.", "Check your internet connection and try again.") }
    static var savedToPhotos: String { L.t("사진첩에 저장됐어요", "Saved to your photos") }
    static var saveFailed: String { L.t("저장에 실패했어요. 잠시 후 다시 시도해 주세요.", "Couldn't save. Please try again in a moment.") }
    static var terms: String { L.t("이용약관", "Terms of Service") }
    static var privacy: String { L.t("개인정보처리방침", "Privacy Policy") }
    static var refund: String { L.t("환불정책", "Refund Policy") }

    /// "3장" / "3 photos"
    static func photos(_ n: Int) -> String { L.ko ? "\(n)장" : plural(n, "photo", "photos") }
    /// "3 크레딧" / "3 credits"
    static func credits(_ n: Int) -> String { L.ko ? "\(n) 크레딧" : plural(n, "credit", "credits") }
    /// 원화 금액 폴백(스토어 가격을 못 받았을 때만) — "3,900원" / "₩3,900"
    static func krw(_ v: Int) -> String { L.ko ? "\(v.formatted())원" : v.formatted(.currency(code: "KRW").precision(.fractionLength(0))) }

    // MARK: 탭

    static var tabGallery: String { L.t("갤러리", "Gallery") }
    static var tabFilter: String { L.t("필터", "Filter") }
    static var tabMyPhotos: String { L.t("내 사진", "My Photos") }
    static var tabProfile: String { L.t("프로필", "Profile") }

    // MARK: 갤러리(홈)

    static var featured: String { L.t("추천", "Featured") }
    static var newArrivals: String { L.t("새로 나왔어요", "New Arrivals") }
    static var creditsLabel: String { L.t("크레딧", "Credits") }
    static var allCategories: String { L.t("전체", "All") }
    static var categoriesHeader: String { L.t("카테고리", "Categories") }
    static var more: String { L.t("더보기", "More") }
    static var a11yNew: String { L.t("새로 나옴", "New") }
    static var favoriteRemove: String { L.t("즐겨찾기 해제", "Remove from favorites") }
    static var favoriteAdd: String { L.t("즐겨찾기", "Add to favorites") }
    static var favoriteBadge: String { L.t("즐겨찾기", "Favorite") }
    static var madeBadge: String { L.t("만든 컨셉", "Made") }
    static var a11yAlreadyMade: String { L.t("이미 만든 컨셉", "Already made") }
    static var noResults: String { L.t("검색 결과가 없어요", "No results") }
    static var makeWithThisConcept: String { L.t("이 컨셉으로 만들기", "Create with this concept") }
    /// 앨범 타일 장수 — "12장" / "12" (웹 `home.albumCount`)
    static func albumCount(_ n: Int) -> String { L.ko ? "\(n)장" : "\(n)" }
    static var brooklynTitle: String { L.t("증명사진이 필요하다면, Brooklyn", "Need an ID photo? Try Brooklyn") }
    static var brooklynDesc: String { L.t("여권·이력서·배우 프로필까지\n셀카 한 장이면 스튜디오급으로", "Passport, resume, actor headshots\nStudio quality from one selfie") }
    static var brooklynGet: String { L.t("받기", "Get") }

    /// 헤더 크레딧 칩 — `Quota.chipLabel`
    static var chipUnlimited: String { L.t("∞ 무제한", "∞ Unlimited") }
    static func chipFree(_ n: Int) -> String { L.ko ? "무료 \(n)장" : "\(n) free" }

    // MARK: 카테고리 이름 (데이터는 한국어 그대로 — 화면에 보일 때만 바꾼다)

    /// `api/_data/concepts.json`·`concepts.fallback.json` 의 category/categories 값 + 시즌(`seasons.fallback.json`)
    /// + 즐겨찾기 앨범. 영어는 웹 `i18nStrings.js` `__categories` 와 같다. 표에 없으면 원래 이름 그대로.
    static let categoryEN: [String: String] = [
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
        "🪄 매직 부스": "🪄 Magic Booth",
        "📸 인생네컷": "📸 Photo Booth",
        "🪪 증명사진": "🪪 ID Photo",
        "🎞️ 필터": "🎞️ Filter",
        // 시즌
        "🌕 추석 인사": "🌕 Chuseok Greetings",
        "🎃 핼러윈": "🎃 Halloween",
        "🍫 빼빼로데이": "🍫 Pepero Day",
        "🎄 크리스마스": "🎄 Christmas",
        "🎊 새해": "🎊 New Year",
        "🧧 설날": "🧧 Lunar New Year",
        "💝 발렌타인데이": "💝 Valentine's Day",
        "🤍 화이트데이": "🤍 White Day",
        "🌸 벚꽃": "🌸 Cherry Blossoms",
        // 즐겨찾기 앨범(`FavoritesStore.albumName`)
        "⭐ 즐겨찾기": "⭐ Favorites",
    ]
    static func category(_ name: String) -> String { L.ko ? name : (categoryEN[name] ?? name) }

    // MARK: 인생네컷 스타일 (서버 `fourcutStyles` 라벨은 한국어 — key 로 영어를 찾는다)

    static let fourcutStyleEN: [String: String] = [
        "cute": "Cute", "luxury": "Luxury", "funky": "Funky", "playful": "Playful",
        "birthday": "Birthday", "film": "Film", "summer": "Summer", "mono": "Mono",
        "school": "School Uniform", "couple": "Couple", "wedding": "Wedding", "party": "Party",
        "beach": "Beach", "vintage": "Vintage", "christmas": "Christmas", "newtro": "Newtro",
        "editorial": "Editorial",
    ]
    static func fourcutStyle(key: String, fallback: String) -> String { L.ko ? fallback : (fourcutStyleEN[key] ?? fallback) }

    // MARK: 필터 탭

    static var filterTitle: String { L.t("필터", "Filters") }
    static var filterGroupPhone: String { L.t("폰카", "Phone cam") }
    static var filterGroupFilm: String { L.t("필름", "Film") }
    static var filterGroupCamera: String { L.t("카메라", "Camera") }
    static var filterGroupFun: String { L.t("재미", "Fun") }
    /// 프리셋 이름 (key → ko, en). 영어는 웹 `src/filters.js` 의 en.
    static let filterNames: [String: (ko: String, en: String)] = [
        "ph16pro": ("16 Pro", "16 Pro"), "ph15pro": ("15 Pro", "15 Pro"), "ph14pro": ("14 Pro", "14 Pro"),
        "phxs": ("XS", "XS"), "ph7": ("7", "7"), "ph6s": ("6s", "6s"), "ph4s": ("4s", "4s"), "ph3gs": ("3GS", "3GS"),
        "golden": ("골든", "Golden"), "peach": ("피치", "Peach"), "slide": ("슬라이드", "Slide"),
        "retro": ("레트로", "Retro"), "vivid": ("비비드", "Vivid"), "green": ("그린", "Green"),
        "pastel": ("파스텔", "Pastel"), "cine": ("시네", "Cine"), "newtro": ("뉴트로", "Newtro"),
        "softmono": ("소프트 모노", "Soft Mono"),
        "warm": ("웜톤", "Warm"), "cool": ("쿨톤", "Cool"), "vintage": ("빈티지", "Vintage"),
        "docu": ("다큐", "Docu"), "mono": ("모노", "Mono"), "digicam": ("디지캠", "Digicam"),
        "toy": ("토이", "Toy"), "dispo": ("일회용", "Dispo"), "instant": ("인스턴트", "Instant"),
        "sepia": ("세피아", "Sepia"), "duopink": ("듀오 핑크", "Duo Pink"), "neon": ("네온", "Neon"),
        "thermal": ("서모", "Thermal"), "glitch": ("글리치", "Glitch"), "vhs": ("VHS", "VHS"),
        "pixelate": ("모자이크", "Pixel"), "sketch": ("스케치", "Sketch"),
    ]
    static func filterName(_ key: String) -> String {
        guard let n = filterNames[key] else { return key }
        return L.ko ? n.ko : n.en
    }
    static var filterOriginal: String { L.t("원본", "Original") }
    static func todaysFilter(_ group: String) -> String { L.ko ? "오늘의 필터 · \(group)" : "Today's filter · \(group)" }
    static var filterTapToStart: String { L.t("탭하면 이 필터로 바로 시작", "Tap to start with this filter") }
    static var filterUpTo10: String { L.t("한 번에 10장까지", "Up to 10 at once") }
    static var filterAllFree: String { L.t("전부 무료", "All free") }
    static var filterShootCamera: String { L.t("카메라로 찍기", "Take photos") }
    static var filterShootCameraSub: String { L.t("· 여러 장 찍고 한 번에 필터", "· Shoot, then filter all") }

    // MARK: 컨셉 옵션 화면

    static var myPhoto: String { L.t("내 사진", "My photo") }
    static var myPhotoInUse: String { L.t("등록된 사진 사용", "Using your saved photo") }
    static var myPhotoNone: String { L.t("얼굴이 잘 보이는 사진 한 장이면 충분해요", "One clear photo of your face is enough") }
    static var slotReady: String { L.t("사진 준비됨 · 서버에 저장되지 않아요", "Photo ready · not stored on our servers") }
    static var needArt: String { L.t("변환할 사진을 골라주세요", "Choose a photo to transform") }
    static var needMain: String { L.t("먼저 내 사진을 등록해 주세요", "Add your photo first") }
    static var needPartner: String { L.t("상대 사진도 올려주세요 🙂", "Add your partner's photo too 🙂") }
    static var needGarment: String { L.t("입어볼 의상 사진을 먼저 올려주세요 🙂", "Please add a clothing photo first 🙂") }
    static var artTitle: String { L.t("변환할 사진", "Photo to transform") }
    static var artSub: String { L.t("인물, 풍경, 동물, 정물 무엇이든 좋아요", "People, scenery, pets, objects — anything works") }
    static var partnerTitle: String { L.t("상대 사진", "Partner's photo") }
    static var partnerSub: String { L.t("얼굴이 잘 보이는 사진이면 좋아요", "A photo with a clear face works best") }
    static var dressStyleQuestion: String { L.t("어떤 컷으로 만들까요?", "Which cut?") }
    static var dressMirror: String { L.t("거울셀카", "Mirror selfie") }
    static var dressModel: String { L.t("일상컷", "Everyday cut") }
    static var cutsTitle: String { L.t("컷 수", "Cuts") }
    /// "4컷" / "4 cuts"
    static func cuts(_ n: Int) -> String { L.ko ? "\(n)컷" : plural(n, "cut", "cuts") }
    static var styleTitle: String { L.t("스타일", "Style") }
    static var batchTitle: String { L.t("한 번에 만들기", "Make several at once") }
    static func creditsHeld(_ n: Int) -> String { L.ko ? "크레딧 \(n)개 보유" : "You have \(plural(n, "credit", "credits"))" }
    /// 묶음 할인 배지 — "17% 할인" / "Save 17%"
    static func percentOff(_ pct: Int) -> String { L.ko ? "\(pct)% 할인" : "Save \(pct)%" }
    static var footArt: String { L.t("업로드하신 사진을 선택한 컨셉으로 변환해 드려요.", "We'll transform your photo into the selected concept.") }
    static var footFace: String { L.t("선택한 컨셉으로 내 얼굴 특징을 살린 이미지를 만들어 드려요.", "We'll create this concept keeping your facial features.") }
    static func makeCost(_ n: Int) -> String { L.ko ? "만들기 · \(n) 크레딧" : "Create · \(plural(n, "credit", "credits"))" }
    static var loginToSave: String { L.t("생성된 이미지 저장을 위해 로그인이 필요합니다", "Sign in to save your generated image") }
    static var garmentsTitle: String { L.t("입어볼 의상 (한 번에 5장까지 선택)", "Items to try on (pick up to 5 at once)") }
    static func garmentRemove(_ i: Int) -> String { L.ko ? "의상 \(i) 삭제" : "Remove item \(i)" }
    static var garmentAddFirst: String { L.t("의상 올리기", "Add item") }
    static var garmentAddMore: String { L.t("더 추가", "Add more") }
    static var garmentAutoNote: String { L.t("빠진 의상은 AI가 판단해서 생성해줘요.", "Anything missing, AI fills in to match.") }

    // MARK: 결과

    static func resultCount(_ n: Int, page: Int) -> String {
        L.ko ? "\(n)장 만들었어요 · \(page) / \(n)" : "\(plural(n, "photo", "photos")) made · \(page) / \(n)"
    }
    static var resultSavedNotice: String { L.t("내 사진에 저장됐어요 · 앨범에도 저장", "Saved to My Photos · save to your album too") }
    static var resultNotThreeFour: String { L.t("사진이 3:4 가 아니에요 · 정방향 맞춤", "This photo isn't 3:4 · Fit to 3:4") }
    static var saving: String { L.t("저장 중…", "Saving…") }
    static var saveToAlbum: String { L.t("앨범에 저장", "Save to album") }
    static var edit: String { L.t("다듬기", "Edit") }
    static var oneMore: String { L.t("한 장 더", "One more") }
    static var reportResult: String { L.t("🚩 부적절한 결과 신고", "🚩 Report inappropriate result") }
    static var similarConcepts: String { L.t("비슷한 컨셉", "Similar concepts") }
    static var resultTitle: String { L.t("결과", "Result") }
    static var fittedToast: String { L.t("3:4 로 맞췄어요", "Fitted to 3:4") }
    static func reportSubject(_ itemId: String) -> String { L.ko ? "[신고] 부적절한 생성 결과 #\(itemId)" : "[신고][Report] Inappropriate result #\(itemId)" }
    static func reportBody(concept: String, itemId: String) -> String {
        L.ko ? "신고 사유를 적어주세요.\n\n컨셉: \(concept)\n결과 ID: \(itemId)\n"
             : "Please tell us why you're reporting this.\n\nConcept: \(concept)\nResult ID: \(itemId)\n"
    }

    // MARK: 정방향 맞춤(3:4)

    static var fitTitle: String { L.t("정방향 맞춤", "Fit to 3:4") }
    static var fitDesc: String { L.t("이 사진은 3:4 가 아니에요. 얼굴 기준으로 잘라 맞추거나, 바깥을 채워 맞출 수 있어요.", "This photo isn't 3:4. You can crop it around the face, or fill in the edges to fit.") }
    static func fitOriginal(_ w: Int, _ h: Int) -> String { L.ko ? "원본 \(w)×\(h)" : "Original \(w)×\(h)" }
    static var fitCropPreview: String { L.t("잘라 맞춤 미리보기", "Crop preview") }
    static var fitCropFree: String { L.t("잘라 맞춤 · 무료", "Crop · free") }
    static var fitFilledToast: String { L.t("채워 맞춤으로 3:4 를 만들었어요", "Filled in to 3:4") }
    static var fitFilling: String { L.t("채워 맞추는 중…", "Filling in…") }
    static var fitFillCost: String { L.t("채워 맞춤 · 1 크레딧", "Fill in · 1 credit") }
    static var fitFootnote: String { L.t("잘라 맞춤은 기기 안에서만 처리돼요. 채워 맞춤은 원본 픽셀을 유지하고 바깥만 채워요.", "Cropping happens only on your device. Fill in keeps your original pixels and only fills the edges.") }
    static var outpaintNeedCredit: String { L.t("채워 맞춤은 1크레딧이 필요해요. 프로필 › 크레딧 충전 뒤 다시 눌러 주세요.", "Fill in needs 1 credit. Top up in Profile, then tap again.") }
    static var outpaintFailed: String { L.t("채워 맞춤에 실패했어요. 잠시 후 다시 시도해 주세요.", "Fill in failed. Please try again in a moment.") }

    // MARK: 얼굴 스캔 (편의 기능 — 정확도 문구 금지)

    static var faceUseThis: String { L.t("이 얼굴을 사용할까요?", "Use this face?") }
    static var faceStoredOnDevice: String { L.t("이 사진들은 이 아이폰 안에만 저장돼요.\n사진을 만들 때만 참조로 쓰이고 서버에 보관하지 않아요.", "These photos are stored only on this iPhone.\nThey're used as a reference only while creating photos and are never kept on our servers.") }
    static var faceStart: String { L.t("이 얼굴로 시작하기", "Start with this face") }
    static var faceRetake: String { L.t("다시 찍기", "Retake") }
    static var faceGetReady: String { L.t("준비하세요", "Get ready") }
    static var faceLookFront: String { L.t("정면을 봐주세요", "Look straight ahead") }
    static var faceTurnSide: String { L.t("고개를 한쪽으로 천천히", "Slowly turn your head to one side") }
    static var faceOtherSide: String { L.t("이제 반대쪽으로", "Now the other side") }
    static var faceDone: String { L.t("다 됐어요", "All done") }
    static var faceHintWarmup: String { L.t("얼굴을 원 안에 맞춰 주세요 · 곧 시작해요", "Fit your face in the circle · starting soon") }
    static var faceHoldStill: String { L.t("그대로 멈춰 주세요", "Hold still") }
    static var faceFillCircle: String { L.t("얼굴을 원 안에 꽉 채워 주세요", "Fill the circle with your face") }
    static var faceSidePause: String { L.t("45도쯤에서 잠깐 멈추면 자동으로 찍혀요", "Pause at about 45° and it captures automatically") }
    static var faceNotVisible: String { L.t("얼굴이 안 보여요", "Can't see your face") }
    static var faceOnlyOne: String { L.t("한 사람만 나오게 해주세요", "Only one person in the frame, please") }
    static var faceCloser: String { L.t("조금 더 가까이 와주세요", "Come a little closer") }
    static var faceOppositeSide: String { L.t("아까와 반대쪽으로 돌려주세요", "Turn the other way from before") }
    static var faceBrighter: String { L.t("조금 더 밝은 곳에서, 잠깐 멈춰 주세요", "Find brighter light and hold still for a moment") }
    static var angleFront: String { L.t("정면", "Front") }
    static var angleSide1: String { L.t("옆모습 ①", "Side ①") }
    static var angleSide2: String { L.t("옆모습 ②", "Side ②") }
    static var faceProfileSaved: String { L.t("얼굴 프로필을 저장했어요", "Face profile saved") }

    // MARK: 로그인

    static var loginTagline: String { L.t("상상이 현실이 되는 곳", "Where imagination becomes real") }
    static var loginApple: String { L.t("Apple로 시작하기", "Continue with Apple") }
    static var loginKakao: String { L.t("카카오로 시작하기", "Continue with Kakao") }
    static var loginNaver: String { L.t("네이버로 시작하기", "Continue with Naver") }
    static var loginGoogle: String { L.t("Google로 시작하기", "Continue with Google") }
    static var loginTerms: String { L.t("로그인하면 서비스 이용약관과 개인정보 처리방침에 동의하는 것으로 간주합니다.", "By signing in, you agree to our Terms of Service and Privacy Policy.") }
    static var loginOpening: String { L.t("이동 중…", "Opening…") }
    static var signedOut: String { L.t("로그인 안 함", "Not signed in") }
    static var signedIn: String { L.t("로그인됨", "Signed in") }
    static var loginNotFinished: String { L.t("로그인을 마치지 못했어요. 잠시 후 다시 시도해 주세요", "Couldn't finish signing in. Please try again in a moment") }
    static var loginInfoUnreadable: String { L.t("로그인 정보를 읽지 못했어요", "Couldn't read your sign-in info") }
    static var loginEmailTaken: String { L.t("이 이메일은 이미 다른 방법(구글·카카오·네이버·애플 중 하나)으로 가입돼 있어요.\n처음 가입할 때 쓴 방법으로 로그인해 주세요 🙂", "This email is already registered with another method (Google, Kakao, Naver or Apple).\nPlease sign in the way you first signed up 🙂") }
    static var loginFailedRetry: String { L.t("로그인에 실패했어요. 다시 시도해 주세요.", "Sign-in failed. Please try again.") }
    static var loginFailed: String { L.t("로그인에 실패했어요.", "Sign-in failed.") }
    static var loginNoResponse: String { L.t("응답이 없어요", "No response") }
    static var loginStartFailed: String { L.t("로그인 시작에 실패했어요.", "Couldn't start sign-in.") }

    // MARK: AI 전송 고지

    static var consentTitle: String { L.t("사진은 이렇게 쓰여요", "How your photos are used") }
    static var consentAI: String { L.t("이 서비스는 인공지능(Google Gemini API)으로 이미지를 생성해요.", "This service creates images with AI (Google Gemini API).") }
    static var consentUpload: String { L.t("업로드한 사진은 이미지를 생성할 때만 Google로 전송되고, 서버에 저장하지 않아요 — 처리 후 즉시 폐기돼요.", "Photos you upload are sent to Google only while an image is being generated and are never stored on our servers — they're discarded right after processing.") }
    static var consentDevice: String { L.t("등록해 둔 얼굴 참조사진은 이용자 기기에만 저장돼요. 생성할 때만 함께 전송돼요.", "Face reference photos you save are stored only on your device. They're sent along only while generating.") }
    static var consentPrivacyLink: String { L.t("개인정보처리방침에서 자세히 보기", "Learn more in our Privacy Policy") }
    static var consentAgree: String { L.t("동의하고 계속", "Agree and continue") }
    static var consentLater: String { L.t("다음에", "Not now") }

    // MARK: 안내(온보딩)

    static var guideTitle: String { L.t("3단계면 끝나요", "Three steps, that's it") }
    /// ⚠️ 새 컨셉은 한국 시간 저녁 8시에 한꺼번에 열린다 — 영어로 "your time" 이라 쓰면 사실과 다르다.
    static var guideSteps: [(String, String)] {
        L.ko ? [
            ("1. 컨셉 고르기", "매일 저녁 8시에 새 컨셉이 올라와요."),
            ("2. 사진 한 장 올리기", "얼굴이 잘 보이는 사진이면 충분해요."),
            ("3. 기다리기", "최대 몇 분 걸려요. 앱을 닫아도 계속 만들어지고, 다 되면 알려드려요."),
        ] : [
            ("1. Pick a concept", "New concepts drop every day."),
            ("2. Upload one photo", "Any photo where your face is clearly visible."),
            ("3. Wait", "It can take a few minutes. You can close the app — we'll notify you when it's ready."),
        ]
    }
    static var guideExpire: String { L.t("만든 사진은 24시간 뒤 사라져요. 마음에 들면 꼭 저장하세요.", "Your photos disappear after 24 hours. Save the ones you like.") }
    static var guideStart: String { L.t("시작하기", "Get started") }

    // MARK: 내 사진

    static var mineLoginPrompt: String { L.t("로그인하면 내가 만든 이미지를 볼 수 있어요", "Sign in to see the images you've created") }
    static var mineEmpty: String { L.t("아직 생성한 이미지가 없어요", "No generated images yet") }
    static var mineEmptyCta: String { L.t("컨셉 선택하러 가기", "Pick a concept") }
    static var mineNotice: String { L.t("생성된 이미지는 24시간만 보관돼요. 오래 보관하려면 앨범에 저장해 주세요.", "Generated images are kept for 24 hours. Save them to your album to keep them.") }
    static var mineLoadFailed: String { L.t("갤러리를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.", "Couldn't load your gallery. Please try again in a moment.") }
    static var genRunning: String { L.t("이미지를 만들고 있어요", "Creating your image") }
    static var genWaiting: String { L.t("연결이 잠시 끊겼지만 서버는 계속 만들고 있어요.\n결과를 기다리는 중이에요...", "The connection dropped, but the server is still working.\nWaiting for your result...") }
    static func genBatchHint(_ n: Int) -> String { L.ko ? "\(n)장을 만드는 중이라 몇 분까지 걸릴 수 있어요" : "Making \(n) photos — this can take a few minutes" }
    static var genHint: String { L.t("최대 몇 분까지 걸릴 수 있어요", "This can take a few minutes") }
    static var genDone: String { L.t("완성!", "Done!") }
    static var genView: String { L.t("보기", "View") }
    static var genFailed: String { L.t("생성 실패", "Generation failed") }
    static var genNoResult: String { L.t("결과를 받지 못했어요. 내 사진에서 다시 확인해 주세요.", "We couldn't get the result. Check My Photos again shortly.") }
    static var getCredits: String { L.t("크레딧 충전", "Get credits") }

    // MARK: 프로필

    static var store: String { L.t("스토어", "Store") }
    static var storeValue: String { L.t("충전 · 구독", "Top up · Subscribe") }
    static var inviteFriends: String { L.t("친구 초대", "Invite friends") }
    static var faceRescan: String { L.t("얼굴 다시 스캔하기", "Rescan face") }
    static var faceScan: String { L.t("얼굴 스캔하기", "Scan face") }
    static func faceSavedCount(_ n: Int) -> String { L.ko ? "\(n)장 등록됨" : "\(n) saved" }
    static var account: String { L.t("계정", "Account") }
    static var signOut: String { L.t("로그아웃", "Sign out") }
    static var deleting: String { L.t("삭제 중…", "Deleting…") }
    static var deleteAccount: String { L.t("계정 삭제", "Delete account") }
    static var guestTitle: String { L.t("로그인이 필요해요", "Sign in required") }
    static var guestDesc: String { L.t("로그인하면 크레딧, 내 갤러리, 친구 초대를 이용할 수 있어요.", "Sign in to use credits, your gallery, and invite friends.") }
    // 사업자 정보(전자상거래법 표시) — 영어는 웹 `footer.biz.*`
    static var bizLine1: String { L.t("상호: 리미키미 · 사업자등록번호: 247-01-03603", "rimikimi · Business Reg. No. 247-01-03603") }
    static var bizLine2: String { L.t("통신판매업신고: 2026-고양일산동-0326 · 경기 고양시 일산동구", "Mail-order Sales No. 2026-Goyang-Ilsandong-0326 · Ilsandong-gu, Goyang-si, Gyeonggi-do, Korea") }
    static var bizLine3: String { L.t("문의: enquiry@rimikimi.com · 050-6988-2464", "Contact: enquiry@rimikimi.com · +82-50-6988-2464") }
    static var deleteConfirmTitle: String { L.t("정말 계정을 삭제할까요?", "Delete your account?") }
    static var deleteConfirmMessage: String { L.t("생성한 이미지·크레딧·모든 데이터가 영구 삭제되며 되돌릴 수 없어요.", "All your generated images, credits, and data will be permanently erased. This cannot be undone.") }
    static var deleteDone: String { L.t("계정이 삭제됐어요. 그동안 이용해 주셔서 감사합니다.", "Your account has been deleted. Thank you for using rimikimi.") }
    static var providerKakao: String { L.t("카카오", "Kakao") }
    static var providerNaver: String { L.t("네이버", "Naver") }
    static var providerEmail: String { L.t("이메일", "Email") }
    static var pushTitle: String { L.t("새 컨셉 알림", "New concept alerts") }
    static var pushDenied: String { L.t("설정에서 알림이 꺼져 있어요", "Notifications are turned off in Settings") }
    static var pushDesc: String { L.t("매일 저녁 8시 새 컨셉이 오면 알려드려요", "We'll let you know at 8 PM your time when new concepts drop") }
    static var myPhotoSaved: String { L.t("등록됨 · 생성 때 얼굴 참조로 함께 보내요", "Saved · used when creating") }
    static var myPhotoEmpty: String { L.t("없음 · 컨셉을 만들 때 자동으로 등록돼요", "None · added automatically when you create") }

    // MARK: 스토어

    static var storeBalance: String { L.t("현재 보유", "Balance") }
    static var storeIntro: String { L.t("하루 무료 1장을 모두 사용했어요. 크레딧 1장으로 이미지 한 장을 만들 수 있어요.", "You've used today's 1 free image. 1 credit = 1 image.") }
    static var storePacks: String { L.t("크레딧 팩", "Credit packs") }
    static var storeSubs: String { L.t("rimikimi+ 구독", "rimikimi+ subscription") }
    static var storeSubsDesc: String { L.t("광고·워터마크 제거 + 크레딧 자동 충전", "No ads or watermark + automatic credit refills") }
    static var restoring: String { L.t("복원 중…", "Restoring…") }
    static var restore: String { L.t("구매 복원", "Restore purchases") }
    static var restoreDone: String { L.t("구매 내역을 확인했어요.", "Checked your purchases.") }
    static var storeLegal: String { L.t("구매는 App Store 계정으로 안전하게 결제돼요. 구독은 기간 종료 24시간 전까지 해지하지 않으면 자동 갱신돼요.", "Purchases are billed securely through your App Store account. Subscriptions renew automatically unless canceled at least 24 hours before the end of the current period.") }
    static func purchaseDone(_ n: Int) -> String { L.ko ? "🎉 +\(n) 크레딧 충전 완료!" : "🎉 +\(plural(n, "credit", "credits")) added!" }
    static var purchaseTestNoCredit: String { L.t("테스트 결제라 크레딧은 적립되지 않았어요.", "This was a test purchase, so no credits were added.") }
    static func purchaseFailed(_ msg: String) -> String { L.ko ? "결제 처리 실패: \(msg)" : "Payment failed: \(msg)" }
    static func subLine(period: String?, credits n: Int) -> String {
        if L.ko { return "매\(period ?? "") \(n) 크레딧" }
        let every: String
        switch period {
        case "주": every = "week"
        case "월": every = "month"
        case "년": every = "year"
        default: every = "period"
        }
        return "\(plural(n, "credit", "credits")) every \(every)"
    }
    static func perImage(krw v: Int) -> String { L.ko ? "장당 \(v.formatted())원" : "\(Copy.krw(v)) each" }
    static var processing: String { L.t("처리 중…", "Processing…") }
    static var notEnoughCredits: String { L.t("크레딧이 부족해요", "Not enough credits") }
    static var continueAfterTopUp: String { L.t("충전하면 하던 작업이 바로 이어져요.", "Top up and we'll pick up right where you left off.") }
    static var oneCreditOneImage: String { L.t("크레딧 1장으로 이미지 한 장을 만들 수 있어요.", "1 credit = 1 image.") }
    static var inviteForFree: String { L.t("친구 초대로 무료 3장", "Invite friends · 3 free credits") }
    static var packIntro: String { L.t("인트로", "Intro") }
    static var packMini: String { L.t("미니", "Mini") }
    static var packStandard: String { L.t("스탠다드", "Standard") }
    static var packPro: String { L.t("프로", "Pro") }
    static var subWeekly: String { L.t("위클리", "Weekly") }
    static var subMonthly: String { L.t("먼슬리", "Monthly") }
    static var subAnnual: String { L.t("애뉴얼", "Annual") }
    static var badgeFirst: String { L.t("첫 구매", "First purchase") }
    static var badgeBest: String { L.t("베스트 가치", "Best value") }
    static var badgeCheapest: String { L.t("장당 최저", "Lowest per photo") }
    static var badgeLowest: String { L.t("가장 저렴", "Best price") }
    static var payNotReady: String { L.t("결제가 아직 준비되지 않았어요.", "Payments aren't ready yet.") }
    static var storeNoProducts: String { L.t("스토어가 상품 0개를 반환했어요. 잠시 후 다시 시도해 주세요.", "The store returned no products. Please try again in a moment.") }
    static var storeProductMissing: String { L.t("스토어에서 상품을 찾지 못했어요.", "Couldn't find this product in the store.") }

    // MARK: 친구 초대

    static var inviteHeadline: String { L.t("🎟 친구 초대하면 크레딧 3개", "🎟 Invite & earn 3 credits") }
    static func inviteDesc(_ invited: Int) -> String { L.ko ? "친구 1명 초대할 때마다 크레딧 3개! (현재 \(invited)명 초대)" : "Get 3 credits for every friend you invite! (\(invited) invited so far)" }
    static var inviteDescShort: String { L.t("친구 1명 초대할 때마다 크레딧 3개!", "3 credits per friend invited!") }
    static var inviteMyCode: String { L.t("내 초대 코드", "Your invite code") }
    static var inviteCodeCopied: String { L.t("초대 코드를 복사했어요", "Invite code copied") }
    static var inviteTapToCopy: String { L.t("탭해서 복사", "Tap to copy") }
    static var inviteShareText: String { L.t("내 얼굴로 인생 프로필 만들기 ✨ rimikimi 같이 해요! 이 링크로 시작하면 저도 크레딧을 받아요 🙌", "Turn your face into a dream portrait ✨ Try rimikimi with me! If you start with this link, I get credits too 🙌") }
    static var inviteEnterCode: String { L.t("친구 초대 코드 입력", "Enter a friend's code") }
    static var inviteCodePlaceholder: String { L.t("6자 코드", "6-character code") }
    static var inviteApply: String { L.t("등록", "Apply") }
    static var inviteCodeHelp: String { L.t("설치 경로에서 링크가 끊겼을 때 친구의 코드를 직접 넣어요.", "If the invite link didn't carry over when you installed, enter your friend's code here.") }
    static var inviteOk: String { L.t("초대가 등록됐어요! 친구에게 크레딧 3개가 쌓였어요 🎉", "Invite registered — your friend got 3 credits 🎉") }
    static var inviteErrInvalid: String { L.t("코드를 다시 확인해 주세요", "Please check the code") }
    static var inviteErrNotFound: String { L.t("없는 코드예요", "That code doesn't exist") }
    static var inviteErrSelf: String { L.t("내 코드는 등록할 수 없어요", "You can't use your own code") }
    static var inviteErrAlready: String { L.t("이미 초대 코드를 등록했어요", "You've already used an invite code") }
    static var inviteErrRetry: String { L.t("잠시 후 다시 시도해 주세요", "Please try again in a moment") }

    // MARK: 카메라 · 편집기

    static var burstAllTaken: String { L.t("10장을 다 찍었어요 · 완료를 눌러 주세요", "You've taken all 10 · tap Done") }
    static var burstHint: String { L.t("여러 장 찍고 한 번에 필터를 입혀요 · 최대 10장", "Shoot several, then filter them all at once · up to 10") }
    static func burstDone(_ n: Int) -> String { L.ko ? "완료 \(n)" : "Done \(n)" }
    static var cameraPermissionTitle: String { L.t("카메라 권한이 필요해요", "Camera access needed") }
    static var cameraPermissionDesc: String { L.t("설정에서 카메라를 켜면 여러 장을 찍어 한 번에 필터를 입힐 수 있어요.", "Turn on camera access in Settings to shoot several photos and filter them all at once.") }
    static var openSettings: String { L.t("설정 열기", "Open Settings") }
    static var shutter: String { L.t("촬영", "Shutter") }
    static var decorate: String { L.t("꾸미기", "Decorate") }
    static func savedNToAlbum(_ n: Int) -> String { L.ko ? "\(n)장을 앨범에 저장했어요" : "Saved \(plural(n, "photo", "photos")) to your album" }
    static var noAlbumPermission: String { L.t("앨범 저장 권한이 없어요", "No permission to save to your album") }
    static var savedToAlbum: String { L.t("앨범에 저장했어요", "Saved to your album") }

    // MARK: 서버 통신 오류(앱이 만드는 문구만 — 서버가 보낸 `error` 문구는 그대로 보여 준다)

    static var errNetwork: String { L.t("네트워크 요청에 실패했어요. 잠시 후 다시 시도해 주세요.", "Network request failed. Please try again shortly.") }
    static func errUnreadable(_ status: Int) -> String { L.ko ? "서버 응답을 읽을 수 없어요 (오류 \(status))" : "Couldn't read the server response (error \(status))" }
    static func errGenerate(_ status: Int) -> String { L.ko ? "이미지 생성 실패 (오류 \(status))" : "Image generation failed (error \(status))" }
    static var errDetailPrefix: String { L.t("\n\n[원문] ", "\n\n[Details] ") }
    static var errNoImage: String { L.t("이미지 응답을 받지 못했어요. 다른 컨셉으로 시도해 주세요.", "No image came back. Please try another concept.") }
    static var errOutpaintRetry: String { L.t("채워 맞춤을 하지 못했어요. 잠시 후 다시 시도해 주세요 🙂", "Couldn't fill in the photo. Please try again in a moment 🙂") }
    static var errOutpaintNoCharge: String { L.t("채워 맞춤을 하지 못했어요. 크레딧은 차감되지 않았어요 🙂", "Couldn't fill in the photo. No credit was used 🙂") }
    static var errOutpaintNoResult: String { L.t("채워 맞춤 결과를 받지 못했어요. 잠시 후 다시 시도해 주세요 🙂", "Didn't get the filled-in photo back. Please try again in a moment 🙂") }
    static func errPayment(_ status: Int) -> String { L.ko ? "결제 처리 실패 (오류 \(status))" : "Payment processing failed (error \(status))" }
    static var errPurchasePending: String { L.t("구매 확인 중이에요. 잠시 후 크레딧을 확인해 주세요.", "Confirming your purchase. Check your credits again in a moment.") }
    static func errRequest(_ status: Int) -> String { L.ko ? "요청에 실패했어요 (오류 \(status))" : "Request failed (error \(status))" }
}
