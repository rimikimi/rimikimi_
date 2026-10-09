import SwiftUI
import Observation
import UIKit

/// 탭 밖에서 공유되는 화면 상태 — 탭 선택, 스택 경로, 로그인 시트, 하던 동작(pending) 재개.
enum TabID: Hashable { case gallery, filter, camera, myPhotos, profile }

/// 각 탭 스택의 목적지.
enum Route: Hashable {
    case concept(Concept)
    case category(String)
    /// 카테고리 안의 사진들을 필름스트립으로 훑어보는 화면(네이티브 사진 앱 참고, 오너 지시
    /// 2026-09-19) — `startID` 는 어떤 사진을 누르고 들어왔는지.
    case browse(category: String, startID: String)
    case result(ResultPayload)
    case store
    case invite
    /// 설정(예전 프로필 탭) — 탭이 3개(만들기·카메라필터·내 사진)로 줄면서 홈 오른쪽 위 ⚙︎ 로 들어간다.
    case settings
    /// 홈 목적 칸(이력서·프로필 / 프사·소개팅 / 웨딩·커플 / 컨셉화보).
    case purpose(String)

    /// 이 화면이 탭바를 그대로 두는지(`.toolbar(.hidden, for: .tabBar)` 를 안 쓰는지).
    /// 떠 있는 카메라 원을 그릴지 판단하는 유일한 기준 — 탭바가 보이는데 카메라 원만 사라지면
    /// 안 된다(오너 지적 2026-09-22: "카테고리 안에 들어가면 카메라 버튼 없어지는데 그대로 있어야 함").
    /// 반대로 탭바를 숨기는 화면에서는 원도 숨겨야 한다 — 안 그러면 "만들기" 바 위에 겹친다.
    var keepsTabBar: Bool {
        switch self {
        case .category, .purpose: return true
        case .concept, .browse, .result, .store, .invite, .settings: return false
        }
    }
}

struct ResultPayload: Hashable, Identifiable {
    let id = UUID()
    var items: [GenerationCoordinator.ResultItem]
    var conceptId: String?
    var conceptTitle: String
}

/// 채워 맞춤(outpaint) 진행 상태.
enum OutpaintPhase: Equatable {
    case idle, running
    case error(String)
}

/// 로그인 뒤 자동으로 이어갈 동작 (1.x `rimikimi_pending_tool` / `pendingContinue` 와 같은 뜻).
enum PendingAction {
    case generate(GenerateRequest)
    /// 여러 컨셉 한 번에(담기 → "N장 만들기"). 컨셉마다 1장씩, 크레딧은 장수만큼 그대로 차감(오너 지시 2026-10-09).
    case generateMany([GenerateRequest])
    /// 게스트 미리보기에서 고른 1장 받기 — 로그인 뒤 앨범에 저장.
    case guestReceive(UIImage)
    case filterPick(presetKey: String?)
    case camera
}

@MainActor
@Observable
final class AppState {
    var tab: TabID = .gallery
    var galleryPath: [Route] = []
    var myPhotosPath: [Route] = []
    var profilePath: [Route] = []

    /// 지금 보이는 탭의 스택. 필터 탭은 푸시가 없고, 카메라 슬롯은 탭이 아니라 동작이라 빈 스택.
    var activePath: [Route] {
        switch tab {
        case .gallery: return galleryPath
        case .myPhotos: return myPhotosPath
        case .profile: return profilePath
        case .filter, .camera: return []
        }
    }
    /// 떠 있는 카메라 원을 그릴지 — 탭바가 실제로 보이는 화면에서만.
    var showsCameraTabButton: Bool { activePath.last?.keepsTabBar ?? true }

    /// 지금 탭의 스택에 한 칸 밀어 넣는다. `NavigationLink` 를 못 쓰는 자리에서 쓴다 —
    /// 격자처럼 **누르는 순간을 우리가 판단해야 하는** 화면(핀치 중에는 안 들어가야 한다).
    func pushRoute(_ route: Route) {
        switch tab {
        case .gallery: galleryPath.append(route)
        case .myPhotos: myPhotosPath.append(route)
        case .profile: profilePath.append(route)
        case .filter, .camera: break
        }
    }

    var loginSheet = false
    var loginMessage: String?
    var pending: PendingAction?
    var toast: String?
    /// 제3자 AI(Google Gemini) 전송 고지 — 첫 "만들기" 전 1회만(Apple 5.1.1(i)/5.1.2(i) +
    /// AI기본법 §31 사전고지, 컴플라이언스 리뷰로 발견). `AIConsentSheet` 가 지켜본다.
    /// ⚠️ **매 생성마다 다시 묻지 않는다** — 다른 플래그들(`guide.done.v2` 등)과 같은 관례로
    /// UserDefaults 에 1회만 기록, 동의 즉시 미뤄둔 요청을 이어간다(오너 지시 2026-09-19).
    var aiConsentSheet = false
    private var pendingAfterConsent: GenerateRequest?
    private var pendingManyAfterConsent: [GenerateRequest]?
    private var pendingGuestAfterConsent: GenerateRequest?
    /// 게스트 첫 1장 화면(만드는 중 → 미리보기 2장 → 받기). nil 이면 닫힘.
    var guestFlow: GuestFlow?
    struct GuestFlow: Identifiable {
        let id = UUID()
        var title: String
        var images: [UIImage] = []
        var error: String?
    }
    private var pendingManyAfterPurchase: [GenerateRequest]?

    // MARK: 여러 장 담기 (오너 지시 2026-10-08 — 카테고리 상관없이 한 번에 최대 8장)
    static let cartMax = 8
    /// 브루클린 룩 · 조세핀 드레스 카탈로그와 탭별 옵션(세부 조정·옷 사진·신랑 사진).
    let studio = StudioStore()
    /// 룩·드레스 크게 보기(리미키미 컨셉은 지금처럼 필름스트립 브라우저).
    var lookViewer: Concept?
    /// 크게 보기에서 넘겨 볼 목록 — 격자에서 누를 때 그 격자의 목록을 넣는다(목적 칸·룩·드레스도 필름스트립으로).
    var browseList: [Concept]?
    private(set) var cart: [Concept] = []
    /// 담은 줄을 홈에서 펼쳤는지(홈에선 작은 배지, 누르면 펼침).
    var cartExpanded = false
    /// 담은 걸 만들려는데 등록된 내 사진이 없을 때 — 사진 고르기를 먼저 띄운다.
    var cartNeedsPhoto = false
    func isInCart(_ c: Concept) -> Bool { cart.contains { $0.id == c.id } }
    func cartIndex(_ c: Concept) -> Int? { cart.firstIndex { $0.id == c.id } }
    /// 담기/빼기. 가득 찼으면 false.
    @discardableResult
    func toggleCart(_ c: Concept, longPress: Bool = false) -> Bool {
        let haptic = longPress ? HapticPlayer.longPress : HapticPlayer.selection
        if let i = cartIndex(c) { cart.remove(at: i); haptic(); return true }
        guard cart.count < Self.cartMax else { HapticPlayer.warning(); showToast(Copy.cartFull(Self.cartMax)); return false }
        cart.append(c)
        haptic()
        if cart.count == 1 { enqueueCoach(Coach.cart) }
        return true
    }
    func removeFromCart(at i: Int) { if cart.indices.contains(i) { cart.remove(at: i) } }
    func clearCart() { cart.removeAll(); cartExpanded = false }
    /// 전문 프로필 룩을 담았으면 만들기 전에 세부 조정·옷 바꾸기 단계를 한 번 거친다(오너 지시 2026-10-09
    /// "세부조정이랑 옷 바꾸기는 다음 단계에"). 격자 화면엔 이 버튼들을 두지 않는다.
    var studioStep = false
    /// "N장 만들기" — 등록 사진으로 담은 컨셉을 한꺼번에 만든다.
    func generateCart(optionsDone: Bool = false) {
        guard !cart.isEmpty else { return }
        if !optionsDone, cart.contains(where: { $0.studioPurpose != nil }) { studioStep = true; return }
        guard let photo = userPhoto.image else { cartNeedsPhoto = true; return }
        let reqs = cart.map { c -> GenerateRequest in
            var r = GenerateRequest(concept: c, photo: photo)
            // 옵션은 그 탭에서 담은 사진에만(이력서·취업 탭의 옷 사진은 이력서·취업 룩에만).
            if let p = c.studioPurpose {
                r.studioOverrides = (studio.overrides[p] ?? [:]).mapValues { $0.base }
                r.outfit = studio.outfit[p]
            }
            if c.dressCode != nil { r.groomPhoto = studio.groom }
            return r
        }
        requireLogin(reqs.count == 1 ? .generate(reqs[0]) : .generateMany(reqs), message: Copy.loginToSave)
    }

    // MARK: 앱을 켜면 먼저 보일 화면 (설정에서 고른다 — 오너 지시 2026-10-09)
    private static let startTabKey = "ui.startTab"
    static var startsOnCamera: Bool {
        get { UserDefaults.standard.string(forKey: startTabKey) == "camera" }
        set { UserDefaults.standard.set(newValue ? "camera" : "make", forKey: startTabKey) }
    }
    /// 채워 맞춤(outpaint)도 같은 Gemini 전송이라 같은 동의가 필요하다(재검증으로 발견 — 결과
    /// 화면을 거치지 않고 도달하는 이론적 우회가 남아 있었다). 이미지+완료 콜백을 미뤄둔다.
    private var pendingOutpaintAfterConsent: (image: UIImage, completion: (UIImage) -> Void)?
    private static let aiConsentKey = "ai.consent.v2" // v2(2026-10-07 리젝 5.1.1/5.1.2): 보내는 데이터·받는 곳을 명시한 새 문구라 기존 동의자도 다시 묻는다
    static var aiConsentGiven: Bool { UserDefaults.standard.bool(forKey: aiConsentKey) }
    /// 크레딧 부족 시트(팩 3 · 구독 · 초대). 구매 성공 시 `pendingAfterPurchase` 를 이어간다.
    var creditsSheet = false
    var pendingAfterPurchase: GenerateRequest?
    /// 채워 맞춤(outpaint) 진행 상태 — `FitSheet` 가 지켜본다.
    var outpaintPhase: OutpaintPhase = .idle
    /// 크레딧 부족으로 미룬 채워 맞춤 원본 — 구매 뒤 `continueAfterPurchase` 가 이어간다.
    private var pendingOutpaintPhoto: UIImage?
    /// `CreditsSheet` 문구용 — 생성이든 채워 맞춤이든, 구매 후 뭔가 이어갈 게 있으면 true.
    var willContinueAfterPurchase: Bool { pendingAfterPurchase != nil || pendingManyAfterPurchase != nil || pendingOutpaintPhoto != nil }
    private var outpaintCompletion: ((UIImage) -> Void)?
    #if DEBUG
    /// 캡처용: 채워 맞춤 진행 화면을 잠깐 보이게 인위적 지연을 준다(실서버는 즉시 성공/실패한다).
    var outpaintDebugDelaySeconds: Double = 0
    #endif
    /// 아이폰 기본 카메라 화면 표시 여부.
    var showSystemCamera = false
    /// 얼굴 스캔(Face ID 등록식) 화면 — 프로필에서 연다.
    var showFaceScan = false
    /// 연속 촬영 카메라 — 여러 장 찍어 한 번에 필터(오너 지시 2026-09-22, 시험 중).
    var showBurstCamera = false
    /// 시스템 사진 선택창 — 필터를 고른 뒤 여기서 사진을 먼저 고른다.
    /// (웹에서 파일창을 자동으로 못 여는 제약 때문. `PhotoPicker` 주석 참고)
    var photoPickPreset: String?     // nil 이면 닫힘
    var showPhotoPicker = false
    /// 카메라 구현 스위치 — true = 아이폰 기본 카메라(현재), false = 옛 웹뷰 카메라(폴백).
    /// 웹뷰 쪽은 지우지 않고 남겨 둔다(문제가 생기면 한 줄로 되돌릴 수 있게).
    static let useSystemCamera = true
    /// 카메라 버튼이 여는 화면 — true = 연속 촬영(여러 장 → 한 번에 필터), false = 아이폰 기본 카메라 한 장.
    /// 컨셉 사진용 경로(내 사진 등록 등)는 이 스위치와 무관하게 기본 카메라·앨범을 쓴다.
    static let useBurstCamera = true
    /// 편집기·카메라 1단계 웹뷰(SPEC §5).
    var webTool: WebTool?
    /// 첫 실행 가이드 1장 — 실행 시 다른 팝업은 없다.
    // 2026-10-09 C안: 예전 첫 실행 안내 화면은 없앴다 — 홈 튜토리얼(코치마크)이 대신한다. ATT 는 실행 직후(RimikimiApp).
    var showGuide = false

    // MARK: 튜토리얼(코치마크)
    private(set) var coachQueue: [CoachStep] = []
    private(set) var coachIndex = 0
    private(set) var coachTotal = 0
    func startHomeCoach() {
        guard !Coach.seen("home"), coachQueue.isEmpty else { return }
        coachQueue = Coach.home(); coachIndex = 0; coachTotal = coachQueue.count
    }
    /// 그 기능을 처음 쓸 때 한 번만.
    func enqueueCoach(_ step: CoachStep) {
        guard !Coach.seen(step.key), !coachQueue.contains(step) else { return }
        if coachQueue.isEmpty { coachIndex = 0; coachTotal = 1 }
        coachQueue.append(step)
    }
    func advanceCoach() {
        guard let s = coachQueue.first else { return }
        Coach.markSeen(s.key)
        coachQueue.removeFirst()
        coachIndex += 1
        if coachQueue.isEmpty { if coachTotal > 1 { Coach.markSeen("home") }; coachTotal = 0; coachIndex = 0 }
    }
    func skipCoach() {
        coachQueue.forEach { Coach.markSeen($0.key) }
        Coach.markSeen("home")
        coachQueue.removeAll(); coachTotal = 0; coachIndex = 0
    }
    /// 홈 상단 초대 카드 — build 90 실기기 결함 #5(오너 지시): 예전엔 첫 생성 완료 후 1회만 떴는데
    /// 1.x 는 홈 맨 위에 항상 있었다. 이제 사용자가 닫기 전까진 상시 노출하고, 닫으면 그 상태를
    /// `inviteCardDismissedKey` 로 영구 기억한다. 초대는 크레딧이 도는 유일한 통로라 이미 친구를
    /// 초대해 본 사용자에게도 계속 보여준다 — 서버에 "1회성" 제한이 없고(재초대해도 계속 크레딧을
    /// 받을 수 있어 보임, `RimikimiAPI.referralCount` 참고) 언제든 닫을 수 있으니 상시 노출 쪽이 낫다고
    /// 판단했다. 명시적으로 "이미 초대를 다 쓴 사용자"를 구분하는 서버 플래그는 없다(`api/` 미확인 범위 —
    /// 필요하면 별도 확인).
    var showInviteCard = !UserDefaults.standard.bool(forKey: AppState.inviteCardDismissedKey)
    private static let inviteCardDismissedKey = "invite.card.dismissed.v1"

    /// 탭 화면 스크롤 콘텐츠의 하단 여백.
    /// ⚠️ **탭바 프레임을 재서 계산하지 말 것** (2026-09-16 build 91 사고 — 같은 측정값을 쓰던
    ///    카메라 버튼이 화면 한가운데로 갔다. `RootTabView.cameraBottomPadding` 주석 참고).
    ///    고정 24pt 로는 마지막 콘텐츠가 떠 있는 탭바에 가려서(결함 #4) 넉넉한 고정값을 쓴다.
    ///    여백이 조금 남는 건 해가 없지만, 모자라면 콘텐츠가 가려진다 — 넉넉한 쪽으로 둔다.
    var contentBottomPad: CGFloat { TabBarMetrics.contentBottomPad }
    #if DEBUG
    /// dev/fit 캡처용 — 결과 화면이 뜨면 정방향 맞춤 시트를 바로 연다.
    var devAutoOpenFit = false
    /// dev/myphotos?fake=1 — 로그인 없이 내 사진 앨범 모양을 캡처하려고 넣는 가짜 갤러리.
    var devFakeGallery: [GalleryItem]?
    /// 결함 #4 검증 캡처용(`dev/devscrollbottom`) — 탭 루트 화면들이 처음부터 맨 아래로 스크롤된
    /// 상태로 뜨게 한다. 실기기 터치 없이 "스크롤 끝까지 내렸을 때 탭바에 안 가리는지"를 캡처하기 위함.
    /// `RimikimiApp.task` 의 `DevRoutes.handleLaunchArguments` 는 `concepts.load()` 등 여러 await
    /// 뒤에 실행돼 GalleryHomeView 가 이미 첫 렌더(스크롤 위치 확정)를 끝낸 뒤라 `.defaultScrollAnchor`
    /// 가 안 먹는다 — 그래서 여기 `init()` 에서 launch argument 를 동기적으로 직접 읽는다.
    var devScrollToBottom = ProcessInfo.processInfo.arguments.contains { $0.contains("devscrollbottom") }
    #endif

    struct WebTool: Identifiable {
        let id = UUID(); let url: URL; let title: String
        /// 편집기에 실어 보낼 초기 데이터(결과 화면 "다듬기" → 사진 1장). `WebBridgeCoordinator.initialPayload`.
        var initialPayload: [String: Any]? = nil
        /// 상단바 없이 화면을 통째로 쓴다. 카메라는 **아이폰 기본 카메라처럼** 보여야 한다는
        /// 오너 지시(2026-09-17) — 상단바가 있으면 웹 카메라 헤더와 겹쳐 두 줄이 되고,
        /// 미리보기도 화면을 못 채운다. 닫기는 웹 쪽 버튼이 브리지로 처리한다.
        var chromeless: Bool = false
    }

    let auth = AuthStore.shared
    let generation = GenerationCoordinator()
    let concepts = ConceptStore()
    let favorites = FavoritesStore()
    let faceProfile = FaceProfileStore()
    let userPhoto = UserPhotoStore()
    let store = StoreManager()
    let push = PushManager.shared
    private(set) var quota: QuotaInfo?
    /// 캡처·검증용 — 카테고리 격자를 5열로 시작(dev 라우트에서만 켜진다. 릴리스에선 항상 false).
    /// ⚠️ `#if DEBUG` 안에 두면 호출부를 `#if` 로 갈라야 하고, 그러면 뒤에 붙는 modifier 가
    ///    붙지 않는다(릴리스 아카이브에서 실제로 걸렸다). 그래서 빌드 구분 없이 둔다.
    var devWideColumns = false
    /// 캡처·검증용 — 브라우저가 떠 있는 동안 이 id 로 **건너뛴다**(스와이프를 흉내 내는 용도).
    /// 시뮬레이터에서는 좌우 스와이프를 못 하니, 열린 뒤 필름스트립이 따라오는지 이걸로 확인한다.
    var devBrowseJump: String?

    /// 마지막 생성 요청 — 크레딧 부족으로 실패했을 때 구매 뒤 이어가기 위해.
    private var lastRequest: GenerateRequest?

    init() {
        if Self.startsOnCamera { tab = .filter }
        // "⭐ 즐겨찾기" 앨범과 홈 정렬만 `FavoritesStore` 를 알면 된다 — `ConceptStore` 가 직접
        // 의존하지 않도록 클로저로 잇는다.
        concepts.favoriteIDs = { [favorites] in favorites.concepts }
        concepts.favoriteCategories = { [favorites] in favorites.categories }
        // 토큰이 서버에서 거절돼 강제 로그아웃될 때도 앱 전체 정리를 탄다(얼굴 사진·스캔·카드·탭 스택).
        auth.onForcedSignOut = { [weak self] in self?.signOut() }
    }

    /// 얼굴 스캔 결과 저장 — 3장은 기기에, 정면 1장은 기존 "내 사진" 자리에도 넣는다(옵션 화면·
    /// 커플·매직부스 등 기존 경로가 전부 `userPhoto` 를 본다).
    func saveFaceProfile(_ shots: [FaceProfileStore.Angle: UIImage]) {
        faceProfile.save(shots)
        if let front = shots[.front] { userPhoto.set(front) }
        toast = Copy.faceProfileSaved
    }

    // MARK: 로그인 게이트

    /// 로그인돼 있으면 바로, 아니면 시트를 띄우고 로그인 뒤 이어간다.
    func requireLogin(_ action: PendingAction, message: String? = nil) {
        if case .generate(let r) = action {
            AppLog.api.info("requireLogin.generate signed=\(self.auth.isSignedIn) used=\(GuestDevice.used) batchable=\(r.concept.isBatchable) eligible=\(Self.guestEligible(r)) concept=\(r.concept.id, privacy: .public)")
        }
        if auth.isSignedIn {
            Task { await perform(action) }
        } else if case .generate(let req) = action, !GuestDevice.used, Self.guestEligible(req) {
            // 게스트 첫 1장(2026-10-09 C안): 가입 없이 바로 만들어 결과부터 보여 준다. 로그인은 "받기"에서.
            startGuest(req)
        } else if case .generateMany = action {
            pending = action
            loginMessage = Copy.cartManyNeedsLogin
            loginSheet = true
        } else {
            pending = action
            loginMessage = message
            loginSheet = true
        }
    }

    /// 셀카 한 장으로 되는 컨셉·룩·드레스만, 옵션(세부 조정·옷·신랑) 없이 — 서버도 같은 기준(403 needLogin).
    static func guestEligible(_ r: GenerateRequest) -> Bool {
        r.concept.isBatchable && r.studioOverrides.isEmpty && r.outfit == nil && r.groomPhoto == nil
    }

    func startGuest(_ req: GenerateRequest) {
        guard Self.aiConsentGiven else { pendingGuestAfterConsent = req; aiConsentSheet = true; return }
        var r = req
        r.count = 1
        if r.faceRef == nil, !r.concept.isArtTransform { r.faceRef = userPhoto.image }
        guestFlow = GuestFlow(title: req.concept.displayTitle)
        HapticPlayer.commit()
        AppLog.api.info("guest.start concept=\(req.concept.id, privacy: .public)")
        Task {
            do {
                let res = try await RimikimiAPI.shared.generate(r, token: "")
                AppLog.api.info("guest.done items=\(res.items.count)")
                GuestDevice.used = true
                guestFlow?.images = res.items.map(\.image)
                HapticPlayer.success()
                #if DEBUG
                if !UserDefaults.standard.bool(forKey: "dev.noAds") { AdManager.shared.showInterstitial() }   // 캡처용으로만 끈다
                #else
                AdManager.shared.showInterstitial()   // 무료 = 생성 광고 1번(오너 지시 2026-10-07)
                #endif
            } catch let e as APIError {
                AppLog.api.error("guest.failed status=\(e.status) msg=\(e.message, privacy: .public)")
                if e.status == 403 {
                    // 이 기기는 이미 첫 1장을 썼다 → 로그인하고 이어서.
                    GuestDevice.used = true
                    guestFlow = nil
                    pending = .generate(req)
                    loginMessage = e.message
                    loginSheet = true
                } else {
                    guestFlow?.error = e.message
                }
            } catch {
                guestFlow?.error = Copy.errNetwork
            }
        }
    }

    /// 미리보기에서 고른 1장 "받기" — 로그인돼 있으면 바로, 아니면 로그인 뒤 저장(저장 광고 1번).
    func guestReceive(_ image: UIImage) {
        if auth.isSignedIn { Task { await perform(.guestReceive(image)) } }
        else { pending = .guestReceive(image); loginMessage = Copy.guestLogin; loginSheet = true }
    }

    /// `AuthStore.signInTick` 이 오르면 호출 — 하던 동작을 이어간다.
    func resumePending() {
        loginSheet = false
        // ⚠️ 크레딧 갱신은 pending 유무와 무관하다 — 예전엔 guard 뒤에 있어 그냥 로그인만 하면 칩이 "–" 로 남았다.
        Task { await refreshQuota() }
        if let uid = auth.session?.userID { Task { await store.logIn(userID: uid) } }
        guard let action = pending else { return }
        pending = nil
        Task { await perform(action) }
    }

    func perform(_ action: PendingAction) async {
        switch action {
        case .generate(var req):
            guard let token = await auth.validAccessToken() else { handleNoToken(); return }
            // 제3자 AI 전송 고지 — 계정당(기기당) 1회만. 동의 전이면 요청을 미뤄두고 시트를 띄운다.
            guard Self.aiConsentGiven else {
                pendingAfterConsent = req
                aiConsentSheet = true
                return
            }
            // 크레딧 부족이면 시트 먼저 — 서버에 보내 봐야 429 다(SPEC §3 "크레딧 부족이면 팩·구독·초대 시트").
            // ⚠️ 묶음(2장 이상)은 서버에서 **크레딧 전용**이다(무료 1장으로는 불가, 서버 402).
            //    무료 한도를 더해 통과시키면 서버까지 갔다가 실패만 보고 시트가 안 떴다.
            let usable = req.effectiveCount > 1 ? (quota?.creditsAvailable ?? 0)
                                                : (quota?.creditsAvailable ?? 0) + (quota?.freeLeft ?? 0)
            if let q = quota, q.unlimited != true, usable < req.creditCost {
                pendingAfterPurchase = req
                creditsSheet = true
                return
            }
            if req.faceRef == nil, !req.concept.isArtTransform { req.faceRef = userPhoto.image }
            // 얼굴 스캔을 해 뒀으면 정면·좌·우 3장을 참조로 보낸다 — 각도가 여러 장일수록 얼굴
            // 재현이 정확하다(스튜디오 실증, `_design/face-profile-v1.md` §0). 서버는 이미
            // 여러 장(`faceRefs`)을 받도록 돼 있어 서버 변경은 없다.
            if !req.concept.isArtTransform, req.faceProfile.isEmpty {
                req.faceProfile = faceProfile.ordered.map { ($0.image, $0.angle.rawValue) }
            }
            lastRequest = req
            HapticPlayer.commit()
            generation.start(req, token: token, pushToken: push.fcmToken)
            // 홈으로 복귀 + 내 사진 진행 카드 (SPEC §3).
            galleryPath.removeAll()
            tab = .myPhotos
        case .generateMany(var reqs):
            guard let token = await auth.validAccessToken() else { handleNoToken(); return }
            guard Self.aiConsentGiven else {
                pendingManyAfterConsent = reqs
                aiConsentSheet = true
                return
            }
            // 여러 장은 크레딧 전용(서버 묶음 규칙과 같다) — 장수만큼 있어야 한다.
            if let q = quota, q.unlimited != true, q.creditsAvailable < reqs.count {
                pendingManyAfterPurchase = reqs
                creditsSheet = true
                return
            }
            for i in reqs.indices {
                reqs[i].faceRef = userPhoto.image
                if reqs[i].faceProfile.isEmpty { reqs[i].faceProfile = faceProfile.ordered.map { ($0.image, $0.angle.rawValue) } }
            }
            HapticPlayer.commit()
            lastRequest = reqs.last
            // 동시에 다 던지면 서버(Vertex) 분당 한도에 걸린다 — 조금씩 띄워 보낸다(서버도 429 백오프가 있다).
            for (i, r) in reqs.enumerated() {
                if i > 0 { try? await Task.sleep(nanoseconds: 700_000_000) }
                generation.start(r, token: token, pushToken: push.fcmToken)
            }
            clearCart()
            galleryPath.removeAll()
            tab = .myPhotos
        case .guestReceive(let image):
            await refreshQuota()
            await adGateBeforeSave()
            let ok = await CameraAlbum.save(image)
            showToast(ok ? Copy.savedToAlbum : Copy.noAlbumPermission)
            guestFlow = nil
            clearCart()
        case .filterPick(let presetKey):
            // 사진을 **먼저** 고른다 — 웹의 "사진 선택" 빈 화면을 없애기 위해(오너 지적 2026-09-17).
            photoPickPreset = presetKey ?? "none"
            showPhotoPicker = true
        case .camera:
            // 아이폰 **기본 카메라 화면**을 띄운다(오너 지시 2026-09-17).
            // 웹뷰 카메라는 포커스·줌을 못 써서 폐기 — 폴백 경로로만 남긴다(useSystemCamera).
            // 2026-09-22: 필터는 "여러 장 찍어 한 번에" 가 핵심이라 연속 촬영 화면을 먼저 띄운다.
            // 기본 카메라는 한 장 찍으면 바로 앱으로 돌아와 연속 촬영이 불가능하다(`BurstCameraView` 주석).
            if Self.useBurstCamera { showBurstCamera = true }
            else if Self.useSystemCamera { showSystemCamera = true }
            else { webTool = WebTool(url: Config.cameraToolURL, title: Copy.camera, chromeless: true) }
        }
    }

    /// 기본 카메라로 찍은 직후 — 앨범에 저장하고 편집기(필터)로 넘긴다.
    /// SPEC §3: "셔터 → 즉시 앨범 저장 → 다듬기·공유". 기본 카메라는 라이브 필터를 못 얹으므로
    /// **찍고 나서** 필터를 입히는 순서가 된다.
    /// 연속 촬영 완료 — 찍은 컷을 앨범에 남기고, 전부 편집기로 넘겨 필터를 한 번에 입힌다.
    /// (편집기는 이미 여러 장을 받도록 돼 있다 — `PhotoEditor` 의 `srcs`.)
    func finishBurstCamera(_ images: [UIImage]) {
        showBurstCamera = false
        guard !images.isEmpty else { return }
        Task {
            var saved = 0
            for img in images where await CameraAlbum.save(img) { saved += 1 }
            showToast(saved == images.count ? Copy.savedNToAlbum(saved) : Copy.noAlbumPermission)
        }
        handlePickedPhotos(images)
    }

    func handleCameraShot(_ image: UIImage) {
        showSystemCamera = false
        Task {
            let saved = await CameraAlbum.save(image)
            showToast(saved ? Copy.savedToAlbum : Copy.noAlbumPermission)
            openEditor(image: image)
        }
    }

    /// 사진 선택 완료 → 고른 사진들을 편집기에 실어 보낸다.
    func handlePickedPhotos(_ images: [UIImage]) {
        showPhotoPicker = false
        let preset = photoPickPreset ?? "none"
        photoPickPreset = nil
        guard !images.isEmpty else { return }
        // ⚠️ 2026-09-30: 예전엔 전부 긴 변 2048·JPEG 0.92 로 줄였다 — 편집기는 받은 크기 그대로 저장하므로
        //    12MP(4032px) 원본이 약 3MP 로 저장됐다(오너 "필터 적용하면 화질이 낮아진다").
        //    미리보기는 편집기가 1080px 로 따로 만들고, 저장은 받은 해상도로 한다 → 받는 쪽을 키운다.
        //    웹뷰 메모리(편집기는 최근 3장을 디코드해 둔다 + 사진마다 base64 문자열) 때문에 장수로 상한을 나눈다:
        //    1~3장 = 4096(12MP 원본 그대로) · 4~10장 = 3072.
        let picked = Array(images.prefix(10))
        let maxLong: CGFloat = picked.count <= 3 ? 4096 : 3072
        let srcs: [String] = picked.compactMap { img in
            let scaled = img.downscaled(maxLong: maxLong)
            guard let d = scaled.jpegData(compressionQuality: 0.95) else { return nil }
            return "data:image/jpeg;base64,\(d.base64EncodedString())"
        }
        guard !srcs.isEmpty else { return }
        webTool = WebTool(url: Config.filterToolURL(mode: "edit", presetKey: preset), title: Copy.decorate,
                          initialPayload: ["mode": "edit", "srcs": srcs])
    }

    /// 결과 화면 "다듬기" — 지금 보고 있는 사진을 편집기에 바로 실어 보낸다(사진 선택 화면 생략).
    func openEditor(image: UIImage) {
        let data = image.jpegData(compressionQuality: 0.95) ?? Data()
        let dataUrl = "data:image/jpeg;base64,\(data.base64EncodedString())"
        webTool = WebTool(url: Config.filterToolURL(mode: "edit"), title: Copy.edit,
                           initialPayload: ["mode": "edit", "src": dataUrl])
    }

    /// 생성이 429 로 실패하면 크레딧 시트를 띄우고, 구매 뒤 같은 요청을 이어간다.
    func handleGenerationFailure() {
        guard generation.quotaExceeded, let req = lastRequest else { return }
        pendingAfterPurchase = req
        creditsSheet = true
    }

    /// 동의 시트 "동의하고 계속" — 플래그를 1회 기록하고 시트를 닫는다. **미뤄둔 동작은 아직
    /// 이어가지 않는다** — `resumeAfterConsentDismissed()`(시트의 `onDismiss`)가 이어간다.
    /// ⚠️ 재검증으로 발견(2026-09-19): 여기서 곧바로 `perform` 을 부르면, 크레딧이 부족해
    /// `creditsSheet = true` 가 되는 경우 "동의 시트가 닫히는 중에 크레딧 시트를 새로 띄우는"
    /// 경합이 생겨 조용히 무반응이 될 수 있었다(같은 프레젠터, UIKit 모달 1개 제한).
    func continueAfterConsent() {
        UserDefaults.standard.set(true, forKey: Self.aiConsentKey)
        aiConsentSheet = false
    }

    /// 동의 시트 "다음에" — 그냥 취소. 사진 생성이 핵심 기능이라 대체 경로는 없고,
    /// 다시 "만들기"를 누르면 시트가 또 뜬다(부작용 없음). 미뤄둔 동작도 전부 버린다 —
    /// `onDismiss` 가 아무것도 이어가지 않게.
    func cancelConsent() {
        aiConsentSheet = false
        pendingAfterConsent = nil
        pendingManyAfterConsent = nil
        pendingGuestAfterConsent = nil
        pendingOutpaintAfterConsent = nil
    }

    /// `aiConsentSheet` 의 `onDismiss` — 시트가 **완전히 닫힌 뒤**(전환 애니메이션 끝) 호출된다.
    /// 동의했을 때만 미뤄둔 생성/채워맞춤이 남아 있으므로, 취소면 위 두 슬롯이 이미 비어 있어
    /// 아무 일도 안 한다. 새 시트(크레딧 시트 등)를 여기서 열어도 이전 시트와 경합하지 않는다.
    func resumeAfterConsentDismissed() {
        if let req = pendingAfterConsent {
            pendingAfterConsent = nil
            Task { await perform(.generate(req)) }
        } else if let g = pendingGuestAfterConsent {
            pendingGuestAfterConsent = nil
            startGuest(g)
        } else if let reqs = pendingManyAfterConsent {
            pendingManyAfterConsent = nil
            Task { await perform(.generateMany(reqs)) }
        } else if let pending = pendingOutpaintAfterConsent {
            pendingOutpaintAfterConsent = nil
            requestOutpaint(pending.image, completion: pending.completion)
        }
    }

    /// 크레딧 시트를 구매 없이 닫았을 때 — 미뤄둔 생성·채워 맞춤을 버린다.
    func dropPendingPurchase() {
        pendingAfterPurchase = nil
        pendingManyAfterPurchase = nil
        pendingOutpaintPhoto = nil
    }

    /// 구매 성공 → 크레딧 갱신 → 하던 생성(또는 채워 맞춤) 이어가기.
    /// 스토어 탭(크레딧 시트가 아닌 곳)에서 샀을 때 — 잔액만 새로 받고 **아무것도 이어가지 않는다**.
    /// 시트가 못 뜬 채 남은 예약(다른 모달 위에서 부족이 났을 때)이 여기서 몰래 실행되면 안 된다.
    func refreshAfterStorePurchase() async {
        dropPendingPurchase()
        await refreshQuota()
    }

    func continueAfterPurchase() async {
        await refreshQuota()
        creditsSheet = false
        if let req = pendingAfterPurchase {
            pendingAfterPurchase = nil
            generation.dismissFinished()
            await perform(.generate(req))
            return
        }
        if let reqs = pendingManyAfterPurchase {
            pendingManyAfterPurchase = nil
            await perform(.generateMany(reqs))
            return
        }
        if let photo = pendingOutpaintPhoto {
            pendingOutpaintPhoto = nil
            await runOutpaint(photo)
        }
    }

    // MARK: 채워 맞춤 (outpaint)

    /// `FitSheet` "채워 맞춤" 버튼 — 크레딧 부족이면 시트를 띄우고, 완료되면 `completion` 으로 결과 이미지를 돌려준다.
    /// 이 경로도 사진을 Gemini 로 보내므로(`RimikimiAPI.outpaint`) 제3자 AI 전송 동의가 먼저 필요하다
    /// (재검증으로 발견 — 보통은 결과 화면을 거쳐야만 도달해 이미 동의된 상태지만, 이론적 우회를 막는다).
    func requestOutpaint(_ image: UIImage, completion: @escaping (UIImage) -> Void) {
        guard Self.aiConsentGiven else {
            pendingOutpaintAfterConsent = (image, completion)
            aiConsentSheet = true
            return
        }
        outpaintCompletion = completion
        Task { await runOutpaint(image) }
    }

    /// ⚠️ 채워 맞춤은 결과 화면 위 FitSheet(.sheet) 에서 돈다. 여기서 크레딧 시트를 띄우면
    ///    iOS 는 "프레젠터당 모달 1개" 라 조용히 무시한다 — 무반응인 데다, 남은 예약
    ///    (pendingOutpaintPhoto)이 나중에 스토어에서 살 때 **보이지 않게 채워 맞춤을 돌려
    ///    1크레딧을 썼다**(2026-09-23 스윕). 그래서 FitSheet 안에 이유를 보여 주고 끝낸다.
    static var outpaintNeedCredit: String { Copy.outpaintNeedCredit }

    private func runOutpaint(_ image: UIImage) async {
        guard let token = await auth.validAccessToken() else { handleNoToken(); return }
        // 채워 맞춤은 1크레딧 고정 — 하루 무료 한도로는 안 된다(서버 api/generate.js outpaint 분기).
        if let q = quota, q.unlimited != true, q.creditsAvailable < 1 {
            outpaintPhase = .error(Self.outpaintNeedCredit)
            return
        }
        outpaintPhase = .running
        #if DEBUG
        if outpaintDebugDelaySeconds > 0 { try? await Task.sleep(nanoseconds: UInt64(outpaintDebugDelaySeconds * 1_000_000_000)) }
        #endif
        do {
            let result = try await RimikimiAPI.shared.outpaint(image: image, token: token)
            outpaintPhase = .idle
            await refreshQuota()
            outpaintCompletion?(result.image)
            outpaintCompletion = nil
        } catch let error as APIError {
            // quota 가 낡아 게이트를 통과했는데 서버가 크레딧 부족을 준 경우 — 이유 모를 실패 대신 충전 시트.
            if error.quotaExceeded {
                outpaintPhase = .error(Self.outpaintNeedCredit)
                await refreshQuota()
                return
            }
            outpaintPhase = .error(error.message)
        } catch {
            outpaintPhase = .error(Copy.outpaintFailed)
        }
    }

    /// 시트가 닫히거나 다시 열릴 때 이전 상태를 지운다.
    func resetOutpaintPhase() { outpaintPhase = .idle }

    // MARK: 크레딧

    func refreshQuota() async {
        guard let token = await auth.validAccessToken() else { quota = nil; return }
        if let q = try? await RimikimiAPI.shared.fetchQuota(token: token) { quota = q }
    }

    func signOut() {
        auth.signOut()
        quota = nil
        // ⚠️ 로그아웃하면 **기기에 남은 이 사람의 것**도 같이 지운다 (2026-09-18 버그 스윕 확정).
        //    예전엔 세션만 지워서, 다음 계정이 로그인하면 앞사람의 등록 얼굴 사진·얼굴 스캔이
        //    그대로 생성 요청에 실려 나갔고(앞사람 얼굴로 이미지가 만들어졌다), 진행 카드·
        //    완성 카드도 새 계정 화면에 남았다.
        //    (AuthStore.signOut() 을 직접 타는 경로는 이제 "토큰이 진짜로 거절됐을 때" 뿐이다.)
        userPhoto.clear()
        faceProfile.clear()
        generation.clearAll()
        pendingAfterPurchase = nil
        pendingOutpaintPhoto = nil
        // 결과 화면·옵션 화면이 탭 스택에 남아 있으면 앞사람 결과 사진(메모리의 UIImage)과
        // 커플 상대·의상 사진이 그대로 보이고 저장·공유까지 됐다(2026-09-23 스윕 blocker).
        galleryPath.removeAll()
        myPhotosPath.removeAll()
        profilePath.removeAll()
        webTool = nil
        Task { await store.logOut() }
    }

    /// 토큰을 못 받았을 때 — **로그인 안 된 것**과 **오프라인**을 구분한다.
    /// 오프라인이면 세션은 살아 있으니(①, dfe153b) 로그인 시트를 띄우면 안 된다 —
    /// 프로필은 로그인 상태인데 로그인하라는 시트가 뜨고, 하던 요청은 사라졌다(스윕 H1).
    func handleNoToken() {
        if auth.session == nil { loginSheet = true }
        else { showToast(Copy.retryNetwork) }
    }

    // MARK: 결과 화면

    func present(_ items: [GenerationCoordinator.ResultItem], job: GenerationCoordinator.Job?) {
        // "이미 만들어 본 컨셉" 표시용 — 서버 갤러리는 24시간만 남으므로 여기서 기기에 적어 둔다.
        if let id = job?.conceptId { favorites.markGenerated([id]) }
        let payload = ResultPayload(items: items, conceptId: job?.conceptId, conceptTitle: job?.conceptTitle ?? "")
        tab = .myPhotos
        myPhotosPath = [.result(payload)]
    }

    /// 완료 푸시 탭 → 결과 화면. 알림 payload 엔 `{kind:"genDone", count}` 뿐이라(서버 `api/generate.js`
    /// `notifyDone`, 이미지·갤러리 id 없음) 정확히 "그 결과"를 지목할 수 없다 — 서버 payload 를 늘리지
    /// 않는 한(SPEC §0 "서버는 그대로") 최선은 **완료 직후 갤러리 최신 항목**을 여는 것. 보통 알림이 온
    /// 시점엔 그게 곧 이번 결과다.
    func openLatestGalleryResult() {
        openGalleryResult(galleryId: nil)
    }

    /// 완료 푸시 탭 → 결과 화면. `galleryId` 가 있으면(4주차, 서버가 payload 에 실으면) 그 항목을 정확히
    /// 연다. 없으면(구버전 서버·이미 깔린 앱) 지금처럼 **최신 갤러리 항목**으로 폴백한다. `galleryId` 가
    /// 있는데 그 항목이 갤러리 목록에 아직 없으면(드문 타이밍 어긋남) 그때도 최신 항목으로 물러선다.
    func openGalleryResult(galleryId: String?) {
        Task {
            guard let token = await auth.validAccessToken(),
                  let items = try? await RimikimiAPI.shared.fetchGallery(token: token) else { return }
            guard let item = (galleryId.flatMap { id in items.first { $0.id == id } }) ?? items.first else { return }
            // 같은 결과가 이미 화면에 떠 있으면(생성 완료로 먼저 자동 표시된 뒤 알림을 누른 경우) 그대로 둔다.
            // 예전엔 이미지를 가진 화면을 URL 만 가진 새 화면으로 갈아 끼워, 완성본이 잠깐 보였다가
            // 로딩 표시만 남았다(9/30 오너 실기기, 커스텀 보정 알림).
            if case .result(let shown)? = myPhotosPath.last, tab == .myPhotos,
               shown.items.contains(where: { $0.id == item.id && $0.image != nil }) { return }
            present([.init(id: item.id, image: nil, url: item.url, expiresAt: item.expiresAt)],
                    job: .init(conceptId: item.conceptId ?? "", conceptTitle: item.conceptTitle ?? "",
                               startedAt: item.createdAt ?? Date(), count: 1))
        }
    }

    /// 결과 화면이 뜬 동안(`ResultView.onAppear`)마다 호출 — ATT 권한 요청은 그 안에서 1회만
    /// 실제로 시도한다. 초대 카드는 여기서 켜지 않는다 — 홈에 상시 노출로 바뀌었다(결함 #5,
    /// `showInviteCard` 초기값 참고). 키 이름은 예전 그대로 재사용(ATT 1회 트리거 용도로만 씀).
    /// ⚠️ 예전엔 이 함수가 `RootTabView`의 내비게이션 전환 onChange 에서 불렸는데, 그 타이밍엔 앱이
    /// 아직 `.active` 가 아닐 수 있어 팝업 없이 플래그만 타는 결함이 있었다(컴플라이언스 리뷰로
    /// 발견, rimikimi 1.0 을 2번 리젝시킨 것과 같은 패턴) — 이제 `ResultView.onAppear`(화면이 진짜
    /// 보이는 시점)에서만 부르고, 플래그도 `TrackingPrompt` 내부에서 실제 결정된 답을 받은 뒤에만
    /// 세운다. 매번 호출해도 안전(이미 물었으면 즉시 반환).
    func afterFirstResult() {
        TrackingPrompt.requestOnceAfterFirstResult()
    }

    /// 생성이 끝난 뒤 **무료 사용자에게만** 전면광고 1회.
    ///
    /// 규칙은 새로 만들지 않고 1.x 를 그대로 옮겼다 — `src/PortraitStudio.jsx:1542`
    /// `showAds = quotaLoaded && !unlimited && credits === 0`:
    ///   - `quota == nil` (아직 못 불러옴) → 안 띄운다. 모르면 안 띄우는 쪽이 맞다.
    ///   - 무제한 계정 → 안 띄운다.
    ///   - 크레딧이 남아 있으면 → 안 띄운다. (크레딧을 쓴 생성에는 광고를 붙이지 않는다는 뜻.
    ///     하루 무료분으로 만든 사람만 광고를 본다.)
    /// 여기서 판정하는 이유는 `GenerationCoordinator` 가 크레딧/무제한 상태를 모르기 때문이다
    /// (`quota` 는 AppState 소유). 코디네이터에 역참조를 심으면 그 파일 구조를 건드리게 된다.
    func showInterstitialAfterGeneration() {
        // 2026-10-07 오너 지시: 무료 사용자는 "생성할 때 한 번, 저장할 때 한 번". 무료 판정은 저장 광고와 같다 —
        // 결제 기록이 없는 계정(firstPurchase), 크레딧 잔액과 무관. (예전 규칙: 크레딧 0 인 사람만)
        guard let q = quota, q.unlimited != true, q.firstPurchase == true else { return }
        Task {
            // 구독자(광고 제거)에게는 띄우지 않는다.
            if await store.hasActiveSubscription() { return }
            AdManager.shared.showInterstitial()
        }
    }

    /// 저장 전 광고 — **무료 사용자만**(오너 지시 2026-10-07 "무료 사용자는 무조건 저장하려면 광고를 봐야 함",
    /// "유료 사용자는 보이면 안 되고"). 크레딧이 남아 있는지와는 상관없다.
    ///   - 무료 = 결제 기록이 한 번도 없는 계정(서버 quota `firstPurchase`). 크레딧팩·구독을 한 번이라도 샀으면 유료.
    ///   - 무제한 계정·구독 중인 계정 → 안 띄운다.
    ///   - quota 를 아직 못 불러왔으면 → 안 띄운다(모르면 안 띄우는 쪽).
    /// 광고가 닫힐 때까지 기다렸다가 돌아오므로, 호출한 쪽은 그다음에 저장하면 된다.
    func adGateBeforeSave() async {
        guard let q = quota, q.unlimited != true, q.firstPurchase == true else { return }
        if await store.hasActiveSubscription() { return }
        await AdManager.shared.showAndWait()
    }

    /// 홈 초대 카드를 닫는다 — 닫힌 상태를 영구 기억해 다음 실행에도 다시 뜨지 않게 한다(결함 #5).
    func dismissInviteCard() {
        showInviteCard = false
        UserDefaults.standard.set(true, forKey: Self.inviteCardDismissedKey)
    }

    func finishGuide() {
        UserDefaults.standard.set(true, forKey: "guide.done.v2")
        showGuide = false
        // 2026-10-07 심사 리젝(2.1, iPad): "ATT 요청을 찾을 수 없다" — 예전엔 첫 생성 결과 뒤에만 물어서
        // 로그인·생성까지 안 해 본 심사관은 볼 수가 없었다. 이제 첫 실행 가이드를 닫는 즉시 묻는다
        // (가이드와 겹치지 않게 닫힌 뒤). 이미 물었으면 아무 일도 안 한다.
        TrackingPrompt.requestOnceAfterFirstResult(delay: 0.6)
    }

    func showToast(_ message: String) { toast = message }
}
